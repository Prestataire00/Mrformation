import { describe, it, expect } from "vitest";
import { formatCurrency, formatDate } from "@/lib/utils";

describe("formatCurrency", () => {
  it("formate 1500 en euros", () => {
    const result = formatCurrency(1500);
    expect(result).toContain("1");
    expect(result).toContain("500");
    expect(result).toContain("€");
  });

  it("formate 0 correctement", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0");
    expect(result).toContain("€");
  });

  it("gere null → tiret", () => {
    expect(formatCurrency(null)).toBe("—");
  });

  it("gere undefined → tiret", () => {
    expect(formatCurrency(undefined)).toBe("—");
  });

  it("formate les decimales", () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain("1");
    expect(result).toContain("234");
  });

  it("gere les nombres negatifs", () => {
    const result = formatCurrency(-500);
    expect(result).toContain("500");
  });
});

describe("formatDate", () => {
  it("formate une date ISO valide en fr-FR", () => {
    const result = formatDate("2026-03-15");
    expect(result).toContain("15");
    expect(result).toContain("03");
    expect(result).toContain("2026");
  });

  it("gere null → tiret", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("gere undefined → tiret", () => {
    expect(formatDate(undefined)).toBe("—");
  });

  it("gere une chaine vide → tiret", () => {
    expect(formatDate("")).toBe("—");
  });

  it("gere une date invalide → tiret", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });

  it("accepte un objet Date", () => {
    const result = formatDate(new Date(2026, 0, 15));
    expect(result).toContain("15");
    expect(result).toContain("01");
    expect(result).toContain("2026");
  });
});
