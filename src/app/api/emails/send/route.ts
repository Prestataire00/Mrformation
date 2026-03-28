import { Resend } from "resend";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { decryptToken } from "@/lib/gmail/encryption";
import { sendGmailEmail } from "@/lib/gmail/client";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit-log";

// Only initialise Resend when a real API key is configured
const isResendConfigured =
  !!process.env.RESEND_API_KEY &&
  process.env.RESEND_API_KEY !== "votre-cle-resend";

const resend = isResendConfigured
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Service-role Supabase client for server-side DB writes (bypasses RLS)
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase service role configuration");
  }

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

interface SendEmailPayload {
  to: string;
  subject: string;
  body: string;
  template_id?: string;
  entity_id?: string;
  trainer_id?: string;
  session_id?: string;
  recipient_type?: string;
  recipient_id?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    type?: string;
  }>;
}

// Convert plain-text body to simple HTML (preserve line breaks)
function toHtmlBody(body: string): string {
  return `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #374151; white-space: pre-wrap;">${body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />")}</div>`;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const { allowed, resetAt } = checkRateLimit(`emails-send:${ip}`, { limit: 20, windowSeconds: 60 });
  if (!allowed) return rateLimitResponse(resetAt);

  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const payload: SendEmailPayload = await request.json();
    const { to, subject, body, template_id, trainer_id, session_id, recipient_type, recipient_id } = payload;

    // Validate required fields
    if (!to || !to.trim()) {
      return NextResponse.json(
        { error: "Le champ 'to' (email destinataire) est requis." },
        { status: 400 }
      );
    }
    if (!subject || !subject.trim()) {
      return NextResponse.json(
        { error: "Le champ 'subject' (objet) est requis." },
        { status: 400 }
      );
    }

    const recipientEmail = to.trim().toLowerCase();
    const htmlBody = toHtmlBody(body);

    let emailStatus: "sent" | "failed" | "pending" = "pending";
    let errorMessage: string | null = null;
    let resendId: string | null = null;
    let simulatedOnly = false;
    let sentVia: "resend" | "gmail" = "resend";
    let sentViaGmail = false;

    // Try Gmail first if trainer_id is provided
    if (trainer_id) {
      const supabase = createServiceClient();
      const { data: connection } = await supabase
        .from("gmail_connections")
        .select(
          "encrypted_refresh_token, token_iv, token_auth_tag, gmail_address, trainer_id"
        )
        .eq("trainer_id", trainer_id)
        .eq("is_active", true)
        .single();

      if (connection) {
        try {
          const refreshToken = decryptToken(
            connection.encrypted_refresh_token,
            connection.token_iv,
            connection.token_auth_tag
          );

          // Get trainer name for the From field
          const { data: trainer } = await supabase
            .from("trainers")
            .select("first_name, last_name")
            .eq("id", trainer_id)
            .single();

          const fromName = trainer
            ? `${trainer.first_name} ${trainer.last_name}`
            : undefined;

          const result = await sendGmailEmail(refreshToken, {
            to: recipientEmail,
            subject: subject.trim(),
            htmlBody,
            fromName,
            fromEmail: connection.gmail_address,
          });

          if (result.success) {
            emailStatus = "sent";
            sentVia = "gmail";
            sentViaGmail = true;

            // Update last_used_at
            await supabase
              .from("gmail_connections")
              .update({ last_used_at: new Date().toISOString() })
              .eq("trainer_id", trainer_id);
          } else {
            // Check if token is revoked (401/403 errors)
            const isTokenError =
              result.error?.includes("invalid_grant") ||
              result.error?.includes("Token has been") ||
              result.error?.includes("401") ||
              result.error?.includes("403");

            if (isTokenError) {
              // Mark connection as inactive
              await supabase
                .from("gmail_connections")
                .update({
                  is_active: false,
                  last_error: result.error ?? "Token révoqué",
                })
                .eq("trainer_id", trainer_id);
            }

            console.warn(
              "[emails/send] Gmail send failed, falling back to Resend:",
              result.error
            );
            // Fall through to Resend
          }
        } catch (gmailErr) {
          console.warn(
            "[emails/send] Gmail error, falling back to Resend:",
            gmailErr
          );
          // Fall through to Resend
        }
      }
    }

    // Fallback to Resend if not sent via Gmail
    if (!sentViaGmail) {
      if (resend) {
        try {
          const { data: entityData } = await auth.supabase
            .from("entities").select("name").eq("id", auth.profile.entity_id).single();
          const FROM_ADDRESS = (entityData?.name || "").toLowerCase().includes("c3v")
            ? "C3V Formation <noreply@c3vformation.fr>"
            : "MR Formation <noreply@mrformation.fr>";
          const result = await resend.emails.send({
            from: FROM_ADDRESS,
            to: [recipientEmail],
            subject: subject.trim(),
            html: htmlBody,
            text: body.trim(),
            attachments: payload.attachments?.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content, "base64"),
            })),
          });

          if (result.error) {
            emailStatus = "failed";
            errorMessage =
              result.error.message ?? "Resend returned an error";
          } else {
            emailStatus = "sent";
            resendId = result.data?.id ?? null;
          }
        } catch (sendError: unknown) {
          emailStatus = "failed";
          errorMessage =
            sendError instanceof Error
              ? sendError.message
              : "Erreur inconnue lors de l'envoi";
        }
      } else {
        // No Resend key — log as pending (simulated send)
        emailStatus = "pending";
        simulatedOnly = true;
      }
    }

    // Log to email_history via service-role client
    let historyId: string | null = null;
    try {
      const supabase = createServiceClient();
      const { data: historyRow, error: dbError } = await supabase
        .from("email_history")
        .insert({
          template_id: template_id ?? null,
          recipient_email: recipientEmail,
          subject: subject.trim(),
          body: body.trim() || null,
          status: emailStatus,
          sent_at: new Date().toISOString(),
          entity_id: auth.profile.entity_id,
          sent_by: auth.profile.id,
          error_message: errorMessage,
          trainer_id: trainer_id ?? null,
          sent_via: sentVia,
          session_id: session_id ?? null,
          recipient_type: recipient_type ?? null,
          recipient_id: recipient_id ?? null,
        })
        .select("id")
        .single();

      if (dbError) {
        sanitizeDbError(dbError, "emails/send insert");
      } else {
        historyId = historyRow?.id ?? null;
      }
    } catch (dbErr) {
      console.error("[emails/send] Failed to log email to DB:", dbErr);
    }

    // Build response
    if (simulatedOnly) {
      return NextResponse.json(
        {
          success: true,
          simulated: true,
          history_id: historyId,
          message:
            "RESEND_API_KEY non configurée — email non envoyé, uniquement journalisé.",
        },
        { status: 200 }
      );
    }

    if (emailStatus === "failed") {
      return NextResponse.json(
        {
          success: false,
          error: errorMessage ?? "L'envoi a échoué",
          history_id: historyId,
        },
        { status: 502 }
      );
    }

    logAudit({
      supabase: auth.supabase,
      entityId: auth.profile.entity_id,
      userId: auth.user.id,
      action: "create",
      resourceType: "email",
      resourceId: historyId ?? "unknown",
      details: { name: `Email à ${recipientEmail}: ${subject.trim()}` },
    });

    return NextResponse.json(
      {
        success: true,
        simulated: false,
        resend_id: resendId,
        history_id: historyId,
        sent_via: sentVia,
        message: `Email envoyé avec succès à ${recipientEmail}${sentVia === "gmail" ? " (via Gmail)" : ""}`,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: sanitizeError(err, "emails/send"),
      },
      { status: 500 }
    );
  }
}
