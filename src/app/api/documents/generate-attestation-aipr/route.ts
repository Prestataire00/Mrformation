/**
 * POST /api/documents/generate-attestation-aipr
 *
 * Génère 1 attestation AIPR pour 1 apprenant.
 * Body : `{ sessionId, learnerId }`.
 *
 * Charge enrollment + learner (avec birth_city) + client (entreprise
 * présentatrice) + entity + formation_trainers (surveillant).
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

    const body = (await request.json()) as {
      sessionId?: string;
      learnerId?: string;
      result?: "success" | "echec";
    };
    if (!body.sessionId || !body.learnerId) {
      return NextResponse.json(
        { error: "sessionId et learnerId sont obligatoires" },
        { status: 400 },
      );
    }
    const aiprExamResult: "success" | "echec" = body.result === "echec" ? "echec" : "success";

    const { data: session } = await supabase
      .from("sessions")
      .select("*, training:trainings(*), formation_trainers:formation_trainers(trainer:trainers(*))")
      .eq("id", body.sessionId).eq("entity_id", profile.entity_id).single();
    if (!session) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id, client_id, learner:learners(*)")
      .eq("session_id", body.sessionId).eq("learner_id", body.learnerId).maybeSingle();
    if (!enrollment || !(enrollment as { learner?: unknown }).learner) {
      return NextResponse.json({ error: "Apprenant non inscrit" }, { status: 404 });
    }
    const enrTyped = enrollment as unknown as { client_id: string | null; learner: Learner };
    const learner = enrTyped.learner;

    let client: Client | null = null;
    if (enrTyped.client_id) {
      const { data: c } = await supabase
        .from("clients").select("*, contacts(*)")
        .eq("id", enrTyped.client_id).maybeSingle();
      client = (c as unknown as Client) ?? null;
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    const context: ResolveContext = {
      session: session as unknown as Session,
      learner,
      client,
      entity,
      aiprExamResult,
    };
    const resolvedHtml = resolveDocumentVariables(ATTESTATION_AIPR_HTML, context);
    const resolvedFooter = resolveDocumentVariables(ATTESTATION_AIPR_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "attestation_aipr",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: aiprExamResult === "echec" ? "attestation_aipr_echec" : "attestation_aipr",
        session_id: body.sessionId,
        learner_id: body.learnerId,
        client_id: enrTyped.client_id ?? null,
        session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
        custom_variables: { result: aiprExamResult },
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
      { error: sanitizeError(err, "generating AIPR") },
      { status: 500 },
    );
  }
}
