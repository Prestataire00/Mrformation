import { describe, it, expect } from "vitest";
import {
  getInvoiceRowActions,
  getDefaultRecipientType,
  computeMargin,
} from "@/lib/utils/finances-display";

describe("getInvoiceRowActions", () => {
  it("pending : primaire email, menu pdf/markPaid/edit/avoir", () => {
    expect(getInvoiceRowActions({ status: "pending", is_avoir: false })).toEqual({
      primary: "email",
      menu: ["pdf", "markPaid", "edit", "avoir", "cancel"],
    });
  });

  it("sent : primaire markPaid, menu pdf/email/avoir", () => {
    expect(getInvoiceRowActions({ status: "sent", is_avoir: false })).toEqual({
      primary: "markPaid",
      menu: ["pdf", "email", "avoir", "cancel"],
    });
  });

  it("late : même traitement que sent", () => {
    expect(getInvoiceRowActions({ status: "late", is_avoir: false })).toEqual({
      primary: "markPaid",
      menu: ["pdf", "email", "avoir", "cancel"],
    });
  });

  it("paid : primaire pdf, jamais markPaid", () => {
    const a = getInvoiceRowActions({ status: "paid", is_avoir: false });
    expect(a.primary).toBe("pdf");
    expect(a.menu).not.toContain("markPaid");
    expect(a.menu).toContain("cancel");
  });

  it("cancelled : ni avoir ni edit", () => {
    expect(getInvoiceRowActions({ status: "cancelled", is_avoir: false })).toEqual({
      primary: "pdf",
      menu: [],
    });
  });

  it("avoir : pdf + email uniquement, quel que soit le statut", () => {
    expect(getInvoiceRowActions({ status: "sent", is_avoir: true })).toEqual({
      primary: "pdf",
      menu: ["email"],
    });
  });

  it("avoir + pending : la garde is_avoir précède le statut (pas de edit)", () => {
    expect(getInvoiceRowActions({ status: "pending", is_avoir: true })).toEqual({
      primary: "pdf",
      menu: ["email"],
    });
  });

  it("edit réservé aux factures pending (règle H7)", () => {
    for (const status of ["sent", "late", "paid", "cancelled"]) {
      expect(getInvoiceRowActions({ status, is_avoir: false }).menu).not.toContain("edit");
    }
  });
});

describe("getDefaultRecipientType", () => {
  it("company si des entreprises sont liées", () => {
    expect(getDefaultRecipientType({ formation_companies: [{}], formation_financiers: [] })).toBe("company");
  });

  it("financier si pas d'entreprise mais des financeurs", () => {
    expect(getDefaultRecipientType({ formation_companies: [], formation_financiers: [{}] })).toBe("financier");
  });

  it("learner si ni entreprise ni financeur", () => {
    expect(getDefaultRecipientType({ formation_companies: [], formation_financiers: [] })).toBe("learner");
  });

  it("learner si les listes sont absentes", () => {
    expect(getDefaultRecipientType({})).toBe("learner");
  });
});

describe("computeMargin", () => {
  it("marge = facturé − charges", () => {
    expect(computeMargin({ total_invoiced: 12300, total_charges: 1200 })).toBe(11100);
  });

  it("marge négative possible", () => {
    expect(computeMargin({ total_invoiced: 500, total_charges: 800 })).toBe(-300);
  });

  it("arrondi à 2 décimales", () => {
    expect(computeMargin({ total_invoiced: 100.005, total_charges: 0 })).toBe(100.01);
  });
});
