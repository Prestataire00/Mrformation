/**
 * POST /api/documents/generate-emargement-individuel-mock
 *
 * Mock pour la feuille d'émargement individuelle apprenant (1 PDF par
 * apprenant). Reproduit l'exemple Loris : Patrick ATTLAN + 2 créneaux
 * matin/aprem du 10/01/2025.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  EMARGEMENT_INDIVIDUEL_HTML,
  EMARGEMENT_INDIVIDUEL_FOOTER_TEMPLATE,
} from "@/lib/templates/emargement-individuel";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import type { Session, Learner } from "@/lib/types";

export async function POST(_request: NextRequest) {
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

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    const mockLearner: Learner = {
      id: "mock-learner-attlan",
      first_name: "Patrick",
      last_name: "ATTLAN",
      email: "patrick.attlan@example.fr",
      phone: null,
      client_id: null,
      entity_id: profile.entity_id,
      profile_id: null,
      job_title: null,
      learner_type: "salarie",
      created_at: "2025-01-01T00:00:00Z",
    } as Learner;

    const mockSession: Session = {
      id: "mock-session-id",
      entity_id: profile.entity_id,
      training_id: null,
      title: "Accompagner les Managers de Proximité dans leurs missions auprès de leur équipe",
      start_date: "2025-01-10T09:00:00Z",
      end_date: "2025-01-10T17:00:00Z",
      location: "En présentiel",
      mode: "presentiel",
      status: "completed",
      max_participants: 10,
      trainer_id: null,
      notes: null,
      type: "intra",
      domain: null,
      description: null,
      total_price: 1900,
      planned_hours: 14,
      visio_link: null,
      manager_id: null,
      program_id: null,
      is_planned: true,
      is_completed: true,
      is_dpc: false,
      is_subcontracted: false,
      catalog_pre_registration: false,
      updated_at: "2025-01-10T00:00:00Z",
      created_at: "2024-12-01T00:00:00Z",
      training: null,
      enrollments: [],
      formation_trainers: [
        {
          trainer: {
            id: "mock-trainer-1",
            first_name: "Brigitte",
            last_name: "MARTINEAU",
            email: "brigitte@example.fr",
            entity_id: profile.entity_id,
          },
        },
      ],
      formation_time_slots: [
        {
          id: "slot-1",
          session_id: "mock-session-id",
          title: "MATIN",
          start_time: "2025-01-10T09:00:00Z",
          end_time: "2025-01-10T12:00:00Z",
          slot_order: 1,
          module_title: null,
          module_objectives: null,
          module_themes: null,
          module_exercises: null,
          created_at: "2025-01-10T00:00:00Z",
          updated_at: "2025-01-10T00:00:00Z",
        },
        {
          id: "slot-2",
          session_id: "mock-session-id",
          title: "APRES MIDI",
          start_time: "2025-01-10T13:00:00Z",
          end_time: "2025-01-10T17:00:00Z",
          slot_order: 2,
          module_title: null,
          module_objectives: null,
          module_themes: null,
          module_exercises: null,
          created_at: "2025-01-10T00:00:00Z",
          updated_at: "2025-01-10T00:00:00Z",
        },
      ],
    } as unknown as Session;

    // Fake signatures SVG inline (apprenant + formateur) pour montrer les
    // images dans le mock vs juste texte "Présent (A signé en présentiel)".
    const fakeSigSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120" height="40"><path d="M5 30 Q 20 5, 35 25 T 65 20 Q 80 30, 95 15 T 115 22" stroke="#1e3a8a" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
    const fakeSigDataUrl = `data:image/svg+xml;base64,${Buffer.from(fakeSigSvg).toString("base64")}`;
    const signaturesById = new Map<string, string>([
      [mockLearner.id, fakeSigDataUrl],
      ["mock-trainer-1", fakeSigDataUrl],
    ]);

    const context: ResolveContext = {
      session: mockSession,
      learner: mockLearner,
      entity,
      signaturesById,
    };
    const resolvedHtml = resolveDocumentVariables(EMARGEMENT_INDIVIDUEL_HTML, context);
    const resolvedFooter = resolveDocumentVariables(EMARGEMENT_INDIVIDUEL_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "emargement_individuel_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "emargement_individuel_mock",
        session_updated_at: new Date().toISOString(),
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
      mock: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating mock émargement individuel") },
      { status: 500 },
    );
  }
}
