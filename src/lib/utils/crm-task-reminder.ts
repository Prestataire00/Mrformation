/**
 * Helpers de manipulation du champ `reminder_at` sur `crm_tasks`.
 *
 * Le `reminder_at` est un TIMESTAMPTZ qui déclenche une notification CRM
 * (cf cron `/api/crm/notifications/generate`) quand sa valeur est passée et
 * que la tâche est pending/in_progress.
 *
 * Distinct de `due_date` (DATE) qui est l'échéance fonctionnelle de la tâche.
 */

/**
 * Calcule un timestamp ISO à 9h du matin, J+`daysFromNow`.
 * Utilisé par les presets "Rappel : Aujourd'hui / Demain / 3 jours / 1 semaine"
 * pour pré-remplir le champ reminder_at.
 */
export function computeReminderDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * Formate un reminder_at pour affichage utilisateur :
 *   "lun. 18/05/2026 09:00"
 */
export function formatReminderLabel(isoStr: string): string {
  const d = new Date(isoStr);
  return (
    d.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) +
    " " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  );
}

/**
 * Indique si un reminder_at est passé / aujourd'hui / futur — sert à colorer
 * le badge (rouge / amber / muted).
 */
export function getReminderStatus(isoStr: string): "past" | "today" | "future" {
  const now = new Date();
  const d = new Date(isoStr);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const reminderDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (reminderDay < today) return "past";
  if (reminderDay.getTime() === today.getTime()) return "today";
  return "future";
}

/**
 * Presets standards utilisés par les forms de création de tâche.
 * Les vues compactes utilisent `.slice(0, 4)` pour ne montrer que les 4
 * premiers; la fiche prospect montre les 6.
 */
export const REMINDER_PRESETS = [
  { label: "Aujourd'hui", days: 0 },
  { label: "Demain", days: 1 },
  { label: "3 jours", days: 3 },
  { label: "1 semaine", days: 7 },
  { label: "2 semaines", days: 14 },
  { label: "1 mois", days: 30 },
] as const;
