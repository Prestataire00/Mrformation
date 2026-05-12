import { describe, it, expect } from "vitest";
import { sortSlotsByStart } from "@/lib/utils/sort-time-slots";

describe("sortSlotsByStart", () => {
  it("tri chronologique : 14h00 vient APRÈS 09h00 le même jour", () => {
    const slots = [
      { id: "a", start_time: "2026-04-10T14:00:00Z" },
      { id: "b", start_time: "2026-04-10T09:00:00Z" },
    ];
    const sorted = sortSlotsByStart(slots);
    expect(sorted.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("multi-jours : jour J trié avant J+1", () => {
    const slots = [
      { id: "j+1-am", start_time: "2026-04-11T09:00:00Z" },
      { id: "j-pm", start_time: "2026-04-10T14:00:00Z" },
      { id: "j-am", start_time: "2026-04-10T09:00:00Z" },
    ];
    const sorted = sortSlotsByStart(slots);
    expect(sorted.map((s) => s.id)).toEqual(["j-am", "j-pm", "j+1-am"]);
  });

  it("tableau vide", () => {
    expect(sortSlotsByStart([])).toEqual([]);
  });

  it("préserve l'ordre stable pour 2 slots avec même start_time", () => {
    const slots = [
      { id: "a", start_time: "2026-04-10T09:00:00Z" },
      { id: "b", start_time: "2026-04-10T09:00:00Z" },
    ];
    const sorted = sortSlotsByStart(slots);
    expect(sorted.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("ne mute pas le tableau d'origine", () => {
    const slots = [
      { id: "pm", start_time: "2026-04-10T14:00:00Z" },
      { id: "am", start_time: "2026-04-10T09:00:00Z" },
    ];
    const original = [...slots];
    sortSlotsByStart(slots);
    expect(slots).toEqual(original);
  });

  it("conserve les autres propriétés des slots", () => {
    const slots = [
      { id: "pm", start_time: "2026-04-10T14:00:00Z", end_time: "2026-04-10T17:00:00Z", title: "Aprem" },
      { id: "am", start_time: "2026-04-10T09:00:00Z", end_time: "2026-04-10T12:00:00Z", title: "Matin" },
    ];
    const sorted = sortSlotsByStart(slots);
    expect(sorted[0]).toEqual({ id: "am", start_time: "2026-04-10T09:00:00Z", end_time: "2026-04-10T12:00:00Z", title: "Matin" });
    expect(sorted[1].title).toBe("Aprem");
  });
});
