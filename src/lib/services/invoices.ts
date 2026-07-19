import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session } from "@/lib/types";
import { isContentLocked } from "@/lib/abby/eligibility";
import { buildInvoiceLines } from "@/lib/utils/invoice-builder";
import { getAmountForCompany } from "@/lib/utils/formation-companies";

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

export type CascadeReport = {
  /** Pending company invoices successfully recalculated. */
  impacted: number;
  /** Invoices in sent/paid/late status (not modified). */
  blocked: number;
  /** Pending invoices with recipient_type != "company" (left untouched). */
  skipped: number;
  /** Partial errors per invoice — don't crash the cascade. */
  errors: Array<{ invoiceId: string; message: string }>;
};

type InvoiceRow = {
  id: string;
  status: string;
  recipient_type: string;
  recipient_id: string;
  abby_push_state: string | null;
};

const BLOCKED_STATUSES = new Set(["sent", "paid", "late"]);

/**
 * Cascade un changement de prix de session vers toutes les factures "pending" liées,
 * dont le destinataire est une entreprise. Les factures déjà envoyées (sent/paid/late) ne sont
 * jamais modifiées. Les factures pending non-company (learner/financier) sont laissées intactes
 * (recalcul manuel via TabFinances). Les factures "cancelled" sont ignorées silencieusement.
 *
 * Idempotent : delete + insert des lignes à chaque appel.
 * Ne modifie PAS la session — uniquement formation_invoices et formation_invoice_lines.
 *
 * Cf. Story 2.2.
 */
export async function cascadeSessionPriceToPendingInvoices(
  supabase: SupabaseClient,
  sessionId: string,
  formation: Session
): Promise<ServiceResult<CascadeReport>> {
  const { data, error } = await supabase
    .from("formation_invoices")
    .select("id, status, recipient_type, recipient_id, abby_push_state")
    .eq("session_id", sessionId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }

  const invoices: InvoiceRow[] = (data ?? []) as InvoiceRow[];
  const report: CascadeReport = { impacted: 0, blocked: 0, skipped: 0, errors: [] };

  for (const invoice of invoices) {
    // Verrou Abby (story 3.5, FR-21) : une facture engagée chez Abby a son
    // contenu figé quel que soit son statut (une poussée peut être pending).
    // Comptée en `blocked` — même toast « utiliser un avoir » (skipped n'est
    // jamais affiché : divergence silencieuse sinon).
    if (isContentLocked({ abby_push_state: invoice.abby_push_state })) {
      report.blocked += 1;
      continue;
    }
    if (BLOCKED_STATUSES.has(invoice.status)) {
      report.blocked += 1;
      continue;
    }

    if (invoice.status === "cancelled") {
      // Silently skip — not counted anywhere.
      continue;
    }

    if (invoice.status !== "pending") {
      // Unknown status — skip silently, don't count.
      continue;
    }

    if (invoice.recipient_type !== "company") {
      report.skipped += 1;
      continue;
    }

    // pending + company → rebuild lines via le builder unifié.
    // Le builder ne lève pas : on valide le montant ici (l'ancien helper
    // levait une exception sur montant nul, capturée par le try/catch).
    const amount = getAmountForCompany(formation, invoice.recipient_id);
    if (amount === null) {
      report.errors.push({
        invoiceId: invoice.id,
        message: `Montant non défini pour l'entreprise ${invoice.recipient_id}`,
      });
      continue;
    }
    const built = buildInvoiceLines(formation, {
      type: "company",
      id: invoice.recipient_id,
      amount,
    });

    const { error: deleteError } = await supabase
      .from("formation_invoice_lines")
      .delete()
      .eq("invoice_id", invoice.id);

    if (deleteError) {
      report.errors.push({ invoiceId: invoice.id, message: deleteError.message });
      continue;
    }

    const rowsToInsert = built.lines.map((line) => ({
      invoice_id: invoice.id,
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unit_price,
    }));

    const { error: insertError } = await supabase
      .from("formation_invoice_lines")
      .insert(rowsToInsert);

    if (insertError) {
      report.errors.push({ invoiceId: invoice.id, message: insertError.message });
      continue;
    }

    const { error: updateError } = await supabase
      .from("formation_invoices")
      .update({ amount: built.amountHT })
      .eq("id", invoice.id);

    if (updateError) {
      report.errors.push({ invoiceId: invoice.id, message: updateError.message });
      continue;
    }

    report.impacted += 1;
  }

  return {
    ok: true,
    impacted: report.impacted,
    blocked: report.blocked,
    skipped: report.skipped,
    errors: report.errors,
  };
}
