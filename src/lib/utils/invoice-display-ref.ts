/**
 * Référence de facture à AFFICHER.
 *
 * Les factures importées (Loris) ont une référence générée synthétique (`LORIS-…`) car la
 * colonne `reference` est calculée (`prefix-fiscal_year-LPAD(global_number)`). Leur vrai
 * numéro d'origine (celui du fichier Excel, ex. « FAC-25-0 ») est stocké dans `external_reference`.
 * → Pour ces factures, on affiche `external_reference` ; sinon la `reference` normale
 *   (factures créées dans l'app, qui gardent leur numéro généré).
 */
export function invoiceDisplayRef(inv: {
  reference?: string | null;
  external_reference?: string | null;
}): string {
  if (inv.reference && inv.reference.startsWith("LORIS") && inv.external_reference) {
    return inv.external_reference;
  }
  return inv.reference ?? inv.external_reference ?? "";
}
