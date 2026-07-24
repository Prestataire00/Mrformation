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
  for (const m of ["select", "eq", "ilike", "or", "order", "limit", "in"]) {
    b[m] = vi.fn(() => b);
  }
  (b as { then: unknown }).then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onF, onR);
  return b;
}

function mockSupabase(byTable: Record<string, { data: unknown; error: unknown }>) {
  const from = vi.fn((table: string) => builder(byTable[table] ?? { data: [], error: null }));
  return { from } as unknown as SupabaseClient;
}

const EMPTY = { ok: true, clients: [], prospects: [], learners: [], sessions: [] };

describe("globalSearchEntities (recherche globale header)", () => {
  beforeEach(() => mockedSearchProspectIds.mockReset());

  it("query < min caractères → vide, aucune requête", async () => {
    const supabase = mockSupabase({});
    const res = await globalSearchEntities(supabase, "ent-1", "d");
    expect(res).toEqual(EMPTY);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(mockedSearchProspectIds).not.toHaveBeenCalled();
  });

  it("entityId null → vide, aucune requête", async () => {
    const supabase = mockSupabase({});
    const res = await globalSearchEntities(supabase, null, "dupont");
    expect(res).toEqual(EMPTY);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("mappe clients + prospects + apprenants + formations (audit 24/07)", async () => {
    mockedSearchProspectIds.mockResolvedValue({ ok: true, ids: ["p1"] });
    const supabase = mockSupabase({
      clients: { data: [{ id: "c1", company_name: "Dupont SARL" }], error: null },
      crm_prospects: { data: [{ id: "p1", company_name: "Dupond", contact_name: "Jean" }], error: null },
      learners: { data: [{ id: "l1", first_name: "Marie", last_name: "Dupont", email: "m@d.fr" }], error: null },
      sessions: { data: [{ id: "s1", title: "Formation Dupont", status: "in_progress" }], error: null },
    });
    const res = await globalSearchEntities(supabase, "ent-1", "dupon");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.clients).toEqual([{ id: "c1", company_name: "Dupont SARL" }]);
      expect(res.prospects).toEqual([{ id: "p1", company_name: "Dupond", contact_name: "Jean" }]);
      expect(res.learners).toEqual([{ id: "l1", first_name: "Marie", last_name: "Dupont", email: "m@d.fr" }]);
      expect(res.sessions).toEqual([{ id: "s1", title: "Formation Dupont", status: "in_progress" }]);
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
    // clients + learners + sessions (pas de fetch crm_prospects)
    expect(supabase.from).toHaveBeenCalledTimes(3);
    expect(vi.mocked(supabase.from).mock.calls.map((c) => c[0])).not.toContain("crm_prospects");
  });

  it("query réduite à rien par la sanitisation .or() → skip la requête learners", async () => {
    mockedSearchProspectIds.mockResolvedValue({ ok: true, ids: [] });
    const supabase = mockSupabase({});
    // "%%" : que des caractères spéciaux → orSanitized vide → pas de .or() learners.
    const res = await globalSearchEntities(supabase, "ent-1", "%%");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.learners).toEqual([]);
    expect(vi.mocked(supabase.from).mock.calls.map((c) => c[0])).not.toContain("learners");
  });

  it("erreur sur la requête clients → ok=false", async () => {
    mockedSearchProspectIds.mockResolvedValue({ ok: true, ids: [] });
    const supabase = mockSupabase({
      clients: { data: null, error: { message: "boom", code: "500" } },
    });
    const res = await globalSearchEntities(supabase, "ent-1", "dupon");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe("boom");
  });

  it("erreur sur la requête learners → ok=false", async () => {
    mockedSearchProspectIds.mockResolvedValue({ ok: true, ids: [] });
    const supabase = mockSupabase({
      clients: { data: [], error: null },
      learners: { data: null, error: { message: "rls", code: "401" } },
      sessions: { data: [], error: null },
    });
    const res = await globalSearchEntities(supabase, "ent-1", "dupon");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe("rls");
  });

  it("respecte GLOBAL_SEARCH_MIN_CHARS", () => {
    expect(GLOBAL_SEARCH_MIN_CHARS).toBe(2);
  });
});
