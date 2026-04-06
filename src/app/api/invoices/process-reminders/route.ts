import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

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

// ── Reminder templates ──

const REMINDER_TEMPLATES = {
  first: {
    subject: (ref: string) => `Rappel de paiement — Facture ${ref}`,
    body: (data: { reference: string; montant: string; entreprise: string; formation: string; dateEcheance: string }) =>
      `Bonjour,\n\nNous vous informons que la facture ${data.reference} d'un montant de ${data.montant} relative à la formation "${data.formation}" est arrivée à échéance le ${data.dateEcheance}.\n\nNous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.\n\nCordialement,\nL'équipe formation`,
  },
  second: {
    subject: (ref: string) => `Deuxième rappel — Facture ${ref} impayée`,
    body: (data: { reference: string; montant: string; entreprise: string; formation: string; dateEcheance: string }) =>
      `Bonjour,\n\nMalgré notre précédent rappel, la facture ${data.reference} d'un montant de ${data.montant} relative à la formation "${data.formation}" reste impayée.\n\nÉchéance initiale : ${data.dateEcheance}\n\nNous vous prions de régulariser cette situation dans un délai de 7 jours.\n\nCordialement,\nL'équipe formation`,
  },
  final: {
    subject: (ref: string) => `Mise en demeure — Facture ${ref}`,
    body: (data: { reference: string; montant: string; entreprise: string; formation: string; dateEcheance: string }) =>
      `Bonjour,\n\nLa présente vaut mise en demeure.\n\nLa facture ${data.reference} d'un montant de ${data.montant} relative à la formation "${data.formation}" reste impayée malgré nos précédents rappels.\n\nÉchéance initiale : ${data.dateEcheance}\n\nSans règlement sous 8 jours, nous serons contraints d'engager des procédures de recouvrement. Des pénalités de retard de 40€ seront également appliquées conformément à la réglementation.\n\nCordialement,\nL'équipe formation`,
  },
};

function toHtml(text: string): string {
  return `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#374151;white-space:pre-wrap;">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>")}</div>`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("fr-FR");
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);
}

// ── Main handler ──

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  let totalReminders = 0;
  const errors: string[] = [];

  try {
    // Fetch all overdue unpaid invoices
    const { data: overdueInvoices } = await supabase
      .from("formation_invoices")
      .select("id, entity_id, reference, amount, recipient_name, recipient_type, recipient_id, due_date, status, reminder_count, session_id, is_avoir")
      .in("status", ["pending", "sent", "late"])
      .eq("is_avoir", false)
      .not("due_date", "is", null)
      .lt("due_date", now.toISOString().split("T")[0]);

    if (!overdueInvoices || overdueInvoices.length === 0) {
      return NextResponse.json({ success: true, totalReminders: 0, message: "No overdue invoices" });
    }

    // Get entity names for FROM address
    const entityIds = [...new Set(overdueInvoices.map((i) => i.entity_id))];
    const { data: entities } = await supabase
      .from("entities")
      .select("id, name")
      .in("id", entityIds);
    const entityMap = Object.fromEntries((entities || []).map((e) => [e.id, e.name]));

    // Get session titles
    const sessionIds = [...new Set(overdueInvoices.map((i) => i.session_id).filter(Boolean))];
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, title")
      .in("id", sessionIds.length > 0 ? sessionIds : ["__none__"]);
    const sessionMap = Object.fromEntries((sessions || []).map((s) => [s.id, s.title]));

    for (const invoice of overdueInvoices) {
      const dueDate = new Date(invoice.due_date);
      const daysPastDue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const reminderCount = invoice.reminder_count || 0;

      // Determine which reminder to send
      let reminderType: "first" | "second" | "final" | null = null;
      if (daysPastDue >= 45 && reminderCount < 3) reminderType = "final";
      else if (daysPastDue >= 21 && reminderCount < 2) reminderType = "second";
      else if (daysPastDue >= 7 && reminderCount < 1) reminderType = "first";

      if (!reminderType) continue;

      // Mark as late
      if (invoice.status !== "late") {
        await supabase
          .from("formation_invoices")
          .update({ status: "late", updated_at: now.toISOString() })
          .eq("id", invoice.id);
      }

      // Find recipient email
      let recipientEmail: string | null = null;
      if (invoice.recipient_type === "company") {
        const { data: client } = await supabase
          .from("clients")
          .select("email")
          .eq("id", invoice.recipient_id)
          .maybeSingle();
        recipientEmail = (client as Record<string, string> | null)?.email || null;

        // Fallback: check formation_companies
        if (!recipientEmail) {
          const { data: fc } = await supabase
            .from("formation_companies")
            .select("email")
            .eq("client_id", invoice.recipient_id)
            .eq("session_id", invoice.session_id)
            .maybeSingle();
          recipientEmail = fc?.email || null;
        }
      } else if (invoice.recipient_type === "learner") {
        const { data: learner } = await supabase
          .from("learners")
          .select("email")
          .eq("id", invoice.recipient_id)
          .maybeSingle();
        recipientEmail = learner?.email || null;
      }

      if (!recipientEmail) {
        errors.push(`${invoice.reference}: pas d'email pour ${invoice.recipient_name}`);
        continue;
      }

      // Build email
      const entityName = entityMap[invoice.entity_id] || "MR FORMATION";
      const sessionTitle = sessionMap[invoice.session_id] || "Formation";
      const template = REMINDER_TEMPLATES[reminderType];
      const templateData = {
        reference: invoice.reference,
        montant: formatCurrency(Number(invoice.amount)),
        entreprise: invoice.recipient_name,
        formation: sessionTitle,
        dateEcheance: formatDate(invoice.due_date),
      };

      const subject = template.subject(invoice.reference);
      const textBody = template.body(templateData);

      // Send email
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
        console.log(`[reminders] Simulated ${reminderType} to ${recipientEmail}: ${subject}`);
        emailSent = true; // simulated
      }

      if (emailSent) {
        // Update invoice
        await supabase
          .from("formation_invoices")
          .update({
            reminder_count: reminderCount + 1,
            last_reminder_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", invoice.id);

        // Insert reminder record
        await supabase.from("invoice_reminders").insert({
          invoice_id: invoice.id,
          entity_id: invoice.entity_id,
          reminder_type: reminderType,
          email_to: recipientEmail,
        });

        // Log in email_history
        await supabase.from("email_history").insert({
          entity_id: invoice.entity_id,
          recipient_email: recipientEmail,
          subject,
          body: textBody,
          status: "sent",
          sent_at: now.toISOString(),
          sent_via: "resend",
          session_id: invoice.session_id,
          recipient_type: invoice.recipient_type,
          recipient_id: invoice.recipient_id,
        });

        totalReminders++;
      } else {
        errors.push(`${invoice.reference}: échec envoi à ${recipientEmail}`);
      }
    }

    console.log(`[reminders] Processed: ${totalReminders} reminders sent, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      totalReminders,
      errors: errors.length > 0 ? errors : undefined,
      executedAt: now.toISOString(),
    });
  } catch (err) {
    console.error("[reminders] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
