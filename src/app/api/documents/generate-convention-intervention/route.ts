/**
 * POST /api/documents/generate-convention-intervention
 *
 * Génère un contrat de sous-traitance pour 1 formateur d'une session.
 *
 * Body : `{ sessionId: UUID, trainerId: UUID }`. Le formateur doit être
 * rattaché à la session via `formation_trainers` (gate d'accès).
 *
 * Le coût HT vient de `formation_trainers.agreed_cost_ht` du lien
 * (session, trainer). Fallback : `hourly_rate × hours_done` puis
 * `daily_rate × dates_done.split(',').length`.
 *
 * NB : ce contrat nécessite la migration SQL
 * `add_trainer_subcontracting_fields.sql` (champs trainers.address/siret/nda/
 * extranet_link/signature_url et formation_trainers.agreed_cost_ht). Sans
 * cette migration, les valeurs apparaîtront en `[Placeholder]`.
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
import { computeAgreedCost, sessionDayCount } from "@/lib/utils/trainer-cost";
import { generateLoginQrDataUrl } from "@/lib/services/login-qr-code";
import {
  resolveTrainerCredentialsForConvention,
  type TrainerAccountRow,
} from "@/lib/services/trainer-account";
import type { Session, Trainer } from "@/lib/types";

export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as { sessionId?: string; trainerId?: string };
    if (!body.sessionId || !body.trainerId) {
      return NextResponse.json(
        { error: "sessionId et trainerId sont obligatoires" },
        { status: 400 },
      );
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

    // Lien formation_trainers + trainer + coût HT
    const { data: ft } = await supabase
      .from("formation_trainers")
      .select(
        "agreed_cost_ht, hourly_rate, hours_done, daily_rate, dates_done, trainer:trainers(*)",
      )
      .eq("session_id", body.sessionId)
      .eq("trainer_id", body.trainerId)
      .maybeSingle();
    if (!ft || !(ft as { trainer?: unknown }).trainer) {
      return NextResponse.json(
        { error: "Formateur non rattaché à cette session" },
        { status: 404 },
      );
    }

    const ftTyped = ft as unknown as {
      agreed_cost_ht: number | null;
      hourly_rate: number | null;
      hours_done: number | null;
      daily_rate: number | null;
      dates_done: string | null;
      trainer: Trainer;
    };

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

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    // Bloc « Accès à votre espace formateur » : credentials (email + mdp stable
    // via trainers.temp_password) + QR /login. Logique idempotente (crée le
    // compte si absent, ne réinitialise jamais un login actif). Non bloquant :
    // en cas d'échec, la convention se génère sans mdp (bloc + note).
    let trainerCredentials: { email: string; password: string } | undefined;
    let loginQrCodeDataUrl: string | undefined;
    try {
      const admin = createServiceRoleClient();
      trainerCredentials = await resolveTrainerCredentialsForConvention(admin, {
        trainer: ftTyped.trainer as unknown as TrainerAccountRow & { temp_password?: string | null },
        entitySlug: entity?.slug ?? "",
      });
      loginQrCodeDataUrl = (await generateLoginQrDataUrl(entity?.slug ?? undefined)) ?? undefined;
    } catch (credErr) {
      console.error("[convention-intervention] credentials formateur échoués:", credErr);
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

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "convention_intervention",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "convention_intervention",
        session_id: body.sessionId,
        trainer_id: body.trainerId,
        session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
        custom_variables: {
          cost_ht: String(costHt ?? ""),
        },
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

    // Persistance : enregistrer le contrat pour qu'il apparaisse côté formateur
    // (page « Mes Contrats »). Idempotent (1 convention par session+formateur).
    // N'échoue jamais la génération/preview si la persistance échoue.
    try {
      const admin = createServiceRoleClient();
      const trainerName = `${ftTyped.trainer.first_name ?? ""} ${ftTyped.trainer.last_name ?? ""}`.trim() || "formateur";
      const path = `conventions-intervention/${body.sessionId}/${body.trainerId}.pdf`;
      await admin.storage
        .from("formation-docs")
        .upload(path, result.buffer, { contentType: "application/pdf", upsert: true });
      const { data: urlData } = admin.storage.from("formation-docs").getPublicUrl(path);
      await admin
        .from("generated_documents")
        .delete()
        .eq("session_id", body.sessionId)
        .eq("trainer_id", body.trainerId);
      await admin.from("generated_documents").insert({
        entity_id: profile.entity_id,
        session_id: body.sessionId,
        trainer_id: body.trainerId,
        name: `Contrat de sous-traitance — ${trainerName}`,
        file_url: urlData.publicUrl,
      });
    } catch (persistErr) {
      console.error("[convention-intervention] persistance échouée:", persistErr);
    }

    return NextResponse.json({
      pdfBase64: result.buffer.toString("base64"),
      cacheHit: result.cacheHit,
      engineUsed: result.engineUsed,
      fileSizeBytes: result.fileSizeBytes,
      latencyMs: result.latencyMs,
      costHt,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating convention intervention") },
      { status: 500 },
    );
  }
}
