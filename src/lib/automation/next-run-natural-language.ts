/**
 * Story aut-a-6 — Calcul du libellé "▶ Prochain déclenchement" en langage naturel.
 *
 * Utilisé par :
 * - GET /api/automation/next-runs (batch-loader formations)
 * - <NextRunBadge> dans <RuleCard> (B.2 UI /admin/automation)
 *
 * Pure function (testable indépendamment). Pas de dépendance Supabase.
 *
 * UX-DR-AUT-5 : Loris pense en événements métier ("ce soir", "vendredi",
 * "pas applicable"), pas en clés techniques (trigger_type, days_offset).
 *
 * Convention : le cron tourne quotidiennement à 7h UTC (cf. aut-a-2
 * netlify/functions/process-automation-rules.mts). Les libellés mentionnent
 * "6h-7h" pour cohérence avec l'horaire perçu par Loris (Europe/Paris).
 */

import {
  differenceInCalendarDays,
  format,
  isToday,
  isTomorrow,
} from "date-fns";
import { fr } from "date-fns/locale";

export type RuleForNaturalLanguage = {
  is_enabled: boolean;
  trigger_type: string;
};

export type NextRunInfo = {
  next_at: string | null;
  natural_language: string;
  applicable_count: number;
};

const EVENT_DRIVEN_TRIGGERS = new Set([
  "on_session_creation",
  "on_session_completion",
  "on_enrollment",
  "certificate_ready",
  // V2 (différés) — au cas où des règles V2 existeraient encore en DB
  "on_signature_complete",
  "questionnaire_reminder",
  "invoice_overdue",
]);

const DATE_BASED_TRIGGERS = new Set([
  "session_start_minus_days",
  "session_end_plus_days",
]);

/**
 * Retourne le libellé "Prochain déclenchement" en langage naturel pour une règle.
 *
 * @param rule - règle avec is_enabled + trigger_type
 * @param nextAt - date ISO du prochain déclenchement calculé (null si pas applicable)
 * @returns string en français, ex: "Ce soir 7h", "Vendredi 7h", "Pas applicable", etc.
 */
export function naturalLanguageNextRun(
  rule: RuleForNaturalLanguage,
  nextAt: string | null,
): string {
  if (!rule.is_enabled) return "Désactivée";

  if (!nextAt) {
    // Pas de prochain déclenchement calculable — raison selon trigger_type
    if (EVENT_DRIVEN_TRIGGERS.has(rule.trigger_type)) {
      return "Évalué à chaque événement";
    }
    if (rule.trigger_type === "session_start_minus_days") {
      return "Pas applicable (aucune session future éligible)";
    }
    if (rule.trigger_type === "session_end_plus_days") {
      return "Pas applicable (aucune session terminée récemment)";
    }
    if (rule.trigger_type === "opco_deposit_reminder") {
      return "Aucun cas en attente";
    }
    return "Pas applicable aujourd'hui";
  }

  const date = new Date(nextAt);
  if (Number.isNaN(date.getTime())) return "Date invalide";

  if (isToday(date)) return "Ce soir 7h";
  if (isTomorrow(date)) return "Demain 7h";

  const daysAhead = differenceInCalendarDays(date, new Date());
  if (daysAhead < 0) return "Date passée"; // garde-fou (devrait pas arriver)
  if (daysAhead < 7) {
    // "Vendredi 7h", "Mardi 7h"
    const dayName = format(date, "EEEE", { locale: fr });
    return `${dayName.charAt(0).toUpperCase()}${dayName.slice(1)} 7h`;
  }
  // > 7 jours : "le 27 juin"
  return `Le ${format(date, "d MMMM", { locale: fr })}`;
}

/**
 * Détermine si une règle est event-driven (déclenchement immédiat à un événement)
 * ou date-based (calculé à partir d'une date de session + offset).
 */
export function isEventDrivenTrigger(triggerType: string): boolean {
  return EVENT_DRIVEN_TRIGGERS.has(triggerType);
}

export function isDateBasedTrigger(triggerType: string): boolean {
  return DATE_BASED_TRIGGERS.has(triggerType);
}
