import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isCsrfMismatch } from "@/lib/auth/csrf-check";

/**
 * Pédagogie V2 Epic 2.5 — TASK 10 — Tests pour `isCsrfMismatch`.
 *
 * Couvre les 5 branches principales :
 *  1. Origin matche → false (OK)
 *  2. Origin ne matche pas → true (mismatch)
 *  3. Pas d'Origin, Referer matche → false (fallback OK)
 *  4. Ni Origin ni Referer → true (suspect)
 *  5. Dev (pas d'env NEXT_PUBLIC_APP_URL) → false (on ne bloque pas)
 *
 * Plus des cas défensifs (Origin malformé, trailing slash dans l'env).
 */

/** Fabrique un mock minimaliste de `NextRequest` (juste `headers.get`). */
function mockReq(headers: Record<string, string>) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    headers: {
      get(name: string): string | null {
        return lower[name.toLowerCase()] ?? null;
      },
    },
  };
}

const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

describe("isCsrfMismatch — env configurée", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://lms.mrformation.fr";
  });
  afterEach(() => {
    if (ORIGINAL_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
  });

  it("retourne false quand Origin matche exactement l'env (cas nominal)", () => {
    const req = mockReq({ origin: "https://lms.mrformation.fr" });
    expect(isCsrfMismatch(req)).toBe(false);
  });

  it("retourne true quand Origin pointe vers un site tiers", () => {
    const req = mockReq({ origin: "https://attacker.example.com" });
    expect(isCsrfMismatch(req)).toBe(true);
  });

  it("utilise le fallback Referer quand Origin est absent et matche", () => {
    const req = mockReq({ referer: "https://lms.mrformation.fr/admin/sessions/abc" });
    expect(isCsrfMismatch(req)).toBe(false);
  });

  it("retourne true quand ni Origin ni Referer ne sont présents", () => {
    const req = mockReq({});
    expect(isCsrfMismatch(req)).toBe(true);
  });

  it("retourne true quand Origin est malformé (URL invalide)", () => {
    const req = mockReq({ origin: "not-a-valid-url" });
    expect(isCsrfMismatch(req)).toBe(true);
  });

  it("retourne true quand Referer pointe vers un site tiers (Origin absent)", () => {
    const req = mockReq({ referer: "https://evil.example.com/csrf-attack" });
    expect(isCsrfMismatch(req)).toBe(true);
  });

  it("tolère un trailing slash dans NEXT_PUBLIC_APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://lms.mrformation.fr/";
    const req = mockReq({ origin: "https://lms.mrformation.fr" });
    expect(isCsrfMismatch(req)).toBe(false);
  });

  it("Origin prioritaire sur Referer (si Origin OK, Referer ignoré)", () => {
    const req = mockReq({
      origin: "https://lms.mrformation.fr",
      referer: "https://evil.example.com",
    });
    expect(isCsrfMismatch(req)).toBe(false);
  });

  it("Origin prioritaire sur Referer (si Origin KO, Referer OK ignoré)", () => {
    // Si Origin est présent (même mauvais), on ne retombe PAS sur Referer.
    // Sinon un attaquant pourrait spoofer Referer et bypass.
    const req = mockReq({
      origin: "https://evil.example.com",
      referer: "https://lms.mrformation.fr",
    });
    expect(isCsrfMismatch(req)).toBe(true);
  });
});

describe("isCsrfMismatch — env non configurée (dev)", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });
  afterEach(() => {
    if (ORIGINAL_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
  });

  it("retourne false (pas de mismatch) en dev sans env, même sans headers", () => {
    const req = mockReq({});
    expect(isCsrfMismatch(req)).toBe(false);
  });

  it("retourne false en dev même avec Origin tiers (pas de référence)", () => {
    const req = mockReq({ origin: "https://anything.example.com" });
    expect(isCsrfMismatch(req)).toBe(false);
  });

  it("retourne false en dev quand NEXT_PUBLIC_APP_URL est vide", () => {
    process.env.NEXT_PUBLIC_APP_URL = "";
    const req = mockReq({ origin: "https://evil.example.com" });
    expect(isCsrfMismatch(req)).toBe(false);
  });

  it("retourne false en dev quand NEXT_PUBLIC_APP_URL est malformé", () => {
    process.env.NEXT_PUBLIC_APP_URL = "::::not-a-url";
    const req = mockReq({ origin: "https://evil.example.com" });
    expect(isCsrfMismatch(req)).toBe(false);
  });
});
