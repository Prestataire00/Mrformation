import { describe, it, expect } from "vitest";
import {
  computeKpis, computeActivitySeries, computeByCommercial,
  type ActionLite, type ProspectLite, type Period,
} from "../commercial-dashboard";

const period: Period = {
  start: new Date("2026-06-01T00:00:00Z"), end: new Date("2026-06-30T23:59:59Z"),
  prevStart: new Date("2026-05-02T00:00:00Z"), prevEnd: new Date("2026-05-31T23:59:59Z"),
};

describe("computeKpis", () => {
  it("compte les actions de la période et calcule la tendance vs période précédente", () => {
    const actions: ActionLite[] = [
      { author_id: "a", action_type: "call", created_at: "2026-06-10T09:00:00Z" },
      { author_id: "a", action_type: "email", created_at: "2026-06-12T09:00:00Z" },
      { author_id: "b", action_type: "call", created_at: "2026-05-15T09:00:00Z" },
    ];
    const k = computeKpis(actions, [], period);
    expect(k.actions).toBe(2);
    expect(k.actionsTrend).toBe(100);
  });

  it("somme le CA gagné (won) sur la période et le pipeline ouvert (toutes dates)", () => {
    const prospects: ProspectLite[] = [
      { assigned_to: "a", status: "won", amount: 1000, updated_at: "2026-06-20T09:00:00Z" },
      { assigned_to: "a", status: "won", amount: 500, updated_at: "2026-04-01T09:00:00Z" },
      { assigned_to: "b", status: "qualified", amount: 800, updated_at: "2026-06-01T09:00:00Z" },
      { assigned_to: "b", status: "lost", amount: 999, updated_at: "2026-06-01T09:00:00Z" },
    ];
    const k = computeKpis([], prospects, period);
    expect(k.caGagne).toBe(1000);
    expect(k.pipeline).toBe(800);
  });

  it("tendance nulle quand la période précédente est vide (pas de division par zéro)", () => {
    const actions: ActionLite[] = [{ author_id: "a", action_type: "call", created_at: "2026-06-10T09:00:00Z" }];
    const k = computeKpis(actions, [], period);
    expect(k.actionsTrend).toBeNull();
  });
});

describe("computeActivitySeries", () => {
  it("groupe par semaine et par type, semaines vides à 0", () => {
    const now = new Date("2026-06-30T12:00:00Z");
    const actions: ActionLite[] = [
      { author_id: "a", action_type: "call", created_at: "2026-06-29T09:00:00Z" },
      { author_id: "a", action_type: "email", created_at: "2026-06-29T10:00:00Z" },
      { author_id: "a", action_type: "relance", created_at: "2026-06-23T09:00:00Z" },
    ];
    const series = computeActivitySeries(actions, 4, now);
    expect(series).toHaveLength(4);
    const last = series[series.length - 1];
    expect(last.call).toBe(1);
    expect(last.email).toBe(1);
    expect(series[series.length - 2].relance).toBe(1);
    expect(series[0].call).toBe(0);
  });
});

describe("computeByCommercial", () => {
  it("fusionne actions (author_id) et pipeline/CA (assigned_to), trie par actions desc", () => {
    const actions: ActionLite[] = [
      { author_id: "a", action_type: "call", created_at: "2026-06-10T09:00:00Z" },
      { author_id: "a", action_type: "email", created_at: "2026-06-11T09:00:00Z" },
      { author_id: "b", action_type: "call", created_at: "2026-06-10T09:00:00Z" },
    ];
    const prospects: ProspectLite[] = [
      { assigned_to: "a", status: "qualified", amount: 1000, updated_at: "2026-06-10T09:00:00Z" },
      { assigned_to: "b", status: "won", amount: 2000, updated_at: "2026-06-10T09:00:00Z" },
    ];
    const names = new Map([["a", "Marie"], ["b", "Paul"]]);
    const rows = computeByCommercial(actions, prospects, names, period);
    expect(rows[0]).toEqual({ profileId: "a", name: "Marie", actions: 2, pipeline: 1000, caGagne: 0 });
    expect(rows[1]).toEqual({ profileId: "b", name: "Paul", actions: 1, pipeline: 0, caGagne: 2000 });
  });

  it("nom de repli quand le profil est inconnu", () => {
    const actions: ActionLite[] = [{ author_id: "z", action_type: "call", created_at: "2026-06-10T09:00:00Z" }];
    const rows = computeByCommercial(actions, [], new Map(), period);
    expect(rows[0].name).toBe("—");
  });
});
