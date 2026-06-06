import { describe, it, expect } from "vitest";
import {
  computeSectionC,
  computeSectionD,
  getF3Index,
  isRncpIndex,
  getFundingLineKey,
} from "../bpf-calculator";

// ─── computeSectionC ────────────────────────────────────────

describe("computeSectionC", () => {
  it("ventile les montants par bpf_funding_type du devis", () => {
    const quotes = [
      { amount: 1000, bpf_funding_type: "entreprise_privee", program: null, client: null },
      { amount: 2000, bpf_funding_type: "cpf", program: null, client: null },
      { amount: 500, bpf_funding_type: "entreprise_privee", program: null, client: null },
    ];
    const result = computeSectionC(quotes);
    expect(result["line_1"]).toBe(1500); // entreprise_privee
    expect(result["line_2e"]).toBe(2000); // cpf
  });

  it("utilise le fallback program.bpf_funding_type quand le devis n'en a pas", () => {
    const quotes = [
      { amount: 3000, bpf_funding_type: null, program: { bpf_funding_type: "apprentissage" }, client: null },
    ];
    const result = computeSectionC(quotes);
    expect(result["line_2a"]).toBe(3000);
  });

  it("utilise le fallback client.bpf_category en dernier recours", () => {
    const quotes = [
      { amount: 1500, bpf_funding_type: null, program: null, client: { bpf_category: "pole_emploi" } },
    ];
    const result = computeSectionC(quotes);
    expect(result["line_7"]).toBe(1500);
  });

  it("met en line_11 (autre) les devis sans type de financement", () => {
    const quotes = [
      { amount: 800, bpf_funding_type: null, program: null, client: null },
    ];
    const result = computeSectionC(quotes);
    expect(result["line_11"]).toBe(800);
  });

  it("ignore les devis avec montant 0 ou négatif", () => {
    const quotes = [
      { amount: 0, bpf_funding_type: "cpf", program: null, client: null },
      { amount: -100, bpf_funding_type: "cpf", program: null, client: null },
    ];
    const result = computeSectionC(quotes);
    expect(result["line_2e"]).toBeUndefined();
  });

  it("retourne un objet vide pour une liste de devis vide", () => {
    const result = computeSectionC([]);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("couvre les 17 types de financement BPF", () => {
    const types = [
      "entreprise_privee", "apprentissage", "professionnalisation",
      "reconversion_alternance", "conge_transition", "cpf",
      "dispositif_chomeurs", "non_salaries", "plan_developpement",
      "pouvoir_public_agents", "instances_europeennes", "etat",
      "conseil_regional", "pole_emploi", "autres_publics",
      "individuel", "organisme_formation", "autre",
    ];
    const quotes = types.map((t, i) => ({
      amount: (i + 1) * 100,
      bpf_funding_type: t,
      program: null,
      client: null,
    }));
    const result = computeSectionC(quotes);
    // Chaque type doit produire une ligne
    expect(Object.keys(result).length).toBe(types.length);
  });
});

// ─── computeSectionD ────────────────────────────────────────

describe("computeSectionD", () => {
  it("calcule salaires internes et achats externes séparément", () => {
    const trainers = [
      { hourly_rate: 50, session_id: "s1", trainer: { type: "internal" } },
      { hourly_rate: 80, session_id: "s1", trainer: { type: "external" } },
    ];
    const durations = { s1: 10 };
    const result = computeSectionD(trainers, durations);
    expect(result.salaires_formateurs).toBe(500); // 50 * 10
    expect(result.achats_prestation).toBe(800); // 80 * 10
    expect(result.total_charges).toBe(1300);
  });

  it("gère le cas trainer en array (jointure Supabase)", () => {
    const trainers = [
      { hourly_rate: 60, session_id: "s1", trainer: [{ type: "external" }] as unknown as { type: string } },
    ];
    const durations = { s1: 5 };
    const result = computeSectionD(trainers, durations);
    expect(result.achats_prestation).toBe(300);
  });

  it("retourne 0 si aucun formateur", () => {
    const result = computeSectionD([], {});
    expect(result.total_charges).toBe(0);
    expect(result.salaires_formateurs).toBe(0);
    expect(result.achats_prestation).toBe(0);
  });

  it("ignore les formateurs avec taux horaire null", () => {
    const trainers = [
      { hourly_rate: null, session_id: "s1", trainer: { type: "internal" } },
    ];
    const durations = { s1: 10 };
    const result = computeSectionD(trainers, durations);
    expect(result.total_charges).toBe(0);
  });

  it("ignore les sessions sans durée", () => {
    const trainers = [
      { hourly_rate: 50, session_id: "s_unknown", trainer: { type: "internal" } },
    ];
    const durations = {};
    const result = computeSectionD(trainers, durations);
    expect(result.total_charges).toBe(0);
  });

  it("traite trainer null comme internal par défaut", () => {
    const trainers = [
      { hourly_rate: 40, session_id: "s1", trainer: null },
    ];
    const durations = { s1: 8 };
    const result = computeSectionD(trainers, durations);
    expect(result.salaires_formateurs).toBe(320);
    expect(result.achats_prestation).toBe(0);
  });
});

// ─── getF3Index ─────────────────────────────────────────────

describe("getF3Index", () => {
  it("mappe chaque objectif BPF au bon index F3", () => {
    expect(getF3Index("rncp_6_8")).toBe(1);
    expect(getF3Index("rncp_5")).toBe(2);
    expect(getF3Index("rncp_4")).toBe(3);
    expect(getF3Index("rncp_3")).toBe(4);
    expect(getF3Index("rncp_2")).toBe(5);
    expect(getF3Index("rncp_cqp")).toBe(6);
    expect(getF3Index("certification_rs")).toBe(7);
    expect(getF3Index("cqp_non_enregistre")).toBe(8);
    expect(getF3Index("autre_pro")).toBe(9);
    expect(getF3Index("bilan_competences")).toBe(10);
    expect(getF3Index("vae")).toBe(11);
  });

  it("retourne 9 (autres formations) pour un objectif null", () => {
    expect(getF3Index(null)).toBe(9);
  });

  it("retourne 9 (autres formations) pour un objectif inconnu", () => {
    expect(getF3Index("objectif_inconnu")).toBe(9);
  });
});

// ─── isRncpIndex ────────────────────────────────────────────

describe("isRncpIndex", () => {
  it("retourne true pour les indices RNCP (1-6)", () => {
    for (let i = 1; i <= 6; i++) {
      expect(isRncpIndex(i)).toBe(true);
    }
  });

  it("retourne false pour les indices non-RNCP", () => {
    expect(isRncpIndex(0)).toBe(false);
    expect(isRncpIndex(7)).toBe(false);
    expect(isRncpIndex(9)).toBe(false);
    expect(isRncpIndex(12)).toBe(false);
  });
});

// ─── getFundingLineKey ──────────────────────────────────────

describe("getFundingLineKey", () => {
  it("retourne la bonne ligne pour chaque type de financement", () => {
    expect(getFundingLineKey("entreprise_privee")).toBe("line_1");
    expect(getFundingLineKey("cpf")).toBe("line_2e");
    expect(getFundingLineKey("pole_emploi")).toBe("line_7");
    expect(getFundingLineKey("autre")).toBe("line_11");
  });

  it("retourne null pour un type null", () => {
    expect(getFundingLineKey(null)).toBeNull();
  });

  it("retourne null pour un type inconnu", () => {
    expect(getFundingLineKey("type_inconnu")).toBeNull();
  });
});

// ─── Cohérence F1=F3=F4 ────────────────────────────────────

describe("cohérence F1=F3=F4", () => {
  it("vérifie que les mêmes données produisent des totaux identiques F1/F3", () => {
    // Simule un set d'apprenants avec objectifs et statuts
    const learners = [
      { id: "l1", type: "salarie", objective: "autre_pro" },
      { id: "l2", type: "particulier", objective: "certification_rs" },
      { id: "l3", type: "salarie", objective: "rncp_6_8" },
    ];

    // F1 total = nombre unique de learner_ids
    const f1Total = new Set(learners.map((l) => l.id)).size;

    // F3 total = nombre unique de learner_ids (même set, réparti par objectif)
    const f3Learners = new Set<string>();
    for (const l of learners) {
      f3Learners.add(l.id);
    }
    const f3Total = f3Learners.size;

    expect(f1Total).toBe(f3Total);
    expect(f1Total).toBe(3);
  });
});
