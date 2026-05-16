/**
 * POST /api/documents/generate-avis-habilitation-electrique-bt-mock
 *
 * Mock variante INITIAL BT : Patrick ATTLAN + Habilitation BS-BR-BE Manoeuvre.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  AVIS_HABILITATION_ELECTRIQUE_BT_HTML,
  AVIS_HABILITATION_ELECTRIQUE_BT_FOOTER_TEMPLATE,
} from "@/lib/templates/avis-habilitation-electrique-bt";
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
      id: "mock-learner-attlan-bt",
      first_name: "Patrick", last_name: "ATTLAN",
      email: null, phone: null, client_id: null, entity_id: profile.entity_id,
      profile_id: null, job_title: null, learner_type: "salarie",
      created_at: "2025-01-01T00:00:00Z",
    } as Learner;

    const mockSession: Session = {
      id: "mock-session-habil-bt",
      entity_id: profile.entity_id,
      title: "Habilitation en électricité – Travaux d'Ordre ELECTRIQUE – INITIAL BT",
      start_date: "2025-02-03T09:00:00Z",
      end_date: "2025-02-05T17:00:00Z",
      location: "Centre de formation MR, 12 rue Saint-Ferréol, 13001 Marseille",
      planned_hours: 21,
      formation_trainers: [
        { trainer: { id: "mock-trainer-bt-1", first_name: "Brigitte", last_name: "MARTINEAU", email: null, entity_id: profile.entity_id } },
      ],
    } as unknown as Session;

    const context: ResolveContext = {
      session: mockSession, learner: mockLearner, entity,
    };
    const resolvedHtml = resolveDocumentVariables(AVIS_HABILITATION_ELECTRIQUE_BT_HTML, context);
    const resolvedFooter = resolveDocumentVariables(AVIS_HABILITATION_ELECTRIQUE_BT_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "avis_habilitation_electrique_bt_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "avis_habilitation_electrique_bt_mock",
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
      { error: sanitizeError(err, "generating mock avis habilitation BT") },
      { status: 500 },
    );
  }
}
