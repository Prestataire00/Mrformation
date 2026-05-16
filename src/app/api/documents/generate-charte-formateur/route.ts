/**
 * POST /api/documents/generate-charte-formateur
 *
 * Génère 1 charte pour 1 formateur (PAS lié à une session — c'est un
 * onboarding generic). Body : `{ trainerId }`.
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

export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as { trainerId?: string };
    if (!body.trainerId) {
      return NextResponse.json({ error: "trainerId est obligatoire" }, { status: 400 });
    }

    const { data: trainer } = await supabase
      .from("trainers")
      .select("*")
      .eq("id", body.trainerId)
      .eq("entity_id", profile.entity_id)
      .maybeSingle();
    if (!trainer) {
      return NextResponse.json({ error: "Formateur introuvable" }, { status: 404 });
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    const context: ResolveContext = {
      entity,
      trainer: trainer as unknown as Trainer,
    };
    const resolvedHtml = resolveDocumentVariables(CHARTE_FORMATEUR_HTML, context);
    const resolvedFooter = resolveDocumentVariables(CHARTE_FORMATEUR_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "charte_formateur",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "charte_formateur",
        trainer_id: body.trainerId,
        // Pas de session — invalidé si trainer modifié (incl. signature_url)
        custom_variables: {
          has_signature: (trainer as { signature_url?: string }).signature_url ? "1" : "0",
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
      { error: sanitizeError(err, "generating charte formateur") },
      { status: 500 },
    );
  }
}
