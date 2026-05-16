/**
 * POST /api/documents/generate-cgv
 *
 * Génère les Conditions Générales de Vente de l'entité courante. Document
 * **statique** au niveau session/client/learner — la seule chose dynamique
 * est l'organisme (nom, SIRET, NDA, adresse, logo).
 *
 * Pas de body. Auth requise mais **tous les rôles** y ont accès (admin,
 * trainer, client, learner) — c'est un document que le client et l'apprenant
 * doivent pouvoir télécharger librement depuis leur espace.
 *
 * Retour : `{ pdfBase64, cacheHit, engineUsed, latencyMs, fileSizeBytes }`.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { CGV_HTML, CGV_FOOTER_TEMPLATE } from "@/lib/templates/cgv";
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

    // Auth (tous rôles autorisés — CGV public en interne)
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
    const resolvedHtml = resolveDocumentVariables(CGV_HTML, context);
    const resolvedFooter = resolveDocumentVariables(CGV_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "cgv",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "cgv",
        // Cache invalidé si les params organisme bougent. Pas de updated_at
        // sur entities, on utilise un hash des champs critiques.
        custom_variables: {
          name: entity.name ?? "",
          siret: entity.siret ?? "",
          nda: entity.nda ?? "",
          address: entity.address ?? "",
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
      { error: sanitizeError(err, "generating CGV") },
      { status: 500 },
    );
  }
}
