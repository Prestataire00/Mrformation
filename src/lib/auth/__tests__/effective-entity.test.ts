import { describe, it, expect } from "vitest";
import { shouldForceProfileEntity } from "@/lib/auth/effective-entity";

/**
 * Le tunnel pré-login (organisme → rôle → login) pose un cookie `entity_id`
 * qui peut pointer une entité à laquelle l'utilisateur n'appartient pas. Pour
 * un rôle NON super_admin, la RLS lie tout à `profiles.entity_id` : si le cookie
 * diverge, l'utilisateur voit un espace vide et ne peut rien créer.
 */
describe("shouldForceProfileEntity", () => {
  it("force l'entité du profil si admin et cookie ≠ profil", () => {
    expect(shouldForceProfileEntity("admin", "c3v", "mr-formation")).toBe(true);
  });

  it("ne force pas si le cookie correspond déjà au profil", () => {
    expect(shouldForceProfileEntity("admin", "c3v", "c3v")).toBe(false);
  });

  it("ne force JAMAIS pour un super_admin (peut basculer d'entité)", () => {
    expect(shouldForceProfileEntity("super_admin", "c3v", "mr-formation")).toBe(false);
  });

  it("ne force pas si le profil n'a pas d'entité (cas limite)", () => {
    expect(shouldForceProfileEntity("admin", null, "mr-formation")).toBe(false);
    expect(shouldForceProfileEntity("admin", undefined, "mr-formation")).toBe(false);
  });

  it("force si cookie absent mais profil défini", () => {
    expect(shouldForceProfileEntity("trainer", "c3v", null)).toBe(true);
  });

  it("couvre les autres rôles non super_admin (trainer, client, learner, commercial)", () => {
    for (const role of ["trainer", "client", "learner", "commercial"]) {
      expect(shouldForceProfileEntity(role, "c3v", "mr-formation")).toBe(true);
    }
  });
});
