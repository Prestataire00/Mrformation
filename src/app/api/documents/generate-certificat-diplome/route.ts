/**
 * POST /api/documents/generate-certificat-diplome
 *
 * Génère un certificat diplôme pour 1 apprenant. Body :
 * `{ sessionId, learnerId }`. Code identification = hash déterministe
 * SHA-256(learnerId+sessionId)[:13].
 *
 * Pour respecter la sémantique "à générer à la fin de la formation",
 * l'API accepte n'importe quelle session sans vérifier `is_completed`
 * (laisse à l'UI le soin de filtrer). Si tu veux strict : ajouter le
 * check ici.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  CERTIFICAT_DIPLOME_HTML,
  CERTIFICAT_DIPLOME_FOOTER_TEMPLATE,
} from "@/lib/templates/certificat-diplome";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import { generateCertificateCode } from "@/lib/services/certificate-code";
import type { Session, Learner } from "@/lib/types";

export async function POST(request: NextRequest) {
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
      .select("entity_id, role")
      .eq("id", user.id)
      .single();
    if (!profile?.entity_id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }
    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const body = (await request.json()) as { sessionId?: string; learnerId?: string };
    if (!body.sessionId || !body.learnerId) {
      return NextResponse.json(
        { error: "sessionId et learnerId sont obligatoires" },
        { status: 400 },
      );
    }

    const { data: session } = await supabase
      .from("sessions")
      .select("*, training:trainings(*)")
      .eq("id", body.sessionId)
      .eq("entity_id", profile.entity_id)
      .single();
    if (!session) {
      return NextResponse.json(
        { error: "Session introuvable ou non autorisée" },
        { status: 404 },
      );
    }

    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id, learner:learners(*)")
      .eq("session_id", body.sessionId)
      .eq("learner_id", body.learnerId)
      .maybeSingle();
    if (!enrollment || !(enrollment as { learner?: unknown }).learner) {
      return NextResponse.json(
        { error: "Apprenant non inscrit à cette session" },
        { status: 404 },
      );
    }
    const learner = (enrollment as unknown as { learner: Learner }).learner;

    const entity = await loadEntitySettings(supabase, profile.entity_id);
    const certificateCode = generateCertificateCode(body.learnerId, body.sessionId);

    const context: ResolveContext = {
      session: session as unknown as Session,
      learner,
      entity,
      certificateCode,
    };
    const resolvedHtml = resolveDocumentVariables(CERTIFICAT_DIPLOME_HTML, context);
    const resolvedFooter = resolveDocumentVariables(CERTIFICAT_DIPLOME_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "certificat_diplome",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "certificat_diplome",
        session_id: body.sessionId,
        learner_id: body.learnerId,
        session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
        custom_variables: { code: certificateCode },
      },
      options: {
        format: "A4",
        margins: { top: "0", right: "0", bottom: "0", left: "0" },
        printBackground: true,
        displayHeaderFooter: false,
        footerTemplate: resolvedFooter,
      },
    });

    return NextResponse.json({
      pdfBase64: result.buffer.toString("base64"),
      cacheHit: result.cacheHit,
      engineUsed: result.engineUsed,
      fileSizeBytes: result.fileSizeBytes,
      latencyMs: result.latencyMs,
      certificateCode,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating certificat diplôme") },
      { status: 500 },
    );
  }
}
