import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const isResendConfigured =
  !!process.env.RESEND_API_KEY &&
  process.env.RESEND_API_KEY !== "votre-cle-resend";

const resend = isResendConfigured
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_ADDRESS = "LMS Formation <noreply@resend.dev>";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase service role configuration");
  }

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

export async function POST(request: NextRequest) {
  // Auth via CRON_SECRET
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  let sent = 0;
  let failed = 0;

  try {
    // Fetch all pending emails whose scheduled time has passed
    const { data: pendingEmails, error: fetchError } = await supabase
      .from("email_history")
      .select("id, recipient_email, subject, body")
      .eq("status", "pending")
      .lte("sent_at", now);

    if (fetchError) {
      console.error("[process-scheduled] Fetch error:", fetchError.message);
      return NextResponse.json(
        { error: "Failed to fetch pending emails" },
        { status: 500 }
      );
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return NextResponse.json({ processed: 0, sent: 0, failed: 0 });
    }

    for (const email of pendingEmails) {
      let emailStatus: "sent" | "failed" = "sent";
      let errorMessage: string | null = null;

      if (resend) {
        try {
          const result = await resend.emails.send({
            from: FROM_ADDRESS,
            to: [email.recipient_email],
            subject: email.subject,
            html: toHtmlBody(email.body || ""),
            text: email.body || "",
          });

          if (result.error) {
            emailStatus = "failed";
            errorMessage = result.error.message ?? "Resend returned an error";
          }
        } catch (err) {
          emailStatus = "failed";
          errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
        }
      } else {
        // Simulated mode
        console.log("[process-scheduled] Simulated email to:", email.recipient_email, "—", email.subject);
      }

      // Update status in DB
      await supabase
        .from("email_history")
        .update({
          status: emailStatus,
          sent_via: "resend",
          sent_at: new Date().toISOString(),
          error_message: errorMessage,
        })
        .eq("id", email.id);

      if (emailStatus === "sent") {
        sent++;
      } else {
        failed++;
      }
    }

    console.log(`[process-scheduled] Processed ${pendingEmails.length}: ${sent} sent, ${failed} failed`);

    return NextResponse.json({
      processed: pendingEmails.length,
      sent,
      failed,
    });
  } catch (err) {
    console.error("[process-scheduled] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
