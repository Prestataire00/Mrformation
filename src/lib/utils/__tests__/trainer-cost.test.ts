import { describe, it, expect } from "vitest";
import { computeAgreedCost, sessionDayCount } from "../trainer-cost";

describe("sessionDayCount", () => {
  it("compte 1 jour quand start == end", () => {
    expect(sessionDayCount("2026-06-22", "2026-06-22")).toBe(1);
  });

  it("compte les jours inclusivement sur une plage", () => {
    // 22 → 24 juin = 3 jours
    expect(sessionDayCount("2026-06-22", "2026-06-24")).toBe(3);
  });

  it("retombe sur start si end absent", () => {
    expect(sessionDayCount("2026-06-22", null)).toBe(1);
  });

  it("retourne null si pas de date de début", () => {
    expect(sessionDayCount(null, "2026-06-24")).toBeNull();
  });

  it("retourne null sur date invalide", () => {
    expect(sessionDayCount("pas-une-date")).toBeNull();
  });
});

describe("computeAgreedCost", () => {
  it("priorise agreed_cost_ht (montant total saisi)", () => {
    expect(
      computeAgreedCost({ agreed_cost_ht: 1900, hourly_rate: 75, hours_done: 21 }),
    ).toBe(1900);
  });

  it("ignore agreed_cost_ht <= 0 et bascule sur le calcul horaire", () => {
    expect(computeAgreedCost({ agreed_cost_ht: 0, hourly_rate: 75, hours_done: 20 })).toBe(1500);
  });

  it("calcule hourly_rate × hours_done quand les deux sont saisis", () => {
    expect(computeAgreedCost({ hourly_rate: 75, hours_done: 21 })).toBe(1575);
  });

  it("BUG TARIF — taux horaire sans heures : retombe sur les heures prévues (fallback)", () => {
    // hours_done vide → utilise fallback.hours (planned_hours de la session)
    expect(
      computeAgreedCost({ hourly_rate: 50, hours_done: null }, { hours: 14 }),
    ).toBe(700);
  });

  it("BUG TARIF — taux journalier sans dates_done : retombe sur les jours de la session (fallback)", () => {
    // dates_done jamais peuplé par l'UI → utilise fallback.days
    expect(
      computeAgreedCost({ daily_rate: 400, dates_done: null }, { days: 3 }),
    ).toBe(1200);
  });

  it("utilise dates_done en priorité sur le fallback days", () => {
    expect(
      computeAgreedCost({ daily_rate: 400, dates_done: "2026-06-22,2026-06-23" }, { days: 5 }),
    ).toBe(800);
  });

  it("retourne null si aucun taux exploitable même avec fallback", () => {
    expect(computeAgreedCost({}, { hours: 10, days: 2 })).toBeNull();
  });

  it("retourne null si taux journalier mais aucun jour (ni dates_done ni fallback)", () => {
    expect(computeAgreedCost({ daily_rate: 400 })).toBeNull();
  });
});
