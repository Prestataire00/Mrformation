import { describe, it, expect } from "vitest";
import { resolveActiveEntity } from "@/lib/auth/effective-entity";

/**
 * SPEC spec-connexion-unique-redirection — dérivation de l'entité active après
 * authentification (connexion unique, plus de choix d'organisme pré-login).
 */

describe("resolveActiveEntity", () => {
  it("rôle scopé : l'entité du profil prime, cookie absent → pas de sélection", () => {
    expect(resolveActiveEntity("learner", "ent-A", undefined)).toEqual({
      entityId: "ent-A",
      needsSelection: false,
    });
  });

  it("rôle scopé : cookie divergent est IGNORÉ au profit du profil", () => {
    expect(resolveActiveEntity("admin", "ent-A", "ent-B")).toEqual({
      entityId: "ent-A",
      needsSelection: false,
    });
  });

  it("rôle scopé sans entité de profil → needsSelection (repli /select-entity)", () => {
    expect(resolveActiveEntity("admin", null, undefined)).toEqual({
      entityId: null,
      needsSelection: true,
    });
  });

  it("super_admin : le cookie fait foi (choix de switch)", () => {
    expect(resolveActiveEntity("super_admin", "ent-A", "ent-B")).toEqual({
      entityId: "ent-B",
      needsSelection: false,
    });
  });

  it("super_admin sans cookie → repli sur l'entité du profil", () => {
    expect(resolveActiveEntity("super_admin", "ent-A", undefined)).toEqual({
      entityId: "ent-A",
      needsSelection: false,
    });
  });

  it("super_admin sans cookie ni entité de profil → needsSelection", () => {
    expect(resolveActiveEntity("super_admin", null, undefined)).toEqual({
      entityId: null,
      needsSelection: true,
    });
  });

  it("commercial (rôle scopé) suit le profil, pas le cookie", () => {
    expect(resolveActiveEntity("commercial", "ent-A", "ent-Z")).toEqual({
      entityId: "ent-A",
      needsSelection: false,
    });
  });
});
