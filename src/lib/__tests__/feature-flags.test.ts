import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPedagogieV2Epic1Enabled } from "@/lib/feature-flags";

/**
 * Contrat depuis 06/2026 : Epic 1-5 ont été validés en prod (commit 0b2ef45).
 * Leur helper est passé sur `flagOnByDefault` — par défaut TRUE, opt-out via
 * `=false` explicite. Toute autre valeur (vide, autre string, undefined) =
 * TRUE. Voir feature-flags.ts pour le rationnel.
 */
describe("feature-flags — isPedagogieV2Epic1Enabled (default ON)", () => {
  const origEnv = process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_1;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_1;
  });

  afterEach(() => {
    if (origEnv === undefined) delete process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_1;
    else process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_1 = origEnv;
  });

  it("retourne TRUE par défaut quand la variable n'est pas définie", () => {
    expect(isPedagogieV2Epic1Enabled()).toBe(true);
  });

  it("retourne TRUE quand la variable vaut 'true'", () => {
    process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_1 = "true";
    expect(isPedagogieV2Epic1Enabled()).toBe(true);
  });

  it("retourne FALSE uniquement quand la variable vaut exactement 'false'", () => {
    process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_1 = "false";
    expect(isPedagogieV2Epic1Enabled()).toBe(false);
  });

  it("retourne TRUE pour toute autre valeur que 'false'", () => {
    const otherValues = ["true", "1", "0", "yes", "TRUE", "False", "FALSE", ""];
    for (const v of otherValues) {
      process.env.NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_1 = v;
      expect(isPedagogieV2Epic1Enabled(), `valeur testée: "${v}"`).toBe(true);
    }
  });
});
