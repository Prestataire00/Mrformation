import { describe, it, expect } from "vitest";
import {
  RESOLVE_USERNAME_TARGET_MS,
  dummyBcryptCompare,
  padToTarget,
} from "@/lib/auth/timing-safe";

/**
 * Pédagogie V2 Epic 2.5 — Tests pour les helpers timing-safe de la route
 * POST /api/auth/resolve-username.
 *
 * Objectif : garantir que la résolution `username → email` ne fuit pas
 * (via timing) l'information "ce username existe / n'existe pas". Approche :
 *  - Faire du travail CPU constant (dummy bcrypt.compare) systématiquement
 *  - Padder le temps total à une cible fixe (RESOLVE_USERNAME_TARGET_MS=150ms)
 *
 * Tests focalisés sur les helpers purs (déterministes). Le test E2E
 * timing-statistique (1000 runs, stdev) est volontairement hors de ce
 * fichier — il est instable en CI et appartient à une suite perf dédiée.
 */

describe("timing-safe — RESOLVE_USERNAME_TARGET_MS", () => {
  it("vaut exactement 150ms (contrat figé)", () => {
    expect(RESOLVE_USERNAME_TARGET_MS).toBe(150);
  });
});

describe("timing-safe — dummyBcryptCompare", () => {
  it("résout sans throw (toujours rapide, jamais d'exception)", async () => {
    // Pas de throw + retourne quelque chose (la valeur exacte n'importe pas,
    // c'est le travail CPU constant qui compte).
    await expect(dummyBcryptCompare()).resolves.not.toThrow();
  });

  it("retourne un boolean (contrat avec bcrypt.compare)", async () => {
    const result = await dummyBcryptCompare();
    expect(typeof result).toBe("boolean");
  });

  it("est appelable en parallèle sans erreur (pas de state partagé)", async () => {
    const results = await Promise.all([
      dummyBcryptCompare(),
      dummyBcryptCompare(),
      dummyBcryptCompare(),
    ]);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(typeof r).toBe("boolean");
    }
  });
});

describe("timing-safe — padToTarget", () => {
  it("attend pour atteindre la cible quand elapsed < target", async () => {
    const start = performance.now();
    await padToTarget(start, 60);
    const elapsed = performance.now() - start;
    // Tolérance ±20ms (setTimeout n'est pas précis à la milliseconde)
    expect(elapsed).toBeGreaterThanOrEqual(55);
    expect(elapsed).toBeLessThan(140);
  });

  it("no-op si elapsed >= target (ne décale pas le temps vers l'arrière)", async () => {
    // Simuler "déjà passé la cible" : start dans le passé.
    const fakeStart = performance.now() - 200; // 200ms déjà écoulés
    const before = performance.now();
    await padToTarget(fakeStart, 50); // target 50ms < 200ms écoulés
    const overhead = performance.now() - before;
    // Doit retourner quasi-immédiatement (pas de setTimeout déclenché)
    expect(overhead).toBeLessThan(20);
  });

  it("atteint approximativement la target pour des start frais", async () => {
    const start = performance.now();
    await padToTarget(start, RESOLVE_USERNAME_TARGET_MS);
    const elapsed = performance.now() - start;
    // Avec target=150, on doit être au moins à ~145ms (tolérance setTimeout)
    expect(elapsed).toBeGreaterThanOrEqual(140);
  });

  it("no-op si target = 0", async () => {
    const start = performance.now();
    const before = performance.now();
    await padToTarget(start, 0);
    const overhead = performance.now() - before;
    expect(overhead).toBeLessThan(20);
  });
});
