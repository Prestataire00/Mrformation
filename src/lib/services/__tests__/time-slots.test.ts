import { describe, it, expect, vi } from "vitest";
import {
  fetchTimeSlots,
  createTimeSlot,
  bulkCreateTimeSlots,
  updateTimeSlot,
  deleteTimeSlot,
  deleteAllTimeSlotsForSession,
} from "../time-slots";

/**
 * PLAN-4 audit BMAD : tests unitaires du service time-slots.
 *
 * Vérifient surtout que :
 *  - assertSessionInEntity est appelé (SELECT sessions WHERE id=... AND
 *    entity_id=...) AVANT toute mutation sur formation_time_slots
 *  - les opérations utilisent les bons filtres (id, session_id)
 *  - PostgrestError est relayé dans ServiceResult.ok=false
 *  - colonnes explicites (pas de select("*"))
 */

type FromCall = { table: string; calls: string[] };

function mockSupabase(returns: { sessionExists: boolean; data?: unknown; error?: unknown }) {
  const fromCalls: FromCall[] = [];

  const client = {
    from: vi.fn((table: string) => {
      const call: FromCall = { table, calls: [] };
      fromCalls.push(call);
      // Stocke le résultat de l'opération en attente — résolu via then()
      // sur l'objet builder lui-même (les chaînes Supabase sont thenable).
      const result = (): { data: unknown; error: unknown } => {
        if (table === "sessions") {
          return {
            data: returns.sessionExists ? { id: "sess-1" } : null,
            error: null,
          };
        }
        return { data: returns.data ?? null, error: returns.error ?? null };
      };

      const builder = {
        select(cols: string) {
          call.calls.push(`select:${cols}`);
          return builder;
        },
        insert(row: unknown) {
          call.calls.push(`insert:${JSON.stringify(row)}`);
          return builder;
        },
        update(row: unknown) {
          call.calls.push(`update:${JSON.stringify(row)}`);
          return builder;
        },
        delete() {
          call.calls.push("delete");
          return builder;
        },
        eq(col: string, val: unknown) {
          call.calls.push(`eq:${col}=${val}`);
          return builder;
        },
        order(col: string, opts: { ascending: boolean }) {
          call.calls.push(`order:${col}:${opts.ascending ? "asc" : "desc"}`);
          return builder;
        },
        maybeSingle() {
          call.calls.push("maybeSingle");
          return Promise.resolve(result());
        },
        single() {
          call.calls.push("single");
          return Promise.resolve(result());
        },
        then(resolve: (v: { data: unknown; error: unknown }) => void) {
          // Pour les chaînes terminées sans .single()/.maybeSingle() :
          // delete().eq() puis await, update().eq() puis await, order().order() puis await.
          resolve(result());
        },
      };
      return builder;
    }),
  } as unknown as Parameters<typeof fetchTimeSlots>[0];

  return { fromCalls, client };
}

// ── assertSessionInEntity (via fetchTimeSlots) ──────────────────────

describe("assertSessionInEntity (defense in depth)", () => {
  it("renvoie 404 si la session n'existe pas dans l'entité", async () => {
    const { client } = mockSupabase({ sessionExists: false });
    const result = await fetchTimeSlots(client, "sess-1", "ent-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("passe par sessions AVANT de toucher formation_time_slots", async () => {
    const { fromCalls, client } = mockSupabase({ sessionExists: true, data: [] });
    await fetchTimeSlots(client, "sess-1", "ent-1");
    expect(fromCalls[0].table).toBe("sessions");
    expect(fromCalls[0].calls.some((c) => c.includes("entity_id=ent-1"))).toBe(true);
    expect(fromCalls[1]?.table).toBe("formation_time_slots");
  });
});

// ── fetchTimeSlots ───────────────────────────────────────────────────

describe("fetchTimeSlots", () => {
  it("trie par slot_order puis start_time, colonnes explicites", async () => {
    const { fromCalls, client } = mockSupabase({ sessionExists: true, data: [] });
    await fetchTimeSlots(client, "sess-1", "ent-1");
    const slotsCall = fromCalls.find((c) => c.table === "formation_time_slots")!;
    expect(slotsCall.calls).toContain("order:slot_order:asc");
    expect(slotsCall.calls.some((c) => c.startsWith("select:id, session_id"))).toBe(true);
    expect(slotsCall.calls.some((c) => c === "select:*")).toBe(false);
  });
});

// ── createTimeSlot ───────────────────────────────────────────────────

describe("createTimeSlot", () => {
  it("attache session_id au payload insert", async () => {
    const { fromCalls, client } = mockSupabase({
      sessionExists: true,
      data: { id: "slot-1", session_id: "sess-1" },
    });
    await createTimeSlot(client, "sess-1", "ent-1", {
      start_time: "2026-01-15T09:00:00Z",
      end_time: "2026-01-15T12:00:00Z",
    });
    const slotsCall = fromCalls.find((c) => c.table === "formation_time_slots")!;
    const insertCall = slotsCall.calls.find((c) => c.startsWith("insert:"));
    expect(insertCall).toContain("sess-1");
  });

  it("renvoie ok=false si insert échoue", async () => {
    const { client } = mockSupabase({
      sessionExists: true,
      data: null,
      error: { message: "RLS denied", code: "42501" },
    });
    const result = await createTimeSlot(client, "sess-1", "ent-1", {
      start_time: "2026-01-15T09:00:00Z",
      end_time: "2026-01-15T12:00:00Z",
    });
    expect(result.ok).toBe(false);
  });
});

// ── bulkCreateTimeSlots ──────────────────────────────────────────────

describe("bulkCreateTimeSlots", () => {
  it("retourne ok=true count=0 sans appel si inputs vide (skip entity check)", async () => {
    const { fromCalls, client } = mockSupabase({ sessionExists: false });
    const result = await bulkCreateTimeSlots(client, "sess-1", "ent-1", []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.count).toBe(0);
    expect(fromCalls).toHaveLength(0);
  });

  it("attache session_id à chaque row", async () => {
    const { fromCalls, client } = mockSupabase({ sessionExists: true });
    await bulkCreateTimeSlots(client, "sess-1", "ent-1", [
      { start_time: "a", end_time: "b" },
      { start_time: "c", end_time: "d" },
    ]);
    const slotsCall = fromCalls.find((c) => c.table === "formation_time_slots")!;
    const insertCall = slotsCall.calls.find((c) => c.startsWith("insert:"))!;
    // 2 occurrences de sess-1 (1 par row) — service ajoute session_id à chaque row
    const occurrences = insertCall.split("sess-1").length - 1;
    expect(occurrences).toBe(2);
  });
});

// ── updateTimeSlot ──────────────────────────────────────────────────

describe("updateTimeSlot", () => {
  it("filtre par id ET session_id", async () => {
    const { fromCalls, client } = mockSupabase({
      sessionExists: true,
      data: { id: "slot-1" },
    });
    await updateTimeSlot(client, "slot-1", "sess-1", "ent-1", { title: "Nouveau" });
    const slotsCall = fromCalls.find((c) => c.table === "formation_time_slots")!;
    expect(slotsCall.calls).toContain("eq:id=slot-1");
    expect(slotsCall.calls).toContain("eq:session_id=sess-1");
  });
});

// ── deleteTimeSlot ──────────────────────────────────────────────────

describe("deleteTimeSlot", () => {
  it("filtre par id ET session_id, defense in depth via assertSession", async () => {
    const { fromCalls, client } = mockSupabase({ sessionExists: true });
    const result = await deleteTimeSlot(client, "slot-1", "sess-1", "ent-1");
    expect(result.ok).toBe(true);
    expect(fromCalls[0].table).toBe("sessions");
    const slotsCall = fromCalls.find((c) => c.table === "formation_time_slots")!;
    expect(slotsCall.calls).toContain("delete");
    expect(slotsCall.calls).toContain("eq:id=slot-1");
    expect(slotsCall.calls).toContain("eq:session_id=sess-1");
  });

  it("bloque si la session n'appartient pas à l'entité", async () => {
    const { fromCalls, client } = mockSupabase({ sessionExists: false });
    const result = await deleteTimeSlot(client, "slot-1", "sess-X", "ent-1");
    expect(result.ok).toBe(false);
    // Aucun call sur formation_time_slots
    expect(fromCalls.every((c) => c.table !== "formation_time_slots")).toBe(true);
  });
});

// ── deleteAllTimeSlotsForSession ────────────────────────────────────

describe("deleteAllTimeSlotsForSession", () => {
  it("filtre par session_id uniquement (bulk)", async () => {
    const { fromCalls, client } = mockSupabase({ sessionExists: true });
    const result = await deleteAllTimeSlotsForSession(client, "sess-1", "ent-1");
    expect(result.ok).toBe(true);
    const slotsCall = fromCalls.find((c) => c.table === "formation_time_slots")!;
    expect(slotsCall.calls).toContain("delete");
    expect(slotsCall.calls).toContain("eq:session_id=sess-1");
  });
});
