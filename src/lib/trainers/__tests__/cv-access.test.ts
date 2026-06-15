import { describe, it, expect } from "vitest";
import { canManageTrainerCv } from "../cv-access";

const trainerA = { entity_id: "ent-1", profile_id: "prof-trainer-A" };

describe("canManageTrainerCv", () => {
  it("super_admin : autorisé sur n'importe quelle fiche", () => {
    expect(canManageTrainerCv({ role: "super_admin", entity_id: "autre" }, trainerA, "u")).toBe(true);
  });

  it("admin : autorisé seulement sur une fiche de SON entité", () => {
    expect(canManageTrainerCv({ role: "admin", entity_id: "ent-1" }, trainerA, "u")).toBe(true);
    expect(canManageTrainerCv({ role: "admin", entity_id: "ent-2" }, trainerA, "u")).toBe(false);
  });

  it("trainer : autorisé seulement sur SA propre fiche (profile_id == userId)", () => {
    expect(canManageTrainerCv({ role: "trainer", entity_id: "ent-1" }, trainerA, "prof-trainer-A")).toBe(true);
    // anti-IDOR : un autre formateur de la même entité ne peut PAS gérer le CV d'autrui
    expect(canManageTrainerCv({ role: "trainer", entity_id: "ent-1" }, trainerA, "prof-trainer-B")).toBe(false);
  });

  it("autres rôles (learner, client, commercial) : refusés", () => {
    for (const role of ["learner", "client", "commercial"]) {
      expect(canManageTrainerCv({ role, entity_id: "ent-1" }, trainerA, "prof-trainer-A")).toBe(false);
    }
  });
});
