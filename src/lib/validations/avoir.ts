/**
 * Validation du montant d'un avoir partiel.
 *
 * Un avoir peut être partiel : l'admin saisit un montant compris entre
 * 0 (exclu) et le montant de la facture parent (inclus). Le montant est
 * ensuite stocké en négatif (`-abs(montant)`) côté appelant.
 *
 * Helper pur et réutilisable — aucun effet de bord, aucun `any` — de façon
 * à être testé isolément (cf. `src/lib/validations/__tests__/avoir.test.ts`).
 */

export type ParseAvoirAmountResult =
  | { ok: true; amount: number }
  | { ok: false; error: string };

/**
 * Formate un nombre en euros pour les messages d'erreur (2 décimales,
 * séparateur français). Ex. 1000 → « 1 000,00 ».
 */
function formatEuro(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Parse et valide le montant d'un avoir saisi par l'utilisateur.
 *
 * @param input        Montant saisi (chaîne). Virgule ou point acceptés comme
 *                     séparateur décimal. Ex. « 299,50 » ou « 299.50 ».
 * @param parentAmount Montant de la facture parent (peut être négatif si le
 *                     parent est lui-même un avoir — on compare sur la valeur
 *                     absolue).
 * @returns `{ ok: true, amount }` avec un montant positif arrondi à 2
 *          décimales, ou `{ ok: false, error }` avec un message FR clair.
 *
 * Règle : `0 < montant ≤ |parentAmount|`.
 */
export function parseAvoirAmount(
  input: string,
  parentAmount: number,
): ParseAvoirAmountResult {
  const maxAmount = Math.abs(parentAmount);

  // Strip des espaces (réflexe FR « 1 000 » = séparateur de milliers, y compris
  // l'espace insécable du formatage fr-FR) puis virgule→point.
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  // Format strict : signe optionnel + chiffres + un seul séparateur décimal.
  // Sans ça, Number.parseFloat tronque silencieusement (« 300xyz »→300,
  // « 1 000 »→1) et créerait un avoir au mauvais montant. Le « - » est toléré
  // ici pour que « -5 » tombe sur le message précis « doit être > 0 ».
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return { ok: false, error: "Montant invalide" };
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: "Montant invalide" };
  }

  // Arrondi à 2 décimales pour éviter les artefacts de flottant.
  const amount = Math.round(parsed * 100) / 100;

  if (amount <= 0) {
    return { ok: false, error: "Le montant doit être > 0 €" };
  }

  if (amount > maxAmount) {
    return {
      ok: false,
      error: `Le montant doit être ≤ ${formatEuro(maxAmount)} €`,
    };
  }

  return { ok: true, amount };
}
