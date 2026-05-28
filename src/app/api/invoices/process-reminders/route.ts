import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enqueueEmail } from "@/lib/services/email-queue";
import { resolveEmailTemplate } from "@/lib/services/email-template-resolver";

// Note : ce cron enqueue les relances via la queue email (status='pending').
// Le worker /api/emails/process-scheduled gère l'envoi avec retry.
//
// Story em-b-1 — Migration vers email-template-resolver via feature flag :
//   - USE_TEMPLATE_RESOLVER_INVOICES=true  → resolver (key = reminder_invoice_*)
//   - USE_TEMPLATE_RESOLVER_INVOICES=false → comportement legacy ci-dessous
//                                            (DB par `type` + fallback REMINDER_TEMPLATES)
// La constante REMINDER_TEMPLATES + le lookup par `type` sont conservés
// jusqu'à em-b-6 cleanup (T+7 jours stabilité prod en flag ON).
const USE_RESOLVER = process.env.USE_TEMPLATE_RESOLVER_INVOICES === "true";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
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
      // Fetch reminder settings for this entity
      const { data: settings } = await supabase
        .from("reminder_settings")
        .select("reminder_key, is_enabled, days_delay")
        .eq("entity_id", invoice.entity_id)
        .in("reminder_key", ["reminder_invoice_first", "reminder_invoice_second", "reminder_invoice_final"]);

      const getDelay = (key: string, fallback: number) => {
        const s = (settings || []).find((x) => x.reminder_key === key);
        return s?.days_delay ?? fallback;
      };
      const isReminderEnabled = (key: string) => {
        const s = (settings || []).find((x) => x.reminder_key === key);
        return s?.is_enabled !== false; // default true if not found
      };

      let reminderType: "first" | "second" | "final" | null = null;
      let reminderTemplateKey = "";
      if (daysPastDue >= getDelay("reminder_invoice_final", 45) && reminderCount < 3 && isReminderEnabled("reminder_invoice_final")) {
        reminderType = "final"; reminderTemplateKey = "reminder_invoice_final";
      } else if (daysPastDue >= getDelay("reminder_invoice_second", 21) && reminderCount < 2 && isReminderEnabled("reminder_invoice_second")) {
        reminderType = "second"; reminderTemplateKey = "reminder_invoice_second";
      } else if (daysPastDue >= getDelay("reminder_invoice_first", 7) && reminderCount < 1 && isReminderEnabled("reminder_invoice_first")) {
        reminderType = "first"; reminderTemplateKey = "reminder_invoice_first";
      }

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
      } else if (invoice.recipient_type === "financier") {
        // recipient_id pointe sur formation_financiers ; l'email est porté
        // par le financeur maître lié (formation_financiers.financeur_id).
        const { data: ff } = await supabase
          .from("formation_financiers")
          .select("financeur:financeurs(email)")
          .eq("id", invoice.recipient_id)
          .maybeSingle();
        const finRel = (ff as { financeur?: { email?: string } | { email?: string }[] } | null)?.financeur;
        const finRec = Array.isArray(finRel) ? finRel[0] : finRel;
        recipientEmail = finRec?.email || null;
      }

      if (!recipientEmail) {
        errors.push(`${invoice.reference}: pas d'email pour ${invoice.recipient_name}`);
        continue;
      }

      // Build email — em-b-1 : resolver (flag ON) ou legacy (flag OFF)
      const sessionTitle = sessionMap[invoice.session_id] || "Formation";

      const templateVars: Record<string, string> = {
        "{{reference}}": invoice.reference,
        "{{montant}}": formatCurrency(Number(invoice.amount)),
        "{{entreprise}}": invoice.recipient_name,
        "{{formation}}": sessionTitle,
        "{{date_echeance}}": formatDate(invoice.due_date),
      };

      const applyVars = (s: string) => {
        let out = s;
        for (const [k, v] of Object.entries(templateVars)) out = out.replaceAll(k, v);
        return out;
      };

      let subject: string;
      let textBody: string;

      if (USE_RESOLVER) {
        // ── Path em-b-1 : resolver unifié (lookup par key) ──
        const resolved = await resolveEmailTemplate(
          supabase,
          reminderTemplateKey,
          invoice.entity_id,
        );
        if (!resolved) {
          // Le resolver a déjà loggé email_template_missing en level error.
          // On skip cette relance : ne pas incrémenter reminder_count pour
          // qu'un re-run après seed la traite (cohérent avec le comportement
          // try/catch des autres erreurs ci-dessous).
          errors.push(
            `${invoice.reference}: template ${reminderTemplateKey} introuvable pour entité ${invoice.entity_id}`,
          );
          continue;
        }
        subject = applyVars(resolved.subject);
        textBody = applyVars(resolved.body);
      } else {
        // ── Path legacy (sera supprimé en em-b-6 cleanup) ──
        const { data: dbTemplate } = await supabase
          .from("email_templates")
          .select("subject, body")
          .eq("entity_id", invoice.entity_id)
          .eq("type", reminderTemplateKey)
          .maybeSingle();

        if (dbTemplate?.subject && dbTemplate?.body) {
          subject = applyVars(dbTemplate.subject);
          textBody = applyVars(dbTemplate.body);
        } else {
          const fallback = REMINDER_TEMPLATES[reminderType];
          subject = fallback.subject(invoice.reference);
          textBody = fallback.body({
            reference: invoice.reference,
            montant: formatCurrency(Number(invoice.amount)),
            entreprise: invoice.recipient_name,
            formation: sessionTitle,
            dateEcheance: formatDate(invoice.due_date),
          });
        }
      }

      // H6 — la mise en file et l'incrément du compteur sont enveloppés dans
      // un try/catch PAR facture : un échec de mise en file n'incrémente PAS
      // le compteur (sinon la relance serait définitivement perdue — exclue
      // au prochain run par `reminderCount < N`) et n'interrompt PAS le
      // traitement des autres factures du lot.
      try {
        await enqueueEmail(supabase, {
          to: recipientEmail,
          subject,
          body: textBody,
          entity_id: invoice.entity_id,
          session_id: invoice.session_id,
          recipient_type: invoice.recipient_type,
          recipient_id: invoice.recipient_id,
        });

        // Compteurs mis à jour APRÈS la mise en file réussie uniquement.
        await supabase
          .from("formation_invoices")
          .update({
            reminder_count: reminderCount + 1,
            last_reminder_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", invoice.id);

        await supabase.from("invoice_reminders").insert({
          invoice_id: invoice.id,
          entity_id: invoice.entity_id,
          reminder_type: reminderType,
          email_to: recipientEmail,
        });

        totalReminders++;
      } catch (e) {
        errors.push(
          `${invoice.reference}: échec de mise en file de la relance — ${e instanceof Error ? e.message : "erreur inconnue"}`,
        );
        continue;
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
