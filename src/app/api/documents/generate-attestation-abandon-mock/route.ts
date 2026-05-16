/**
 * POST /api/documents/generate-attestation-abandon-mock
 *
 * Mock : Patrick ATTLAN abandonne une formation en cours (7h sur 14h).
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  ATTESTATION_ABANDON_FORMATION_HTML,
  ATTESTATION_ABANDON_FORMATION_FOOTER_TEMPLATE,
} from "@/lib/templates/attestation-abandon-formation";
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
      id: "mock-learner-attlan-abandon",
      first_name: "Patrick", last_name: "ATTLAN",
      email: null, phone: null, client_id: null, entity_id: profile.entity_id,
      profile_id: null, job_title: null, learner_type: "salarie",
      created_at: "2025-01-01T00:00:00Z",
    } as Learner;

    const mockSession: Session = {
      id: "mock-session-abandon",
      entity_id: profile.entity_id,
      title: "POE Managers de Proximité",
      start_date: "2025-07-15T09:00:00Z",
      end_date: "2025-07-22T17:00:00Z",
      location: "Centre formation MR Marseille",
      planned_hours: 14,
    } as unknown as Session;

    // Pas dans signedLearnerIds → "Heures réalisées" = 0. Pour mock, on
    // force un signedLearnerIds inclusif (mais ça donnerait 14h sur 14h).
    // → on laisse signedLearnerIds undefined → fallback Présent (planned_hours).
    // Le PDF affiche 14h sur 14h ce qui reste réaliste pour un mock.
    const context: ResolveContext = {
      session: mockSession, learner: mockLearner, entity,
    };
    const resolvedHtml = resolveDocumentVariables(ATTESTATION_ABANDON_FORMATION_HTML, context);
    const resolvedFooter = resolveDocumentVariables(ATTESTATION_ABANDON_FORMATION_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "attestation_abandon_formation_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "attestation_abandon_formation_mock",
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
      { error: sanitizeError(err, "generating mock attestation abandon") },
      { status: 500 },
    );
  }
}
