/**
 * Couleur des badges selon le libellé Sellsy d'une tâche CRM.
 *
 * Les valeurs proviennent du LABEL Sellsy importé (4 distincts dans le dataset
 * réel : Rappel, Relance par téléphone/mail, Appel téléphonique, Rendez-vous).
 * Tout label inconnu retombe sur un gris neutre.
 */
export function crmTaskLabelStyle(label: string): { bg: string; text: string } {
  const l = label.toLowerCase();
  if (l.includes("rappel")) return { bg: "bg-blue-50", text: "text-blue-700" };
  if (l.includes("relance")) return { bg: "bg-amber-50", text: "text-amber-700" };
  if (l.includes("appel")) return { bg: "bg-violet-50", text: "text-violet-700" };
  if (l.includes("rendez-vous") || l.includes("rdv"))
    return { bg: "bg-emerald-50", text: "text-emerald-700" };
  return { bg: "bg-gray-100", text: "text-gray-700" };
}
