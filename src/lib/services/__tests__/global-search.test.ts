import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/services/prospect-search", () => ({
  searchProspectIds: vi.fn(),
}));

import { searchProspectIds } from "@/lib/services/prospect-search";
import { globalSearchEntities, GLOBAL_SEARCH_MIN_CHARS } from "@/lib/services/global-search";

const mockedSearchProspectIds = vi.mocked(searchProspectIds);

/** Builder Supabase chaînable et "awaitable" résolvant `result`. */
function builder(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "ilike", "order", "limit", "in"]) {
    b[m] = vi.fn(() => b);
  }
  (b as { then: unknown }).then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onF, onR);
  return b;
}

function mockSupabase(byTable: Record<string, { data: unknown; error: unknown }>) {
  const from = vi.fn((table: string) => builder(byTable[table]));
  return { from } as unknown as SupabaseClient;
}

describe("globalSearchEntities (recherche globale header)", () => {
  beforeEach(() => mockedSearchProspectIds.mockReset());

  it("query < min caractères → vide, aucune requête", async () => {
    const supabase = mockSupabase({});
    const res = await globalSearchEntities(supabase, "ent-1", "d");
    expect(res).toEqual({ ok: true, clients: [], prospects: [] });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(mockedSearchProspectIds).not.toHaveBeenCalled();
  });

  it("entityId null → vide, aucune requête", async () => {
    const supabase = mockSupabase({});
    const res = await globalSearchEntities(supabase, null, "dupont");
    expect(res).toEqual({ ok: true, clients: [], prospects: [] });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("mappe clients (ilike) + prospects (fuzzy → fetch)", async () => {
    mockedSearchProspectIds.mockResolvedValue({ ok: true, ids: ["p1"] });
    const supabase = mockSupabase({
      clients: { data: [{ id: "c1", company_name: "Dupont SARL" }], error: null },
      crm_prospects: { data: [{ id: "p1", company_name: "Dupond", contact_name: "Jean" }], error: null },
    });
    const res = await globalSearchEntities(supabase, "ent-1", "dupon");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.clients).toEqual([{ id: "c1", company_name: "Dupont SARL" }]);
      expect(res.prospects).toEqual([{ id: "p1", company_name: "Dupond", contact_name: "Jean" }]);
    }
    expect(mockedSearchProspectIds).toHaveBeenCalledWith(supabase, "ent-1", "dupon", 6);
  });

  it("aucun prospect matché → ne fetch pas crm_prospects", async () => {
    mockedSearchProspectIds.mockResolvedValue({ ok: true, ids: [] });
    const supabase = mockSupabase({
      clients: { data: [{ id: "c1", company_name: "Dupont" }], error: null },
    });
    const res = await globalSearchEntities(supabase, "ent-1", "dupon");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.prospects).toEqual([]);
    expect(supabase.from).toHaveBeenCalledTimes(1); // clients seulement
  });

  it("erreur sur la requête clients → ok=false", async () => {
    const supabase = mockSupabase({
      clients: { data: null, error: { message: "boom", code: "500" } },
    });
    const res = await globalSearchEntities(supabase, "ent-1", "dupon");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe("boom");
  });
});
