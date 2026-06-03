import { describe, it, expect } from "vitest";
import { getFrenchHolidays, isFrenchHoliday, buildHolidaySet } from "../french-holidays";

describe("getFrenchHolidays", () => {
  it("retourne 11 jours fériés métropolitains par an", () => {
    expect(getFrenchHolidays(2026)).toHaveLength(11);
  });

  it("inclut les dates fixes invariantes", () => {
    const h = getFrenchHolidays(2026).map((x) => x.date);
    expect(h).toContain("2026-01-01");
    expect(h).toContain("2026-05-01");
    expect(h).toContain("2026-05-08");
    expect(h).toContain("2026-07-14");
    expect(h).toContain("2026-08-15");
    expect(h).toContain("2026-11-01");
    expect(h).toContain("2026-11-11");
    expect(h).toContain("2026-12-25");
  });

  // Algorithme Gauss validé : Pâques 2025 = 20 avril, donc Lundi de Pâques = 21 avril
  it("calcule correctement le Lundi de Pâques 2025 (21 avril)", () => {
    const h = getFrenchHolidays(2025);
    const easter = h.find((x) => x.name === "Lundi de Pâques");
    expect(easter?.date).toBe("2025-04-21");
  });

  // Pâques 2026 = 5 avril → Lundi de Pâques = 6 avril
  it("calcule correctement le Lundi de Pâques 2026 (6 avril)", () => {
    const h = getFrenchHolidays(2026);
    const easter = h.find((x) => x.name === "Lundi de Pâques");
    expect(easter?.date).toBe("2026-04-06");
  });

  // Pâques 2025 = 20 avril → Ascension = 20+39 = 29 mai
  it("calcule l'Ascension à Pâques + 39 jours (2025 → 29 mai)", () => {
    const h = getFrenchHolidays(2025);
    const ascension = h.find((x) => x.name === "Ascension");
    expect(ascension?.date).toBe("2025-05-29");
  });

  // Pâques 2025 → Lundi Pentecôte = Pâques + 50 = 9 juin
  it("calcule le Lundi de Pentecôte à Pâques + 50 jours (2025 → 9 juin)", () => {
    const h = getFrenchHolidays(2025);
    const pentecost = h.find((x) => x.name === "Lundi de Pentecôte");
    expect(pentecost?.date).toBe("2025-06-09");
  });
});

describe("isFrenchHoliday", () => {
  it("renvoie true pour le 25 décembre", () => {
    expect(isFrenchHoliday("2026-12-25")).toBe(true);
  });

  it("renvoie true pour le Lundi de Pâques 2025", () => {
    expect(isFrenchHoliday("2025-04-21")).toBe(true);
  });

  it("renvoie false pour un jour ouvré", () => {
    expect(isFrenchHoliday("2026-03-15")).toBe(false);
  });

  it("renvoie false pour un format invalide", () => {
    expect(isFrenchHoliday("not-a-date")).toBe(false);
  });
});

describe("buildHolidaySet", () => {
  it("contient tous les fériés d'une année", () => {
    const set = buildHolidaySet(2026, 2026);
    expect(set.size).toBe(11);
    expect(set.has("2026-12-25")).toBe(true);
  });

  it("merge plusieurs années", () => {
    const set = buildHolidaySet(2025, 2027);
    expect(set.size).toBe(33);
    expect(set.has("2025-12-25")).toBe(true);
    expect(set.has("2027-01-01")).toBe(true);
  });
});
