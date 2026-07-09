import { describe, it, expect } from "vitest";
import { computeRevenueFromInvoices, type InvoiceLite } from "../revenue";

const Y = 2026;
describe("computeRevenueFromInvoices", () => {
  it("réalisé = factures payées de l'année (par paid_at)", () => {
    const inv: InvoiceLite[] = [
      { amount: 1000, status: "paid", paid_at: "2026-03-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
      { amount: 500, status: "paid", paid_at: "2025-12-01T00:00:00Z", created_at: "2025-11-01T00:00:00Z" },
    ];
    expect(computeRevenueFromInvoices(inv, Y)).toEqual({ realise: 1000, previsionnel: 0 });
  });
  it("paid sans paid_at → repli sur created_at", () => {
    const inv: InvoiceLite[] = [{ amount: 800, status: "paid", paid_at: null, created_at: "2026-02-01T00:00:00Z" }];
    expect(computeRevenueFromInvoices(inv, Y).realise).toBe(800);
  });
  it("prévisionnel = factures émises non payées de l'année (pending/sent/late)", () => {
    const inv: InvoiceLite[] = [
      { amount: 300, status: "pending", paid_at: null, created_at: "2026-04-01T00:00:00Z" },
      { amount: 200, status: "sent", paid_at: null, created_at: "2026-05-01T00:00:00Z" },
      { amount: 100, status: "late", paid_at: null, created_at: "2026-06-01T00:00:00Z" },
    ];
    expect(computeRevenueFromInvoices(inv, Y)).toEqual({ realise: 0, previsionnel: 600 });
  });
  it("cancelled ignoré ; amount null = 0", () => {
    const inv: InvoiceLite[] = [
      { amount: 9999, status: "cancelled", paid_at: null, created_at: "2026-01-01T00:00:00Z" },
      { amount: null, status: "paid", paid_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
    ];
    expect(computeRevenueFromInvoices(inv, Y)).toEqual({ realise: 0, previsionnel: 0 });
  });

  it("avoir (is_avoir=true) exclu des deux sommes", () => {
    const inv: InvoiceLite[] = [
      { amount: 1000, status: "paid", paid_at: "2026-03-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
      { amount: -250, status: "pending", paid_at: null, created_at: "2026-02-01T00:00:00Z", is_avoir: true },
    ];
    expect(computeRevenueFromInvoices(inv, Y)).toEqual({ realise: 1000, previsionnel: 0 });
  });

  it("montant négatif NON flaggé (avoir legacy / remise) exclu → prévisionnel jamais négatif", () => {
    const inv: InvoiceLite[] = [
      { amount: 5000, status: "pending", paid_at: null, created_at: "2026-04-01T00:00:00Z" },
      // Avoir importé sans le flag, ou remise saisie en négatif :
      { amount: -12250, status: "pending", paid_at: null, created_at: "2026-04-02T00:00:00Z" },
    ];
    const r = computeRevenueFromInvoices(inv, Y);
    expect(r.previsionnel).toBe(5000);
    expect(r.previsionnel).toBeGreaterThanOrEqual(0);
  });

  it("montant négatif payé (remboursement) exclu du réalisé", () => {
    const inv: InvoiceLite[] = [
      { amount: 2000, status: "paid", paid_at: "2026-05-01T00:00:00Z", created_at: "2026-05-01T00:00:00Z" },
      { amount: -500, status: "paid", paid_at: "2026-05-02T00:00:00Z", created_at: "2026-05-02T00:00:00Z" },
    ];
    expect(computeRevenueFromInvoices(inv, Y).realise).toBe(2000);
  });
});
