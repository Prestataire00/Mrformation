import { describe, it, expect, vi } from "vitest";
import { fetchPaginatedData } from "../pagination";
import type { PaginationFilters } from "../pagination";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tests unitaires du helper pagination serveur partagé (E3-S01).
 *
 * On mock un SupabaseClient chainable minimal. Le but est de vérifier :
 *  - entity_id toujours appliqué (multi-tenant defense-in-depth)
 *  - hasMore correct selon totalCount vs offset+pageSize
 *  - les filtres optionnels (search, statusIn, date range) sont appliqués
 */

type AppliedFilter = { method: string; args: unknown[] };

function makeMockQuery(returnValue: {
  data: unknown[] | null;
  error: { message: string } | null;
  count: number | null;
}) {
  const applied: AppliedFilter[] = [];

  const builder: Record<string, unknown> = {};

  const chainMethod = (name: string) => {
    return (...args: unknown[]) => {
      applied.push({ method: name, args });
      return builder;
    };
  };

  builder.select = chainMethod("select");
  builder.eq = chainMethod("eq");
  builder.ilike = chainMethod("ilike");
  builder.in = chainMethod("in");
  builder.gte = chainMethod("gte");
  builder.lte = chainMethod("lte");
  builder.range = (...args: unknown[]) => {
    applied.push({ method: "range", args });
    return Promise.resolve(returnValue);
  };

  return {
    applied,
    client: {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient,
  };
}

const BASE_FILTERS: PaginationFilters = { entityId: "ent-1" };

describe("fetchPaginatedData", () => {
  it("retourne 0 résultat avec hasMore=false quand la table est vide", async () => {
    const { client, applied } = makeMockQuery({ data: [], error: null, count: 0 });

    const result = await fetchPaginatedData(client, "elearning_courses", {
      filters: BASE_FILTERS,
      pageSize: 50,
      offset: 0,
    });

    expect(result.data).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.hasMore).toBe(false);

    // Vérifie entity_id toujours appliqué
    const eqCalls = applied.filter((f) => f.method === "eq");
    expect(eqCalls).toEqual([{ method: "eq", args: ["entity_id", "ent-1"] }]);
  });

  it("retourne 1 page complète avec hasMore=false quand totalCount <= pageSize", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `c-${i}`, title: `Cours ${i}` }));
    const { client } = makeMockQuery({ data: rows, error: null, count: 10 });

    const result = await fetchPaginatedData<{ id: string; title: string }>(
      client,
      "elearning_courses",
      { filters: BASE_FILTERS, pageSize: 50, offset: 0 }
    );

    expect(result.data).toHaveLength(10);
    expect(result.totalCount).toBe(10);
    expect(result.hasMore).toBe(false);
  });

  it("retourne hasMore=true quand totalCount > offset+pageSize (multipage)", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `c-${i}` }));
    const { client } = makeMockQuery({ data: rows, error: null, count: 85 });

    const result = await fetchPaginatedData(client, "programs", {
      filters: BASE_FILTERS,
      pageSize: 20,
      offset: 0,
    });

    expect(result.data).toHaveLength(20);
    expect(result.totalCount).toBe(85);
    expect(result.hasMore).toBe(true);

    // Page 2
    const { client: client2 } = makeMockQuery({ data: rows, error: null, count: 85 });
    const page2 = await fetchPaginatedData(client2, "programs", {
      filters: BASE_FILTERS,
      pageSize: 20,
      offset: 20,
    });
    expect(page2.hasMore).toBe(true);

    // Dernière page (offset 80, 5 restants)
    const lastRows = Array.from({ length: 5 }, (_, i) => ({ id: `c-${80 + i}` }));
    const { client: client3 } = makeMockQuery({ data: lastRows, error: null, count: 85 });
    const lastPage = await fetchPaginatedData(client3, "programs", {
      filters: BASE_FILTERS,
      pageSize: 20,
      offset: 80,
    });
    expect(lastPage.hasMore).toBe(false);
    expect(lastPage.data).toHaveLength(5);
  });

  it("applique les filtres search, statusIn et date range", async () => {
    const { client, applied } = makeMockQuery({ data: [], error: null, count: 0 });

    await fetchPaginatedData(client, "elearning_courses", {
      filters: {
        entityId: "ent-2",
        search: "agile",
        searchColumn: "title",
        statusIn: ["published", "draft"],
        statusColumn: "status",
        dateFrom: "2025-01-01",
        dateTo: "2025-12-31",
        dateColumn: "created_at",
      },
      pageSize: 50,
      offset: 0,
    });

    expect(applied.find((f) => f.method === "ilike")).toEqual({
      method: "ilike",
      args: ["title", "%agile%"],
    });
    expect(applied.find((f) => f.method === "in")).toEqual({
      method: "in",
      args: ["status", ["published", "draft"]],
    });
    expect(applied.find((f) => f.method === "gte")).toEqual({
      method: "gte",
      args: ["created_at", "2025-01-01"],
    });
    expect(applied.find((f) => f.method === "lte")).toEqual({
      method: "lte",
      args: ["created_at", "2025-12-31"],
    });
  });

  it("utilise count 'estimated' quand countExact=false", async () => {
    const { client, applied } = makeMockQuery({ data: [], error: null, count: 15000 });

    await fetchPaginatedData(client, "elearning_courses", {
      filters: BASE_FILTERS,
      pageSize: 50,
      offset: 0,
      countExact: false,
    });

    const selectCall = applied.find((f) => f.method === "select");
    expect(selectCall?.args[1]).toEqual({ count: "estimated" });
  });

  it("throw une erreur quand Supabase retourne une erreur", async () => {
    const { client } = makeMockQuery({
      data: null,
      error: { message: "RLS denied" },
      count: null,
    });

    await expect(
      fetchPaginatedData(client, "elearning_courses", {
        filters: BASE_FILTERS,
        pageSize: 50,
        offset: 0,
      })
    ).rejects.toThrow("RLS denied");
  });
});
