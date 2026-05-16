/**
 * POST /api/documents/generate-attestation-competences-mock
 *
 * Mock : Patrick ATTLAN + Brigitte MARTINEAU + formation Managers Proximité.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  ATTESTATION_COMPETENCES_HTML,
  ATTESTATION_COMPETENCES_FOOTER_TEMPLATE,
} from "@/lib/templates/attestation-competences";
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

    // Fake signature SVG inline pour le mock (montre l'image vs ligne vide)
    const fakeSigSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120" height="40"><path d="M5 30 Q 20 5, 35 25 T 65 20 Q 80 30, 95 15 T 115 22" stroke="#1e3a8a" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
    const fakeSigDataUrl = `data:image/svg+xml;base64,${Buffer.from(fakeSigSvg).toString("base64")}`;

    const mockSession: Session = {
      id: "mock-session-id",
      entity_id: profile.entity_id,
      title: "Accompagner les Managers de Proximité dans leurs missions auprès de leur équipe",
      start_date: "2025-01-10T09:00:00Z",
      end_date: "2025-01-10T17:00:00Z",
      planned_hours: 14,
      training: {
        id: "mock-training",
        entity_id: profile.entity_id,
        title: "Manager de proximité",
        objectives: [
          "Pratiquer l'écoute active avec le gestionnaire",
          "Développer la confiance et favoriser la parole du gestionnaire",
          "Favoriser la relation gagnant-gagnant",
          "Favoriser la parole de groupe et donner un cadre commun clair",
          "Faciliter les relations pour des échanges constructifs",
        ].join("\n"),
      } as unknown as Record<string, unknown>,
      formation_trainers: [
        {
          trainer: {
            id: "mock-trainer-1",
            first_name: "Brigitte",
            last_name: "MARTINEAU",
            email: "brigitte@example.fr",
            entity_id: profile.entity_id,
            signature_url: fakeSigDataUrl,
          },
        },
      ],
    } as unknown as Session;

    const context: ResolveContext = {
      session: mockSession,
      learner: mockLearner,
      entity,
    };
    const resolvedHtml = resolveDocumentVariables(ATTESTATION_COMPETENCES_HTML, context);
    const resolvedFooter = resolveDocumentVariables(ATTESTATION_COMPETENCES_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "attestation_competences_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "attestation_competences_mock",
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
      { error: sanitizeError(err, "generating mock attestation compétences") },
      { status: 500 },
    );
  }
}
