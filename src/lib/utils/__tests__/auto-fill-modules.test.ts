import { describe, it, expect } from "vitest";
import { distributeModulesToSlots } from "../auto-fill-modules";
import type { FormationTimeSlot, ProgramContentModule } from "@/lib/types";

function slot(id: string, start_time: string, overrides: Partial<FormationTimeSlot> = {}): FormationTimeSlot {
  return {
    id,
    session_id: "sess",
    title: null,
    start_time,
    end_time: start_time,
    slot_order: 0,
    module_title: null,
    module_objectives: null,
    module_themes: null,
    module_exercises: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  } as FormationTimeSlot;
}

function module(id: number, title: string, opts: Partial<ProgramContentModule> = {}): ProgramContentModule {
  return { id, title, ...opts };
}

describe("distributeModulesToSlots", () => {
  it("assigne module[i] au slot[i] par ordre chronologique", () => {
    const slots = [
      slot("s2", "2026-01-15T14:00:00Z"),
      slot("s1", "2026-01-15T09:00:00Z"),
    ];
    const modules = [module(1, "Module 1"), module(2, "Module 2")];
    const result = distributeModulesToSlots(modules, slots);
    expect(result.assignments[0].slotId).toBe("s1");
    expect(result.assignments[0].patch.module_title).toBe("Module 1");
    expect(result.assignments[1].slotId).toBe("s2");
    expect(result.assignments[1].patch.module_title).toBe("Module 2");
  });

  it("trie les modules par id (ordre de saisie du programme)", () => {
    const slots = [slot("s1", "2026-01-15T09:00:00Z"), slot("s2", "2026-01-15T14:00:00Z")];
    const modules = [module(2, "Deuxième"), module(1, "Premier")];
    const result = distributeModulesToSlots(modules, slots);
    expect(result.assignments[0].patch.module_title).toBe("Premier");
    expect(result.assignments[1].patch.module_title).toBe("Deuxième");
  });

  it("joins objectifs et topics avec retour à la ligne", () => {
    const slots = [slot("s1", "2026-01-15T09:00:00Z")];
    const modules = [
      module(1, "M1", {
        objectives: ["Obj A", "Obj B"],
        topics: ["Topic 1", "Topic 2", "Topic 3"],
      }),
    ];
    const result = distributeModulesToSlots(modules, slots);
    expect(result.assignments[0].patch.module_objectives).toBe("Obj A\nObj B");
    expect(result.assignments[0].patch.module_themes).toBe("Topic 1\nTopic 2\nTopic 3");
  });

  it("renvoie null pour objectifs/topics absents ou vides", () => {
    const slots = [slot("s1", "2026-01-15T09:00:00Z")];
    const modules = [module(1, "M1", { objectives: [], topics: undefined })];
    const result = distributeModulesToSlots(modules, slots);
    expect(result.assignments[0].patch.module_objectives).toBeNull();
    expect(result.assignments[0].patch.module_themes).toBeNull();
  });

  it("compte les slots en surplus quand #modules < #slots", () => {
    const slots = [
      slot("s1", "2026-01-15T09:00:00Z"),
      slot("s2", "2026-01-15T14:00:00Z"),
      slot("s3", "2026-01-16T09:00:00Z"),
    ];
    const modules = [module(1, "M1")];
    const result = distributeModulesToSlots(modules, slots);
    expect(result.assignments).toHaveLength(1);
    expect(result.emptySlots).toBe(2);
    expect(result.unassignedModules).toBe(0);
  });

  it("compte les modules ignorés quand #modules > #slots", () => {
    const slots = [slot("s1", "2026-01-15T09:00:00Z")];
    const modules = [module(1, "M1"), module(2, "M2"), module(3, "M3")];
    const result = distributeModulesToSlots(modules, slots);
    expect(result.assignments).toHaveLength(1);
    expect(result.emptySlots).toBe(0);
    expect(result.unassignedModules).toBe(2);
  });

  it("détecte les slots déjà remplis (déclenche confirm UI)", () => {
    const slots = [
      slot("s1", "2026-01-15T09:00:00Z", { module_title: "Existant" }),
      slot("s2", "2026-01-15T14:00:00Z"),
    ];
    const modules = [module(1, "M1"), module(2, "M2")];
    const result = distributeModulesToSlots(modules, slots);
    expect(result.slotsAlreadyFilled).toBe(1);
  });

  it("compte aussi module_objectives et module_themes comme contenu existant", () => {
    const slots = [
      slot("s1", "2026-01-15T09:00:00Z", { module_objectives: "déjà" }),
      slot("s2", "2026-01-15T14:00:00Z", { module_themes: "déjà" }),
    ];
    const modules = [module(1, "M1"), module(2, "M2")];
    const result = distributeModulesToSlots(modules, slots);
    expect(result.slotsAlreadyFilled).toBe(2);
  });

  it("renvoie vide quand 0 modules ou 0 slots", () => {
    expect(distributeModulesToSlots([], [slot("s1", "2026-01-15T09:00:00Z")]).assignments).toHaveLength(0);
    expect(distributeModulesToSlots([module(1, "M1")], []).assignments).toHaveLength(0);
  });
});
