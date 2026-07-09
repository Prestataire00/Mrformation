/**
 * Substitution des variables des modèles d'email de devis.
 *
 * Les modèles de devis utilisent des balises `{{var}}` (reference, montant,
 * destinataire, date_validite, entite, lien_signature). Cette logique était
 * dupliquée dans les deux dialogs d'envoi (e-signature + envoi simple) de
 * `admin/crm/quotes/page.tsx` ; elle est factorisée ici, testable et réutilisée
 * par le sélecteur de modèle.
 *
 * Cf. docs/superpowers/specs/2026-07-09-devis-email-template-selector-design.md
 */

/** Modèle d'email de devis tel que listé dans le sélecteur. */
export interface QuoteEmailTemplate {
  id: string;
  key: string | null;
  name: string;
  subject: string;
  body: string;
}

/**
 * Remplace les balises `{{var}}` d'un texte par leur valeur.
 * Une balise sans valeur (`vars[k]` absent) est laissée littérale `{{k}}`
 * (utile pour `{{lien_signature}}`, re-substitué côté serveur e-signature).
 */
export function substituteQuoteVars(text: string, vars: Record<string, string>): string {
  return (text ?? "").replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : `{{${k}}}`,
  );
}

/** Applique les variables au sujet et au corps d'un modèle de devis. */
export function applyQuoteTemplate(
  tpl: { subject?: string | null; body?: string | null },
  vars: Record<string, string>,
): { subject: string; body: string } {
  return {
    subject: substituteQuoteVars(tpl.subject ?? "", vars),
    body: substituteQuoteVars(tpl.body ?? "", vars),
  };
}
