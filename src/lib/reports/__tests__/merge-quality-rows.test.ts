import { describe, it, expect } from "vitest";
import { mergeQualityRows, type QualiteRowLite } from "../merge-quality-rows";

const base = (over: Partial<QualiteRowLite>): QualiteRowLite => ({
  id: "x", formation: "F", annee: 2026,
  eval_preformation: null, eval_pendant: null, eval_postformation: null,
  satisfaction_chaud: null, satisfaction_froid: null,
  ...over,
});

describe("mergeQualityRows", () => {
  it("le live (par session) est la base ; un indicateur nul est rempli depuis le précalculé (même formation+année)", () => {
    const live = [base({ id: "s1", formation: "Circuit", annee: 2026, eval_pendant: 80, satisfaction_chaud: null })];
    const pre = [base({ id: "q1", formation: "circuit", annee: 2026, satisfaction_chaud: 90 })];
    const r = mergeQualityRows(live, pre);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "s1", eval_pendant: 80, satisfaction_chaud: 90 });
  });
  it("une valeur live non-nulle n'est PAS écrasée par le précalculé", () => {
    const live = [base({ id: "s1", formation: "F", annee: 2026, satisfaction_chaud: 70 })];
    const pre = [base({ id: "q1", formation: "F", annee: 2026, satisfaction_chaud: 99 })];
    expect(mergeQualityRows(live, pre)[0].satisfaction_chaud).toBe(70);
  });
  it("une formation+année présente seulement dans le précalculé (historique) est conservée", () => {
    const live = [base({ id: "s1", formation: "F", annee: 2026 })];
    const pre = [base({ id: "q1", formation: "Vieux", annee: 2025, satisfaction_chaud: 88 })];
    const r = mergeQualityRows(live, pre);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.formation === "Vieux")?.satisfaction_chaud).toBe(88);
  });
  it("live vide → précalculé ; précalculé vide → live", () => {
    const pre = [base({ id: "q1", satisfaction_chaud: 50 })];
    expect(mergeQualityRows([], pre)).toHaveLength(1);
    const live = [base({ id: "s1", eval_pendant: 60 })];
    expect(mergeQualityRows(live, [])[0].eval_pendant).toBe(60);
  });
});
