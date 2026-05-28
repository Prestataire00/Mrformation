import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveEmailTemplate } from "@/lib/services/email-template-resolver";
import { enqueueEmail } from "@/lib/services/email-queue";

// em-c-10 — Refactor : passage de l'envoi Resend synchrone vers enqueueEmail.
// Cohérence pipeline avec invoices/process-reminders (em-b-1) :
// - support attachments (em-c-10 ajoute le descriptor devis)
// - retry/backoff via worker process-scheduled
// - 1 seule insert email_history (status='pending') au lieu de send + insert
//
// em-b-6 cleanup déjà fait : pas de branche legacy/TEMPLATES, resolver unique.

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
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
  const errors: string[] = [];

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
        errors.push(`${quote.reference}: template ${reminderTemplateKey} introuvable pour entité ${quote.entity_id}`);
        continue;
      }
      const subject = applyVars(resolved.subject);
      const textBody = applyVars(resolved.body);

      // em-c-10 — Construit les attachments depuis le template résolu.
      // Si le template "Relance devis" a `devis` dans ses attachment_doc_types,
      // on joint un descriptor type:'devis' qui sera résolu par
      // email-attachments-resolver vers le PDF devis (Puppeteer + template HTML).
      const attachments: Array<{ type: "devis"; payload: { quote_id: string } }> = [];
      const docTypes = (resolved as { attachment_doc_types?: string[] | null })
        .attachment_doc_types ?? [];
      if (docTypes.includes("devis")) {
        attachments.push({ type: "devis", payload: { quote_id: quote.id } });
      }

      // H6 (cf. invoices/process-reminders) — la mise en file et l'incrément du
      // compteur sont enveloppés dans un try/catch PAR devis : un échec de
      // mise en file n'incrémente PAS le compteur (sinon la relance serait
      // définitivement perdue) et n'interrompt PAS le traitement des autres.
      try {
        await enqueueEmail(supabase, {
          to: recipientEmail,
          subject,
          body: textBody,
          entity_id: quote.entity_id,
          attachments: attachments.length > 0 ? attachments : undefined,
        });

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

        totalReminders++;
      } catch (enqueueErr) {
        const msg = enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr);
        console.error(`[quote-reminders] enqueue échoué pour ${quote.reference}:`, msg);
        errors.push(`${quote.reference}: enqueue échoué — ${msg}`);
        // Pas d'incrément reminder_count — la relance sera retentée au prochain run.
      }
    }

    return NextResponse.json({
      success: true,
      totalReminders,
      totalExpired,
      errors: errors.length > 0 ? errors : undefined,
      executedAt: now.toISOString(),
    });
  } catch (err) {
    console.error("[quote-reminders] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
