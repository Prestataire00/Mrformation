import { describe, it, expect } from "vitest";
import { resolveDisplayedHours } from "@/lib/utils/hours-source";

describe("resolveDisplayedHours", () => {
  it("retourne source=override quand override_hours est défini", () => {
    const result = resolveDisplayedHours({
      planned_hours: 14,
      computed_hours: 14,
      override_hours: 16,
    });
    expect(result.value).toBe(16);
    expect(result.source).toBe("override");
    expect(result.computedValue).toBe(14);
  });

  it("retourne source=computed quand override_hours est null mais computed_hours est défini", () => {
    const result = resolveDisplayedHours({
      planned_hours: 14,
      computed_hours: 14,
      override_hours: null,
    });
    expect(result.value).toBe(14);
    expect(result.source).toBe("computed");
    expect(result.computedValue).toBe(14);
  });

  it("retourne source=legacy quand seul planned_hours est défini (sessions historiques)", () => {
    const result = resolveDisplayedHours({
      planned_hours: 12,
      computed_hours: null,
      override_hours: null,
    });
    expect(result.value).toBe(12);
    expect(result.source).toBe("legacy");
    expect(result.computedValue).toBe(12);
  });

  it("retourne source=null et value=null quand aucune valeur n'est définie", () => {
    const result = resolveDisplayedHours({
      planned_hours: null,
      computed_hours: null,
      override_hours: null,
    });
    expect(result.value).toBeNull();
    expect(result.source).toBeNull();
    expect(result.computedValue).toBeNull();
  });

  it("override = 0 est traité comme override valide (pas null)", () => {
    const result = resolveDisplayedHours({
      planned_hours: 14,
      computed_hours: 14,
      override_hours: 0,
    });
    expect(result.value).toBe(0);
    expect(result.source).toBe("override");
  });

  it("override prime sur computed même si la valeur est identique", () => {
    // L'utilisateur a explicitement saisi la même valeur que le calcul auto.
    // Le helper respecte le marqueur "manuellement saisi" (source=override).
    const result = resolveDisplayedHours({
      planned_hours: 14,
      computed_hours: 14,
      override_hours: 14,
    });
    expect(result.value).toBe(14);
    expect(result.source).toBe("override");
  });

  it("computedValue fallback sur planned_hours quand computed_hours est null", () => {
    const result = resolveDisplayedHours({
      planned_hours: 10,
      computed_hours: null,
      override_hours: 12,
    });
    expect(result.value).toBe(12);
    expect(result.source).toBe("override");
    expect(result.computedValue).toBe(10); // fallback sur legacy
  });
});
