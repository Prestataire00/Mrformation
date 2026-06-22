import { describe, it, expect, vi } from "vitest";
import {
  resolveTrainerCourseIds,
  getOwnedCourse,
  getSharedSupportsForLearner,
} from "../trainer-course-sharing";

type AnyClient = Parameters<typeof resolveTrainerCourseIds>[0];

/**
 * Mock Supabase multi-tables. Chaque table renvoie un résultat awaitable
 * (`then`) ou via `maybeSingle`. Enregistre les filtres `.eq()`/`.in()`.
 */
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

describe("resolveTrainerCourseIds", () => {
  it("retourne les ids des supports de toutes les fiches du formateur", async () => {
    const client = makeClient({
      trainers: { rows: [{ id: "t1" }, { id: "t2" }] },
      trainer_courses: { rows: [{ id: "c1" }, { id: "c2" }] },
    });
    expect(await resolveTrainerCourseIds(client, "profile-1")).toEqual(["c1", "c2"]);
    expect(client.__calls.trainer_courses.trainer_id).toEqual(["t1", "t2"]);
  });

  it("retourne [] si aucune fiche formateur", async () => {
    const client = makeClient({ trainers: { rows: [] } });
    expect(await resolveTrainerCourseIds(client, "x")).toEqual([]);
  });
});

describe("getOwnedCourse", () => {
  it("retourne le cours si une fiche du formateur le possède", async () => {
    const client = makeClient({
      trainer_courses: { single: { id: "c1", status: "published", trainer_id: "t2", entity_id: "e1" } },
      trainers: { rows: [{ id: "t1" }, { id: "t2" }] },
    });
    const course = await getOwnedCourse(client, "profile-1", "c1");
    expect(course).toEqual({ id: "c1", status: "published", trainer_id: "t2", entity_id: "e1" });
  });

  it("retourne null si le cours n'appartient à aucune fiche du formateur", async () => {
    const client = makeClient({
      trainer_courses: { single: { id: "c1", status: "draft", trainer_id: "autre", entity_id: "e1" } },
      trainers: { rows: [{ id: "t1" }] },
    });
    expect(await getOwnedCourse(client, "profile-1", "c1")).toBeNull();
  });

  it("retourne null si le cours est introuvable", async () => {
    const client = makeClient({ trainer_courses: { single: null }, trainers: { rows: [{ id: "t1" }] } });
    expect(await getOwnedCourse(client, "profile-1", "absent")).toBeNull();
  });
});

describe("getSharedSupportsForLearner", () => {
  it("ne renvoie que les supports PUBLIÉS des sessions fournies", async () => {
    const client = makeClient({
      trainer_course_sessions: {
        rows: [
          { id: "l1", session_id: "s1", course: { id: "c1", title: "Pub", description: null, files: [{ name: "a.pdf", type: "application/pdf", size: 1, path: "p/a.pdf" }], status: "published" } },
          { id: "l2", session_id: "s1", course: { id: "c2", title: "Brouillon", description: null, files: [], status: "draft" } },
        ],
      },
    });
    const res = await getSharedSupportsForLearner(client, ["s1"]);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ link_id: "l1", session_id: "s1", course: { id: "c1", title: "Pub" } });
  });

  it("retourne [] si aucune session", async () => {
    const client = makeClient({});
    expect(await getSharedSupportsForLearner(client, [])).toEqual([]);
  });
});
