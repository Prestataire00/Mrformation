export interface InvoiceLite {
  amount: number | null;
  status: string;
  paid_at: string | null;
  created_at: string;
  is_avoir?: boolean;
}

const UNPAID = new Set(["pending", "sent", "late"]);

/** Réalisé = total facturé ENCAISSÉ de `year` (factures payées, par paid_at,
 *  repli created_at).
 *  Prévisionnel = total facturé NON ENCORE ENCAISSÉ de `year` (factures émises
 *  pending/sent/late, par created_at).
 *
 *  Sont EXCLUS des deux sommes :
 *   - les avoirs (`is_avoir = true`) ;
 *   - tout montant ≤ 0. Un avoir est stocké à montant négatif ; certains avoirs
 *     legacy/importés ou des remises saisies en négatif (le PATCH factures
 *     n'impose pas de montant positif) n'ont PAS le flag `is_avoir` et tiraient
 *     le CA prévisionnel en négatif (ex. -12 250 €). Le rejet des montants ≤ 0
 *     garantit un CA toujours ≥ 0, indépendamment de la qualité de la donnée.
 *  Les factures annulées (cancelled) sont ignorées (statut hors UNPAID/paid). */
export function computeRevenueFromInvoices(
  invoices: InvoiceLite[],
  year: number,
): { realise: number; previsionnel: number } {
  let realise = 0;
  let previsionnel = 0;
  for (const inv of invoices) {
    if (inv.is_avoir) continue;
    const amt = inv.amount ?? 0;
    if (amt <= 0) continue;
    if (inv.status === "paid") {
      const ref = inv.paid_at ?? inv.created_at;
      if (new Date(ref).getUTCFullYear() === year) realise += amt;
    } else if (UNPAID.has(inv.status)) {
      if (new Date(inv.created_at).getUTCFullYear() === year) previsionnel += amt;
    }
  }
  return { realise: Math.round(realise), previsionnel: Math.round(previsionnel) };
}
