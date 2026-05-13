import { describe, it, expect } from "vitest";
import {
  getCompaniesForFormation,
  isIntraFormation,
  getLearnersForCompany,
  getAmountForCompany,
  validateCompanyExport,
  getFormationKind,
} from "@/lib/utils/formation-companies";
import type { Session, Enrollment, FormationCompany, Learner } from "@/lib/types";

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

function makeLearner(id: string, last: string, first: string): Learner {
  return {
    id,
    entity_id: "ent-1",
    first_name: first,
    last_name: last,
    email: `${first}@x.fr`,
  } as unknown as Learner;
}

function makeEnrollment(id: string, learnerId: string, clientId: string | null): Enrollment {
  return {
    id,
    session_id: "sess-1",
    learner_id: learnerId,
    client_id: clientId,
    status: "confirmed",
    completion_rate: 0,
    enrolled_at: "2026-01-01T00:00:00Z",
    price_per_learner: null,
    hours_per_learner: null,
    learner: makeLearner(learnerId, `Last${learnerId}`, `First${learnerId}`),
  } as unknown as Enrollment;
}

function makeFormationCompany(id: string, clientId: string, amount: number | null, createdAt = "2026-01-01T00:00:00Z"): FormationCompany {
  return {
    id,
    session_id: "sess-1",
    client_id: clientId,
    amount,
    email: null,
    reference: null,
    created_at: createdAt,
  };
}

function makeSession(opts: {
  enrollments?: Enrollment[];
  formation_companies?: FormationCompany[];
  total_price?: number | null;
}): Session {
  return {
    id: "sess-1",
    entity_id: "ent-1",
    title: "Formation X",
    description: null,
    mode: "presentiel",
    start_date: "2026-06-01",
    end_date: "2026-06-05",
    planned_hours: 35,
    location: "Marseille",
    status: "upcoming",
    total_price: opts.total_price ?? null,
    enrollments: opts.enrollments ?? [],
    formation_companies: opts.formation_companies ?? [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as unknown as Session;
}

// ──────────────────────────────────────────────
// getCompaniesForFormation
// ──────────────────────────────────────────────

describe("getCompaniesForFormation", () => {
  it("retourne [] quand aucune entreprise", () => {
    const formation = makeSession({});
    expect(getCompaniesForFormation(formation)).toEqual([]);
  });

  it("retourne [] quand formation_companies est undefined", () => {
    const formation = { ...makeSession({}), formation_companies: undefined } as Session;
    expect(getCompaniesForFormation(formation)).toEqual([]);
  });

  it("retourne 1 entreprise quand INTRA", () => {
    const fc = makeFormationCompany("fc-1", "client-A", 1000);
    const formation = makeSession({ formation_companies: [fc] });
    expect(getCompaniesForFormation(formation)).toHaveLength(1);
  });

  it("retourne N entreprises triées par created_at quand INTER", () => {
    const fc1 = makeFormationCompany("fc-1", "client-A", 2000, "2026-01-03");
    const fc2 = makeFormationCompany("fc-2", "client-B", 3000, "2026-01-01");
    const fc3 = makeFormationCompany("fc-3", "client-C", 1000, "2026-01-02");
    const formation = makeSession({ formation_companies: [fc1, fc2, fc3] });
    const result = getCompaniesForFormation(formation);
    expect(result).toHaveLength(3);
    expect(result.map((fc) => fc.id)).toEqual(["fc-2", "fc-3", "fc-1"]);
  });
});

// ──────────────────────────────────────────────
// isIntraFormation
// ──────────────────────────────────────────────

describe("isIntraFormation", () => {
  it("false quand 0 entreprise", () => {
    expect(isIntraFormation(makeSession({}))).toBe(false);
  });

  it("true quand 1 seule entreprise", () => {
    const fc = makeFormationCompany("fc-1", "client-A", 1000);
    expect(isIntraFormation(makeSession({ formation_companies: [fc] }))).toBe(true);
  });

  it("false quand 2+ entreprises (INTER)", () => {
    const fc1 = makeFormationCompany("fc-1", "client-A", 1000);
    const fc2 = makeFormationCompany("fc-2", "client-B", 2000);
    expect(isIntraFormation(makeSession({ formation_companies: [fc1, fc2] }))).toBe(false);
  });
});

// ──────────────────────────────────────────────
// getLearnersForCompany
// ──────────────────────────────────────────────

describe("getLearnersForCompany", () => {
  it("retourne [] quand pas d'enrollments", () => {
    const fc = makeFormationCompany("fc-1", "client-A", 1000);
    const formation = makeSession({ formation_companies: [fc], enrollments: [] });
    expect(getLearnersForCompany(formation, "client-A")).toEqual([]);
  });

  it("INTRA: retourne TOUS les enrollments même si client_id est null (auto-assign virtuel)", () => {
    const fc = makeFormationCompany("fc-1", "client-A", 1000);
    const e1 = makeEnrollment("e-1", "learner-1", null);
    const e2 = makeEnrollment("e-2", "learner-2", "client-A");
    const e3 = makeEnrollment("e-3", "learner-3", null);
    const formation = makeSession({ formation_companies: [fc], enrollments: [e1, e2, e3] });
    const result = getLearnersForCompany(formation, "client-A");
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.id)).toEqual(["e-1", "e-2", "e-3"]);
  });

  it("INTER: filtre strictement par client_id", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", 1000);
    const fcB = makeFormationCompany("fc-2", "client-B", 2000);
    const e1 = makeEnrollment("e-1", "learner-1", "client-A");
    const e2 = makeEnrollment("e-2", "learner-2", "client-B");
    const e3 = makeEnrollment("e-3", "learner-3", "client-A");
    const e4 = makeEnrollment("e-4", "learner-4", null);
    const formation = makeSession({ formation_companies: [fcA, fcB], enrollments: [e1, e2, e3, e4] });

    const aLearners = getLearnersForCompany(formation, "client-A");
    expect(aLearners.map((e) => e.id)).toEqual(["e-1", "e-3"]);

    const bLearners = getLearnersForCompany(formation, "client-B");
    expect(bLearners.map((e) => e.id)).toEqual(["e-2"]);
  });

  it("INTER: companyId inconnue → retourne []", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", 1000);
    const fcB = makeFormationCompany("fc-2", "client-B", 2000);
    const e1 = makeEnrollment("e-1", "learner-1", "client-A");
    const formation = makeSession({ formation_companies: [fcA, fcB], enrollments: [e1] });
    expect(getLearnersForCompany(formation, "client-Z")).toEqual([]);
  });
});

// ──────────────────────────────────────────────
// getAmountForCompany
// ──────────────────────────────────────────────

describe("getAmountForCompany", () => {
  it("retourne le montant trouvé", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", 1500);
    const fcB = makeFormationCompany("fc-2", "client-B", 2500);
    const formation = makeSession({ formation_companies: [fcA, fcB] });
    expect(getAmountForCompany(formation, "client-A")).toBe(1500);
    expect(getAmountForCompany(formation, "client-B")).toBe(2500);
  });

  it("retourne null si amount === null", () => {
    const fc = makeFormationCompany("fc-1", "client-A", null);
    const formation = makeSession({ formation_companies: [fc] });
    expect(getAmountForCompany(formation, "client-A")).toBeNull();
  });

  it("retourne null si amount === 0 (considéré comme manquant)", () => {
    const fc = makeFormationCompany("fc-1", "client-A", 0);
    const formation = makeSession({ formation_companies: [fc] });
    expect(getAmountForCompany(formation, "client-A")).toBeNull();
  });

  it("retourne null si companyId inconnue", () => {
    const fc = makeFormationCompany("fc-1", "client-A", 1000);
    const formation = makeSession({ formation_companies: [fc] });
    expect(getAmountForCompany(formation, "client-Z")).toBeNull();
  });
});

// ──────────────────────────────────────────────
// validateCompanyExport
// ──────────────────────────────────────────────

describe("validateCompanyExport", () => {
  it("INTRA: OK même si enrollments ont client_id null (auto-assign)", () => {
    const fc = makeFormationCompany("fc-1", "client-A", 1000);
    const e1 = makeEnrollment("e-1", "l-1", null);
    const e2 = makeEnrollment("e-2", "l-2", null);
    const formation = makeSession({ formation_companies: [fc], enrollments: [e1, e2] });
    expect(validateCompanyExport(formation, "client-A")).toEqual({ ok: true });
  });

  it("INTRA: KO si amount manquant", () => {
    const fc = makeFormationCompany("fc-1", "client-A", null);
    const formation = makeSession({ formation_companies: [fc], enrollments: [] });
    const result = validateCompanyExport(formation, "client-A");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/montant/i);
  });

  it("INTER: KO si ≥1 enrollment a client_id null", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", 1000);
    const fcB = makeFormationCompany("fc-2", "client-B", 2000);
    const e1 = makeEnrollment("e-1", "l-1", "client-A");
    const e2 = makeEnrollment("e-2", "l-2", null);
    const formation = makeSession({ formation_companies: [fcA, fcB], enrollments: [e1, e2] });
    const result = validateCompanyExport(formation, "client-A");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/rattach/i);
  });

  it("INTER: KO si amount manquant pour cette entreprise", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", null);
    const fcB = makeFormationCompany("fc-2", "client-B", 2000);
    const e1 = makeEnrollment("e-1", "l-1", "client-A");
    const e2 = makeEnrollment("e-2", "l-2", "client-B");
    const formation = makeSession({ formation_companies: [fcA, fcB], enrollments: [e1, e2] });
    const result = validateCompanyExport(formation, "client-A");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/montant/i);
  });

  it("INTER: OK quand tous les enrollments ont client_id et amount défini", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", 1000);
    const fcB = makeFormationCompany("fc-2", "client-B", 2000);
    const e1 = makeEnrollment("e-1", "l-1", "client-A");
    const e2 = makeEnrollment("e-2", "l-2", "client-B");
    const formation = makeSession({ formation_companies: [fcA, fcB], enrollments: [e1, e2] });
    expect(validateCompanyExport(formation, "client-A")).toEqual({ ok: true });
    expect(validateCompanyExport(formation, "client-B")).toEqual({ ok: true });
  });

  it("KO si companyId inconnue", () => {
    const fc = makeFormationCompany("fc-1", "client-A", 1000);
    const formation = makeSession({ formation_companies: [fc], enrollments: [] });
    const result = validateCompanyExport(formation, "client-Z");
    expect(result.ok).toBe(false);
  });
});

// ──────────────────────────────────────────────
// getFormationKind
// ──────────────────────────────────────────────

describe("getFormationKind", () => {
  it("retourne 'unset' quand aucune entreprise rattachée", () => {
    const formation = { id: "s1", formation_companies: [] } as unknown as Session;
    expect(getFormationKind(formation)).toBe("unset");
  });

  it("retourne 'unset' quand formation_companies est undefined", () => {
    const formation = { id: "s1" } as unknown as Session;
    expect(getFormationKind(formation)).toBe("unset");
  });

  it("retourne 'intra' quand exactement 1 entreprise rattachée", () => {
    const formation = {
      id: "s1",
      formation_companies: [{ client_id: "c1", session_id: "s1", amount: 1000 }],
    } as unknown as Session;
    expect(getFormationKind(formation)).toBe("intra");
  });

  it("retourne 'inter' quand 2+ entreprises rattachées", () => {
    const formation = {
      id: "s1",
      formation_companies: [
        { client_id: "c1", session_id: "s1", amount: 1000 },
        { client_id: "c2", session_id: "s1", amount: 500 },
        { client_id: "c3", session_id: "s1", amount: 200 },
      ],
    } as unknown as Session;
    expect(getFormationKind(formation)).toBe("inter");
  });
});
