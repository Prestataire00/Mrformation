/**
 * POST /api/documents/generate-reglement-interieur
 *
 * Génère le Règlement Intérieur de l'entité courante. Document **statique**
 * au niveau session/client/learner — seul l'organisme varie. Pattern
 * identique aux CGV / RGPD (cf generate-cgv, generate-rgpd).
 *
 * Pas de body. Tous rôles autorisés (admin, trainer, client, learner) — le
 * règlement doit être téléchargeable librement.
 *
 * Retour : `{ pdfBase64, cacheHit, engineUsed, latencyMs, fileSizeBytes }`.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  REGLEMENT_INTERIEUR_HTML,
  REGLEMENT_INTERIEUR_FOOTER_TEMPLATE,
} from "@/lib/templates/reglement-interieur";
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
    const resolvedHtml = resolveDocumentVariables(REGLEMENT_INTERIEUR_HTML, context);
    const resolvedFooter = resolveDocumentVariables(REGLEMENT_INTERIEUR_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "reglement_interieur",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "reglement_interieur",
        custom_variables: {
          name: entity.name ?? "",
          siret: entity.siret ?? "",
          nda: entity.nda ?? "",
          address: entity.address ?? "",
          email: entity.email ?? "",
          phone: entity.phone ?? "",
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
      { error: sanitizeError(err, "generating règlement intérieur") },
      { status: 500 },
    );
  }
}
