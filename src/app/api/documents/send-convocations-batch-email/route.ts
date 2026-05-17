/**
 * POST /api/documents/send-convocations-batch-email
 *
 * Génère N convocations (1 par apprenant inscrit) ET envoie chacune par email
 * avec le PDF en pièce jointe via Resend. Update `formation_convention_documents.is_sent=true`
 * + log dans `email_history`. Fail-soft : un apprenant sans email est skip
 * proprement (compté dans failureCount, pas dans successCount).
 *
 * Body : `{ sessionId: UUID }`.
 * Réponse : `{ totalRequested, successCount, failureCount, errors, totalLatencyMs }`.
 *
 * Story F2 — Mass send email batch.
 */

import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
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

interface BatchError {
  learnerId: string;
  learnerName: string;
  error: string;
}

const isResendConfigured =
  !!process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== "votre-cle-resend";

const resend = isResendConfigured ? new Resend(process.env.RESEND_API_KEY) : null;

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
      return NextResponse.json(
        { error: "Session introuvable ou non autorisée" },
        { status: 404 },
      );
    }

    const { data: enrollments, error: enrErr } = await supabase
      .from("enrollments")
      .select("learner:learners(*)")
      .eq("session_id", body.sessionId);

    if (enrErr) {
      return NextResponse.json(
        { error: `Lecture enrollments : ${enrErr.message}` },
        { status: 500 },
      );
    }

    const learners = ((enrollments ?? []) as unknown as { learner: Learner | null }[])
      .map((e) => e.learner)
      .filter((l): l is Learner => Boolean(l));

    if (learners.length === 0) {
      return NextResponse.json(
        { error: "Aucun apprenant inscrit à cette session" },
        { status: 404 },
      );
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    // From-address selon l'entité (même règle que /api/emails/send)
    const { data: entityRow } = await supabase
      .from("entities")
      .select("name")
      .eq("id", profile.entity_id)
      .single();
    const fromAddress = (entityRow?.name || "").toLowerCase().includes("c3v")
      ? "C3V Formation <noreply@c3vformation.fr>"
      : "MR Formation <noreply@mrformation.fr>";

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });
    const serviceSupabase = createServiceClient(); // pour writes is_sent + email_history (bypass RLS)

    const sessionTitle = (session as { title?: string }).title ?? "Formation";

    // Pour chaque apprenant : génère PDF + envoie email + update is_sent
    const tasks = learners.map(async (learner) => {
      if (!learner.email) {
        throw new Error("Pas d'email");
      }

      const magicLink = await getOrCreateConvocationMagicLink({
        supabase,
        learnerId: learner.id,
        sessionId: body.sessionId!,
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

      // Générer PDF (Puppeteer + cache)
      const result = await service.generate({
        entityId: profile.entity_id,
        docType: "convocation_apprenant",
        html: resolvedHtml,
        cacheInputs: {
          doc_type: "convocation_apprenant",
          session_id: body.sessionId,
          learner_id: learner.id,
          session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
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

      // Envoyer email via Resend avec PDF en pj
      if (!resend) {
        throw new Error("RESEND_API_KEY non configurée");
      }
      const subject = `Convocation - ${sessionTitle}`;
      const htmlBody = `<p>Bonjour ${learner.first_name ?? ""},</p>
<p>Veuillez trouver ci-joint votre convocation pour la formation <strong>${sessionTitle}</strong>.</p>
<p>Cordialement,<br/>L'équipe formation</p>`;
      const textBody = `Bonjour ${learner.first_name ?? ""},\n\nVeuillez trouver ci-joint votre convocation pour la formation ${sessionTitle}.\n\nCordialement,\nL'équipe formation`;
      const filename = `convocation-${slugify(`${learner.last_name} ${learner.first_name}`)}.pdf`;

      const sendResult = await resend.emails.send({
        from: fromAddress,
        to: [learner.email],
        subject,
        html: htmlBody,
        text: textBody,
        attachments: [{ filename, content: result.buffer }],
      });

      if (sendResult.error) {
        throw new Error(sendResult.error.message ?? "Resend send error");
      }

      // Log dans email_history (best-effort, ne bloque pas si fail)
      try {
        await serviceSupabase.from("email_history").insert({
          recipient_email: learner.email,
          subject,
          body: textBody,
          status: "sent",
          sent_at: new Date().toISOString(),
          entity_id: profile.entity_id,
          sent_by: profile.id,
          session_id: body.sessionId,
          recipient_type: "learner",
          recipient_id: learner.id,
          sent_via: "resend",
        });
      } catch (logErr) {
        console.error("[send-convocations-batch-email] email_history insert failed:", logErr);
      }

      // Update is_sent sur le doc convocation de cet apprenant (si existe)
      try {
        await serviceSupabase
          .from("formation_convention_documents")
          .update({ is_sent: true, sent_at: new Date().toISOString() })
          .eq("session_id", body.sessionId)
          .eq("doc_type", "convocation")
          .eq("owner_type", "learner")
          .eq("owner_id", learner.id);
      } catch (updateErr) {
        console.error("[send-convocations-batch-email] is_sent update failed:", updateErr);
      }

      return { learner, resendId: sendResult.data?.id };
    });

    const settled = await Promise.allSettled(tasks);

    const errors: BatchError[] = [];
    let successCount = 0;

    settled.forEach((outcome, idx) => {
      const learner = learners[idx];
      const name = `${learner.last_name} ${learner.first_name}`;

      if (outcome.status === "fulfilled") {
        successCount += 1;
      } else {
        const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        errors.push({ learnerId: learner.id, learnerName: name, error: msg });
      }
    });

    return NextResponse.json({
      totalRequested: learners.length,
      successCount,
      failureCount: errors.length,
      errors,
      totalLatencyMs: Date.now() - t0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "sending convocations batch email") },
      { status: 500 },
    );
  }
}
