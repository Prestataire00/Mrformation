import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchProspectIds } from "@/lib/services/prospect-search";

function mockSupabase(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("searchProspectIds (recherche prospects fuzzy)", () => {
  it("recherche vide → ok, ids vides, sans appel RPC", async () => {
    const { client, rpc } = mockSupabase({ data: null, error: null });
    const res = await searchProspectIds(client, "ent-1", "   ");
    expect(res).toEqual({ ok: true, ids: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("entityId vide → ok, ids vides, sans appel RPC (pas de 500)", async () => {
    const { client, rpc } = mockSupabase({ data: null, error: null });
    const res = await searchProspectIds(client, "", "dupont");
    expect(res).toEqual({ ok: true, ids: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passe entity_id + query trimmés à la RPC (sans limite par défaut)", async () => {
    const { client, rpc } = mockSupabase({ data: [], error: null });
    await searchProspectIds(client, "ent-1", "  dupont  ");
    expect(rpc).toHaveBeenCalledWith("search_crm_prospect_ids", {
      p_entity_id: "ent-1",
      p_query: "dupont",
    });
  });

  it("transmet p_limit quand une limite est fournie", async () => {
    const { client, rpc } = mockSupabase({ data: [], error: null });
    await searchProspectIds(client, "ent-1", "dupont", 50000);
    expect(rpc).toHaveBeenCalledWith("search_crm_prospect_ids", {
      p_entity_id: "ent-1",
      p_query: "dupont",
      p_limit: 50000,
    });
  });

  it("mappe un SETOF uuid renvoyé en tableau de strings", async () => {
    const { client } = mockSupabase({ data: ["id-1", "id-2"], error: null });
    const res = await searchProspectIds(client, "ent-1", "dupon");
    expect(res).toEqual({ ok: true, ids: ["id-1", "id-2"] });
  });

  it("mappe aussi un retour en tableau d'objets", async () => {
    const { client } = mockSupabase({
      data: [{ search_crm_prospect_ids: "id-1" }, { id: "id-2" }],
      error: null,
    });
    const res = await searchProspectIds(client, "ent-1", "dupon");
    expect(res).toEqual({ ok: true, ids: ["id-1", "id-2"] });
  });

  it("remonte l'erreur RPC en ok=false", async () => {
    const { client } = mockSupabase({
      data: null,
      error: { message: "boom", code: "42883" },
    });
    const res = await searchProspectIds(client, "ent-1", "dupon");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe("boom");
  });
});
