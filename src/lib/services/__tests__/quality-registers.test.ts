import { describe, it, expect, vi } from "vitest";
import {
  listImprovements,
  createImprovement,
  updateImprovement,
  removeImprovement,
  listIncidents,
  createIncident,
  updateIncident,
  removeIncident,
} from "@/lib/services/quality-registers";

/**
 * Mock chaînable d'un query builder Supabase : chaque méthode enregistre son
 * appel et renvoie `this`. L'objet est thenable → `await` résout `result`.
 */
function makeQueryMock(result: unknown = { data: null, error: null }) {
  const calls: { method: string; args: unknown[] }[] = [];
  let payload: unknown;
  const builder: Record<string, unknown> = {};
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      if (method === "insert" || method === "update") payload = args[0];
      return builder;
    });
  for (const m of ["select", "eq", "order", "insert", "update", "delete", "single"]) {
    builder[m] = record(m);
  }
  // thenable : permet `await builder`
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  const from = vi.fn(() => builder);
  return {
    supabase: { from } as never,
    from,
    calls,
    eqCalls: () => calls.filter((c) => c.method === "eq"),
    payload: () => payload,
  };
}

describe("quality-registers — quality_improvements", () => {
  it("listImprovements filtre par entity_id sur la bonne table", async () => {
    const m = makeQueryMock({ data: [], error: null });
    await listImprovements(m.supabase, "ENT-A");
    expect(m.from).toHaveBeenCalledWith("quality_improvements");
    expect(m.eqCalls()).toContainEqual({ method: "eq", args: ["entity_id", "ENT-A"] });
  });

  it("createImprovement injecte entity_id et les champs", async () => {
    const m = makeQueryMock({ data: {}, error: null });
    await createImprovement(m.supabase, "ENT-A", {
      date: "2026-06-18",
      description: "Constat",
      action_taken: "Action",
    });
    expect(m.payload()).toMatchObject({
      entity_id: "ENT-A",
      date: "2026-06-18",
      description: "Constat",
      action_taken: "Action",
    });
  });

  it("updateImprovement pose updated_at et filtre entity_id + id", async () => {
    const m = makeQueryMock({ data: {}, error: null });
    await updateImprovement(m.supabase, "ENT-A", "I1", {
      date: "2026-06-18",
      description: "Maj",
    });
    expect(m.payload()).toHaveProperty("updated_at");
    expect(m.eqCalls()).toContainEqual({ method: "eq", args: ["entity_id", "ENT-A"] });
    expect(m.eqCalls()).toContainEqual({ method: "eq", args: ["id", "I1"] });
  });

  it("removeImprovement filtre entity_id + id", async () => {
    const m = makeQueryMock({ data: null, error: null });
    await removeImprovement(m.supabase, "ENT-A", "I1");
    expect(m.eqCalls()).toContainEqual({ method: "eq", args: ["entity_id", "ENT-A"] });
    expect(m.eqCalls()).toContainEqual({ method: "eq", args: ["id", "I1"] });
  });
});

describe("quality-registers — quality_incidents", () => {
  it("listIncidents filtre par entity_id sur la bonne table", async () => {
    const m = makeQueryMock({ data: [], error: null });
    await listIncidents(m.supabase, "ENT-B");
    expect(m.from).toHaveBeenCalledWith("quality_incidents");
    expect(m.eqCalls()).toContainEqual({ method: "eq", args: ["entity_id", "ENT-B"] });
  });

  it("createIncident injecte entity_id et les champs", async () => {
    const m = makeQueryMock({ data: {}, error: null });
    await createIncident(m.supabase, "ENT-B", {
      date: "2026-06-18",
      nom: "Réclamation",
      statut: "Ouvert",
      gravite: "Faible",
    });
    expect(m.payload()).toMatchObject({
      entity_id: "ENT-B",
      nom: "Réclamation",
      statut: "Ouvert",
    });
  });

  it("updateIncident pose updated_at et filtre entity_id + id", async () => {
    const m = makeQueryMock({ data: {}, error: null });
    await updateIncident(m.supabase, "ENT-B", "INC1", { date: "2026-06-18", statut: "Clos" });
    expect(m.payload()).toHaveProperty("updated_at");
    expect(m.eqCalls()).toContainEqual({ method: "eq", args: ["entity_id", "ENT-B"] });
    expect(m.eqCalls()).toContainEqual({ method: "eq", args: ["id", "INC1"] });
  });

  it("removeIncident filtre entity_id + id", async () => {
    const m = makeQueryMock({ data: null, error: null });
    await removeIncident(m.supabase, "ENT-B", "INC1");
    expect(m.eqCalls()).toContainEqual({ method: "eq", args: ["entity_id", "ENT-B"] });
    expect(m.eqCalls()).toContainEqual({ method: "eq", args: ["id", "INC1"] });
  });
});
