import { describe, it, expect } from "vitest";
import { pickDerouleFields, filterPastSlotsWithContent } from "../deroule";

describe("pickDerouleFields", () => {
  it("ne garde que les 4 champs module_* (rejette horaires/couleur)", () => {
    const out = pickDerouleFields({
      module_title: "M1", module_objectives: "Obj", module_themes: "Th", module_exercises: "Ex",
      start_time: "x", end_time: "y", color: "#fff", title: "hack", slot_order: 3, foo: "bar",
    });
    expect(out).toEqual({ module_title: "M1", module_objectives: "Obj", module_themes: "Th", module_exercises: "Ex" });
  });
  it("normalise les absents à null", () => {
    expect(pickDerouleFields({ module_title: "M1" })).toEqual({
      module_title: "M1", module_objectives: null, module_themes: null, module_exercises: null,
    });
  });
});

describe("filterPastSlotsWithContent", () => {
  const now = new Date("2026-07-20T12:00:00Z");
  it("garde les créneaux passés AVEC contenu, exclut futurs et vides", () => {
    const slots = [
      { id: "a", end_time: "2026-07-20T10:00:00Z", module_themes: "fait" },      // passé + contenu ✓
      { id: "b", end_time: "2026-07-20T18:00:00Z", module_themes: "futur" },      // futur ✗
      { id: "c", end_time: "2026-07-19T10:00:00Z", module_themes: "  " },          // passé mais vide ✗
    ];
    const out = filterPastSlotsWithContent(slots, now);
    expect(out.map((s) => s.id)).toEqual(["a"]);
  });
});
