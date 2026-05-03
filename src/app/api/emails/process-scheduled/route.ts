import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { computeNextRetryAt, type EmailAttachmentDescriptor } from "@/lib/services/email-queue";
import { resolveAttachments } from "@/lib/services/email-attachments-resolver";

const isResendConfigured =
  !!process.env.RESEND_API_KEY &&
  process.env.RESEND_API_KEY !== "votre-cle-resend";

const resend = isResendConfigured ? new Resend(process.env.RESEND_API_KEY) : null;

// Limites tunables. Pensé pour Netlify Functions (timeout 10s standard, 26s Pro).
// Resend rate limit standard : 100 emails/sec, 10k/jour.
const BATCH_SIZE = 50;          // max emails traités par run
const PARALLEL_CHUNK = 10;      // emails envoyés en parallèle dans un chunk
const RESEND_PAUSE_MS = 250;    // pause entre chunks pour rester sous le rate limit Resend

function getFromAddress(entityName: string): string {
  return entityName.toLowerCase().includes("c3v")
    ? "C3V Formation <noreply@c3vformation.fr>"
    : "MR Formation <noreply@mrformation.fr>";
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function toHtmlBody(body: string): string {
  return `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #374151; white-space: pre-wrap;">${body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />")}</div>`;
}

interface PendingEmail {
  id: string;
  recipient_email: string;
  subject: string;
  body: string | null;
  entity_id: string;
  retry_count: number;
  max_retries: number;
  attachments: EmailAttachmentDescriptor[] | null;
  entities: { name: string } | null;
}

interface SendResult {
  id: string;
  status: "sent" | "failed";
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
}

async function sendOne(supabase: SupabaseClient, email: PendingEmail): Promise<SendResult> {
  if (!resend) {
    // Mode simulé (pas de RESEND_API_KEY) : on marque sent pour ne pas saturer la queue
    console.log("[process-scheduled] Simulated:", email.recipient_email);
    return {
      id: email.id,
      status: "sent",
      errorMessage: null,
      retryCount: email.retry_count,
      maxRetries: email.max_retries,
    };
  }

  try {
    // Résout les pièces jointes (génération PDF via PDFShift, fetch URL, etc.)
    const attachmentDescriptors = email.attachments ?? [];
    const resolvedAttachments =
      attachmentDescriptors.length > 0
        ? await resolveAttachments(supabase, attachmentDescriptors)
        : [];

    const result = await resend.emails.send({
      from: getFromAddress(email.entities?.name || ""),
      to: [email.recipient_email],
      subject: email.subject,
      html: toHtmlBody(email.body || ""),
      text: email.body || "",
      attachments: resolvedAttachments.length > 0
        ? resolvedAttachments.map((a) => ({ filename: a.filename, content: a.content }))
        : undefined,
    });

    if (result.error) {
      return {
        id: email.id,
        status: "failed",
        errorMessage: result.error.message ?? "Resend returned an error",
        retryCount: email.retry_count,
        maxRetries: email.max_retries,
      };
    }

    return {
      id: email.id,
      status: "sent",
      errorMessage: null,
      retryCount: email.retry_count,
      maxRetries: email.max_retries,
    };
  } catch (err) {
    return {
      id: email.id,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Erreur inconnue",
      retryCount: email.retry_count,
      maxRetries: email.max_retries,
    };
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: NextRequest) {
  // Auth via CRON_SECRET (appelé par Netlify Scheduled Function)
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  try {
    // Récupère les emails à traiter :
    //   status = 'pending'
    //   ET (next_retry_at IS NULL OR next_retry_at <= now)  ← retry est dû
    //   ET (scheduled_for IS NULL OR scheduled_for <= now)  ← scheduled est dû
    // L'index idx_email_history_queue couvre le filtre status='pending'.
    const { data: pending, error: fetchError } = await supabase
      .from("email_history")
      .select(
        "id, recipient_email, subject, body, entity_id, retry_count, max_retries, attachments, entities:entities(name)"
      )
      .eq("status", "pending")
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
      .order("sent_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error("[process-scheduled] Fetch error:", fetchError.message);
      return NextResponse.json(
        { error: "Failed to fetch pending emails" },
        { status: 500 }
      );
    }

    if (!pending || pending.length === 0) {
      return NextResponse.json({ processed: 0, sent: 0, failed: 0, retried: 0 });
    }

    // Marque tous les emails sélectionnés en 'processing' pour éviter
    // qu'un autre worker les reprenne (lock optimiste léger).
    const ids = pending.map((e) => e.id);
    await supabase
      .from("email_history")
      .update({ status: "processing", last_attempt_at: now })
      .in("id", ids);

    // Envoi par chunks parallèles avec pause entre chunks (rate limit Resend safe)
    const results: SendResult[] = [];
    const chunks = chunk(pending as unknown as PendingEmail[], PARALLEL_CHUNK);
    for (const c of chunks) {
      const chunkResults = await Promise.all(c.map((email) => sendOne(supabase, email)));
      results.push(...chunkResults);
      // Pause entre chunks sauf pour le dernier
      if (c !== chunks[chunks.length - 1]) await wait(RESEND_PAUSE_MS);
    }

    // Update DB par batch selon le résultat
    let sent = 0;
    let failed = 0;
    let retried = 0;
    let permanent = 0;

    // On groupe les updates par status final pour limiter les round-trips DB
    const successIds: string[] = [];
    type FailUpdate = { id: string; status: "pending" | "failed_permanent"; retry_count: number; next_retry_at: string | null; error_message: string };
    const failUpdates: FailUpdate[] = [];

    for (const r of results) {
      if (r.status === "sent") {
        successIds.push(r.id);
        sent++;
      } else {
        const newRetryCount = r.retryCount + 1;
        const nextRetry = computeNextRetryAt(r.retryCount);
        if (newRetryCount >= r.maxRetries || !nextRetry) {
          failUpdates.push({
            id: r.id,
            status: "failed_permanent",
            retry_count: newRetryCount,
            next_retry_at: null,
            error_message: r.errorMessage || "Echec définitif après retries",
          });
          permanent++;
        } else {
          failUpdates.push({
            id: r.id,
            status: "pending",
            retry_count: newRetryCount,
            next_retry_at: nextRetry.toISOString(),
            error_message: r.errorMessage || "Retry programmé",
          });
          retried++;
        }
        failed++;
      }
    }

    // Bulk update success
    if (successIds.length > 0) {
      await supabase
        .from("email_history")
        .update({
          status: "sent",
          sent_via: "resend",
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .in("id", successIds);
    }

    // Failed : un update par email (champs différents). Supabase ne supporte
    // pas le bulk UPDATE avec valeurs différentes simplement → boucle.
    for (const u of failUpdates) {
      await supabase
        .from("email_history")
        .update({
          status: u.status,
          retry_count: u.retry_count,
          next_retry_at: u.next_retry_at,
          error_message: u.error_message,
          last_attempt_at: new Date().toISOString(),
        })
        .eq("id", u.id);
    }

    console.log(
      `[process-scheduled] Batch ${pending.length}: ${sent} sent, ${retried} retried, ${permanent} failed_permanent`
    );

    return NextResponse.json({
      processed: pending.length,
      sent,
      failed,
      retried,
      failed_permanent: permanent,
    });
  } catch (err) {
    console.error("[process-scheduled] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
