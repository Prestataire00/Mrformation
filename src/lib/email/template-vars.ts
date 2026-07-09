/**
 * Substitution générique des variables `{{var}}` d'un modèle d'email, côté
 * client (sélecteur de modèle des dialogs d'envoi).
 *
 * Une balise sans valeur fournie est laissée littérale (`{{k}}`) — parité avec
 * le résolveur serveur et le sélecteur de devis.
 */
export function substituteTemplateVars(text: string, vars: Record<string, string>): string {
  return (text ?? "").replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : `{{${k}}}`,
  );
}

export function applyEmailTemplate(
  tpl: { subject?: string | null; body?: string | null },
  vars: Record<string, string>,
): { subject: string; body: string } {
  return {
    subject: substituteTemplateVars(tpl.subject ?? "", vars),
    body: substituteTemplateVars(tpl.body ?? "", vars),
  };
}
