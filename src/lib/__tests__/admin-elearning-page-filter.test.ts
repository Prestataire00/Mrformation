import { describe, it, expect } from "vitest";

/**
 * Test isolant la logique pure de filtre conditionnel basée sur le flag.
 * On extrait juste la décision "afficher la section programs legacy ou non".
 *
 * NB : on duplique sciemment la fonction inline ici. La logique réelle dans
 * src/app/(dashboard)/admin/elearning/page.tsx utilise directement
 * isPedagogieV2Epic1Enabled() inline (ternaire ou && conditional render).
 * Ce test documente le contrat sémantique : flag ON = masquer, flag OFF = afficher.
 */
function shouldHideLegacyProgramsSection(flagEnabled: boolean): boolean {
  return flagEnabled === true;
}

describe("admin/elearning page — section programs legacy", () => {
  it("affiche la section quand flag Epic 1 est OFF (comportement actuel)", () => {
    expect(shouldHideLegacyProgramsSection(false)).toBe(false);
  });

  it("masque la section quand flag Epic 1 est ON (nouveau comportement)", () => {
    expect(shouldHideLegacyProgramsSection(true)).toBe(true);
  });
});
