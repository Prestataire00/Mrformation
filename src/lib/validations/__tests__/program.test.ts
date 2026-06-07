import { describe, it, expect } from "vitest";
import {
  programContentSchema,
  programHubFormSchema,
  programCreateSessionSchema,
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
});

// ── programHubFormSchema ─────────────────────────────────────────────

const validHubForm: ProgramHubFormInput = {
  title: "Formation Excel avancé",
  description: "",
  objectives: "",
  content: JSON.stringify({ modules: [{ id: 1, title: "M1" }] }),
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

  it("rejette un contenu JSON syntaxiquement invalide", () => {
    const result = programHubFormSchema.safeParse({ ...validHubForm, content: "{ pas: du JSON" });
    expect(result.success).toBe(false);
  });

  it("rejette un contenu JSON valide mais sans modules", () => {
    const result = programHubFormSchema.safeParse({
      ...validHubForm,
      content: JSON.stringify({ foo: "bar" }),
    });
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
    const result = programHubFormSchema.safeParse({ ...validHubForm, title: "", content: "{ pas: JSON" });
    const errors = getProgramFormErrors<ProgramHubFormInput>(result);
    expect(errors.title).toBeDefined();
    expect(errors.content).toBeDefined();
  });

  it("renvoie une map vide quand le parse réussit", () => {
    const result = programHubFormSchema.safeParse(validHubForm);
    const errors = getProgramFormErrors<ProgramHubFormInput>(result);
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
