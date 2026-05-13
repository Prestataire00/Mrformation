import type { Session } from "@/lib/types";

export type HoursSource = "override" | "computed" | "legacy" | null;

export interface ResolvedHours {
  /** La valeur d'heures à afficher dans l'UI. */
  value: number | null;
  /** D'où provient `value` : override manuel, calcul auto, ou legacy (sessions avant Story 2.3). */
  source: HoursSource;
  /** La valeur calculée automatiquement, à afficher pour comparaison si source === "override". */
  computedValue: number | null;
}

/**
 * Résout la source des heures à afficher pour une session :
 * - Si `override_hours` est défini, c'est lui qui prime (source "override").
 * - Sinon, si `computed_hours` est défini, on l'utilise (source "computed").
 * - Sinon, fallback sur `planned_hours` pour les sessions historiques (source "legacy").
 * - Sinon, null (rien à afficher).
 *
 * Le champ `computedValue` est toujours la valeur calculée (ou legacy en fallback) — utile
 * pour afficher "Saisi manuellement (X) — calculé : Y" quand source === "override".
 */
export function resolveDisplayedHours(formation: Pick<Session, "planned_hours" | "computed_hours" | "override_hours">): ResolvedHours {
  const override = formation.override_hours ?? null;
  const computed = formation.computed_hours ?? null;
  const legacy = formation.planned_hours ?? null;

  // Fallback "computed" used for the badge tooltip
  const computedValue = computed ?? legacy;

  if (override !== null) {
    return { value: override, source: "override", computedValue };
  }
  if (computed !== null) {
    return { value: computed, source: "computed", computedValue: computed };
  }
  if (legacy !== null) {
    return { value: legacy, source: "legacy", computedValue: legacy };
  }
  return { value: null, source: null, computedValue: null };
}
