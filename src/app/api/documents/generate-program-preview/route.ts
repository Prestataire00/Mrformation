/**
 * POST /api/documents/generate-program-preview
 *
 * Lot F audit BMAD — Génère le PDF de prévisualisation d'un programme depuis
 * sa page admin (/admin/programs/[id]). Remplace le hack window.print() de
 * src/app/(dashboard)/admin/programs/[id]/page.tsx:660 qui ouvrait la page
 * web en print dialog avec un rendu cassé.
 *
 * Diffère de generate-programme :
 *  - prend `programId` au lieu de `sessionId`
 *  - construit une session fictive minimale autour du programme réel pour
 *    que le template (qui attend session + program) fonctionne. Les champs
 *    spécifiques à une session (dates, formateurs, apprenants) sont laissés
 *    vides — c'est une PREVIEW du programme, pas une convention de session.
 *
 * Body : `{ programId: UUID }`
 * Auth : admin / super_admin de l'entité du programme.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  PROGRAMME_FORMATION_HTML,
  PROGRAMME_FORMATION_FOOTER_TEMPLATE,
} from "@/lib/templates/programme-formation";
import { PROGRAMME_FORMATION_V2_HTML } from "@/lib/templates/programme-formation-v2";
import { isEnrichedProgramContent } from "@/lib/utils/program-content";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import { fetchProgramById } from "@/lib/services/programs";
import type { Session } from "@/lib/types";

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

    const body = (await request.json()) as { programId?: string };
    if (!body.programId) {
      return NextResponse.json({ error: "programId est obligatoire" }, { status: 400 });
    }

    // Charge le programme avec entity_id check (defense in depth, cf Lot A/B).
    const programResult = await fetchProgramById(supabase, body.programId, profile.entity_id);
    if (!programResult.ok) {
      return NextResponse.json(
        { error: programResult.error.message },
        { status: 500 },
      );
    }
    if (!programResult.program) {
      return NextResponse.json(
        { error: "Programme introuvable dans l'entité" },
        { status: 404 },
      );
    }

    const program = programResult.program;
    const entity = await loadEntitySettings(supabase, profile.entity_id);

    // Session minimaliste pour que le template fonctionne (resolveDocumentVariables
    // attend un session avec program attaché). Les champs spécifiques session
    // sont laissés à null — c'est une PREVIEW du programme catalogue.
    const previewSession: Session = {
      id: "preview-" + program.id,
      entity_id: profile.entity_id,
      training_id: null,
      title: program.title,
      start_date: null,
      end_date: null,
      location: null,
      mode: "presentiel",
      status: "upcoming",
      max_participants: null,
      trainer_id: null,
      notes: null,
      type: "intra",
      domain: null,
      description: program.description,
      total_price: null,
      planned_hours: program.duration_hours,
      visio_link: null,
      manager_id: null,
      program_id: program.id,
      is_planned: false,
      is_completed: false,
      is_dpc: false,
      is_subcontracted: false,
      catalog_pre_registration: false,
      updated_at: program.updated_at,
      created_at: program.created_at,
      training: null,
      enrollments: [],
      program,
      formation_trainers: [],
      formation_convention_documents: [],
      formation_evaluation_assignments: [],
      formation_satisfaction_assignments: [],
      formation_elearning_assignments: [],
    } as unknown as Session;

    const context: ResolveContext = { session: previewSession, entity };
    // Lot A2 : programme enrichi → template v2 (format exemples client) ;
    // sinon template legacy (aucune régression). Même routage que la route
    // formation pour un aperçu hub cohérent.
    const isEnriched = isEnrichedProgramContent(program.content);
    const tpl = isEnriched ? PROGRAMME_FORMATION_V2_HTML : PROGRAMME_FORMATION_HTML;
    const resolvedHtml = resolveDocumentVariables(tpl, context);
    const resolvedFooter = resolveDocumentVariables(PROGRAMME_FORMATION_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "programme_formation_preview",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "programme_formation_preview",
        // CacheKeyInputs ne reconnaît pas program_id en clé propre — on
        // passe par custom_variables pour invalider quand le programme change.
        custom_variables: {
          program_id: program.id,
          program_updated_at: program.updated_at,
          // Invalide le cache au changement de template (v1 ↔ v2).
          template_version: isEnriched ? "v2" : "v1",
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

    return NextResponse.json({
      pdfBase64: result.buffer.toString("base64"),
      cacheHit: result.cacheHit,
      engineUsed: result.engineUsed,
      fileSizeBytes: result.fileSizeBytes,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating program preview") },
      { status: 500 },
    );
  }
}
