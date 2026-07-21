import { describe, it, expect } from "vitest";
import { invoiceDisplayRef } from "../invoice-display-ref";

describe("invoiceDisplayRef", () => {
  it("facture importée (réf LORIS) → affiche le vrai numéro (external_reference)", () => {
    expect(invoiceDisplayRef({ reference: "LORIS-26-9500", external_reference: "FAC-25-0" })).toBe("FAC-25-0");
  });
  it("facture app (réf normale) → garde sa référence", () => {
    expect(invoiceDisplayRef({ reference: "FAC-26-0001", external_reference: "PO-123" })).toBe("FAC-26-0001");
  });
  it("réf LORIS sans external_reference → garde la réf LORIS (pas de vrai numéro)", () => {
    expect(invoiceDisplayRef({ reference: "LORIS-26-9500", external_reference: null })).toBe("LORIS-26-9500");
  });
  it("réf absente → external_reference puis chaîne vide", () => {
    expect(invoiceDisplayRef({ reference: null, external_reference: "FAC-25-9" })).toBe("FAC-25-9");
    expect(invoiceDisplayRef({ reference: null, external_reference: null })).toBe("");
  });

  it("FR-20 : le rapprochement ignore le Numéro Abby d'une facture poussée", () => {
    // Une facture poussée porte un abby_invoice_number — la référence
    // affichée/rapprochée reste la référence INTERNE, jamais le numéro Abby.
    const pushed = {
      reference: "FAC-26-45",
      external_reference: null,
      abby_invoice_number: "F-2026-0003",
      abby_state: "paid",
    } as unknown as Parameters<typeof invoiceDisplayRef>[0];
    expect(invoiceDisplayRef(pushed)).toBe("FAC-26-45");
  });
});
