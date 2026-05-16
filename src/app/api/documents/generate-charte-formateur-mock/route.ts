/**
 * POST /api/documents/generate-charte-formateur-mock
 *
 * Mock : Brigitte MARTINEAU + entité courante (MR ou C3V selon contexte).
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  CHARTE_FORMATEUR_HTML,
  CHARTE_FORMATEUR_FOOTER_TEMPLATE,
} from "@/lib/templates/charte-formateur";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import type { Trainer } from "@/lib/types";

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

    // Fake signature SVG inline
    const fakeSigSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120" height="40"><path d="M5 30 Q 20 5, 35 25 T 65 20 Q 80 30, 95 15 T 115 22" stroke="#1e3a8a" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
    const fakeSigDataUrl = `data:image/svg+xml;base64,${Buffer.from(fakeSigSvg).toString("base64")}`;

    const mockTrainer = {
      id: "mock-trainer-1",
      profile_id: null,
      entity_id: profile.entity_id,
      first_name: "Brigitte",
      last_name: "MARTINEAU",
      email: "brigitte.martineau@example.fr",
      phone: "06 12 34 56 78",
      type: "external",
      bio: null,
      hourly_rate: 75,
      availability_notes: null,
      created_at: "2025-01-01T00:00:00Z",
      address: null,
      postal_code: null,
      city: null,
      siret: null,
      nda: null,
      extranet_link: null,
      signature_url: fakeSigDataUrl,
    } as unknown as Trainer;

    const context: ResolveContext = {
      entity,
      trainer: mockTrainer,
    };
    const resolvedHtml = resolveDocumentVariables(CHARTE_FORMATEUR_HTML, context);
    const resolvedFooter = resolveDocumentVariables(CHARTE_FORMATEUR_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "charte_formateur_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "charte_formateur_mock",
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
      { error: sanitizeError(err, "generating mock charte formateur") },
      { status: 500 },
    );
  }
}
