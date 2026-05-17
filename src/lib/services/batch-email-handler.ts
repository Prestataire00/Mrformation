/**
 * Helper commun pour les endpoints `/api/documents/send-X-batch-email`
 * (Story F2 et extensions F2.x).
 *
 * Factorise : init Resend + fromAddress par entité + Promise.allSettled
 * + envoi Resend avec PDF en pj + log email_history + update is_sent
 * (les 2 writes en best-effort, ne bloquent pas la réponse).
 *
 * Chaque endpoint reste responsable du chargement métier (session,
 * enrollments, clients, trainers, etc.). Il fournit une liste de
 * `RecipientGenerationTask` au helper qui génère le PDF lazy (skip
 * si email absent) puis envoie.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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

export interface RecipientGenerationTask {
  ownerId: string;
  ownerName: string;
  ownerEmail: string | null;
  /** Génère le PDF buffer. Appelée seulement si `ownerEmail` est présent. */
  generatePdf: () => Promise<Buffer>;
  emailSubject: string;
  emailHtmlBody: string;
  emailTextBody: string;
  attachmentFilename: string;
}

export interface BatchSendError {
  ownerId: string;
  ownerName: string;
  error: string;
}

export interface BatchSendOutcome {
  totalRequested: number;
  successCount: number;
  failureCount: number;
  errors: BatchSendError[];
}

export interface BatchSendOptions {
  supabase: SupabaseClient;
  entityId: string;
  profileId: string;
  sessionId: string;
  docType: string;
  /** Filtre owner_type pour l'update is_sent (learner / company / trainer). */
  ownerType: "learner" | "company" | "trainer";
}

/**
 * Pour chaque task : génère PDF lazy → envoie Resend + log email_history
 * + update is_sent. Promise.allSettled : une erreur individuelle n'arrête
 * pas les autres.
 */
export async function executeBatchEmailSend(
  tasks: RecipientGenerationTask[],
  options: BatchSendOptions,
): Promise<BatchSendOutcome> {
  if (!resend) {
    throw new Error("RESEND_API_KEY non configurée");
  }

  // From-address selon l'entité (même règle que /api/emails/send)
  const { data: entityRow } = await options.supabase
    .from("entities")
    .select("name")
    .eq("id", options.entityId)
    .single();
  const fromAddress = (entityRow?.name || "").toLowerCase().includes("c3v")
    ? "C3V Formation <noreply@c3vformation.fr>"
    : "MR Formation <noreply@mrformation.fr>";

  const serviceSupabase = createServiceClient();
  const errors: BatchSendError[] = [];
  let successCount = 0;

  const settled = await Promise.allSettled(
    tasks.map(async (task) => {
      if (!task.ownerEmail) {
        throw new Error("Pas d'email");
      }

      // Génère PDF (lazy : skippé si email absent ci-dessus)
      const pdfBuffer = await task.generatePdf();

      const sendResult = await resend!.emails.send({
        from: fromAddress,
        to: [task.ownerEmail],
        subject: task.emailSubject,
        html: task.emailHtmlBody,
        text: task.emailTextBody,
        attachments: [{ filename: task.attachmentFilename, content: pdfBuffer }],
      });

      if (sendResult.error) {
        throw new Error(sendResult.error.message ?? "Resend send error");
      }

      // Log email_history (best-effort)
      try {
        await serviceSupabase.from("email_history").insert({
          recipient_email: task.ownerEmail,
          subject: task.emailSubject,
          body: task.emailTextBody,
          status: "sent",
          sent_at: new Date().toISOString(),
          entity_id: options.entityId,
          sent_by: options.profileId,
          session_id: options.sessionId,
          recipient_type: options.ownerType,
          recipient_id: task.ownerId,
          sent_via: "resend",
        });
      } catch (logErr) {
        console.error("[batch-email-handler] email_history insert failed:", logErr);
      }

      // Update is_sent sur le doc correspondant (best-effort)
      try {
        await serviceSupabase
          .from("formation_convention_documents")
          .update({ is_sent: true, sent_at: new Date().toISOString() })
          .eq("session_id", options.sessionId)
          .eq("doc_type", options.docType)
          .eq("owner_type", options.ownerType)
          .eq("owner_id", task.ownerId);
      } catch (updateErr) {
        console.error("[batch-email-handler] is_sent update failed:", updateErr);
      }

      return { ownerId: task.ownerId, resendId: sendResult.data?.id };
    }),
  );

  settled.forEach((outcome, idx) => {
    const task = tasks[idx];
    if (outcome.status === "fulfilled") {
      successCount += 1;
    } else {
      const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      errors.push({ ownerId: task.ownerId, ownerName: task.ownerName, error: msg });
    }
  });

  return {
    totalRequested: tasks.length,
    successCount,
    failureCount: errors.length,
    errors,
  };
}
