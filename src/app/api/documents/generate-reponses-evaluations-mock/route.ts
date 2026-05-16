/**
 * POST /api/documents/generate-reponses-evaluations-mock
 *
 * Mock : session Managers Proximité — variante simplifiée (2 tableaux
 * seulement : satisfaction + évaluations agrégées).
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  REPONSES_EVALUATIONS_HTML,
  REPONSES_EVALUATIONS_FOOTER_TEMPLATE,
} from "@/lib/templates/reponses-evaluations";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import type { Session } from "@/lib/types";

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

    const mockSession: Session = {
      id: "mock-session-id",
      entity_id: profile.entity_id,
      title: "Accompagner les Managers de Proximité dans leurs missions auprès de leur équipe",
      start_date: "2025-01-10T09:00:00Z",
      end_date: "2025-01-10T17:00:00Z",
      location: "En présentiel - UNICIL, 11 RUE ARMENY 13006 MARSEILLE",
      planned_hours: 14,
    } as unknown as Session;

    const context: ResolveContext = {
      session: mockSession,
      entity,
      sessionAggregates: {
        satisfaction: [
          {
            questionText: "Qualité globale de la formation",
            questionType: "rating",
            averageRating: 4.6,
            distribution: [
              { value: "5", count: 7 },
              { value: "4", count: 3 },
            ],
            responseCount: 10,
          },
          {
            questionText: "Pertinence des contenus pédagogiques",
            questionType: "rating",
            averageRating: 4.4,
            distribution: [
              { value: "5", count: 5 },
              { value: "4", count: 4 },
              { value: "3", count: 1 },
            ],
            responseCount: 10,
          },
          {
            questionText: "Qualité du formateur",
            questionType: "rating",
            averageRating: 4.8,
            distribution: [
              { value: "5", count: 8 },
              { value: "4", count: 2 },
            ],
            responseCount: 10,
          },
          {
            questionText: "Recommanderiez-vous cette formation ?",
            questionType: "yes_no",
            averageRating: null,
            distribution: [
              { value: "true", count: 9 },
              { value: "false", count: 1 },
            ],
            responseCount: 10,
          },
        ],
        qualiopi: {
          totalLearners: 10,
          signedLearnersCount: 10,
          completionRate: 100,
          satisfactionRate: 92,
          satisfactionResponses: 10,
          acquisitionRate: 90,
          evaluationCount: 3,
        },
        evaluations: [
          { title: "Quiz d'entrée — Évaluation des prérequis", responseCount: 10, totalEnrolled: 10, averageScorePct: 78, acquisRate: 80 },
          { title: "Mises en situation — Atelier individuel", responseCount: 10, totalEnrolled: 10, averageScorePct: 85, acquisRate: 100 },
          { title: "Quiz final — Validation des acquis", responseCount: 9, totalEnrolled: 10, averageScorePct: 72, acquisRate: 78 },
        ],
      },
    };
    const resolvedHtml = resolveDocumentVariables(REPONSES_EVALUATIONS_HTML, context);
    const resolvedFooter = resolveDocumentVariables(REPONSES_EVALUATIONS_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "reponses_evaluations_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "reponses_evaluations_mock",
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
      { error: sanitizeError(err, "generating mock réponses évaluations") },
      { status: 500 },
    );
  }
}
