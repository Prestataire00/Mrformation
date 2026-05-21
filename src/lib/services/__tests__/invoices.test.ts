import { describe, it, expect, vi, beforeEach } from "vitest";
import { cascadeSessionPriceToPendingInvoices } from "@/lib/services/invoices";
import type { Session } from "@/lib/types";

// Mock du builder unifié — on contrôle sa sortie pour tester le cascade.
vi.mock("@/lib/utils/invoice-builder", () => ({
  buildInvoiceLines: vi.fn(),
}));

import { buildInvoiceLines } from "@/lib/utils/invoice-builder";

function makeMockSupabase(opts: {
  invoices: Array<{ id: string; status: string; recipient_type: string; recipient_id: string }>;
  fetchError?: { message: string; code: string } | null;
  deleteErrors?: Record<string, { message: string; code: string }>;
  insertErrors?: Record<string, { message: string; code: string }>;
  updateErrors?: Record<string, { message: string; code: string }>;
}) {
  // Fetch invoices
  const selectInvoicesEq = vi.fn().mockResolvedValue({
    data: opts.fetchError ? null : opts.invoices,
    error: opts.fetchError ?? null,
  });
  const selectInvoices = vi.fn().mockReturnValue({ eq: selectInvoicesEq });

  // Delete lines (called per invoice)
  const deleteLinesEq = vi.fn().mockImplementation((_col, invoiceId: string) => {
    return Promise.resolve({ data: null, error: opts.deleteErrors?.[invoiceId] ?? null });
  });
  const deleteLines = vi.fn().mockReturnValue({ eq: deleteLinesEq });

  // Insert lines (called per invoice)
  const insertLines = vi.fn().mockImplementation((rows: Array<{ invoice_id: string }>) => {
    const invoiceId = rows[0]?.invoice_id ?? "";
    return Promise.resolve({ data: null, error: opts.insertErrors?.[invoiceId] ?? null });
  });

  // Update invoice amount (called per invoice)
  const updateInvoiceEq = vi.fn().mockImplementation((_col, invoiceId: string) => {
    return Promise.resolve({ data: null, error: opts.updateErrors?.[invoiceId] ?? null });
  });
  const updateInvoice = vi.fn().mockReturnValue({ eq: updateInvoiceEq });

  const from = vi.fn((table: string) => {
    if (table === "formation_invoices") {
      // 2 cases : initial fetch OR update amount
      return {
        select: selectInvoices,
        update: updateInvoice,
      };
    }
    if (table === "formation_invoice_lines") {
      return {
        delete: deleteLines,
        insert: insertLines,
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    supabase: { from } as never,
    selectInvoicesEq,
    insertLines,
    deleteLinesEq,
    updateInvoiceEq,
  };
}

const fakeFormation = {
  id: "s1",
  title: "Test",
  formation_companies: [
    { id: "fc1", session_id: "s1", client_id: "c1", amount: 1000, email: null, reference: null, created_at: "2026-01-01" },
    { id: "fc2", session_id: "s1", client_id: "c2", amount: 1000, email: null, reference: null, created_at: "2026-01-01" },
    { id: "fc3", session_id: "s1", client_id: "c3", amount: 1000, email: null, reference: null, created_at: "2026-01-01" },
  ],
} as unknown as Session;

describe("cascadeSessionPriceToPendingInvoices", () => {
  beforeEach(() => {
    vi.mocked(buildInvoiceLines).mockReset();
  });

  it("happy path : 2 pending company invoices recalculées", async () => {
    vi.mocked(buildInvoiceLines).mockReturnValue({
      lines: [{ description: "Formation", quantity: 1, unit_price: 1000 }],
      amountHT: 1000,
    });

    const { supabase, insertLines, updateInvoiceEq } = makeMockSupabase({
      invoices: [
        { id: "inv1", status: "pending", recipient_type: "company", recipient_id: "c1" },
        { id: "inv2", status: "pending", recipient_type: "company", recipient_id: "c2" },
      ],
    });

    const result = await cascadeSessionPriceToPendingInvoices(supabase, "s1", fakeFormation);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.impacted).toBe(2);
      expect(result.blocked).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toEqual([]);
    }
    expect(buildInvoiceLines).toHaveBeenCalledTimes(2);
    expect(insertLines).toHaveBeenCalledTimes(2);
    expect(updateInvoiceEq).toHaveBeenCalledTimes(2);
  });

  it("mixed : 1 pending company + 1 sent + 1 paid → 1 impacted, 2 blocked", async () => {
    vi.mocked(buildInvoiceLines).mockReturnValue({
      lines: [{ description: "Formation", quantity: 1, unit_price: 500 }],
      amountHT: 500,
    });

    const { supabase } = makeMockSupabase({
      invoices: [
        { id: "inv1", status: "pending", recipient_type: "company", recipient_id: "c1" },
        { id: "inv2", status: "sent", recipient_type: "company", recipient_id: "c2" },
        { id: "inv3", status: "paid", recipient_type: "company", recipient_id: "c3" },
      ],
    });

    const result = await cascadeSessionPriceToPendingInvoices(supabase, "s1", fakeFormation);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.impacted).toBe(1);
      expect(result.blocked).toBe(2);
      expect(result.skipped).toBe(0);
    }
  });

  it("pending non-company → skipped", async () => {
    const { supabase } = makeMockSupabase({
      invoices: [
        { id: "inv1", status: "pending", recipient_type: "learner", recipient_id: "l1" },
        { id: "inv2", status: "pending", recipient_type: "financier", recipient_id: "f1" },
      ],
    });

    const result = await cascadeSessionPriceToPendingInvoices(supabase, "s1", fakeFormation);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.impacted).toBe(0);
      expect(result.skipped).toBe(2);
      expect(result.blocked).toBe(0);
    }
    expect(buildInvoiceLines).not.toHaveBeenCalled();
  });

  it("partial error : 1 facture pending company avec lines insert error → ajoutée à errors mais ne crash pas", async () => {
    vi.mocked(buildInvoiceLines).mockReturnValue({
      lines: [{ description: "Formation", quantity: 1, unit_price: 800 }],
      amountHT: 800,
    });

    const { supabase } = makeMockSupabase({
      invoices: [
        { id: "inv1", status: "pending", recipient_type: "company", recipient_id: "c1" },
        { id: "inv2", status: "pending", recipient_type: "company", recipient_id: "c2" },
      ],
      insertErrors: { inv2: { message: "FK violation", code: "23503" } },
    });

    const result = await cascadeSessionPriceToPendingInvoices(supabase, "s1", fakeFormation);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.impacted).toBe(1);          // inv1 ok
      expect(result.errors.length).toBe(1);     // inv2 errored
      expect(result.errors[0].invoiceId).toBe("inv2");
      expect(result.errors[0].message).toContain("FK violation");
    }
  });

  it("propage l'erreur Supabase si le fetch invoices échoue", async () => {
    const { supabase } = makeMockSupabase({
      invoices: [],
      fetchError: { message: "RLS denied", code: "42501" },
    });

    const result = await cascadeSessionPriceToPendingInvoices(supabase, "s1", fakeFormation);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("RLS denied");
      expect(result.error.code).toBe("42501");
    }
  });

  it("pending company sans montant défini → erreur dans le rapport, pas de crash", async () => {
    // recipient_id "cX" absent de fakeFormation.formation_companies
    const { supabase } = makeMockSupabase({
      invoices: [{ id: "inv1", status: "pending", recipient_type: "company", recipient_id: "cX" }],
    });
    const result = await cascadeSessionPriceToPendingInvoices(supabase, "s1", fakeFormation);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].invoiceId).toBe("inv1");
      expect(result.impacted).toBe(0);
    }
    expect(buildInvoiceLines).not.toHaveBeenCalled();
  });
});
