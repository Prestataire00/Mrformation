/**
 * POST /api/documents/generate-reponses-satisfaction
 *
 * Génère 1 PDF "Réponses satisfaction apprenants" pour 1 session.
 * Body : `{ sessionId }`.
 *
 * Per-session (pas per-learner) → 1 seul endpoint single, pas de batch.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  REPONSES_SATISFACTION_HTML,
  REPONSES_SATISFACTION_FOOTER_TEMPLATE,
} from "@/lib/templates/reponses-satisfaction-session";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import { loadSessionAggregates } from "@/lib/services/load-session-aggregates";
import type { Session } from "@/lib/types";

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

    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId est obligatoire" }, { status: 400 });
    }

    const { data: session } = await supabase
      .from("sessions").select("*, training:trainings(*)")
      .eq("id", body.sessionId).eq("entity_id", profile.entity_id).single();
    if (!session) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    const [entity, sessionAggregates] = await Promise.all([
      loadEntitySettings(supabase, profile.entity_id),
      loadSessionAggregates(supabase, body.sessionId),
    ]);

    const context: ResolveContext = {
      session: session as unknown as Session,
      entity,
      sessionAggregates,
    };
    const resolvedHtml = resolveDocumentVariables(REPONSES_SATISFACTION_HTML, context);
    const resolvedFooter = resolveDocumentVariables(REPONSES_SATISFACTION_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "reponses_satisfaction",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "reponses_satisfaction",
        session_id: body.sessionId,
        session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
        custom_variables: {
          sat_responses: String(sessionAggregates.qualiopi.satisfactionResponses),
          completion_rate: String(sessionAggregates.qualiopi.completionRate.toFixed(0)),
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
      qualiopi: sessionAggregates.qualiopi,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating réponses satisfaction") },
      { status: 500 },
    );
  }
}
