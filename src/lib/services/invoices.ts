import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session } from "@/lib/types";
import { buildInvoiceLinesForCompany } from "@/lib/utils/invoice-builder";

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
    .select("id, status, recipient_type, recipient_id")
    .eq("session_id", sessionId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }

  const invoices: InvoiceRow[] = (data ?? []) as InvoiceRow[];
  const report: CascadeReport = { impacted: 0, blocked: 0, skipped: 0, errors: [] };

  for (const invoice of invoices) {
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

    // pending + company → rebuild lines
    let built;
    try {
      built = buildInvoiceLinesForCompany(formation, invoice.recipient_id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      report.errors.push({ invoiceId: invoice.id, message });
      continue;
    }

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
