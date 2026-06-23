import { describe, it, expect, vi } from "vitest";
import { getSessionDocumentsForLearner } from "../learner-session-documents";

type AnyClient = Parameters<typeof getSessionDocumentsForLearner>[0];

/**
 * Mock Supabase : `trainer_documents` renvoie une liste awaitable. Enregistre les
 * filtres `.eq()`/`.in()` pour vérifier le câblage.
 */
function makeClient(rows: unknown[]) {
  const calls: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn((c: string, v: unknown) => { calls[`eq:${c}`] = v; return builder; }),
    in: vi.fn((c: string, v: unknown) => { calls[`in:${c}`] = v; return builder; }),
    order: vi.fn(() => builder),
    then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  };
  const client = { from: vi.fn(() => builder), __calls: calls };
  return client as unknown as AnyClient & { __calls: typeof calls };
}

describe("getSessionDocumentsForLearner", () => {
  it("retourne [] si aucune session", async () => {
    const client = makeClient([]);
    expect(await getSessionDocumentsForLearner(client, [])).toEqual([]);
    // n'interroge pas la base sans session
    expect(client.from).not.toHaveBeenCalled();
  });

  it("filtre scope='session' + visible_to_learners et `.in` sur les sessions", async () => {
    const rows = [
      { id: "d1", session_id: "s1", doc_type: "compte_rendu", file_name: "cr.pdf", file_type: "application/pdf", notes: null },
    ];
    const client = makeClient(rows);
    const res = await getSessionDocumentsForLearner(client, ["s1", "s2"]);
    expect(res).toEqual(rows);
    expect(client.__calls["eq:scope"]).toBe("session");
    expect(client.__calls["eq:visible_to_learners"]).toBe(true);
    expect(client.__calls["in:session_id"]).toEqual(["s1", "s2"]);
  });

  it("retourne [] (jamais null) si la base ne renvoie rien", async () => {
    const client = makeClient([]);
    expect(await getSessionDocumentsForLearner(client, ["s1"])).toEqual([]);
  });
});
