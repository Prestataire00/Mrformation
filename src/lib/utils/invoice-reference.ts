/**
 * Référence de facture telle que GÉNÉRÉE en base.
 *
 * Reflète exactement la colonne générée `formation_invoices.reference` :
 *   prefix || '-' || LPAD((fiscal_year % 100), 2) || '-' || global_number
 * Année sur 2 chiffres, numéro NON paddé — identique à la nomenclature Excel (ex. « FAC-26-25 »).
 *
 * Source de vérité unique du format côté app (preview / cohérence). Pour AFFICHER une facture
 * existante (qui peut être un import LORIS), utiliser `invoiceDisplayRef`.
 */
export function formatInvoiceReference(args: {
  prefix: string;
  fiscalYear: number;
  globalNumber: number;
}): string {
  const yy = String(args.fiscalYear % 100).padStart(2, "0");
  return `${args.prefix}-${yy}-${args.globalNumber}`;
}
