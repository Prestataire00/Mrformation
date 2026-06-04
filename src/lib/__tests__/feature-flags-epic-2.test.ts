import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPedagogieV2Epic2Enabled } from "@/lib/feature-flags";

describe("isPedagogieV2Epic2Enabled", () => {
  const origEnv = process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2;
  });

  afterEach(() => {
    if (origEnv === undefined) delete process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2;
    else process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2 = origEnv;
  });

  it("retourne false par défaut", () => {
    expect(isPedagogieV2Epic2Enabled()).toBe(false);
  });

  it("retourne true quand la variable vaut exactement 'true'", () => {
    process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2 = "true";
    expect(isPedagogieV2Epic2Enabled()).toBe(true);
  });

  it("retourne false pour toute autre valeur que 'true'", () => {
    for (const v of ["false", "1", "0", "yes", "TRUE", ""]) {
      process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2 = v;
      expect(isPedagogieV2Epic2Enabled(), `valeur testée: "${v}"`).toBe(false);
    }
  });
});
