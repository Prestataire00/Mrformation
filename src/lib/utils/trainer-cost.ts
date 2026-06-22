/**
 * Calcul du coût HT d'un formateur sous-traitant pour le contrat de
 * sous-traitance (convention d'intervention).
 *
 * Logique partagée par les 3 chemins de génération (single, batch, from-template)
 * pour éviter la divergence : auparavant chaque route dupliquait ce calcul.
 *
 * Bug client « le tarif ne s'affiche pas alors qu'il est renseigné » : `dates_done`
 * n'est jamais peuplé par l'UI et `hours_done` peut être vide → l'ancien calcul
 * renvoyait `null` dès qu'on saisissait un taux journalier (ou un taux horaire
 * sans heures). On retombe donc sur la durée de la session passée en `fallback`.
 *
 * Priorité : `agreed_cost_ht` (montant total saisi à la main) >
 * `hourly_rate × (hours_done ?? fallback.hours)` >
 * `daily_rate × (nb dates_done ?? fallback.days)`.
 */

export interface TrainerCostInputs {
  agreed_cost_ht?: number | null;
  hourly_rate?: number | null;
  hours_done?: number | null;
  daily_rate?: number | null;
  dates_done?: string | null;
}

export interface TrainerCostFallback {
  /** Heures à utiliser si `hours_done` est vide (ex. durée prévue de la session). */
  hours?: number | null;
  /** Nb de jours à utiliser si `dates_done` est vide (ex. jours de la session). */
  days?: number | null;
}

/** Nombre de jours (inclusif) couverts par une session, déduit de ses dates. */
export function sessionDayCount(
  startDate?: string | null,
  endDate?: string | null,
): number | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : start;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const days = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return days > 0 ? days : null;
}

export function computeAgreedCost(
  ft: TrainerCostInputs,
  fallback?: TrainerCostFallback,
): number | null {
  if (typeof ft.agreed_cost_ht === "number" && ft.agreed_cost_ht > 0) {
    return ft.agreed_cost_ht;
  }

  const hours =
    typeof ft.hours_done === "number" && ft.hours_done > 0
      ? ft.hours_done
      : fallback?.hours ?? null;
  if (
    typeof ft.hourly_rate === "number" &&
    ft.hourly_rate > 0 &&
    typeof hours === "number" &&
    hours > 0
  ) {
    return ft.hourly_rate * hours;
  }

  let days: number | null = null;
  if (ft.dates_done) {
    const n = ft.dates_done.split(",").filter(Boolean).length;
    if (n > 0) days = n;
  }
  if (days == null && typeof fallback?.days === "number" && fallback.days > 0) {
    days = fallback.days;
  }
  if (typeof ft.daily_rate === "number" && ft.daily_rate > 0 && days && days > 0) {
    return ft.daily_rate * days;
  }

  return null;
}
