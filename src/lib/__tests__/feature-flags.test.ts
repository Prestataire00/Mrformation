import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPedagogieV2Epic1Enabled } from "@/lib/feature-flags";

describe("feature-flags", () => {
  const origEnv = process.env.FEATURE_PEDAGOGIE_V2_EPIC_1;

  beforeEach(() => {
    delete process.env.FEATURE_PEDAGOGIE_V2_EPIC_1;
  });

  afterEach(() => {
    if (origEnv === undefined) delete process.env.FEATURE_PEDAGOGIE_V2_EPIC_1;
    else process.env.FEATURE_PEDAGOGIE_V2_EPIC_1 = origEnv;
  });

  describe("isPedagogieV2Epic1Enabled", () => {
    it("retourne false par défaut quand la variable n'est pas définie", () => {
      expect(isPedagogieV2Epic1Enabled()).toBe(false);
    });

    it("retourne true quand la variable vaut exactement 'true'", () => {
      process.env.FEATURE_PEDAGOGIE_V2_EPIC_1 = "true";
      expect(isPedagogieV2Epic1Enabled()).toBe(true);
    });

    it("retourne false pour toute autre valeur que 'true'", () => {
      const otherValues = ["false", "1", "0", "yes", "TRUE", "True", ""];
      for (const v of otherValues) {
        process.env.FEATURE_PEDAGOGIE_V2_EPIC_1 = v;
        expect(isPedagogieV2Epic1Enabled(), `valeur testée: "${v}"`).toBe(false);
      }
    });
  });
});
