import { describe, it, expect, vi } from "vitest";
import { loadQualiopiIndicators } from "@/lib/services/load-session-aggregates";

/**
 * Mock minimaliste de SupabaseClient. On capture les .from(table) et les
 * .eq(col, val) pour vérifier la défense en profondeur :
 *  1. La fonction lit d'abord sessions.entity_id avant d'aller plus loin.
 *  2. Si session introuvable, return neutre sans toucher aux sub-tables.
 *  3. Les sub-tables sont filtrées par session_id (FK qui porte le rattachement
 *     multi-tenant — ces tables n'ont pas de colonne entity_id propre).
 */

function makeSupabaseMock(opts: { sessionEntityId: string | null }) {
  const fromCalls: string[] = [];
  const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];

  function createQuery(table: string) {
    const query: Record<string, unknown> = {};
    const chainable = () => query;
    query.select = vi.fn(chainable);
    query.eq = vi.fn((column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      return query;
    });
    query.in = vi.fn(chainable);
    query.single = vi.fn(async () => ({
      data: table === "sessions"
        ? (opts.sessionEntityId ? { entity_id: opts.sessionEntityId } : null)
        : null,
      error: null,
    }));
    query.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
    return query;
  }

  return {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      return createQuery(table);
    }),
    fromCalls,
    eqCalls,
  };
}

describe("loadQualiopiIndicators — défense en profondeur entity_id", () => {
  it("lit d'abord sessions.entity_id avec .eq('id', sessionId)", async () => {
    const mock = makeSupabaseMock({ sessionEntityId: "ENTITY-A" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await loadQualiopiIndicators(mock as any, "SESS-1");
    // sessions est la première table touchée
    expect(mock.fromCalls[0]).toBe("sessions");
    // La query sessions filtre par id
    const sessionsCalls = mock.eqCalls.filter(c => c.table === "sessions");
    expect(sessionsCalls.some(c => c.column === "id" && c.value === "SESS-1")).toBe(true);
  });

  it("retourne des valeurs neutres si la session est introuvable", async () => {
    const mock = makeSupabaseMock({ sessionEntityId: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await loadQualiopiIndicators(mock as any, "SESS-UNKNOWN");
    expect(res.totalLearners).toBe(0);
    expect(res.completionRate).toBe(0);
    expect(res.satisfactionRate).toBeNull();
    expect(res.acquisitionRate).toBeNull();
    // Ne doit PAS avoir touché aux sub-tables sensibles
    expect(mock.fromCalls).not.toContain("enrollments");
    expect(mock.fromCalls).not.toContain("signatures");
  });

  it("downstream queries filtrent par session_id (transit entity_id via FK)", async () => {
    const mock = makeSupabaseMock({ sessionEntityId: "ENTITY-A" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await loadQualiopiIndicators(mock as any, "SESS-1");
    // Vérifie que chaque sub-table touchée filtre bien par session_id
    const subTables = ["enrollments", "signatures", "questionnaire_sessions"];
    for (const table of subTables) {
      const tableCalls = mock.eqCalls.filter(c => c.table === table);
      expect(
        tableCalls.some(c => c.column === "session_id" && c.value === "SESS-1"),
      ).toBe(true);
    }
  });
});
