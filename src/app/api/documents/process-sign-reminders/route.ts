import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const isResendConfigured = !!process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== "votre-cle-resend";
const resend = isResendConfigured ? new Resend(process.env.RESEND_API_KEY) : null;

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase config");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function getFromAddress(entityName: string): string {
  return entityName.toLowerCase().includes("c3v")
    ? "C3V Formation <noreply@c3vformation.fr>"
    : "MR Formation <noreply@mrformation.fr>";
}

const DOC_LABELS: Record<string, string> = {
  convention_entreprise: "Convention de formation",
  convention_intervention: "Convention d'intervention",
  contrat_sous_traitance: "Contrat de sous-traitance",
};

function toHtml(text: string): string {
  return `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#374151;white-space:pre-wrap;">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}</div>`;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  let totalReminders = 0;

  try {
    // Fetch documents pending signature (table unifiée `documents`)
    const { data: pendingDocsRaw } = await supabase
      .from("documents")
      .select("id, doc_type, source_id, signature_token, metadata")
      .eq("source_table", "sessions")
      .eq("status", "sent")
      .not("signature_token", "is", null);

    // Filtre côté app : requires_signature dans metadata + signature_requested_at non-null
    const pendingDocs = (pendingDocsRaw ?? [])
      .filter((d) => {
        const meta = d.metadata as { requires_signature?: boolean; signature_requested_at?: string; signer_email?: string } | null;
        return meta?.requires_signature && meta?.signature_requested_at && meta?.signer_email;
      })
      .map((d) => {
        const meta = (d.metadata as Record<string, unknown>);
        return {
          id: d.id as string,
          doc_type: d.doc_type as string,
          session_id: d.source_id as string,
          signature_token: d.signature_token as string,
          signer_email: meta.signer_email as string,
          signer_name: (meta.signer_name as string | undefined) ?? null,
          signature_requested_at: meta.signature_requested_at as string,
          signature_reminder_count: (meta.signature_reminder_count as number | undefined) ?? 0,
          metadata: meta,
        };
      });

    if (pendingDocs.length === 0) {
      return NextResponse.json({ success: true, totalReminders: 0 });
    }

    // Get entity info for FROM address
    const sessionIds = [...new Set(pendingDocs.map((d) => d.session_id))];
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, title, entity_id")
      .in("id", sessionIds);
    const sessionMap = Object.fromEntries((sessions || []).map((s) => [s.id, s]));

    const entityIds = [...new Set((sessions || []).map((s) => s.entity_id))];
    const { data: entities } = await supabase
      .from("entities")
      .select("id, name")
      .in("id", entityIds);
    const entityMap = Object.fromEntries((entities || []).map((e) => [e.id, e.name]));

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || "https://mrformationcrm.netlify.app";

    for (const doc of pendingDocs) {
      const requestedAt = new Date(doc.signature_requested_at);
      const daysSinceRequest = Math.floor((now.getTime() - requestedAt.getTime()) / (1000 * 60 * 60 * 24));
      const reminderCount = doc.signature_reminder_count || 0;

      let shouldRemind = false;
      let reminderLabel = "";
      if (daysSinceRequest >= 14 && reminderCount < 3) { shouldRemind = true; reminderLabel = "urgente"; }
      else if (daysSinceRequest >= 7 && reminderCount < 2) { shouldRemind = true; reminderLabel = "ferme"; }
      else if (daysSinceRequest >= 3 && reminderCount < 1) { shouldRemind = true; reminderLabel = "courtoise"; }

      if (!shouldRemind || !doc.signer_email || !doc.signature_token) continue;

      const session = sessionMap[doc.session_id];
      if (!session) continue;

      const entityName = entityMap[session.entity_id] || "MR FORMATION";
      const docLabel = DOC_LABELS[doc.doc_type] || doc.doc_type;
      const signUrl = `${appUrl}/sign/${doc.signature_token}`;

      const subject = reminderCount >= 2
        ? `URGENT — Document en attente de signature — ${docLabel}`
        : `Rappel — Document à signer — ${docLabel}`;

      const body = `Bonjour${doc.signer_name ? ` ${doc.signer_name}` : ""},\n\n${
        reminderCount >= 2
          ? `Le document "${docLabel}" relatif à la formation "${session.title}" n'a toujours pas été signé.\n\nMerci de procéder à la signature dans les plus brefs délais.`
          : `Nous vous rappelons que le document "${docLabel}" relatif à la formation "${session.title}" est en attente de votre signature.`
      }\n\nPour signer : ${signUrl}\n\nCordialement,\nL'équipe ${entityName}`;

      let sent = false;
      if (resend) {
        try {
          const result = await resend.emails.send({
            from: getFromAddress(entityName),
            to: [doc.signer_email],
            subject,
            html: toHtml(body),
            text: body,
          });
          sent = !result.error;
        } catch { sent = false; }
      } else {
        console.log(`[sign-reminders] Simulated: ${doc.signer_email} — ${subject}`);
        sent = true;
      }

      if (sent) {
        // Increment reminder count dans metadata jsonb
        const newMetadata = { ...doc.metadata, signature_reminder_count: reminderCount + 1 };
        await supabase
          .from("documents")
          .update({ metadata: newMetadata })
          .eq("id", doc.id);
        totalReminders++;
      }
    }

    return NextResponse.json({ success: true, totalReminders, executedAt: now.toISOString() });
  } catch (err) {
    console.error("[sign-reminders] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
