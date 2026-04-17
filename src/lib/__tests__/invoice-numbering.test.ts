import { describe, it, expect } from "vitest";

// Test invoice reference formatting logic (mirrors DB-generated references)
function formatInvoiceReference(prefix: string, fiscalYear: number, globalNumber: number): string {
  return `${prefix}-${fiscalYear}-${String(globalNumber).padStart(4, "0")}`;
}

describe("invoice numbering", () => {
  it("genere une reference facture correcte", () => {
    expect(formatInvoiceReference("FAC", 2026, 1)).toBe("FAC-2026-0001");
  });

  it("genere une reference avoir correcte", () => {
    expect(formatInvoiceReference("AV", 2026, 1)).toBe("AV-2026-0001");
  });

  it("pad a 4 chiffres : 1 → 0001", () => {
    expect(formatInvoiceReference("FAC", 2026, 1)).toContain("0001");
  });

  it("pad a 4 chiffres : 42 → 0042", () => {
    expect(formatInvoiceReference("FAC", 2026, 42)).toContain("0042");
  });

  it("pad a 4 chiffres : 999 → 0999", () => {
    expect(formatInvoiceReference("FAC", 2026, 999)).toContain("0999");
  });

  it("gere les grands numeros (> 9999)", () => {
    expect(formatInvoiceReference("FAC", 2026, 10001)).toBe("FAC-2026-10001");
  });

  it("inclut l'annee fiscale correcte", () => {
    const ref = formatInvoiceReference("FAC", 2027, 5);
    expect(ref).toContain("2027");
  });
});
