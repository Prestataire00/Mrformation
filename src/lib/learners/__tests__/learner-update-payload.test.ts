import { describe, it, expect } from "vitest";
import {
  LEARNER_EDITABLE_FIELDS,
  buildLearnerUpdatePayload,
} from "@/lib/learners/learner-update-payload";

/**
 * Garde anti-récidive du bug AIPR : un champ éditable de la fiche apprenant
 * (ex. birth_city) doit TOUJOURS finir dans le payload UPDATE. Le payload est
 * désormais dérivé de LEARNER_EDITABLE_FIELDS → impossible d'en oublier un.
 */

const current = {
  first_name: "Ancien",
  last_name: "Nom",
  email: "ancien@example.fr",
} as Record<string, string>;

function fullForm(): Record<string, string> {
  // une valeur non vide pour chaque champ éditable
  return Object.fromEntries(LEARNER_EDITABLE_FIELDS.map((f) => [f, `val_${f}`]));
}

describe("buildLearnerUpdatePayload — parité champs/​payload", () => {
  it("le payload contient TOUS les champs éditables (aucun oubli possible)", () => {
    const payload = buildLearnerUpdatePayload(fullForm(), current);
    for (const f of LEARNER_EDITABLE_FIELDS) {
      expect(payload).toHaveProperty(f);
    }
  });

  it("birth_city est inclus (régression du bug AIPR)", () => {
    const payload = buildLearnerUpdatePayload({ birth_city: "Lyon" }, current);
    expect(payload.birth_city).toBe("Lyon");
  });
});

describe("buildLearnerUpdatePayload — comportement (préserve l'existant)", () => {
  it("trim + fallback sur la valeur courante pour les champs requis (nom/prénom/email)", () => {
    const p = buildLearnerUpdatePayload({ first_name: "  ", last_name: "Martin", email: "" }, current);
    expect(p.first_name).toBe("Ancien"); // vide → garde l'ancien
    expect(p.last_name).toBe("Martin");
    expect(p.email).toBe("ancien@example.fr");
  });

  it("trim + null pour les champs optionnels texte", () => {
    const p = buildLearnerUpdatePayload({ phone: "  06  ", birth_city: "   ", address: "12 rue X" }, current);
    expect(p.phone).toBe("06");
    expect(p.birth_city).toBeNull(); // vide → null
    expect(p.address).toBe("12 rue X");
  });

  it("brut → null pour les selects/dates (pas de trim)", () => {
    const p = buildLearnerUpdatePayload({ client_id: "c1", birth_date: "2026-01-02", gender: "", education_level: "bac" }, current);
    expect(p.client_id).toBe("c1");
    expect(p.birth_date).toBe("2026-01-02");
    expect(p.gender).toBeNull();
    expect(p.education_level).toBe("bac");
  });
});
