/**
 * POST /api/documents/generate-resultats-evaluations-mock
 *
 * Mock : Patrick ATTLAN avec 3 évaluations fake (2 acquises, 1 non acquise).
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  RESULTATS_EVALUATIONS_HTML,
  RESULTATS_EVALUATIONS_FOOTER_TEMPLATE,
} from "@/lib/templates/resultats-evaluations";
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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: profile } = await supabase
      .from("profiles").select("entity_id, role").eq("id", user.id).single();
    if (!profile?.entity_id) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    const mockLearner: Learner = {
      id: "mock-learner-attlan",
      first_name: "Patrick",
      last_name: "ATTLAN",
      email: null, phone: null, client_id: null, entity_id: profile.entity_id,
      profile_id: null, job_title: null, learner_type: "salarie",
      created_at: "2025-01-01T00:00:00Z",
    } as Learner;

    const mockSession: Session = {
      id: "mock-session-id",
      entity_id: profile.entity_id,
      title: "Accompagner les Managers de Proximité dans leurs missions auprès de leur équipe",
      start_date: "2025-01-10T09:00:00Z",
      end_date: "2025-01-10T17:00:00Z",
      planned_hours: 14,
    } as unknown as Session;

    const context: ResolveContext = {
      session: mockSession,
      learner: mockLearner,
      entity,
      evaluationResults: [
        {
          title: "Quiz d'entrée — Évaluation des prérequis",
          completedAt: "2025-01-10T09:15:00Z",
          score: 8,
          maxScore: 10,
          percentage: 80,
          status: "acquis",
        },
        {
          title: "Mises en situation — Atelier individuel",
          completedAt: "2025-01-10T14:30:00Z",
          score: 12,
          maxScore: 15,
          percentage: 80,
          status: "acquis",
        },
        {
          title: "Quiz final — Validation des acquis",
          completedAt: "2025-01-10T16:45:00Z",
          score: 11,
          maxScore: 20,
          percentage: 55,
          status: "non_acquis",
        },
      ],
    };
    const resolvedHtml = resolveDocumentVariables(RESULTATS_EVALUATIONS_HTML, context);
    const resolvedFooter = resolveDocumentVariables(RESULTATS_EVALUATIONS_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "resultats_evaluations_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "resultats_evaluations_mock",
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
      { error: sanitizeError(err, "generating mock résultats évaluations") },
      { status: 500 },
    );
  }
}
