/**
 * POST /api/documents/generate-attestation-aipr-echec-mock
 *
 * Mock AIPR avec résultat ÉCHEC (vs success). Patrick ATTLAN + UNICIL +
 * ticket "MARSEILLE" + date 10/01/2025 → "a échoué cet examen".
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  ATTESTATION_AIPR_HTML,
  ATTESTATION_AIPR_FOOTER_TEMPLATE,
} from "@/lib/templates/attestation-aipr";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import type { Session, Client, Learner } from "@/lib/types";

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

    const mockClient: Client = {
      id: "mock-client-unicil",
      entity_id: profile.entity_id,
      company_name: "UNICIL",
      siret: "57362075400032",
      address: "11 RUE ARMENY",
      postal_code: "13006",
      city: "MARSEILLE",
      website: null, sector: null, naf_code: null, bpf_category: null,
      status: "active", notes: null,
      created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z",
      contacts: [],
    } as Client;

    const mockLearner = {
      id: "mock-learner-attlan",
      first_name: "Patrick",
      last_name: "ATTLAN",
      email: null, phone: null,
      client_id: mockClient.id,
      entity_id: profile.entity_id,
      profile_id: null, job_title: null,
      learner_type: "salarie",
      birth_city: "MARSEILLE",
      created_at: "2025-01-01T00:00:00Z",
    } as unknown as Learner;

    const mockSession: Session = {
      id: "mock-session-id",
      entity_id: profile.entity_id,
      title: "Formation AIPR — Habilitation Réseaux",
      start_date: "2025-01-10T09:00:00Z",
      end_date: "2025-01-10T17:00:00Z",
      planned_hours: 7,
      formation_trainers: [
        { trainer: { id: "mock-trainer-1", first_name: "Brigitte", last_name: "MARTINEAU", email: "brigitte@example.fr", entity_id: profile.entity_id } },
      ],
    } as unknown as Session;

    const context: ResolveContext = {
      session: mockSession,
      learner: mockLearner,
      client: mockClient,
      entity,
      aiprExamResult: "echec",
    };
    const resolvedHtml = resolveDocumentVariables(ATTESTATION_AIPR_HTML, context);
    const resolvedFooter = resolveDocumentVariables(ATTESTATION_AIPR_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "attestation_aipr_echec_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "attestation_aipr_echec_mock",
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
      { error: sanitizeError(err, "generating mock AIPR échec") },
      { status: 500 },
    );
  }
}
