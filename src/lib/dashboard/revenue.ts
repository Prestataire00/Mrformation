export interface InvoiceLite {
  amount: number | null;
  status: string;
  paid_at: string | null;
  created_at: string;
}

const UNPAID = new Set(["pending", "sent", "late"]);

/** Réalisé = factures payées de `year` (par paid_at, repli created_at).
 *  Prévisionnel = factures émises non payées de `year` (pending/sent/late). */
export function computeRevenueFromInvoices(
  invoices: InvoiceLite[],
  year: number,
): { realise: number; previsionnel: number } {
  let realise = 0;
  let previsionnel = 0;
  for (const inv of invoices) {
    const amt = inv.amount ?? 0;
    if (inv.status === "paid") {
      const ref = inv.paid_at ?? inv.created_at;
      if (new Date(ref).getUTCFullYear() === year) realise += amt;
    } else if (UNPAID.has(inv.status)) {
      if (new Date(inv.created_at).getUTCFullYear() === year) previsionnel += amt;
    }
  }
  return { realise: Math.round(realise), previsionnel: Math.round(previsionnel) };
}
