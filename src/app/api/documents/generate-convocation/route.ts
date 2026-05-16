/**
 * POST /api/documents/generate-convocation
 *
 * Génère une convocation pour 1 apprenant d'une session.
 *
 * Body : `{ sessionId: UUID, learnerId: UUID }`. L'apprenant doit être inscrit
 * à la session via `enrollments` (gate d'accès).
 *
 * QR code généré côté serveur (lib qrcode) pointant vers
 * `${APP_URL}/learner/sessions/${sessionId}` (page extranet apprenant).
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import {
  CONVOCATION_APPRENANT_HTML,
  CONVOCATION_APPRENANT_FOOTER_TEMPLATE,
} from "@/lib/templates/convocation-apprenant";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import { getOrCreateConvocationMagicLink } from "@/lib/services/convocation-magic-link";
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

    // Session (gate entity_id) + time slots
    const { data: session } = await supabase
      .from("sessions")
      .select(
        "*, training:trainings(*), formation_time_slots:formation_time_slots(*)",
      )
      .eq("id", body.sessionId)
      .eq("entity_id", profile.entity_id)
      .single();
    if (!session) {
      return NextResponse.json(
        { error: "Session introuvable ou non autorisée" },
        { status: 404 },
      );
    }

    // Enrollment (proof of access) + learner
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

    // Magic link par apprenant : auto-login + redirect vers sa session
    // (token valide 30 jours, réutilisé si déjà existant non-expiré)
    const magicLink = await getOrCreateConvocationMagicLink({
      supabase,
      learnerId: body.learnerId,
      sessionId: body.sessionId,
      entityId: profile.entity_id,
      createdByUserId: user.id,
    });
    const qrDataUrl = await QRCode.toDataURL(magicLink.url, {
      width: 400,
      margin: 1,
      errorCorrectionLevel: "M",
    });

    const context: ResolveContext = {
      session: session as unknown as Session,
      learner,
      entity,
      extranetQrDataUrl: qrDataUrl,
    };
    const resolvedHtml = resolveDocumentVariables(CONVOCATION_APPRENANT_HTML, context);
    const resolvedFooter = resolveDocumentVariables(CONVOCATION_APPRENANT_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "convocation_apprenant",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "convocation_apprenant",
        session_id: body.sessionId,
        learner_id: body.learnerId,
        session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
        // Cache invalidé si le token change (rotation 30j, ou recréation)
        custom_variables: { magic_token: magicLink.token },
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
      magicLinkUrl: magicLink.url,
      magicLinkExpiresAt: magicLink.expiresAt,
      magicLinkReused: magicLink.reused,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating convocation") },
      { status: 500 },
    );
  }
}
