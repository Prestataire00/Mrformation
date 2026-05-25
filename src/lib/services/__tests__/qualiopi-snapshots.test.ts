import { describe, it, expect, vi } from "vitest";
import { snapshotEntityQualiopi } from "@/lib/services/qualiopi-snapshots";

/**
 * Mock builder qui rejoue des résultats par table.
 * On configure : sessions actives + dernier snapshot par session_id + comptages eval.
 */
function makeMock(opts: {
  sessions: Array<{ id: string; entity_id: string }>;
  lastSnapshotByCSession: Record<string, number | null>;
  computeScore: (sessionId: string) => number;
  inserted: { session_id: string; global_score: number }[];
}) {
  const supabase = {
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      const chainable = () => builder;
      builder.select = vi.fn(chainable);
      builder.eq = vi.fn(chainable);
      builder.or = vi.fn(chainable);
      builder.order = vi.fn(chainable);
      builder.limit = vi.fn(chainable);

      if (table === "sessions") {
        builder.then = (resolve: (v: unknown) => void) =>
          resolve({ data: opts.sessions, error: null });
      } else if (table === "qualiopi_snapshots") {
        builder.maybeSingle = vi.fn(async () => ({
          data: null,
          error: null,
        }));
        builder.single = vi.fn(async function (this: { _ctx: string }) {
          return { data: null, error: null };
        });
        builder.insert = vi.fn(async (row: { session_id: string; global_score: number }) => {
          opts.inserted.push({ session_id: row.session_id, global_score: row.global_score });
          return { data: null, error: null };
        });
      }
      return builder;
    }),
  };
  return supabase;
}

describe("snapshotEntityQualiopi", () => {
  it("entité sans sessions actives → 0 inserted, 0 skipped", async () => {
    const inserted: { session_id: string; global_score: number }[] = [];
    const supabase = makeMock({
      sessions: [],
      lastSnapshotByCSession: {},
      computeScore: () => 0,
      inserted,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await snapshotEntityQualiopi(supabase as any, "ENT-1");
    expect(res.inserted).toBe(0);
    expect(res.skipped).toBe(0);
  });

  it("retourne un objet de la forme { inserted, skipped, errors }", async () => {
    const supabase = makeMock({
      sessions: [],
      lastSnapshotByCSession: {},
      computeScore: () => 0,
      inserted: [],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await snapshotEntityQualiopi(supabase as any, "ENT-X");
    expect(res).toHaveProperty("inserted");
    expect(res).toHaveProperty("skipped");
    expect(res).toHaveProperty("errors");
  });
});
