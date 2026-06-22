import { describe, it, expect, vi } from "vitest";
import { resolveTrainerIds, getOwnedQuestionnaire } from "../trainer-questionnaire";

type AnyClient = Parameters<typeof resolveTrainerIds>[0];

function makeClient(tables: Record<string, { rows?: unknown[]; single?: unknown }>) {
  const calls: Record<string, Record<string, unknown>> = {};
  function chain(table: string) {
    calls[table] = calls[table] || {};
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn((c: string, v: unknown) => { calls[table][c] = v; return builder; }),
      in: vi.fn((c: string, v: unknown) => { calls[table][c] = v; return builder; }),
      maybeSingle: vi.fn(async () => ({ data: tables[table]?.single ?? null, error: null })),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: tables[table]?.rows ?? [], error: null }),
    };
    return builder;
  }
  const client = { from: vi.fn((t: string) => chain(t)), __calls: calls };
  return client as unknown as AnyClient & { __calls: typeof calls };
}

describe("resolveTrainerIds", () => {
  it("retourne toutes les fiches du formateur", async () => {
    const client = makeClient({ trainers: { rows: [{ id: "t1" }, { id: "t2" }] } });
    expect(await resolveTrainerIds(client, "p1")).toEqual(["t1", "t2"]);
    expect(client.__calls.trainers.profile_id).toBe("p1");
  });

  it("retourne [] si aucune fiche", async () => {
    const client = makeClient({ trainers: { rows: [] } });
    expect(await resolveTrainerIds(client, "p1")).toEqual([]);
  });
});

describe("getOwnedQuestionnaire", () => {
  it("retourne le questionnaire si une fiche du formateur en est l'auteur", async () => {
    const client = makeClient({
      questionnaires: { single: { id: "q1", created_by_trainer_id: "t2", entity_id: "e1" } },
      trainers: { rows: [{ id: "t1" }, { id: "t2" }] },
    });
    expect(await getOwnedQuestionnaire(client, "p1", "q1")).toEqual({
      id: "q1", created_by_trainer_id: "t2", entity_id: "e1",
    });
  });

  it("retourne null si le questionnaire est d'un admin (created_by_trainer_id null)", async () => {
    const client = makeClient({
      questionnaires: { single: { id: "q1", created_by_trainer_id: null, entity_id: "e1" } },
      trainers: { rows: [{ id: "t1" }] },
    });
    expect(await getOwnedQuestionnaire(client, "p1", "q1")).toBeNull();
  });

  it("retourne null si un autre formateur en est l'auteur", async () => {
    const client = makeClient({
      questionnaires: { single: { id: "q1", created_by_trainer_id: "autre", entity_id: "e1" } },
      trainers: { rows: [{ id: "t1" }] },
    });
    expect(await getOwnedQuestionnaire(client, "p1", "q1")).toBeNull();
  });

  it("retourne null si introuvable", async () => {
    const client = makeClient({ questionnaires: { single: null }, trainers: { rows: [{ id: "t1" }] } });
    expect(await getOwnedQuestionnaire(client, "p1", "absent")).toBeNull();
  });
});
