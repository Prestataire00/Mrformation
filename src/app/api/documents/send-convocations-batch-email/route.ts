/**
 * POST /api/documents/send-convocations-batch-email
 *
 * Génère N convocations (1 par apprenant inscrit) ET envoie chacune par
 * email avec PDF en pj via Resend. Update `formation_convention_documents.is_sent`
 * + log email_history. Fail-soft per-recipient.
 *
 * Body : `{ sessionId: UUID }`.
 *
 * Story F2 — Mass send email batch (MVP convocation).
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
import { generateLoginQrDataUrl } from "@/lib/services/login-qr-code";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  executeBatchEmailSend,
  type RecipientGenerationTask,
} from "@/lib/services/batch-email-handler";
import type { Session, Learner } from "@/lib/types";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 60) || "apprenant"
  );
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();
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
      .select("id, entity_id, role")
      .eq("id", user.id)
      .single();
    if (!profile?.entity_id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }
    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId est obligatoire" }, { status: 400 });
    }

    const { data: session } = await supabase
      .from("sessions")
      .select("*, training:trainings(*), formation_time_slots:formation_time_slots(*)")
      .eq("id", body.sessionId)
      .eq("entity_id", profile.entity_id)
      .single();
    if (!session) {
      return NextResponse.json({ error: "Session introuvable ou non autorisée" }, { status: 404 });
    }

    const { data: enrollments, error: enrErr } = await supabase
      .from("enrollments")
      .select("learner:learners(*)")
      .eq("session_id", body.sessionId);
    if (enrErr) {
      return NextResponse.json({ error: `Lecture enrollments : ${enrErr.message}` }, { status: 500 });
    }

    const learners = ((enrollments ?? []) as unknown as { learner: Learner | null }[])
      .map((e) => e.learner)
      .filter((l): l is Learner => Boolean(l));

    if (learners.length === 0) {
      return NextResponse.json({ error: "Aucun apprenant inscrit à cette session" }, { status: 404 });
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);
    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });
    const sessionTitle = (session as { title?: string }).title ?? "Formation";

    // Service client pour les appels auth.admin (ensureLearnerAccount)
    const serviceClient = createServiceClient();

    // Lot H : QR code connexion pré-calculé 1× pour tout le batch.
    const loginQrCodeDataUrl = (await generateLoginQrDataUrl()) ?? undefined;

    const tasks: RecipientGenerationTask[] = learners.map((learner) => ({
      ownerId: learner.id,
      ownerName: `${learner.last_name} ${learner.first_name}`,
      ownerEmail: learner.email,
      emailSubject: `Convocation - ${sessionTitle}`,
      emailHtmlBody: `<p>Bonjour ${learner.first_name ?? ""},</p>
<p>Veuillez trouver ci-joint votre convocation pour la formation <strong>${sessionTitle}</strong>.</p>
<p>Cordialement,<br/>L'équipe formation</p>`,
      emailTextBody: `Bonjour ${learner.first_name ?? ""},\n\nVeuillez trouver ci-joint votre convocation pour la formation ${sessionTitle}.\n\nCordialement,\nL'équipe formation`,
      attachmentFilename: `convocation-${slugify(`${learner.last_name} ${learner.first_name}`)}.pdf`,
      generatePdf: async () => {
        // Ensure que l'apprenant a un compte Supabase + mot de passe temporaire
        // (idempotent : réutilise les credentials existants si déjà setup).
        let learnerCredentials: { email: string; tempPassword: string } | null = null;
        try {
          learnerCredentials = await ensureLearnerAccount(serviceClient, learner.id);
        } catch (err) {
          console.warn("[send-convocations-batch-email] ensureLearnerAccount failed:", err);
        }
        const context: ResolveContext = {
          session: session as unknown as Session,
          learner,
          entity,
          learnerCredentials: learnerCredentials ?? undefined,
          loginQrCodeDataUrl,
        };
        const html = resolveDocumentVariables(CONVOCATION_APPRENANT_HTML, context);
        const footer = resolveDocumentVariables(CONVOCATION_APPRENANT_FOOTER_TEMPLATE, context);
        const result = await service.generate({
          entityId: profile.entity_id,
          docType: "convocation_apprenant",
          html,
          cacheInputs: {
            doc_type: "convocation_apprenant",
            session_id: body.sessionId,
            learner_id: learner.id,
            session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
            // Lot H : bump pour invalider les anciennes convocations en cache.
            custom_variables: { template_version: "lot-h" },
          },
          options: {
            format: "A4",
            margins: { top: "18mm", right: "16mm", bottom: "22mm", left: "16mm" },
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: "<span></span>",
            footerTemplate: footer,
          },
        });
        return result.buffer;
      },
    }));

    const outcome = await executeBatchEmailSend(tasks, {
      supabase,
      entityId: profile.entity_id,
      profileId: profile.id,
      sessionId: body.sessionId,
      docType: "convocation",
      ownerType: "learner",
    });

    return NextResponse.json({ ...outcome, totalLatencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "sending convocations batch email") },
      { status: 500 },
    );
  }
}
