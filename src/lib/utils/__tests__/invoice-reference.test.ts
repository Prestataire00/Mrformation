import { describe, it, expect } from "vitest";
import { formatInvoiceReference } from "../invoice-reference";

describe("formatInvoiceReference", () => {
  it("facture FAC 2026 → FAC-26-25 (numéro non paddé, année 2 chiffres)", () => {
    expect(formatInvoiceReference({ prefix: "FAC", fiscalYear: 2026, globalNumber: 25 })).toBe("FAC-26-25");
  });
  it("continue la séquence Excel : FAC-26-24 → suivant 25", () => {
    expect(formatInvoiceReference({ prefix: "FAC", fiscalYear: 2026, globalNumber: 79 })).toBe("FAC-26-79");
  });
  it("avoir avec son propre préfixe", () => {
    expect(formatInvoiceReference({ prefix: "AV", fiscalYear: 2025, globalNumber: 3 })).toBe("AV-25-3");
  });
  it("année paddée à 2 chiffres", () => {
    expect(formatInvoiceReference({ prefix: "FAC", fiscalYear: 2005, globalNumber: 1 })).toBe("FAC-05-1");
  });
  it("numéro jamais paddé même à un chiffre", () => {
    expect(formatInvoiceReference({ prefix: "FAC", fiscalYear: 2026, globalNumber: 0 })).toBe("FAC-26-0");
  });
});
