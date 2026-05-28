import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { resolveEmailTemplate } from "@/lib/services/email-template-resolver";

// Story em-b-6 cleanup — Suppression branche legacy + constante TEMPLATES.
// Resolver = chemin unique. Si null → skip + log critical.

const isResendConfigured =
  !!process.env.RESEND_API_KEY &&
  process.env.RESEND_API_KEY !== "votre-cle-resend";

const resend = isResendConfigured ? new Resend(process.env.RESEND_API_KEY) : null;

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function getFromAddress(entityName: string): string {
  return entityName.toLowerCase().includes("c3v")
    ? "C3V Formation <noreply@c3vformation.fr>"
    : "MR Formation <noreply@mrformation.fr>";
}

function toHtml(text: string): string {
  return `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#374151;white-space:pre-wrap;">${text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}</div>`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("fr-FR");
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  let totalReminders = 0;
  let totalExpired = 0;

  try {
    // 1. Auto-expire overdue quotes
    const { data: expiredQuotes } = await supabase
      .from("crm_quotes")
      .update({ status: "expired", updated_at: now.toISOString() })
      .eq("status", "sent")
      .lt("valid_until", today)
      .select("id");
    totalExpired = expiredQuotes?.length || 0;

    // 2. Process reminders for sent quotes
    const { data: sentQuotes } = await supabase
      .from("crm_quotes")
      .select("id, entity_id, reference, prospect_id, client_id, valid_until, reminder_count, sent_at, updated_at, created_at")
      .eq("status", "sent")
      .gte("valid_until", today); // Not expired yet

    if (!sentQuotes || sentQuotes.length === 0) {
      return NextResponse.json({ success: true, totalReminders: 0, totalExpired, message: "No quotes to remind" });
    }

    // Get entity names
    const entityIds = [...new Set(sentQuotes.map((q) => q.entity_id))];
    const { data: entities } = await supabase.from("entities").select("id, name").in("id", entityIds);
    const entityMap = Object.fromEntries((entities || []).map((e) => [e.id, e.name]));

    for (const quote of sentQuotes) {
      const sentDate = new Date(quote.sent_at || quote.updated_at || quote.created_at);
      const daysSinceSent = Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24));
      const reminderCount = quote.reminder_count || 0;

      let reminderType: "first" | "second" | "final" | null = null;
      // Fetch settings
      const { data: qSettings } = await supabase
        .from("reminder_settings")
        .select("reminder_key, is_enabled, days_delay")
        .eq("entity_id", quote.entity_id)
        .in("reminder_key", ["reminder_quote_first", "reminder_quote_second", "reminder_quote_final"]);

      const qDelay = (key: string, fb: number) => (qSettings || []).find((x) => x.reminder_key === key)?.days_delay ?? fb;
      const qEnabled = (key: string) => (qSettings || []).find((x) => x.reminder_key === key)?.is_enabled !== false;

      let reminderTemplateKey = "";
      if (daysSinceSent >= qDelay("reminder_quote_final", 14) && reminderCount < 3 && qEnabled("reminder_quote_final")) {
        reminderType = "final"; reminderTemplateKey = "reminder_quote_final";
      } else if (daysSinceSent >= qDelay("reminder_quote_second", 7) && reminderCount < 2 && qEnabled("reminder_quote_second")) {
        reminderType = "second"; reminderTemplateKey = "reminder_quote_second";
      } else if (daysSinceSent >= qDelay("reminder_quote_first", 3) && reminderCount < 1 && qEnabled("reminder_quote_first")) {
        reminderType = "first"; reminderTemplateKey = "reminder_quote_first";
      }

      if (!reminderType) continue;

      // Find recipient email
      let recipientEmail: string | null = null;
      let prospectName = "";

      if (quote.prospect_id) {
        const { data: p } = await supabase.from("crm_prospects").select("email, company_name").eq("id", quote.prospect_id).maybeSingle();
        recipientEmail = p?.email || null;
        prospectName = p?.company_name || "";
      } else if (quote.client_id) {
        const { data: c } = await supabase.from("clients").select("email, company_name").eq("id", quote.client_id).maybeSingle();
        recipientEmail = (c as Record<string, string> | null)?.email || null;
        prospectName = c?.company_name || "";
      }

      if (!recipientEmail) continue;

      const entityName = entityMap[quote.entity_id] || "MR FORMATION";

      // Build email via resolver unifié (post em-b-6 cleanup)
      const vars: Record<string, string> = {
        "{{reference}}": quote.reference,
        "{{entreprise}}": prospectName,
        "{{prospect}}": prospectName,
        "{{date_echeance}}": quote.valid_until ? formatDate(quote.valid_until) : "",
        "{{date_validite_clause}}": quote.valid_until ? ` le ${formatDate(quote.valid_until)}` : " prochainement",
      };
      const applyVars = (s: string) => {
        let out = s;
        for (const [k, v] of Object.entries(vars)) out = out.replaceAll(k, v);
        return out;
      };

      const resolved = await resolveEmailTemplate(supabase, reminderTemplateKey, quote.entity_id);
      if (!resolved) {
        console.warn(`[quote-reminders] Template ${reminderTemplateKey} introuvable pour entité ${quote.entity_id}, skip ${quote.reference}`);
        continue;
      }
      const subject = applyVars(resolved.subject);
      const textBody = applyVars(resolved.body);

      let emailSent = false;
      if (resend) {
        try {
          const result = await resend.emails.send({
            from: getFromAddress(entityName),
            to: [recipientEmail],
            subject,
            html: toHtml(textBody),
            text: textBody,
          });
          emailSent = !result.error;
        } catch {
          emailSent = false;
        }
      } else {
        console.log(`[quote-reminders] Simulated ${reminderType} to ${recipientEmail}: ${subject}`);
        emailSent = true;
      }

      if (emailSent) {
        await supabase.from("crm_quotes").update({
          reminder_count: reminderCount + 1,
          last_reminder_at: now.toISOString(),
          updated_at: now.toISOString(),
        }).eq("id", quote.id);

        await supabase.from("crm_quote_reminders").insert({
          quote_id: quote.id,
          entity_id: quote.entity_id,
          reminder_type: reminderType,
          email_to: recipientEmail,
        });

        await supabase.from("email_history").insert({
          entity_id: quote.entity_id,
          recipient_email: recipientEmail,
          subject,
          body: textBody,
          status: "sent",
          sent_at: now.toISOString(),
          sent_via: "resend",
        });

        totalReminders++;
      }
    }

    return NextResponse.json({
      success: true,
      totalReminders,
      totalExpired,
      executedAt: now.toISOString(),
    });
  } catch (err) {
    console.error("[quote-reminders] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
