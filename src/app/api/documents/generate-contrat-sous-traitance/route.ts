/**
 * POST /api/documents/generate-contrat-sous-traitance
 *
 * Génère un contrat de sous-traitance Qualiopi (8 articles) pour 1 formateur
 * d'une session.
 *
 * Body : `{ sessionId: UUID, trainerId: UUID }`. Le formateur doit être
 * rattaché à la session via `formation_trainers` (gate d'accès).
 *
 * La liste des stagiaires est extraite des `enrollments` de la session
 * (via `[%Liste des stagiaires de la session%]` → `{{liste_apprenants}}`).
 *
 * Persistance : enregistre le PDF dans `generated_documents` (idempotent,
 * 1 contrat par session+formateur). N'échoue jamais la génération si la
 * persistance échoue.
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  CONTRAT_SOUS_TRAITANCE_HTML,
  CONTRAT_SOUS_TRAITANCE_FOOTER_TEMPLATE,
} from "@/lib/templates/contrat-sous-traitance";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
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

    // Session (gate entity_id) — on charge les enrollments + learners pour la
    // variable [%Liste des stagiaires de la session%]
    const { data: session } = await supabase
      .from("sessions")
      .select(
        "*, training:trainings(*), enrollments(id, learner:learners(id, first_name, last_name, email))",
      )
      .eq("id", body.sessionId)
      .eq("entity_id", profile.entity_id)
      .single();
    if (!session) {
      return NextResponse.json(
        { error: "Session introuvable ou non autorisée" },
        { status: 404 },
      );
    }

    // Lien formation_trainers + trainer
    const { data: ft } = await supabase
      .from("formation_trainers")
      .select("trainer:trainers(*)")
      .eq("session_id", body.sessionId)
      .eq("trainer_id", body.trainerId)
      .maybeSingle();
    if (!ft || !(ft as { trainer?: unknown }).trainer) {
      return NextResponse.json(
        { error: "Formateur non rattaché à cette session" },
        { status: 404 },
      );
    }

    const ftTyped = ft as unknown as { trainer: Trainer };
    const entity = await loadEntitySettings(supabase, profile.entity_id);

    const context: ResolveContext = {
      session: session as unknown as Session,
      trainer: ftTyped.trainer,
      entity,
    };
    const resolvedHtml = resolveDocumentVariables(CONTRAT_SOUS_TRAITANCE_HTML, context);
    const resolvedFooter = resolveDocumentVariables(CONTRAT_SOUS_TRAITANCE_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "contrat_sous_traitance",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "contrat_sous_traitance",
        session_id: body.sessionId,
        trainer_id: body.trainerId,
        session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
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

    // Persistance : enregistre le contrat pour qu'il apparaisse côté formateur.
    // Idempotent (1 contrat par session+formateur). N'échoue jamais la génération.
    try {
      const admin = createServiceRoleClient();
      const trainerName =
        `${ftTyped.trainer.first_name ?? ""} ${ftTyped.trainer.last_name ?? ""}`.trim() ||
        "formateur";
      const path = `contrats-sous-traitance/${body.sessionId}/${body.trainerId}.pdf`;
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
      console.error("[contrat-sous-traitance] persistance échouée:", persistErr);
    }

    return NextResponse.json({
      pdfBase64: result.buffer.toString("base64"),
      cacheHit: result.cacheHit,
      engineUsed: result.engineUsed,
      fileSizeBytes: result.fileSizeBytes,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating contrat sous-traitance") },
      { status: 500 },
    );
  }
}
