import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPedagogieV2Epic2Enabled } from "@/lib/feature-flags";

/**
 * Contrat depuis 06/2026 : voir feature-flags.test.ts (helper flagOnByDefault).
 */
describe("isPedagogieV2Epic2Enabled (default ON)", () => {
  const origEnv = process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2;
  });

  afterEach(() => {
    if (origEnv === undefined) delete process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2;
    else process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2 = origEnv;
  });

  it("retourne TRUE par défaut", () => {
    expect(isPedagogieV2Epic2Enabled()).toBe(true);
  });

  it("retourne TRUE quand la variable vaut 'true'", () => {
    process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2 = "true";
    expect(isPedagogieV2Epic2Enabled()).toBe(true);
  });

  it("retourne FALSE uniquement quand la variable vaut exactement 'false'", () => {
    process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2 = "false";
    expect(isPedagogieV2Epic2Enabled()).toBe(false);
  });

  it("retourne TRUE pour toute autre valeur que 'false'", () => {
    for (const v of ["true", "1", "0", "yes", "TRUE", "False", ""]) {
      process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2 = v;
      expect(isPedagogieV2Epic2Enabled(), `valeur testée: "${v}"`).toBe(true);
    }
  });
});
