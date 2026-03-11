import { Resend } from "resend";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

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
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (auth.error) return auth.error;

  try {
    const payload: SendEmailPayload = await request.json();
    const { to, subject, body, template_id } = payload;

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
    const FROM_ADDRESS = "LMS Formation <noreply@resend.dev>";

    let emailStatus: "sent" | "failed" | "pending" = "pending";
    let errorMessage: string | null = null;
    let resendId: string | null = null;
    let simulatedOnly = false;

    // Attempt to send via Resend if configured
    if (resend) {
      try {
        // Convert plain-text body to simple HTML (preserve line breaks)
        const htmlBody = `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #374151; white-space: pre-wrap;">${body
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br />")}</div>`;

        const result = await resend.emails.send({
          from: FROM_ADDRESS,
          to: [recipientEmail],
          subject: subject.trim(),
          html: htmlBody,
          text: body.trim(),
        });

        if (result.error) {
          emailStatus = "failed";
          errorMessage = result.error.message ?? "Resend returned an error";
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
        })
        .select("id")
        .single();

      if (dbError) {
        console.error("[emails/send] DB insert error:", dbError.message);
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

    return NextResponse.json(
      {
        success: true,
        simulated: false,
        resend_id: resendId,
        history_id: historyId,
        message: `Email envoyé avec succès à ${recipientEmail}`,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("[emails/send] Unexpected error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erreur interne du serveur",
      },
      { status: 500 }
    );
  }
}
