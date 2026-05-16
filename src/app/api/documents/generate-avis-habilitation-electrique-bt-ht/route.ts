/**
 * POST /api/documents/generate-avis-habilitation-electrique-bt-ht
 *
 * Variante BT-HT (HAUTE TENSION, norme NF C 18-510 A2). Tableau complet
 * avec Domaine de tension. Body : `{ sessionId, learnerId }`.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  AVIS_HABILITATION_ELECTRIQUE_BT_HT_HTML,
  AVIS_HABILITATION_ELECTRIQUE_BT_HT_FOOTER_TEMPLATE,
} from "@/lib/templates/avis-habilitation-electrique-bt-ht";
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

    const body = (await request.json()) as { sessionId?: string; learnerId?: string };
    if (!body.sessionId || !body.learnerId) {
      return NextResponse.json({ error: "sessionId et learnerId sont obligatoires" }, { status: 400 });
    }

    const { data: session } = await supabase
      .from("sessions")
      .select("*, training:trainings(*), formation_trainers:formation_trainers(trainer:trainers(*))")
      .eq("id", body.sessionId).eq("entity_id", profile.entity_id).single();
    if (!session) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from("enrollments").select("id, learner:learners(*)")
      .eq("session_id", body.sessionId).eq("learner_id", body.learnerId).maybeSingle();
    if (!enrollment || !(enrollment as { learner?: unknown }).learner) {
      return NextResponse.json({ error: "Apprenant non inscrit" }, { status: 404 });
    }
    const learner = (enrollment as unknown as { learner: Learner }).learner;

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    const context: ResolveContext = {
      session: session as unknown as Session, learner, entity,
    };
    const resolvedHtml = resolveDocumentVariables(AVIS_HABILITATION_ELECTRIQUE_BT_HT_HTML, context);
    const resolvedFooter = resolveDocumentVariables(AVIS_HABILITATION_ELECTRIQUE_BT_HT_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "avis_habilitation_electrique_bt_ht",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "avis_habilitation_electrique_bt_ht",
        session_id: body.sessionId,
        learner_id: body.learnerId,
        session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
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
      { error: sanitizeError(err, "generating avis habilitation électrique BT-HT") },
      { status: 500 },
    );
  }
}
