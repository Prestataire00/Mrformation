import { describe, it, expect } from "vitest";
import { pickLearnerRecord } from "../pick-learner-record";

describe("pickLearnerRecord (compte apprenant partagé — régression-safe mono-fiche)", () => {
  const a = { id: "a-1", first_name: "Apprenant 2" };
  const b = { id: "b-2", first_name: "Apprenant 7" };
  const c = { id: "c-3", first_name: "Apprenant 12" };

  it("renvoie null si aucune fiche", () => {
    expect(pickLearnerRecord([])).toBeNull();
    expect(pickLearnerRecord(null)).toBeNull();
    expect(pickLearnerRecord(undefined)).toBeNull();
  });

  it("NON-RÉGRESSION mono-fiche : 1 seule fiche → cette fiche (== ancien .single)", () => {
    expect(pickLearnerRecord([a])).toBe(a);
  });

  it("multi-fiche (compte partagé) : choix déterministe (plus petit id)", () => {
    expect(pickLearnerRecord([b, a, c])).toBe(a);
    expect(pickLearnerRecord([c, b, a])).toBe(a);
    // même entrée dans un ordre différent → MÊME fiche (cohérence inter-pages)
    expect(pickLearnerRecord([c, b, a])).toBe(pickLearnerRecord([a, c, b]));
  });

  it("ne mute pas le tableau d'entrée", () => {
    const input = [c, b, a];
    pickLearnerRecord(input);
    expect(input).toEqual([c, b, a]);
  });
});
