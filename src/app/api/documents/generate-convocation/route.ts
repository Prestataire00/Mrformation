/**
 * POST /api/documents/generate-convocation
 *
 * Génère une convocation pour 1 apprenant d'une session.
 *
 * Body : `{ sessionId: UUID, learnerId: UUID }`. L'apprenant doit être inscrit
 * à la session via `enrollments` (gate d'accès).
 *
 * Injecte les credentials de connexion (email + mot de passe temporaire) via
 * `ensureLearnerAccount` (idempotent) — le template affiche les credentials
 * dans le PDF à la place de l'ancien QR code magic link.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
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
import { ensureLearnerAccount } from "@/lib/services/learner-account";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Session, Learner } from "@/lib/types";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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

    // Ensure que l'apprenant a un compte Supabase + mot de passe temporaire
    // (idempotent : réutilise les credentials existants si déjà setup).
    // Remplace l'ancien flow magic link + QR code.
    let learnerCredentials: { email: string; tempPassword: string } | null = null;
    try {
      const serviceClient = createServiceClient();
      learnerCredentials = await ensureLearnerAccount(serviceClient, body.learnerId);
    } catch (err) {
      console.warn("[generate-convocation] ensureLearnerAccount failed:", err);
    }

    const context: ResolveContext = {
      session: session as unknown as Session,
      learner,
      entity,
      learnerCredentials: learnerCredentials ?? undefined,
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
        custom_variables: null,
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
      { error: sanitizeError(err, "generating convocation") },
      { status: 500 },
    );
  }
}
