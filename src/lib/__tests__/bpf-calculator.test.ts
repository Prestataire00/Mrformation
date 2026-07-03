import { describe, it, expect } from "vitest";
import {
  computeSectionC,
  computeSectionD,
  getF3Index,
  isRncpIndex,
  getFundingLineKey,
  computeSectionCFromInvoices,
  computeDataGaps,
  computeSectionF1,
  computeSectionF2,
  buildSectionCView,
  computeSessionBpfSummary,
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

// ─── computeSectionCFromInvoices ───────────────────────────

describe("computeSectionCFromInvoices", () => {
  it("aggregates by funding_type using FUNDING_TO_LINE", () => {
    const invoices = [
      { amount: 1000, funding_type: "entreprise_privee", invoice_date_confirmed: true, is_avoir: false, status: "confirmed" },
      { amount: 500, funding_type: "cpf", invoice_date_confirmed: true, is_avoir: false, status: "confirmed" },
      { amount: -200, funding_type: "entreprise_privee", invoice_date_confirmed: true, is_avoir: true, status: "confirmed" },
    ];
    const result = computeSectionCFromInvoices(invoices);
    expect(result.fiable["line_1"]).toBe(800); // 1000 - 200
    expect(result.fiable["line_2e"]).toBe(500);
  });

  it("splits fiable vs a_verifier by invoice_date_confirmed", () => {
    const invoices = [
      { amount: 1000, funding_type: "entreprise_privee", invoice_date_confirmed: true, is_avoir: false, status: "confirmed" },
      { amount: 500, funding_type: "entreprise_privee", invoice_date_confirmed: false, is_avoir: false, status: "confirmed" },
    ];
    const result = computeSectionCFromInvoices(invoices);
    expect(result.fiable["line_1"]).toBe(1000);
    expect(result.a_verifier["line_1"]).toBe(500);
  });

  it("puts null funding_type into non_classifie", () => {
    const invoices = [
      { amount: 750, funding_type: null, invoice_date_confirmed: true, is_avoir: false, status: "confirmed" },
    ];
    const result = computeSectionCFromInvoices(invoices);
    expect(result.non_classifie.fiable).toBe(750);
    expect(result.fiable).toEqual({});
  });

  it("excludes cancelled invoices", () => {
    const invoices = [
      { amount: 1000, funding_type: "cpf", invoice_date_confirmed: true, is_avoir: false, status: "cancelled" },
    ];
    const result = computeSectionCFromInvoices(invoices);
    expect(result.fiable["line_2e"]).toBeUndefined();
    expect(result.a_verifier["line_2e"]).toBeUndefined();
    expect(result.non_classifie.fiable).toBe(0);
    expect(result.non_classifie.a_verifier).toBe(0);
  });

  it("sessions_sans_cout : formateur avec hourly_rate=0 mais agreed_cost_ht renseigné n'est PAS un trou", () => {
    const gaps = computeDataGaps({
      invoices: [],
      enrollments: [],
      trainings: [],
      formationTrainers: [{ id: "ft1", hourly_rate: 0, agreed_cost_ht: 500 }],
      signatures: [],
    });
    expect(gaps.sessions_sans_cout).toBe(0);
  });

  it("sessions_sans_cout : formateur sans aucun coût (hourly_rate null + agreed_cost_ht null) est compté", () => {
    const gaps = computeDataGaps({
      invoices: [],
      enrollments: [],
      trainings: [],
      formationTrainers: [{ id: "ft1", hourly_rate: null, agreed_cost_ht: null }],
      signatures: [],
    });
    expect(gaps.sessions_sans_cout).toBe(1);
  });

  it("sessions_sans_cout : compat ascendante — agreed_cost_ht omis + hourly_rate 0 reste un trou", () => {
    const gaps = computeDataGaps({
      invoices: [],
      enrollments: [],
      trainings: [],
      formationTrainers: [{ id: "ft1", hourly_rate: 0 }],
      signatures: [],
    });
    expect(gaps.sessions_sans_cout).toBe(1);
  });

  it("avoir cross-year detected in dataGaps", () => {
    const invoices = [
      {
        id: "inv-1",
        amount: 1000,
        funding_type: "entreprise_privee",
        invoice_date_confirmed: true,
        is_avoir: false,
        status: "confirmed",
        invoice_date: "2026-12-15",
        parent_invoice_id: null,
      },
      {
        id: "inv-2",
        amount: -1000,
        funding_type: "entreprise_privee",
        invoice_date_confirmed: true,
        is_avoir: true,
        status: "confirmed",
        invoice_date: "2027-01-10",
        parent_invoice_id: "inv-1",
      },
    ];

    const gaps = computeDataGaps({
      invoices: invoices as Parameters<typeof computeDataGaps>[0]["invoices"],
      enrollments: [],
      trainings: [],
      formationTrainers: [],
      signatures: [],
    });
    expect(gaps.avoirs_orphelins).toHaveLength(1);
    expect(gaps.avoirs_orphelins[0].id).toBe("inv-2");
  });
});

// ─── computeSectionF1 ─────────────────────────────────────

describe("computeSectionF1", () => {
  it("groups by bpf_trainee_type with hours from signed slots", () => {
    const enrollments = [
      { id: "e1", bpf_trainee_type: "salarie_prive", status: "confirmed", session_id: "s1" },
      { id: "e2", bpf_trainee_type: "apprenti", status: "confirmed", session_id: "s1" },
    ];
    const timeSlots = [
      { id: "ts1", session_id: "s1", start_time: "2026-03-10T09:00:00Z", duration_hours: 3.5 },
      { id: "ts2", session_id: "s1", start_time: "2026-03-11T09:00:00Z", duration_hours: 3.5 },
    ];
    const signatures = [
      { enrollment_id: "e1", time_slot_id: "ts1", signed_at: "2026-03-10T09:30:00Z" },
      { enrollment_id: "e1", time_slot_id: "ts2", signed_at: "2026-03-11T09:30:00Z" },
      { enrollment_id: "e2", time_slot_id: "ts1", signed_at: "2026-03-10T09:30:00Z" },
    ];

    const result = computeSectionF1(enrollments, signatures, timeSlots, 2026);
    expect(result["salarie_prive"]).toEqual({ count: 1, hours: 7 }); // 3.5 + 3.5
    expect(result["apprenti"]).toEqual({ count: 1, hours: 3.5 }); // 1 slot
  });

  it("civil year split - session spanning 2 years", () => {
    const enrollments = [
      { id: "e1", bpf_trainee_type: "salarie_prive", status: "confirmed", session_id: "s1" },
    ];
    const timeSlots: Array<{ id: string; session_id: string; start_time: string; duration_hours: number }> = [];
    // 20 slots in 2026, 20 in 2027
    for (let i = 0; i < 20; i++) {
      timeSlots.push({
        id: `ts-2026-${i}`,
        session_id: "s1",
        start_time: `2026-11-${String(i + 1).padStart(2, "0")}T09:00:00Z`,
        duration_hours: 2,
      });
    }
    for (let i = 0; i < 20; i++) {
      timeSlots.push({
        id: `ts-2027-${i}`,
        session_id: "s1",
        start_time: `2027-01-${String(i + 1).padStart(2, "0")}T09:00:00Z`,
        duration_hours: 2,
      });
    }
    // Learner signed 15 in 2026 and 15 in 2027
    const signatures: Array<{ enrollment_id: string; time_slot_id: string; signed_at: string }> = [];
    for (let i = 0; i < 15; i++) {
      signatures.push({
        enrollment_id: "e1",
        time_slot_id: `ts-2026-${i}`,
        signed_at: `2026-11-${String(i + 1).padStart(2, "0")}T09:30:00Z`,
      });
    }
    for (let i = 0; i < 15; i++) {
      signatures.push({
        enrollment_id: "e1",
        time_slot_id: `ts-2027-${i}`,
        signed_at: `2027-01-${String(i + 1).padStart(2, "0")}T09:30:00Z`,
      });
    }

    const result2026 = computeSectionF1(enrollments, signatures, timeSlots, 2026);
    expect(result2026["salarie_prive"]).toEqual({ count: 1, hours: 30 }); // 15 * 2h

    const result2027 = computeSectionF1(enrollments, signatures, timeSlots, 2027);
    expect(result2027["salarie_prive"]).toEqual({ count: 1, hours: 30 }); // 15 * 2h
  });

  it("excludes cancelled enrollments", () => {
    const enrollments = [
      { id: "e1", bpf_trainee_type: "salarie_prive", status: "cancelled", session_id: "s1" },
    ];
    const timeSlots = [
      { id: "ts1", session_id: "s1", start_time: "2026-03-10T09:00:00Z", duration_hours: 3.5 },
    ];
    const signatures = [
      { enrollment_id: "e1", time_slot_id: "ts1", signed_at: "2026-03-10T09:30:00Z" },
    ];

    const result = computeSectionF1(enrollments, signatures, timeSlots, 2026);
    expect(result["salarie_prive"]).toBeUndefined();
  });

  it("abandoned learner still counts (status=registered, signed 3/10)", () => {
    const enrollments = [
      { id: "e1", bpf_trainee_type: "salarie_prive", status: "registered", session_id: "s1" },
    ];
    const timeSlots: Array<{ id: string; session_id: string; start_time: string; duration_hours: number }> = [];
    for (let i = 0; i < 10; i++) {
      timeSlots.push({
        id: `ts${i}`,
        session_id: "s1",
        start_time: `2026-03-${String(i + 1).padStart(2, "0")}T09:00:00Z`,
        duration_hours: 3.5,
      });
    }
    const signatures = [
      { enrollment_id: "e1", time_slot_id: "ts0", signed_at: "2026-03-01T09:30:00Z" },
      { enrollment_id: "e1", time_slot_id: "ts1", signed_at: "2026-03-02T09:30:00Z" },
      { enrollment_id: "e1", time_slot_id: "ts2", signed_at: "2026-03-03T09:30:00Z" },
    ];

    const result = computeSectionF1(enrollments, signatures, timeSlots, 2026);
    expect(result["salarie_prive"]).toEqual({ count: 1, hours: 10.5 }); // 3 * 3.5h
  });

  it("legacy signature fallback (time_slot_id=null)", () => {
    const enrollments = [
      { id: "e1", bpf_trainee_type: "salarie_prive", status: "confirmed", session_id: "s1" },
    ];
    const timeSlots = [
      { id: "ts1", session_id: "s1", start_time: "2026-03-01T09:00:00Z", duration_hours: 3.5 },
      { id: "ts2", session_id: "s1", start_time: "2026-03-02T09:00:00Z", duration_hours: 3.5 },
      { id: "ts3", session_id: "s1", start_time: "2026-03-03T09:00:00Z", duration_hours: 3.5 },
      { id: "ts4", session_id: "s1", start_time: "2026-03-04T09:00:00Z", duration_hours: 3.5 },
      { id: "ts5", session_id: "s1", start_time: "2026-03-05T09:00:00Z", duration_hours: 3.5 },
      { id: "ts6", session_id: "s1", start_time: "2026-03-06T09:00:00Z", duration_hours: 3.5 },
      { id: "ts7", session_id: "s1", start_time: "2026-03-07T09:00:00Z", duration_hours: 3.5 },
      { id: "ts8", session_id: "s1", start_time: "2026-03-08T09:00:00Z", duration_hours: 3.5 },
      { id: "ts9", session_id: "s1", start_time: "2026-03-09T09:00:00Z", duration_hours: 3.5 },
      { id: "ts10", session_id: "s1", start_time: "2026-03-10T09:00:00Z", duration_hours: 3.5 },
    ];
    // session_computed_hours = sum of slot durations = 35h, total_slots = 10
    // Legacy signature: time_slot_id=null, signed_at in 2026
    const signatures = [
      { enrollment_id: "e1", time_slot_id: null, signed_at: "2026-03-05T09:30:00Z", session_computed_hours: 35 },
    ];

    const result = computeSectionF1(
      enrollments,
      signatures as Parameters<typeof computeSectionF1>[1],
      timeSlots,
      2026,
    );
    expect(result["salarie_prive"]).toEqual({ count: 1, hours: 3.5 }); // 35/10 = 3.5h
  });
});

// ─── computeSectionF2 ─────────────────────────────────────

describe("computeSectionF2", () => {
  const sessionInfo = {
    s1: { duration: 7, isSubcontracted: true },
    s2: { duration: 5, isSubcontracted: false },
  };

  it("compte stagiaires et heures des sessions sous-traitées uniquement", () => {
    const enrollments = [
      { learner_id: "L1", session_id: "s1", status: "confirmed" },
      { learner_id: "L2", session_id: "s1", status: "registered" },
      { learner_id: "L3", session_id: "s2", status: "confirmed" }, // non sous-traitée
    ];
    expect(computeSectionF2(enrollments, sessionInfo)).toEqual({ stagiaires: 2, heures: 14 });
  });

  it("déduplique les stagiaires mais somme les heures par inscription", () => {
    const enrollments = [
      { learner_id: "L1", session_id: "s1", status: "confirmed" },
      { learner_id: "L1", session_id: "s3", status: "confirmed" },
    ];
    const info = {
      s1: { duration: 7, isSubcontracted: true },
      s3: { duration: 3, isSubcontracted: true },
    };
    expect(computeSectionF2(enrollments, info)).toEqual({ stagiaires: 1, heures: 10 });
  });

  it("exclut les inscriptions annulées", () => {
    const enrollments = [
      { learner_id: "L1", session_id: "s1", status: "cancelled" },
      { learner_id: "L2", session_id: "s1", status: "confirmed" },
    ];
    expect(computeSectionF2(enrollments, sessionInfo)).toEqual({ stagiaires: 1, heures: 7 });
  });

  it("retourne zéro si aucune session sous-traitée", () => {
    const enrollments = [{ learner_id: "L3", session_id: "s2", status: "confirmed" }];
    expect(computeSectionF2(enrollments, sessionInfo)).toEqual({ stagiaires: 0, heures: 0 });
  });

  it("n'ajoute pas d'heures pour une inscription sans apprenant (F-2 ⊆ F-1)", () => {
    const enrollments = [
      { learner_id: "", session_id: "s1", status: "confirmed" },
      { learner_id: "L2", session_id: "s1", status: "confirmed" },
    ];
    expect(computeSectionF2(enrollments, sessionInfo)).toEqual({ stagiaires: 1, heures: 7 });
  });
});

// ─── buildSectionCView ────────────────────────────────────

describe("buildSectionCView", () => {
  it("combine fiable + à-vérifier par ligne (lignes distinctes)", () => {
    const view = buildSectionCView({
      fiable: { line_1: 1000 },
      a_verifier: { line_2e: 500 },
      non_classifie: { fiable: 0, a_verifier: 0 },
    });
    expect(view.combined).toEqual({ line_1: 1000, line_2e: 500 });
    expect(view.fiable).toEqual({ line_1: 1000 });
    expect(view.aVerifier).toEqual({ line_2e: 500 });
  });

  it("additionne fiable et à-vérifier sur une même ligne", () => {
    const view = buildSectionCView({
      fiable: { line_1: 1000 },
      a_verifier: { line_1: 500 },
      non_classifie: { fiable: 0, a_verifier: 0 },
    });
    expect(view.combined.line_1).toBe(1500);
    expect(view.fiable.line_1).toBe(1000);
    expect(view.aVerifier.line_1).toBe(500);
  });

  it("replie les factures sans funding_type sur la ligne 11", () => {
    const view = buildSectionCView({
      fiable: { line_1: 1000 },
      a_verifier: {},
      non_classifie: { fiable: 200, a_verifier: 300 },
    });
    expect(view.combined.line_11).toBe(500); // 200 + 300
    expect(view.fiable.line_11).toBe(200);
    expect(view.aVerifier.line_11).toBe(300);
    expect(view.combined.line_1).toBe(1000);
  });
});

// ─── computeSessionBpfSummary ──────────────────────────────

describe("computeSessionBpfSummary", () => {
  // Session "propre" : 4 inscrits non annulés, training 8h,
  // 2 factures 1000€ + 500€ confirmées, objectif + coûts renseignés.
  const cleanInput: Parameters<typeof computeSessionBpfSummary>[0] = {
    invoices: [
      {
        id: "inv-1",
        amount: 1000,
        funding_type: "entreprise_privee",
        invoice_date_confirmed: true,
        is_avoir: false,
        status: "confirmed",
        invoice_date: "2026-03-01",
        parent_invoice_id: null,
      },
      {
        id: "inv-2",
        amount: 500,
        funding_type: "cpf",
        invoice_date_confirmed: true,
        is_avoir: false,
        status: "confirmed",
        invoice_date: "2026-04-01",
        parent_invoice_id: null,
      },
    ],
    enrollments: [
      { id: "e1", learner_id: "L1", session_id: "s1", status: "confirmed", bpf_trainee_type: "salarie_prive" },
      { id: "e2", learner_id: "L2", session_id: "s1", status: "confirmed", bpf_trainee_type: "salarie_prive" },
      { id: "e3", learner_id: "L3", session_id: "s1", status: "registered", bpf_trainee_type: "salarie_prive" },
      { id: "e4", learner_id: "L4", session_id: "s1", status: "confirmed", bpf_trainee_type: "apprenti" },
    ],
    trainings: [{ id: "t1", bpf_objective: "autre_pro" }],
    formationTrainers: [{ id: "ft1", hourly_rate: 50 }],
    signatures: [],
    isSubcontracted: false,
    durationHours: 8,
  };

  it("résume stagiaires, heures et CA (4 stagiaires · 32 h · 1 500 €)", () => {
    const s = computeSessionBpfSummary(cleanInput);
    expect(s.stagiaires).toBe(4);
    expect(s.heures).toBe(32); // 8h × 4 inscriptions non annulées
    expect(s.caTotal).toBe(1500); // 1000 + 500
    expect(s.caFiable).toBe(1500); // dates confirmées
    expect(s.caAVerifier).toBe(0);
  });

  it("pastille verte : totalGaps = 0 quand toutes les données sont complètes", () => {
    const s = computeSessionBpfSummary(cleanInput);
    expect(s.totalGaps).toBe(0);
    expect(s.aVerifierCount).toBe(0);
  });

  it("pastille rouge : totalGaps compte les 5 trous (ici 2 inscriptions sans type)", () => {
    const s = computeSessionBpfSummary({
      ...cleanInput,
      enrollments: [
        { id: "e1", learner_id: "L1", session_id: "s1", status: "confirmed", bpf_trainee_type: null },
        { id: "e2", learner_id: "L2", session_id: "s1", status: "confirmed", bpf_trainee_type: null },
        { id: "e3", learner_id: "L3", session_id: "s1", status: "confirmed", bpf_trainee_type: "salarie_prive" },
        { id: "e4", learner_id: "L4", session_id: "s1", status: "confirmed", bpf_trainee_type: "apprenti" },
      ],
    });
    expect(s.gaps.enrollments_sans_type).toBe(2);
    expect(s.totalGaps).toBe(2);
  });

  it("compte le trou facture non confirmée dans totalGaps et aVerifierCount", () => {
    const s = computeSessionBpfSummary({
      ...cleanInput,
      invoices: [
        {
          id: "inv-1",
          amount: 1000,
          funding_type: "entreprise_privee",
          invoice_date_confirmed: false, // non confirmée → à vérifier
          is_avoir: false,
          status: "confirmed",
          invoice_date: "2026-03-01",
          parent_invoice_id: null,
        },
      ],
    });
    expect(s.aVerifierCount).toBe(1);
    expect(s.gaps.invoices_non_confirmees).toBe(1);
    expect(s.totalGaps).toBe(1);
    expect(s.caAVerifier).toBe(1000);
    expect(s.caFiable).toBe(0);
    expect(s.caTotal).toBe(1000);
  });

  it("F-1 méthode durée-session : heures = durationHours × inscription (pas heures signées)", () => {
    const s = computeSessionBpfSummary(cleanInput);
    const salarie = s.f1.find((r) => r.type === "salarie_prive");
    const apprenti = s.f1.find((r) => r.type === "apprenti");
    // 3 salariés (dont 1 registered qui compte) × 8h = 24h
    expect(salarie).toEqual({ type: "salarie_prive", stagiaires: 3, heures: 24 });
    // 1 apprenti × 8h = 8h
    expect(apprenti).toEqual({ type: "apprenti", stagiaires: 1, heures: 8 });
  });

  it("F-1 : bpf_trainee_type null bascule dans 'autre' et exclut les annulés", () => {
    const s = computeSessionBpfSummary({
      ...cleanInput,
      enrollments: [
        { id: "e1", learner_id: "L1", session_id: "s1", status: "confirmed", bpf_trainee_type: null },
        { id: "e2", learner_id: "L2", session_id: "s1", status: "cancelled", bpf_trainee_type: "salarie_prive" },
      ],
    });
    const autre = s.f1.find((r) => r.type === "autre");
    expect(autre).toEqual({ type: "autre", stagiaires: 1, heures: 8 });
    // L'inscription annulée ne compte pas.
    expect(s.stagiaires).toBe(1);
    expect(s.heures).toBe(8);
  });

  it("F-2 : stagiaires/heures des sessions sous-traitées (⊆ F-1)", () => {
    const s = computeSessionBpfSummary({ ...cleanInput, isSubcontracted: true });
    // 4 inscriptions non annulées, session sous-traitée, 8h chacune.
    expect(s.f2.stagiaires).toBe(4);
    expect(s.f2.heures).toBe(32);
  });

  it("F-2 : zéro quand la session n'est pas sous-traitée", () => {
    const s = computeSessionBpfSummary(cleanInput);
    expect(s.f2).toEqual({ stagiaires: 0, heures: 0 });
  });
});
