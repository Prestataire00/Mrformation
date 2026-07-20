import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshInvoiceStatus } from "../abby-status";
import type { AbbyConnectionState } from "@/lib/types/abby";

vi.mock("../abby-connections", () => ({
  getConnectionState: vi.fn(),
  withAbbyConnection: vi.fn(),
}));
vi.mock("@/lib/abby/client", () => ({
  createAbbyClient: vi.fn(),
  getAbbyInvoice: vi.fn(),
}));

import { getConnectionState, withAbbyConnection } from "../abby-connections";
import { getAbbyInvoice } from "@/lib/abby/client";

const getConnectionStateMock = vi.mocked(getConnectionState);
const withAbbyConnectionMock = vi.mocked(withAbbyConnection);
const getAbbyInvoiceMock = vi.mocked(getAbbyInvoice);

const ENTITY_ID = "ent-mr";
const INVOICE_ID = "inv-1";

const FINALIZED_INVOICE = {
  id: INVOICE_ID,
  abby_invoice_id: "abby-inv-9",
  abby_push_state: "finalized" as string | null,
  abby_push_locked_at: null,
  abby_invoice_number: "F-2026-0042",
  abby_state: "finalized" as string | null,
  abby_last_error: null,
};

interface UpdateCall {
  payload: Record<string, unknown>;
  filters: string[];
}

function makeDb(
  invoice: unknown = FINALIZED_INVOICE,
  updateResults: Array<{ rows: number }> = []
) {
  const updates: UpdateCall[] = [];
  const selectFilters: string[] = [];
  const queue = [...updateResults];
  const supabase = {
    from: vi.fn(() => {
      const filters: string[] = [];
      let payload: Record<string, unknown> = {};
      let mode: "select" | "update" = "select";
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => {
        if (mode === "update") {
          const r = queue.shift() ?? { rows: 1 };
          updates.push({ payload, filters: [...filters] });
          return Promise.resolve({
            data: Array.from({ length: r.rows }, () => ({ id: INVOICE_ID })),
            error: null,
          });
        }
        return builder;
      });
      builder.update = vi.fn((p: Record<string, unknown>) => {
        mode = "update";
        payload = p;
        return builder;
      });
      builder.eq = vi.fn((col: string, val: unknown) => {
        filters.push(`${col}=${String(val)}`);
        return builder;
      });
      builder.maybeSingle = vi.fn(async () => {
        selectFilters.push(...filters);
        return { data: invoice, error: null };
      });
      return builder;
    }),
  } as unknown as SupabaseClient;
  return { supabase, updates, selectFilters };
}

function activeState(): AbbyConnectionState {
  return {
    status: "active",
    companyName: "MR FORMATION",
    companySiret: "91311329600036",
    isActive: true,
    connectedAt: "2026-07-16T10:00:00Z",
    lastUsedAt: null,
    lastError: null,
    lastErrorAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getConnectionStateMock.mockResolvedValue({ ok: true, state: activeState() } as never);
  withAbbyConnectionMock.mockImplementation(async (_sb, _ent, fn) => {
    try {
      return { ok: true, data: await fn({} as never) } as never;
    } catch {
      return { ok: false, error: { message: "réseau", code: "abby_network" } } as never;
    }
  });
  getAbbyInvoiceMock.mockResolvedValue({
    id: "abby-inv-9",
    number: "F-2026-0042",
    state: "paid",
    paidAt: 1784332800, // secondes
    finalizedAt: 1784246400,
  });
});

describe("refreshInvoiceStatus — INVARIANT AD-11 (jamais status ni paid_at LMS)", () => {
  it("succès : écrit abby_state/synced_at/paid_at/finalized_at et JAMAIS status ni paid_at", async () => {
    const { supabase, updates } = makeDb();
    const res = await refreshInvoiceStatus(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status.state).toBe("paid");
    expect(res.status.paidAt).toBe("2026-07-18T00:00:00.000Z");
    expect(updates).toHaveLength(1);
    const patch = updates[0].payload;
    expect(patch).toMatchObject({
      abby_state: "paid",
      abby_last_error: null,
      abby_paid_at: "2026-07-18T00:00:00.000Z",
    });
    expect(patch.abby_synced_at).toBeDefined();
    // ⛔ L'invariant : ces deux clés ne doivent JAMAIS apparaître
    expect("status" in patch).toBe(false);
    expect("paid_at" in patch).toBe(false);
  });

  it("l'UPDATE est conditionnel WHERE abby_push_state='finalized' (AD-13, tous chemins)", async () => {
    const { supabase, updates } = makeDb();
    await refreshInvoiceStatus(supabase, ENTITY_ID, INVOICE_ID);
    expect(updates[0].filters).toContain("abby_push_state=finalized");
    expect(updates[0].filters).toContain(`entity_id=${ENTITY_ID}`);
  });

  it("dates Abby en millisecondes (défensif) : converties sans année fantôme", async () => {
    getAbbyInvoiceMock.mockResolvedValue({
      id: "abby-inv-9", number: "F", state: "paid",
      paidAt: 1784332800000, finalizedAt: null,
    });
    const { supabase } = makeDb();
    const res = await refreshInvoiceStatus(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.status.paidAt).toBe("2026-07-18T00:00:00.000Z");
  });

  it("dates absentes : colonnes non écrasées (pas de null qui efface une donnée connue)", async () => {
    getAbbyInvoiceMock.mockResolvedValue({
      id: "abby-inv-9", number: "F", state: "finalized",
      paidAt: null, finalizedAt: null,
    });
    const { supabase, updates } = makeDb();
    await refreshInvoiceStatus(supabase, ENTITY_ID, INVOICE_ID);
    expect("abby_paid_at" in updates[0].payload).toBe(false);
    expect("abby_finalized_at" in updates[0].payload).toBe(false);
  });
});

describe("refreshInvoiceStatus — gardes (AC-3)", () => {
  it("push non finalisé → abby_invalid_state, AUCUNE écriture ni appel SDK", async () => {
    const { supabase, updates } = makeDb({
      ...FINALIZED_INVOICE,
      abby_push_state: "draft_created",
    });
    const res = await refreshInvoiceStatus(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
    expect(updates).toHaveLength(0);
    expect(getAbbyInvoiceMock).not.toHaveBeenCalled();
  });

  it("jamais poussée (null explicite) → refus — anti-piège undefined", async () => {
    const { supabase, updates } = makeDb({ ...FINALIZED_INVOICE, abby_push_state: null });
    const res = await refreshInvoiceStatus(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("finalisée SANS abby_invoice_id (incohérence) → refus sans appel SDK", async () => {
    const { supabase, updates } = makeDb({ ...FINALIZED_INVOICE, abby_invoice_id: null });
    const res = await refreshInvoiceStatus(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_invalid_state");
    expect(updates).toHaveLength(0);
    expect(getAbbyInvoiceMock).not.toHaveBeenCalled();
  });

  it("connexion non active → refus, aucune lecture facture", async () => {
    getConnectionStateMock.mockResolvedValue({
      ok: true,
      state: { ...activeState(), status: "desactivee", isActive: false },
    } as never);
    const { supabase, updates } = makeDb();
    const res = await refreshInvoiceStatus(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("facture LMS introuvable (autre entité) → abby_not_found", async () => {
    const { supabase } = makeDb(null);
    const res = await refreshInvoiceStatus(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_not_found");
  });

  it("le SELECT est filtré par entity_id (isolation multi-tenant prouvée, pas seulement le retour null)", async () => {
    const { supabase, selectFilters } = makeDb();
    await refreshInvoiceStatus(supabase, ENTITY_ID, INVOICE_ID);
    expect(selectFilters).toContain(`entity_id=${ENTITY_ID}`);
    expect(selectFilters).toContain(`id=${INVOICE_ID}`);
  });

  it("UPDATE 0 ligne (état changé entre la garde et l'écriture) → 409, garde de course AD-13", async () => {
    const { supabase } = makeDb(FINALIZED_INVOICE, [{ rows: 0 }]);
    const res = await refreshInvoiceStatus(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("abby_invalid_state");
      expect(res.error.message).toMatch(/rechargez la page/);
    }
  });
});

describe("refreshInvoiceStatus — introuvable chez Abby (AC-4)", () => {
  it("404 Abby → SUCCÈS daté notFound, dernière donnée connue préservée", async () => {
    withAbbyConnectionMock.mockResolvedValue({
      ok: false,
      error: { message: "introuvable", code: "abby_not_found" },
    } as never);
    const { supabase, updates } = makeDb();
    const res = await refreshInvoiceStatus(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status.notFound).toBe(true);
    expect(res.status.state).toBe("finalized"); // dernière donnée connue
    // Seuls last_error + synced_at sont écrits — abby_state INTACT
    expect(updates[0].payload).toEqual({
      abby_last_error: "Facture introuvable chez Abby.",
      abby_synced_at: expect.any(String),
    });
  });

  it("erreur réseau → échec typé, last_error + synced_at écrits, abby_state intact", async () => {
    withAbbyConnectionMock.mockResolvedValue({
      ok: false,
      error: { message: "Abby injoignable", code: "abby_network" },
    } as never);
    const { supabase, updates } = makeDb();
    const res = await refreshInvoiceStatus(supabase, ENTITY_ID, INVOICE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("abby_network");
    expect("abby_state" in updates[0].payload).toBe(false);
    expect(updates[0].payload.abby_last_error).toBe("Abby injoignable");
  });
});
