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

/**
 * Liste des 4 types Sellsy connus. Utilisée à la fois pour :
 *   - Détecter si un title Sellsy historique est générique (= identique au label
 *     Sellsy → on bascule l'affichage sur description / prospect.company_name).
 *   - Proposer ces options dans le sélecteur de type du form de création.
 *
 * "Autre" sert quand l'utilisateur veut un type custom (free-form).
 */
export const SELLSY_TASK_LABELS = [
  "Rappel",
  "Relance par téléphone/mail",
  "Appel téléphonique",
  "Rendez-vous",
] as const;

/**
 * Détermine si un title de tâche est "générique" — c'est-à-dire identique au
 * label ou correspond exactement à l'un des 4 types Sellsy connus.
 * Quand `true`, l'UI doit afficher description ou prospect_name comme titre
 * visible plutôt que le title brut (qui sera juste une répétition du badge).
 */
export function isGenericTaskTitle(title: string | null, label: string | null): boolean {
  if (!title) return false;
  const t = title.trim();
  if (!t) return false;
  if (label && t === label.trim()) return true;
  return (SELLSY_TASK_LABELS as readonly string[]).includes(t);
}
