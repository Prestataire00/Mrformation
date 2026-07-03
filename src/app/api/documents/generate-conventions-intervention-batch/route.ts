/**
 * POST /api/documents/generate-conventions-intervention-batch
 *
 * Génère N contrats de sous-traitance (1 par formateur rattaché à la session
 * via `formation_trainers`) et les empaquette dans un ZIP. Fail-soft : si un
 * formateur n'a pas ses infos (SIRET/adresse), son contrat est généré avec
 * `[Placeholder]` visible — pas d'erreur, juste un PDF incomplet.
 *
 * Body : `{ sessionId: UUID }`.
 *
 * Retour : `{ zipBase64, totalTrainers, successCount, failureCount, errors, totalLatencyMs }`.
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import {
  CONVENTION_INTERVENTION_HTML,
  CONVENTION_INTERVENTION_FOOTER_TEMPLATE,
} from "@/lib/templates/convention-intervention";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import { computeAgreedCost, sessionDayCount } from "@/lib/utils/trainer-cost";
import { generateLoginQrDataUrl } from "@/lib/services/login-qr-code";
import {
  resolveTrainerCredentialsForConvention,
  type TrainerAccountRow,
} from "@/lib/services/trainer-account";
import type { Session, Trainer } from "@/lib/types";

interface BatchError {
  trainerId: string;
  trainerName: string;
  error: string;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60) || "formateur";
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();
    if (!profile?.entity_id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }
    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId est obligatoire" }, { status: 400 });
    }

    // Session (gate entity_id)
    const { data: session } = await supabase
      .from("sessions")
      .select("*, training:trainings(*)")
      .eq("id", body.sessionId)
      .eq("entity_id", profile.entity_id)
      .single();
    if (!session) {
      return NextResponse.json(
        { error: "Session introuvable ou non autorisée" },
        { status: 404 },
      );
    }

    // Formateurs rattachés à la session
    const { data: links, error: linksError } = await supabase
      .from("formation_trainers")
      .select(
        "trainer_id, agreed_cost_ht, hourly_rate, hours_done, daily_rate, dates_done, trainer:trainers(*)",
      )
      .eq("session_id", body.sessionId);

    if (linksError) {
      return NextResponse.json(
        { error: `Lecture formation_trainers : ${linksError.message}` },
        { status: 500 },
      );
    }
    if (!links || links.length === 0) {
      return NextResponse.json(
        { error: "Aucun formateur rattaché à cette session" },
        { status: 404 },
      );
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    // Bloc « Accès à votre espace formateur » : le QR /login est identique pour
    // tous les formateurs de l'entité, calculé une fois. Non bloquant.
    let loginQrCodeDataUrl: string | undefined;
    try {
      loginQrCodeDataUrl = (await generateLoginQrDataUrl(entity?.slug ?? undefined)) ?? undefined;
    } catch (qrErr) {
      console.error("[conventions-intervention-batch] QR login échoué:", qrErr);
    }
    // Client service_role réutilisé pour créer/persister les credentials
    // formateur (email + trainers.temp_password) au fil de la boucle.
    const admin = createServiceRoleClient();

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const tasks = links.map(async (link) => {
      const ftTyped = link as unknown as {
        trainer_id: string;
        agreed_cost_ht: number | null;
        hourly_rate: number | null;
        hours_done: number | null;
        daily_rate: number | null;
        dates_done: string | null;
        trainer: Trainer | null;
      };
      if (!ftTyped.trainer) {
        throw new Error("Formateur introuvable (FK cassée formation_trainers → trainers)");
      }
      const sessionForCost = session as unknown as {
        planned_hours?: number | null;
        start_date?: string | null;
        end_date?: string | null;
      };
      const costHt = computeAgreedCost(ftTyped, {
        hours: sessionForCost.planned_hours ?? null,
        days: sessionDayCount(sessionForCost.start_date, sessionForCost.end_date),
      });
      const trainerWithCost = {
        ...ftTyped.trainer,
        _agreed_cost_ht: costHt,
      } as Trainer & { _agreed_cost_ht: number | null };

      // Credentials PAR formateur (chaque PDF porte l'accès du bon formateur).
      // Non bloquant : en cas d'échec, le PDF se génère sans mdp (bloc + note).
      let trainerCredentials: { email: string; password: string } | undefined;
      try {
        trainerCredentials = await resolveTrainerCredentialsForConvention(admin, {
          trainer: ftTyped.trainer as unknown as TrainerAccountRow & { temp_password?: string | null },
          entitySlug: entity?.slug ?? "",
        });
      } catch (credErr) {
        console.error(
          `[conventions-intervention-batch] credentials formateur ${ftTyped.trainer_id} échoués:`,
          credErr,
        );
      }

      const context: ResolveContext = {
        session: session as unknown as Session,
        trainer: trainerWithCost,
        entity,
        trainerCredentials,
        loginQrCodeDataUrl,
      };
      const resolvedHtml = resolveDocumentVariables(CONVENTION_INTERVENTION_HTML, context);
      const resolvedFooter = resolveDocumentVariables(CONVENTION_INTERVENTION_FOOTER_TEMPLATE, context);

      const result = await service.generate({
        entityId: profile.entity_id,
        docType: "convention_intervention",
        html: resolvedHtml,
        cacheInputs: {
          doc_type: "convention_intervention",
          session_id: body.sessionId,
          trainer_id: ftTyped.trainer_id,
          session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
          custom_variables: { cost_ht: String(costHt ?? "") },
        },
        options: {
          format: "A4",
          margins: { top: "18mm", right: "16mm", bottom: "22mm", left: "16mm" },
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: "<span></span>",
          footerTemplate: resolvedFooter,
        },
      });
      return { trainer: ftTyped.trainer, result };
    });

    const settled = await Promise.allSettled(tasks);

    const zip = new JSZip();
    const errors: BatchError[] = [];
    let successCount = 0;

    settled.forEach((outcome, idx) => {
      const ftTyped = links[idx] as unknown as { trainer_id: string; trainer: Trainer | null };
      const trainer = ftTyped.trainer;
      const trainerName = trainer ? `${trainer.last_name} ${trainer.first_name}` : `Formateur inconnu ${idx + 1}`;
      const trainerId = ftTyped.trainer_id;

      if (outcome.status === "fulfilled") {
        const filename = `contrat-${slugify(trainerName)}.pdf`;
        zip.file(filename, outcome.value.result.buffer);
        successCount += 1;
      } else {
        const errMsg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        errors.push({ trainerId, trainerName, error: errMsg });
      }
    });

    if (errors.length > 0) {
      const report = errors
        .map((e) => `- ${e.trainerName} (id=${e.trainerId}) : ${e.error}`)
        .join("\n");
      zip.file(
        "_erreurs.txt",
        `Échec de génération pour ${errors.length} formateur(s) sur ${links.length} :\n\n${report}\n`,
      );
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return NextResponse.json({
      zipBase64: zipBuffer.toString("base64"),
      totalTrainers: links.length,
      successCount,
      failureCount: errors.length,
      errors,
      totalLatencyMs: Date.now() - t0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating conventions intervention batch") },
      { status: 500 },
    );
  }
}
