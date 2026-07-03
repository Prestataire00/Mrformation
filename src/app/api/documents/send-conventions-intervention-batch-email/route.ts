/**
 * POST /api/documents/send-conventions-intervention-batch-email
 *
 * Génère N conventions d'intervention (1 par formateur rattaché à la session)
 * + envoie chacune par email au formateur. Story F2.5.
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
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
import {
  executeBatchEmailSend,
  type RecipientGenerationTask,
} from "@/lib/services/batch-email-handler";
import { generateLoginQrDataUrl } from "@/lib/services/login-qr-code";
import {
  resolveTrainerCredentialsForConvention,
  type TrainerAccountRow,
} from "@/lib/services/trainer-account";
import type { Session, Trainer } from "@/lib/types";

function slugify(name: string): string {
  return (
    name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "formateur"
  );
}

function computeAgreedCost(ft: {
  agreed_cost_ht?: number | null;
  hourly_rate?: number | null;
  hours_done?: number | null;
  daily_rate?: number | null;
  dates_done?: string | null;
}): number | null {
  if (typeof ft.agreed_cost_ht === "number" && ft.agreed_cost_ht > 0) return ft.agreed_cost_ht;
  if (typeof ft.hourly_rate === "number" && typeof ft.hours_done === "number") {
    return ft.hourly_rate * ft.hours_done;
  }
  if (typeof ft.daily_rate === "number" && ft.dates_done) {
    const days = ft.dates_done.split(",").filter(Boolean).length;
    if (days > 0) return ft.daily_rate * days;
  }
  return null;
}

interface FormationTrainerLink {
  trainer_id: string;
  agreed_cost_ht: number | null;
  hourly_rate: number | null;
  hours_done: number | null;
  daily_rate: number | null;
  dates_done: string | null;
  trainer: Trainer | null;
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles").select("id, entity_id, role").eq("id", user.id).single();
    if (!profile?.entity_id) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) return NextResponse.json({ error: "sessionId est obligatoire" }, { status: 400 });

    const { data: session } = await supabase
      .from("sessions").select("*, training:trainings(*)")
      .eq("id", body.sessionId).eq("entity_id", profile.entity_id).single();
    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    const { data: links, error: linksError } = await supabase
      .from("formation_trainers")
      .select("trainer_id, agreed_cost_ht, hourly_rate, hours_done, daily_rate, dates_done, trainer:trainers(*)")
      .eq("session_id", body.sessionId);
    if (linksError) {
      return NextResponse.json({ error: `Lecture formation_trainers : ${linksError.message}` }, { status: 500 });
    }
    if (!links || links.length === 0) {
      return NextResponse.json({ error: "Aucun formateur rattaché" }, { status: 404 });
    }

    const formationTrainers = links as unknown as FormationTrainerLink[];
    const validLinks = formationTrainers.filter((l) => l.trainer);

    const entity = await loadEntitySettings(supabase, profile.entity_id);
    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });
    const sessionTitle = (session as { title?: string }).title ?? "Formation";

    // Bloc « Accès à votre espace formateur » : QR /login partagé (calculé une
    // fois) + client service_role pour créer/persister les credentials
    // (trainers.temp_password) au fil des générations. Non bloquant.
    let loginQrCodeDataUrl: string | undefined;
    try {
      loginQrCodeDataUrl = (await generateLoginQrDataUrl(entity?.slug ?? undefined)) ?? undefined;
    } catch (qrErr) {
      console.error("[send-conventions-intervention-batch-email] QR login échoué:", qrErr);
    }
    const admin = createServiceRoleClient();

    const tasks: RecipientGenerationTask[] = validLinks.map((ft) => {
      const trainer = ft.trainer!;
      const costHt = computeAgreedCost(ft);
      return {
        ownerId: ft.trainer_id,
        ownerName: `${trainer.last_name} ${trainer.first_name}`,
        ownerEmail: trainer.email,
        emailSubject: `Convention d'intervention - ${sessionTitle}`,
        emailHtmlBody: `<p>Bonjour ${trainer.first_name ?? ""},</p>
<p>Veuillez trouver ci-joint votre convention d'intervention pour la formation <strong>${sessionTitle}</strong>.</p>
<p>Merci de la retourner signée à notre attention.</p>
<p>Cordialement,<br/>L'équipe formation</p>`,
        emailTextBody: `Bonjour ${trainer.first_name ?? ""},\n\nVeuillez trouver ci-joint votre convention d'intervention pour la formation ${sessionTitle}.\n\nMerci de la retourner signée à notre attention.\n\nCordialement,\nL'équipe formation`,
        attachmentFilename: `contrat-${slugify(`${trainer.last_name} ${trainer.first_name}`)}.pdf`,
        generatePdf: async () => {
          const trainerWithCost = { ...trainer, _agreed_cost_ht: costHt } as Trainer & {
            _agreed_cost_ht: number | null;
          };
          // Credentials PAR formateur (chaque convention envoyée porte l'accès
          // du bon formateur). Non bloquant : sans mdp → bloc + note.
          let trainerCredentials: { email: string; password: string } | undefined;
          try {
            trainerCredentials = await resolveTrainerCredentialsForConvention(admin, {
              trainer: trainer as unknown as TrainerAccountRow & { temp_password?: string | null },
              entitySlug: entity?.slug ?? "",
            });
          } catch (credErr) {
            console.error(
              `[send-conventions-intervention-batch-email] credentials formateur ${ft.trainer_id} échoués:`,
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
          const html = resolveDocumentVariables(CONVENTION_INTERVENTION_HTML, context);
          const footer = resolveDocumentVariables(CONVENTION_INTERVENTION_FOOTER_TEMPLATE, context);
          const result = await service.generate({
            entityId: profile.entity_id,
            docType: "convention_intervention",
            html,
            cacheInputs: {
              doc_type: "convention_intervention",
              session_id: body.sessionId,
              trainer_id: ft.trainer_id,
              session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
              custom_variables: { cost_ht: String(costHt ?? "") },
            },
            options: {
              format: "A4",
              margins: { top: "18mm", right: "16mm", bottom: "22mm", left: "16mm" },
              printBackground: true,
              displayHeaderFooter: true,
              headerTemplate: "<span></span>",
              footerTemplate: footer,
            },
          });
          return result.buffer;
        },
      };
    });

    const outcome = await executeBatchEmailSend(tasks, {
      supabase,
      entityId: profile.entity_id,
      profileId: profile.id,
      sessionId: body.sessionId,
      docType: "convention_intervention",
      ownerType: "trainer",
    });

    return NextResponse.json({ ...outcome, totalLatencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "sending conventions intervention batch email") },
      { status: 500 },
    );
  }
}
