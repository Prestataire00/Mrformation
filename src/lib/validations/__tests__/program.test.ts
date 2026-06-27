import { describe, it, expect } from "vitest";
import {
  programContentSchema,
  programHubFormSchema,
  programCreateSessionSchema,
  generateProgramFormSchema,
  getProgramFormErrors,
  type ProgramHubFormInput,
} from "../program";

// ── programContentSchema ─────────────────────────────────────────────

describe("programContentSchema", () => {
  it("accepte un contenu minimal valide (au moins 1 module)", () => {
    const result = programContentSchema.safeParse({
      modules: [{ id: 1, title: "M1" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejette un contenu sans modules", () => {
    const result = programContentSchema.safeParse({ modules: [] });
    expect(result.success).toBe(false);
  });

  it("rejette un module sans titre", () => {
    const result = programContentSchema.safeParse({
      modules: [{ id: 1, title: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepte les métadonnées Qualiopi optionnelles", () => {
    const result = programContentSchema.safeParse({
      modules: [{ id: 1, title: "M1" }],
      duration_hours: 14,
      location: "Paris",
      target_audience: "Salariés en reconversion",
      cpf_eligible: true,
      evaluation_methods: ["QCM", "Mise en situation"],
    });
    expect(result.success).toBe(true);
  });

  // ── Lot A1 — séquence enrichie + page 1 enrichie (générateur IA) ──────

  it("accepte un contenu enrichi avec champs de séquence et page 1 (Lot A1)", () => {
    const result = programContentSchema.safeParse({
      modules: [
        {
          id: 1,
          title: "Séquence 1 — Fondamentaux",
          duration_hours: 3.5,
          topics: ["Sujet A", "Sujet B"],
          summary_objective: "Comprendre les bases",
          operational_objectives: ["Être capable d'identifier…", "Être capable d'appliquer…"],
          content_details: ["Définition avec exemple concret", "Cas pratique guidé"],
          methods: "Apports théoriques + atelier pratique",
          evaluation: "Évaluation des acquis en continu",
        },
      ],
      general_objectives: ["Maîtriser le cadre réglementaire", "Savoir conduire un entretien"],
      access_terms: "Inscription jusqu'à 10 jours avant la session ; accès PMR.",
      target_audience: "Aides-soignants (max 12 personnes)",
    });
    expect(result.success).toBe(true);
  });

  it("reste valide pour un contenu legacy sans les nouveaux champs enrichis (rétro-compatibilité)", () => {
    const legacy = {
      modules: [{ id: 1, title: "Module 1", duration_hours: 7, topics: ["Intro"] }],
      duration_hours: 7,
      duration_days: 1,
      location: "Présentiel",
      target_audience: "Tout public",
      evaluation_methods: ["QCM"],
      pedagogical_resources: ["Support PDF"],
    };
    const result = programContentSchema.safeParse(legacy);
    expect(result.success).toBe(true);
  });

  it("accepte un module enrichi mélangé avec un module legacy", () => {
    const result = programContentSchema.safeParse({
      modules: [
        { id: 1, title: "Legacy", duration_hours: 2, topics: ["X"] },
        {
          id: 2,
          title: "Enrichi",
          operational_objectives: ["Être capable de…"],
          methods: "Atelier",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  // ── Lot C : la création hub passe par l'IA → l'objet content généré doit
  // être validable par programContentSchema (filet anti-régression). ────────
  it("accepte un content généré par l'IA (objet, création hub Lot C)", () => {
    const generatedContent = {
      modules: [
        {
          id: 1,
          title: "Séquence 1 — Accueil et cadrage",
          duration_hours: 3,
          topics: ["Tour de table", "Objectifs"],
          summary_objective: "Poser le cadre",
          operational_objectives: ["Identifier ses besoins"],
          content_details: ["Présentation du déroulé"],
          methods: "Apports + atelier",
          evaluation: "Évaluation en continu",
        },
      ],
      duration_hours: 14,
      duration_days: 2,
      location: "Présentiel",
      target_audience: "Aides-soignants (max 12 personnes)",
      prerequisites: "Aucun",
      team_description: "Formateur expert métier",
      evaluation_methods: ["QCM", "Mise en situation"],
      pedagogical_resources: ["Support de synthèse"],
      certification_results: "Attestation de fin de formation",
      general_objectives: ["Maîtriser le cadre réglementaire"],
      access_terms: "Inscription jusqu'à 10 jours avant la session.",
    };
    const result = programContentSchema.safeParse(generatedContent);
    expect(result.success).toBe(true);
  });
});

// ── generateProgramFormSchema (Lot A1 — dialog génération IA) ─────────

describe("generateProgramFormSchema", () => {
  it("accepte un formulaire pré-rempli (titre + durées + précisions)", () => {
    const result = generateProgramFormSchema.safeParse({
      title: "Gestion du stress",
      duration_hours: "14",
      duration_days: "2",
      precisions: "Formation DPC, public aides-soignants",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.duration_hours).toBe(14);
      expect(result.data.duration_days).toBe(2);
      expect(result.data.precisions).toBe("Formation DPC, public aides-soignants");
    }
  });

  it("accepte des précisions et une durée en jours vides (optionnels → null)", () => {
    const result = generateProgramFormSchema.safeParse({
      title: "Excel avancé",
      duration_hours: "7",
      duration_days: "",
      precisions: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.duration_days).toBeNull();
      expect(result.data.precisions).toBeNull();
    }
  });

  it("rejette un titre vide", () => {
    const result = generateProgramFormSchema.safeParse({
      title: "",
      duration_hours: "7",
      duration_days: "",
      precisions: "",
    });
    expect(result.success).toBe(false);
  });
});

// ── programHubFormSchema ─────────────────────────────────────────────

// Lot C : le `content` n'est plus un champ du formulaire hub (création IA).
const validHubForm: ProgramHubFormInput = {
  title: "Formation Excel avancé",
  description: "",
  objectives: "",
  price: "",
  tva_rate: "20",
  duration_hours: "",
  nsf_code: "",
  nsf_label: "",
  is_apprenticeship: false,
  bpf_objective: "",
  bpf_funding_type: "",
};

describe("programHubFormSchema", () => {
  it("accepte un formulaire minimal valide", () => {
    const result = programHubFormSchema.safeParse(validHubForm);
    expect(result.success).toBe(true);
  });

  it("rejette un titre vide", () => {
    const result = programHubFormSchema.safeParse({ ...validHubForm, title: "" });
    expect(result.success).toBe(false);
  });

  it("convertit les strings numériques en number", () => {
    const result = programHubFormSchema.safeParse({ ...validHubForm, price: "1500", duration_hours: "14" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price).toBe(1500);
      expect(result.data.duration_hours).toBe(14);
    }
  });

  it("convertit les strings vides en null pour les champs optionnels", () => {
    const result = programHubFormSchema.safeParse(validHubForm);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeNull();
      expect(result.data.price).toBeNull();
      expect(result.data.nsf_code).toBeNull();
      expect(result.data.bpf_objective).toBeNull();
    }
  });

  it("accepte les enum BPF valides (valeurs canonical)", () => {
    const result = programHubFormSchema.safeParse({
      ...validHubForm,
      bpf_objective: "rncp_6_8",
      bpf_funding_type: "entreprise_privee",
    });
    expect(result.success).toBe(true);
  });

  it("rejette un bpf_objective invalide", () => {
    const result = programHubFormSchema.safeParse({ ...validHubForm, bpf_objective: "n_importe_quoi" });
    expect(result.success).toBe(false);
  });

  it("rejette un tva_rate hors plage [0, 100]", () => {
    const result = programHubFormSchema.safeParse({ ...validHubForm, tva_rate: "150" });
    expect(result.success).toBe(false);
  });
});

// ── programCreateSessionSchema ───────────────────────────────────────

describe("programCreateSessionSchema", () => {
  const valid = {
    title: "Session test",
    startDate: "2026-06-10",
    endDate: "2026-06-11",
    location: "Paris",
    mode: "presentiel" as const,
    trainerId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", // UUID v4 valide
  };

  it("accepte une session valide", () => {
    const result = programCreateSessionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejette une date de fin antérieure à la date de début", () => {
    const result = programCreateSessionSchema.safeParse({
      ...valid,
      startDate: "2026-06-15",
      endDate: "2026-06-10",
    });
    expect(result.success).toBe(false);
  });

  it("accepte sans trainerId (non assigné)", () => {
    const result = programCreateSessionSchema.safeParse({ ...valid, trainerId: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.trainerId).toBeNull();
  });

  it("rejette un mode invalide", () => {
    const result = programCreateSessionSchema.safeParse({
      ...valid,
      mode: "inventé",
    } as unknown as typeof valid);
    expect(result.success).toBe(false);
  });
});

// ── getProgramFormErrors ─────────────────────────────────────────────

describe("getProgramFormErrors", () => {
  it("renvoie une map champ → premier message", () => {
    const result = programHubFormSchema.safeParse({ ...validHubForm, title: "", tva_rate: "150" });
    const errors = getProgramFormErrors<ProgramHubFormInput>(result);
    expect(errors.title).toBeDefined();
    expect(errors.tva_rate).toBeDefined();
  });

  it("renvoie une map vide quand le parse réussit", () => {
    const result = programHubFormSchema.safeParse(validHubForm);
    const errors = getProgramFormErrors<ProgramHubFormInput>(result);
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
