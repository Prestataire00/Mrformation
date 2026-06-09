import { describe, it, expect } from "vitest";
import { partitionSessions } from "../session-grouping";

interface S { id: string; status: string }

function s(id: string, status: string): S {
  return { id, status };
}

describe("partitionSessions", () => {
  it("classe upcoming et in_progress dans le groupe actif", () => {
    const sessions = [s("a", "upcoming"), s("b", "in_progress")];
    const { active, completed, cancelled } = partitionSessions(sessions);
    expect(active.map((x) => x.id)).toEqual(["a", "b"]);
    expect(completed).toEqual([]);
    expect(cancelled).toEqual([]);
  });

  it("classe completed dans le groupe terminé", () => {
    const { active, completed, cancelled } = partitionSessions([s("a", "completed")]);
    expect(completed.map((x) => x.id)).toEqual(["a"]);
    expect(active).toEqual([]);
    expect(cancelled).toEqual([]);
  });

  it("classe cancelled dans le groupe annulé", () => {
    const { active, completed, cancelled } = partitionSessions([s("a", "cancelled")]);
    expect(cancelled.map((x) => x.id)).toEqual(["a"]);
    expect(active).toEqual([]);
    expect(completed).toEqual([]);
  });

  it("préserve l'ordre d'entrée à l'intérieur de chaque groupe", () => {
    const sessions = [s("a", "completed"), s("b", "upcoming"), s("c", "completed"), s("d", "in_progress")];
    const { active, completed } = partitionSessions(sessions);
    expect(active.map((x) => x.id)).toEqual(["b", "d"]);
    expect(completed.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("range tout statut inconnu dans actif (défaut sûr : reste visible)", () => {
    const { active } = partitionSessions([s("a", "unknown_status")]);
    expect(active.map((x) => x.id)).toEqual(["a"]);
  });
});
