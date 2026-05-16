/**
 * POST /api/documents/generate-rgpd
 *
 * Génère la Politique RGPD de l'entité courante. Document **statique** au
 * niveau session/client/learner — seul l'organisme (nom, email, adresse,
 * SIRET, NDA, logo) varie. Pattern identique aux CGV (cf generate-cgv).
 *
 * Pas de body. Tous rôles autorisés (admin, trainer, client, learner) — la
 * RGPD doit être téléchargeable librement depuis chaque espace.
 *
 * Retour : `{ pdfBase64, cacheHit, engineUsed, latencyMs, fileSizeBytes }`.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  POLITIQUE_RGPD_HTML,
  POLITIQUE_RGPD_FOOTER_TEMPLATE,
} from "@/lib/templates/politique-rgpd";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";

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
      .select("entity_id")
      .eq("id", user.id)
      .single();
    if (!profile?.entity_id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);
    if (!entity) {
      return NextResponse.json(
        { error: "Paramètres organisme introuvables" },
        { status: 404 },
      );
    }

    const context: ResolveContext = { entity };
    const resolvedHtml = resolveDocumentVariables(POLITIQUE_RGPD_HTML, context);
    const resolvedFooter = resolveDocumentVariables(POLITIQUE_RGPD_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "politique_rgpd",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "politique_rgpd",
        custom_variables: {
          name: entity.name ?? "",
          siret: entity.siret ?? "",
          nda: entity.nda ?? "",
          address: entity.address ?? "",
          email: entity.email ?? "",
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
      { error: sanitizeError(err, "generating RGPD") },
      { status: 500 },
    );
  }
}
