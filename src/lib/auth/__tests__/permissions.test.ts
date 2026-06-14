import { describe, it, expect } from "vitest";
import { findMatchingRoles, API_PERMISSIONS } from "../permissions";

describe("findMatchingRoles — RBAC API espace formateur (EF-1.1)", () => {
  it("autorise le rôle trainer sur /api/trainer/* (courses, documents…)", () => {
    expect(findMatchingRoles("/api/trainer/courses", API_PERMISSIONS)).toContain("trainer");
    expect(findMatchingRoles("/api/trainer/documents", API_PERMISSIONS)).toEqual([
      "super_admin",
      "admin",
      "trainer",
    ]);
  });

  it("ne laisse PAS /api/trainer ombrer /api/trainers (gestion admin) — ordre first-match", () => {
    // /api/trainers (pluriel) = gestion admin des fiches formateurs : reste admin-only.
    expect(findMatchingRoles("/api/trainers", API_PERMISSIONS)).toEqual(["super_admin", "admin"]);
    expect(findMatchingRoles("/api/trainers/abc-123", API_PERMISSIONS)).not.toContain("trainer");
  });

  it("retourne null si aucun préfixe ne matche", () => {
    expect(findMatchingRoles("/api/inconnu", API_PERMISSIONS)).toBeNull();
  });
});
