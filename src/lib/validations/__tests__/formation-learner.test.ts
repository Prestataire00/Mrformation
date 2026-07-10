import { describe, it, expect } from "vitest";
import { editFormationLearnerSchema } from "@/lib/validations/formation-learner";

const base = { first_name: "Jean", last_name: "Dupont", email: "", bpf_trainee_type: "salarie_prive" };

describe("editFormationLearnerSchema", () => {
  it("valide une fiche correcte (email vide autorisé)", () => {
    expect(editFormationLearnerSchema.safeParse(base).success).toBe(true);
  });

  it("accepte un email valide", () => {
    expect(editFormationLearnerSchema.safeParse({ ...base, email: "a@b.fr" }).success).toBe(true);
  });

  it("rejette un email invalide", () => {
    const r = editFormationLearnerSchema.safeParse({ ...base, email: "pas-un-email" });
    expect(r.success).toBe(false);
  });

  it("exige prénom et nom", () => {
    expect(editFormationLearnerSchema.safeParse({ ...base, first_name: "" }).success).toBe(false);
    expect(editFormationLearnerSchema.safeParse({ ...base, last_name: "  " }).success).toBe(false);
  });

  it("n'accepte que les types BPF officiels", () => {
    for (const t of ["salarie_prive", "apprenti", "demandeur_emploi", "particulier", "autre"]) {
      expect(editFormationLearnerSchema.safeParse({ ...base, bpf_trainee_type: t }).success).toBe(true);
    }
    expect(editFormationLearnerSchema.safeParse({ ...base, bpf_trainee_type: "inconnu" }).success).toBe(false);
  });
});
