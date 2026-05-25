import { describe, it, expect, vi } from "vitest";
import { updateDocsByDocType, updateDocsForOwner } from "@/lib/services/documents-store";

describe("updateDocsByDocType", () => {
  it("filtre par entity_id + source_table + source_id + doc_type", async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = [];
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(function chain(this: object, col: string, val: unknown) {
            eqCalls.push({ col, val });
            return Object.assign(this, {
              eq: vi.fn(function chain2(this: object, col2: string, val2: unknown) {
                eqCalls.push({ col: col2, val: val2 });
                return Object.assign(this, {
                  eq: vi.fn(function chain3(this: object, col3: string, val3: unknown) {
                    eqCalls.push({ col: col3, val: val3 });
                    return Object.assign(this, {
                      eq: vi.fn((col4: string, val4: unknown) => {
                        eqCalls.push({ col: col4, val: val4 });
                        return {
                          select: vi.fn(() => Promise.resolve({ error: null, data: [1, 2, 3] })),
                        };
                      }),
                    });
                  }),
                });
              }),
            });
          }),
        })),
      })),
    };
    const res = await updateDocsByDocType(
      supabase as never, "ENT-A", "SESS-1", "convocation",
      { is_confirmed: true },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.updated).toBe(3);
    expect(eqCalls).toContainEqual({ col: "entity_id", val: "ENT-A" });
    expect(eqCalls).toContainEqual({ col: "source_table", val: "sessions" });
    expect(eqCalls).toContainEqual({ col: "source_id", val: "SESS-1" });
    expect(eqCalls).toContainEqual({ col: "doc_type", val: "convocation" });
  });

  it("ajoute le filtre status quand onlyStatus est spécifié", async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = [];
    function makeChain(): object {
      return {
        eq: vi.fn(function (col: string, val: unknown) {
          eqCalls.push({ col, val });
          return makeChain();
        }),
        select: vi.fn(() => Promise.resolve({ error: null, data: [1] })),
      };
    }
    const supabase = {
      from: vi.fn(() => ({ update: vi.fn(() => makeChain()) })),
    };
    await updateDocsByDocType(
      supabase as never, "ENT-A", "SESS-1", "convocation",
      { is_confirmed: true },
      { onlyStatus: "draft" },
    );
    expect(eqCalls).toContainEqual({ col: "status", val: "draft" });
  });

  it("retourne { ok: false, error } si Supabase erreur", async () => {
    function makeChain(): object {
      return {
        eq: vi.fn(function () { return makeChain(); }),
        select: vi.fn(() => Promise.resolve({ error: { message: "DB error", code: "42P01" }, data: null })),
      };
    }
    const supabase = {
      from: vi.fn(() => ({ update: vi.fn(() => makeChain()) })),
    };
    const res = await updateDocsByDocType(
      supabase as never, "ENT-A", "SESS-1", "convocation",
      { is_confirmed: true },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toBe("DB error");
      expect(res.error.code).toBe("42P01");
    }
  });

  it("retourne updated: 0 si aucune row trouvée", async () => {
    function makeChain(): object {
      return {
        eq: vi.fn(function () { return makeChain(); }),
        select: vi.fn(() => Promise.resolve({ error: null, data: [] })),
      };
    }
    const supabase = {
      from: vi.fn(() => ({ update: vi.fn(() => makeChain()) })),
    };
    const res = await updateDocsByDocType(
      supabase as never, "ENT-A", "SESS-1", "convocation",
      { is_confirmed: true },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.updated).toBe(0);
  });
});

describe("updateDocsForOwner", () => {
  it("filtre par entity_id + source_table + source_id + owner_type + owner_id", async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = [];
    function makeChain(): object {
      return {
        eq: vi.fn(function (col: string, val: unknown) {
          eqCalls.push({ col, val });
          return makeChain();
        }),
        select: vi.fn(() => Promise.resolve({ error: null, data: [{}, {}] })),
      };
    }
    const supabase = {
      from: vi.fn(() => ({ update: vi.fn(() => makeChain()) })),
    };
    const res = await updateDocsForOwner(
      supabase as never, "ENT-A", "SESS-1", "learner", "L-1",
      { is_confirmed: true },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.updated).toBe(2);
    expect(eqCalls).toContainEqual({ col: "entity_id", val: "ENT-A" });
    expect(eqCalls).toContainEqual({ col: "source_table", val: "sessions" });
    expect(eqCalls).toContainEqual({ col: "source_id", val: "SESS-1" });
    expect(eqCalls).toContainEqual({ col: "owner_type", val: "learner" });
    expect(eqCalls).toContainEqual({ col: "owner_id", val: "L-1" });
  });

  it("retourne erreur sur erreur Supabase", async () => {
    function makeChain(): object {
      return {
        eq: vi.fn(function () { return makeChain(); }),
        select: vi.fn(() => Promise.resolve({ error: { message: "err", code: "X" }, data: null })),
      };
    }
    const supabase = {
      from: vi.fn(() => ({ update: vi.fn(() => makeChain()) })),
    };
    const res = await updateDocsForOwner(
      supabase as never, "ENT-A", "SESS-1", "company", "C-1", { is_sent: true },
    );
    expect(res.ok).toBe(false);
  });

  it("supporte les 6 owner types", async () => {
    function makeChain(): object {
      return {
        eq: vi.fn(function () { return makeChain(); }),
        select: vi.fn(() => Promise.resolve({ error: null, data: [{}] })),
      };
    }
    const supabase = { from: vi.fn(() => ({ update: vi.fn(() => makeChain()) })) };
    for (const ownerType of ["learner", "company", "trainer", "session", "client", "financier"] as const) {
      const res = await updateDocsForOwner(supabase as never, "ENT", "SESS", ownerType, "ID", {});
      expect(res.ok).toBe(true);
    }
  });
});
