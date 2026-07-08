import { describe, it, expect } from "vitest";
import { resolveVariables, type ResolveContext } from "@/lib/utils/resolve-variables";
import type { Session, Learner } from "@/lib/types";

/**
 * Tests de CORRECTNESS de résolution pour les attestations à plus forte
 * remontée de bugs : assiduité (présence 0/100), AIPR, compétences.
 *
 * Complète `resolve-variables.test.ts` (basics/dates/entity) et l'invariant
 * `document-variables-invariant.test.ts` (présence des variables) : ici on
 * vérifie que la VALEUR résolue est juste, pas seulement non vide.
 */

// Fabriques minimales (mêmes conventions que resolve-variables.test.ts).
function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    entity_id: "entity-1",
    title: "Formation Habilitation Électrique B1V",
    start_date: "2026-05-15T09:00:00Z",
    end_date: "2026-05-16T17:00:00Z",
    location: "Aix-en-Provence",
    planned_hours: 14,
    ...overrides,
  } as Session;
}

function makeLearner(overrides: Partial<Learner> = {}): Learner {
  return {
    id: "learner-1",
    entity_id: "entity-1",
    client_id: "client-1",
    first_name: "Pierre",
    last_name: "MARTIN",
    email: "pierre.martin@example.com",
    ...overrides,
  } as Learner;
}

const resolve = (token: string, ctx: ResolveContext) => resolveVariables(token, ctx);

describe("Attestation assiduité — heures réalisées & taux (logique présence 0/100)", () => {
  const learner = makeLearner();
  const session = makeSession({ planned_hours: 14 });

  it("apprenant PRÉSENT (a signé) → heures = planned_hours, taux = 100", () => {
    const ctx: ResolveContext = { session, learner, signedLearnerIds: new Set(["learner-1"]) };
    expect(resolve("{{heures_realisees_apprenant}}", ctx)).toBe("14.00");
    expect(resolve("{{taux_realisation}}", ctx)).toBe("100.00");
  });

  it("apprenant ABSENT (n'a pas signé) → heures = 0, taux = 0", () => {
    const ctx: ResolveContext = {
      session,
      learner,
      signedLearnerIds: new Set(["un-autre-apprenant"]),
    };
    expect(resolve("{{heures_realisees_apprenant}}", ctx)).toBe("0.00");
    expect(resolve("{{taux_realisation}}", ctx)).toBe("0.00");
  });

  it("signedLearnerIds non fourni (mock/preview) → présent par défaut", () => {
    const ctx: ResolveContext = { session, learner };
    expect(resolve("{{heures_realisees_apprenant}}", ctx)).toBe("14.00");
    expect(resolve("{{taux_realisation}}", ctx)).toBe("100.00");
  });

  it("planned_hours absent → heures = 0, taux = 0 (pas de NaN)", () => {
    const ctx: ResolveContext = {
      session: makeSession({ planned_hours: null as unknown as number }),
      learner,
      signedLearnerIds: new Set(["learner-1"]),
    };
    expect(resolve("{{heures_realisees_apprenant}}", ctx)).toBe("0.00");
    expect(resolve("{{taux_realisation}}", ctx)).toBe("0.00");
  });

  it("formate les heures avec 2 décimales (ex. 10.5h → 10.50)", () => {
    const ctx: ResolveContext = {
      session: makeSession({ planned_hours: 10.5 }),
      learner,
      signedLearnerIds: new Set(["learner-1"]),
    };
    expect(resolve("{{heures_realisees_apprenant}}", ctx)).toBe("10.50");
  });

  it("learnerAttendance présent (émargement partiel) prime sur l'heuristique binaire", () => {
    const ctx: ResolveContext = {
      session,
      learner,
      // Présent au sens binaire (a signé ≥1 fois) mais assiduité réelle partielle.
      signedLearnerIds: new Set(["learner-1"]),
      learnerAttendance: { signedHours: 3, totalHours: 7, ratePct: 42.86 },
    };
    expect(resolve("{{heures_realisees_apprenant}}", ctx)).toBe("3.00");
    expect(resolve("{{taux_realisation}}", ctx)).toBe("42.86");
  });

  it("learnerAttendance intégral → heures = total, taux = 100", () => {
    const ctx: ResolveContext = {
      session,
      learner,
      learnerAttendance: { signedHours: 7, totalHours: 7, ratePct: 100 },
    };
    expect(resolve("{{heures_realisees_apprenant}}", ctx)).toBe("7.00");
    expect(resolve("{{taux_realisation}}", ctx)).toBe("100.00");
  });
});

describe("Attestation AIPR — résultat examen & ville de naissance", () => {
  const session = makeSession();

  it("résultat « success » → « a réussi cet examen. »", () => {
    const ctx: ResolveContext = { session, learner: makeLearner(), aiprExamResult: "success" };
    expect(resolve("{{resultat_examen_aipr}}", ctx)).toBe("a réussi cet examen.");
  });

  it("résultat « echec » → « a échoué cet examen. »", () => {
    const ctx: ResolveContext = { session, learner: makeLearner(), aiprExamResult: "echec" };
    expect(resolve("{{resultat_examen_aipr}}", ctx)).toBe("a échoué cet examen.");
  });

  it("résultat non fourni → défaut « a réussi cet examen. »", () => {
    const ctx: ResolveContext = { session, learner: makeLearner() };
    expect(resolve("{{resultat_examen_aipr}}", ctx)).toBe("a réussi cet examen.");
  });

  it("ville de naissance présente → valeur de l'apprenant", () => {
    const learner = { ...makeLearner(), birth_city: "Lyon" } as unknown as Learner;
    const ctx: ResolveContext = { session, learner };
    expect(resolve("{{ville_naissance_apprenant}}", ctx)).toBe("Lyon");
  });

  it("ville de naissance absente → placeholder d'audit explicite", () => {
    const ctx: ResolveContext = { session, learner: makeLearner() };
    expect(resolve("{{ville_naissance_apprenant}}", ctx)).toBe("[Ville de naissance]");
  });
});

describe("Attestation compétences — signature de l'intervenant", () => {
  it("formateur avec signature_url → balise <img> de la signature", () => {
    const session = makeSession({
      formation_trainers: [
        { trainer: { signature_url: "https://example.com/sig-formateur.png" } },
      ],
    } as unknown as Partial<Session>);
    const html = resolve("{{signature_intervenant}}", { session, learner: makeLearner() });
    expect(html).toContain("<img");
    expect(html).toContain("https://example.com/sig-formateur.png");
  });

  it("formateur sans signature → zone vide pour signature manuelle (pas d'<img>)", () => {
    const session = makeSession({
      formation_trainers: [{ trainer: { signature_url: null } }],
    } as unknown as Partial<Session>);
    const html = resolve("{{signature_intervenant}}", { session, learner: makeLearner() });
    expect(html).not.toContain("<img");
    expect(html).toContain("border-bottom");
  });
});
