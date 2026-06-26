import { describe, it, expect } from "vitest";
import {
  computeSessionHeadlineIndicators,
  type ObjectiveProgression,
} from "@/lib/services/load-session-aggregates";

/**
 * SPEC spec-p4-indicateurs-synthese-session — 3 indicateurs de synthèse dérivés
 * (sans recalcul ni fetch) : positionnement avant/après en %, satisfaction /5.
 */

const obj = (avgBefore: number | null, avgAfter: number | null): ObjectiveProgression => ({
  objective: "o",
  avgBefore,
  avgAfter,
  delta: avgBefore !== null && avgAfter !== null ? avgAfter - avgBefore : null,
});

describe("computeSessionHeadlineIndicators", () => {
  it("calcule avant/après en % et la satisfaction en /5 (cas complet)", () => {
    // avgBefore moyen = 4.5 → 90% ; avgAfter moyen = 4.8 → 96% ; satisfaction 84 → 4.2/5
    const res = computeSessionHeadlineIndicators(
      [obj(4, 4.6), obj(5, 5)],
      84,
    );
    expect(res.beforePct).toBeCloseTo(90);
    expect(res.afterPct).toBeCloseTo(96);
    expect(res.deltaPct).toBeCloseTo(6);
    expect(res.satisfactionOn5).toBeCloseTo(4.2);
  });

  it("après manquant → afterPct et deltaPct null, avant calculé", () => {
    const res = computeSessionHeadlineIndicators([obj(4.5, null), obj(4.5, null)], 80);
    expect(res.beforePct).toBeCloseTo(90);
    expect(res.afterPct).toBeNull();
    expect(res.deltaPct).toBeNull();
    expect(res.satisfactionOn5).toBeCloseTo(4);
  });

  it("aucune progression mais satisfaction présente", () => {
    const res = computeSessionHeadlineIndicators([], 100);
    expect(res.beforePct).toBeNull();
    expect(res.afterPct).toBeNull();
    expect(res.deltaPct).toBeNull();
    expect(res.satisfactionOn5).toBe(5);
  });

  it("aucune donnée → tout null", () => {
    const res = computeSessionHeadlineIndicators([], null);
    expect(res).toEqual({ beforePct: null, afterPct: null, deltaPct: null, satisfactionOn5: null });
  });

  it("moyenne sur les objectifs non-null, MAIS deltaPct null si aucun objectif n'a ses 2 côtés (objectifs disjoints)", () => {
    // avant : seul l'objectif 1 (4.0 → 80%) ; après : seul l'objectif 2 (5.0 → 100%).
    // Aucun objectif apparié → pas d'évolution affirmée (évite un faux « +20 pts »).
    const res = computeSessionHeadlineIndicators([obj(4, null), obj(null, 5)], null);
    expect(res.beforePct).toBeCloseTo(80);
    expect(res.afterPct).toBeCloseTo(100);
    expect(res.deltaPct).toBeNull();
    expect(res.satisfactionOn5).toBeNull();
  });

  it("deltaPct = moyenne des deltas appariés (pas la différence de deux moyennes disjointes)", () => {
    // obj1 apparié (3→4, delta +1) ; obj2 seulement avant (pas d'après).
    // beforePct = moyenne(3,5)/5×100=80 ; afterPct = 4/5×100=80 ; mais delta réel = +1 → +20 pts.
    const res = computeSessionHeadlineIndicators([obj(3, 4), obj(5, null)], null);
    expect(res.deltaPct).toBeCloseTo(20);
  });

  it("évolution négative (régression du niveau)", () => {
    const res = computeSessionHeadlineIndicators([obj(4, 3)], null);
    expect(res.beforePct).toBeCloseTo(80);
    expect(res.afterPct).toBeCloseTo(60);
    expect(res.deltaPct).toBeCloseTo(-20);
  });
});
