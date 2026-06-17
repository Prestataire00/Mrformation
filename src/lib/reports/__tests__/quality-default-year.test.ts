import { describe, it, expect } from "vitest";
import { pickDefaultQualityYear } from "../quality-default-year";

describe("pickDefaultQualityYear", () => {
  it("choisit l'année la plus fournie", () => {
    expect(pickDefaultQualityYear([{ year: 2025, dataCount: 63 }, { year: 2026, dataCount: 4 }], 2026)).toBe(2025);
  });
  it("égalité → année la plus récente", () => {
    expect(pickDefaultQualityYear([{ year: 2024, dataCount: 10 }, { year: 2025, dataCount: 10 }], 2026)).toBe(2025);
  });
  it("liste vide → année courante", () => {
    expect(pickDefaultQualityYear([], 2026)).toBe(2026);
  });
  it("aucune année avec données (counts 0) → année courante", () => {
    expect(pickDefaultQualityYear([{ year: 2025, dataCount: 0 }, { year: 2026, dataCount: 0 }], 2026)).toBe(2026);
  });
  it("une seule année avec données → elle", () => {
    expect(pickDefaultQualityYear([{ year: 2023, dataCount: 5 }], 2026)).toBe(2023);
  });
});
