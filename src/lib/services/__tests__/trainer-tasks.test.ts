import { describe, it, expect } from "vitest";
import { computeTrainerTasksStatus } from "../trainer-tasks";

describe("computeTrainerTasksStatus", () => {
  it("déroulé = fait si un créneau a du contenu module", () => {
    const r = computeTrainerTasksStatus({
      slots: [{ module_title: null, module_objectives: null, module_themes: "Sécurité", module_exercises: null }],
      supportCount: 0,
      bilanRequested: false,
      bilanAnswered: false,
    });
    expect(r.deroule).toBe(true);
    expect(r.support).toBe(false);
    expect(r.bilan).toBeNull(); // aucun bilan demandé → null (pas "à faire")
  });

  it("déroulé = à faire si aucun contenu module", () => {
    const r = computeTrainerTasksStatus({
      slots: [{ module_title: "", module_objectives: null, module_themes: "  ", module_exercises: null }],
      supportCount: 2,
      bilanRequested: true,
      bilanAnswered: false,
    });
    expect(r.deroule).toBe(false);
    expect(r.support).toBe(true);
    expect(r.bilan).toBe(false); // bilan demandé mais non répondu
  });

  it("bilan = true si demandé et répondu", () => {
    const r = computeTrainerTasksStatus({ slots: [], supportCount: 0, bilanRequested: true, bilanAnswered: true });
    expect(r.bilan).toBe(true);
  });

  it("déroulé = false si slots vide", () => {
    const r = computeTrainerTasksStatus({ slots: [], supportCount: 0, bilanRequested: false, bilanAnswered: false });
    expect(r.deroule).toBe(false);
  });

  it("support = false si supportCount = 0", () => {
    const r = computeTrainerTasksStatus({ slots: [], supportCount: 0, bilanRequested: false, bilanAnswered: false });
    expect(r.support).toBe(false);
  });

  it("déroulé = fait si module_title seul est renseigné", () => {
    const r = computeTrainerTasksStatus({
      slots: [{ module_title: "Introduction", module_objectives: null, module_themes: null, module_exercises: null }],
      supportCount: 0,
      bilanRequested: false,
      bilanAnswered: false,
    });
    expect(r.deroule).toBe(true);
  });
});
