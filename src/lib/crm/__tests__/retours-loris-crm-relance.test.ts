import { describe, it, expect, vi } from "vitest";
import { relanceInactiveProspects } from "@/lib/crm/automations";

/**
 * Fix retour Loris (#12) — « les rappels mensuels ne servent à rien quand un
 * rappel est déjà prévu à +1 mois ». On vérifie ici que `relanceInactiveProspects`
 * NE crée PAS de tâche de relance lorsqu'une action est déjà planifiée à venir
 * (tâche ouverte dont l'échéance ≥ aujourd'hui), et qu'il en crée une sinon.
 *
 * Mock Supabase routé par table : chaque `from(table)` renvoie un builder
 * chaînable et thenable ; un SELECT résout la donnée de la table, un INSERT est
 * enregistré.
 */
function makeMock(opts: {
  prospects: unknown[];
  admins: unknown[];
  recentActions: unknown[];
  plannedTasks: unknown[];
}) {
  const inserts: { table: string; payload: unknown }[] = [];
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = vi.fn((table: string) => {
    let isInsert = false;
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "in", "gte", "lte", "limit", "order", "single", "maybeSingle"]) {
      b[m] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method: m, args });
        return b;
      });
    }
    b.insert = vi.fn((payload: unknown) => {
      isInsert = true;
      inserts.push({ table, payload });
      return b;
    });
    b.then = (resolve: (v: unknown) => unknown) => {
      if (isInsert) return resolve({ data: null, error: null });
      const data =
        table === "crm_prospects" ? opts.prospects
        : table === "profiles" ? opts.admins
        : table === "crm_commercial_actions" ? opts.recentActions
        : table === "crm_tasks" ? opts.plannedTasks
        : [];
      return resolve({ data, error: null });
    };
    return b;
  });
  return { supabase: { from } as never, inserts, calls };
}

describe("relanceInactiveProspects — garde « action déjà planifiée » (retour Loris #12)", () => {
  const prospect = { id: "P1", company_name: "ACME", assigned_to: "U1" };

  it("NE crée PAS de relance quand une tâche future est déjà planifiée", async () => {
    const m = makeMock({
      prospects: [prospect],
      admins: [{ id: "A1" }],
      recentActions: [], // aucune action commerciale récente → prospect inactif
      plannedTasks: [{ id: "T-future" }], // mais un rappel est déjà prévu à venir
    });

    const created = await relanceInactiveProspects(m.supabase, "ENT-A");

    expect(created).toBe(0);
    expect(m.inserts.filter((i) => i.table === "crm_tasks")).toHaveLength(0);
  });

  it("crée une relance quand aucune action n'est planifiée", async () => {
    const m = makeMock({
      prospects: [prospect],
      admins: [{ id: "A1" }],
      recentActions: [],
      plannedTasks: [], // aucun rappel/tâche future
    });

    const created = await relanceInactiveProspects(m.supabase, "ENT-A");

    expect(created).toBe(1);
    const taskInserts = m.inserts.filter((i) => i.table === "crm_tasks");
    expect(taskInserts).toHaveLength(1);
    expect(taskInserts[0].payload).toMatchObject({
      entity_id: "ENT-A",
      prospect_id: "P1",
      title: "Relancer ACME",
      status: "pending",
    });
  });

  it("le garde considère TOUTE tâche ouverte (pas de filtre de date) — une relance en retard bloque aussi (audit 24/07)", async () => {
    const m = makeMock({
      prospects: [prospect],
      admins: [{ id: "A1" }],
      recentActions: [],
      // Une relance encore ouverte mais dont l'échéance est passée : elle doit
      // bloquer la recréation (sinon doublon tous les ~4 jours).
      plannedTasks: [{ id: "T-overdue" }],
    });

    const created = await relanceInactiveProspects(m.supabase, "ENT-A");

    expect(created).toBe(0);
    expect(m.inserts.filter((i) => i.table === "crm_tasks")).toHaveLength(0);
    // Régression audit 24/07 : le garde ne doit PAS filtrer par due_date
    // (un .gte("due_date") ferait sortir les tâches en retard du garde).
    const gteOnTasks = m.calls.filter((c) => c.table === "crm_tasks" && c.method === "gte");
    expect(gteOnTasks).toHaveLength(0);
  });

  it("NE crée PAS de relance quand une action commerciale récente existe (comportement inchangé)", async () => {
    const m = makeMock({
      prospects: [prospect],
      admins: [{ id: "A1" }],
      recentActions: [{ id: "act-1" }], // action < 30 jours
      plannedTasks: [],
    });

    const created = await relanceInactiveProspects(m.supabase, "ENT-A");

    expect(created).toBe(0);
    expect(m.inserts.filter((i) => i.table === "crm_tasks")).toHaveLength(0);
  });
});
