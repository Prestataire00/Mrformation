import { describe, it, expect } from "vitest";
import {
  buildInvoiceLinesForCompany,
  calculateInvoiceTotals,
} from "@/lib/utils/invoice-builder";
import type { Session, Enrollment, FormationCompany, Learner } from "@/lib/types";

// ──────────────────────────────────────────────
// Fixtures (équivalent à formation-companies.test.ts)
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

function makeEnrollment(id: string, learnerId: string, clientId: string | null, lastName: string, firstName: string): Enrollment {
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
    learner: makeLearner(learnerId, lastName, firstName),
  } as unknown as Enrollment;
}

function makeFormationCompany(id: string, clientId: string, amount: number | null): FormationCompany {
  return {
    id,
    session_id: "sess-1",
    client_id: clientId,
    amount,
    email: null,
    reference: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function makeSession(opts: {
  title?: string;
  enrollments?: Enrollment[];
  formation_companies?: FormationCompany[];
}): Session {
  return {
    id: "sess-1",
    entity_id: "ent-1",
    title: opts.title ?? "Formation X",
    description: null,
    mode: "presentiel",
    start_date: "2026-06-01",
    end_date: "2026-06-05",
    planned_hours: 35,
    location: "Marseille",
    status: "upcoming",
    total_price: null,
    enrollments: opts.enrollments ?? [],
    formation_companies: opts.formation_companies ?? [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as unknown as Session;
}

// ──────────────────────────────────────────────
// buildInvoiceLinesForCompany — INTRA
// ──────────────────────────────────────────────

describe("buildInvoiceLinesForCompany — INTRA", () => {
  it("INTRA: 1 ligne globale + participantsNote avec liste apprenants", () => {
    const fc = makeFormationCompany("fc-1", "client-A", 5000);
    const enrollments = [
      makeEnrollment("e-1", "l-1", "client-A", "Dupont", "Jean"),
      makeEnrollment("e-2", "l-2", "client-A", "Martin", "Marie"),
      makeEnrollment("e-3", "l-3", null, "Durand", "Paul"),
    ];
    const formation = makeSession({ title: "Sécurité", formation_companies: [fc], enrollments });

    const result = buildInvoiceLinesForCompany(formation, "client-A");

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toEqual({
      description: "Formation : Sécurité",
      quantity: 1,
      unit_price: 5000,
    });
    expect(result.amountHT).toBe(5000);
    expect(result.participantsNote).toBe("Participants : DUPONT Jean, MARTIN Marie, DURAND Paul");
  });

  it("INTRA sans apprenants: 1 ligne globale + participantsNote null", () => {
    const fc = makeFormationCompany("fc-1", "client-A", 1000);
    const formation = makeSession({ formation_companies: [fc], enrollments: [] });
    const result = buildInvoiceLinesForCompany(formation, "client-A");
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].unit_price).toBe(1000);
    expect(result.participantsNote).toBeNull();
  });
});

// ──────────────────────────────────────────────
// buildInvoiceLinesForCompany — INTER
// ──────────────────────────────────────────────

describe("buildInvoiceLinesForCompany — INTER", () => {
  it("INTER 3 apprenants 3000€: 3 lignes 1000€ chacune, pas de participantsNote", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", 3000);
    const fcB = makeFormationCompany("fc-2", "client-B", 5000);
    const enrollments = [
      makeEnrollment("e-1", "l-1", "client-A", "Dupont", "Jean"),
      makeEnrollment("e-2", "l-2", "client-A", "Martin", "Marie"),
      makeEnrollment("e-3", "l-3", "client-A", "Durand", "Paul"),
      makeEnrollment("e-4", "l-4", "client-B", "Other", "Emma"),
    ];
    const formation = makeSession({ title: "Sécurité", formation_companies: [fcA, fcB], enrollments });

    const result = buildInvoiceLinesForCompany(formation, "client-A");

    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]).toEqual({
      description: "Formation : Sécurité — DUPONT Jean",
      quantity: 1,
      unit_price: 1000,
    });
    expect(result.lines[1].description).toBe("Formation : Sécurité — MARTIN Marie");
    expect(result.lines[2].description).toBe("Formation : Sécurité — DURAND Paul");
    expect(result.amountHT).toBe(3000);
    expect(result.participantsNote).toBeNull();
  });

  it("INTER 1 apprenant: 1 ligne avec unit_price = amount (split de 1)", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", 1000);
    const fcB = makeFormationCompany("fc-2", "client-B", 2000);
    const enrollments = [
      makeEnrollment("e-1", "l-1", "client-A", "Solo", "Alice"),
      makeEnrollment("e-2", "l-2", "client-B", "Other", "Bob"),
    ];
    const formation = makeSession({ formation_companies: [fcA, fcB], enrollments });

    const result = buildInvoiceLinesForCompany(formation, "client-A");
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].unit_price).toBe(1000);
    expect(result.amountHT).toBe(1000);
  });

  it("INTER avec arrondi: 1000€ / 3 apprenants = 333.33€ par ligne", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", 1000);
    const fcB = makeFormationCompany("fc-2", "client-B", 500);
    const enrollments = [
      makeEnrollment("e-1", "l-1", "client-A", "A", "A"),
      makeEnrollment("e-2", "l-2", "client-A", "B", "B"),
      makeEnrollment("e-3", "l-3", "client-A", "C", "C"),
      makeEnrollment("e-4", "l-4", "client-B", "X", "X"),
    ];
    const formation = makeSession({ formation_companies: [fcA, fcB], enrollments });

    const result = buildInvoiceLinesForCompany(formation, "client-A");
    expect(result.lines).toHaveLength(3);
    // Split équitable arrondi à 2 décimales : 333.33 + 333.33 + 333.34 = 1000.00
    const total = result.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    expect(total).toBeCloseTo(1000, 2);
    expect(result.amountHT).toBeCloseTo(1000, 2);
  });
});

// ──────────────────────────────────────────────
// buildInvoiceLinesForCompany — Erreurs
// ──────────────────────────────────────────────

describe("buildInvoiceLinesForCompany — Erreurs", () => {
  it("amount manquant (NULL) → throw avec message clair", () => {
    const fc = makeFormationCompany("fc-1", "client-A", null);
    const formation = makeSession({ formation_companies: [fc], enrollments: [] });
    expect(() => buildInvoiceLinesForCompany(formation, "client-A")).toThrow(/montant/i);
  });

  it("companyId inconnue → throw", () => {
    const fc = makeFormationCompany("fc-1", "client-A", 1000);
    const formation = makeSession({ formation_companies: [fc] });
    expect(() => buildInvoiceLinesForCompany(formation, "client-Z")).toThrow();
  });

  it("INTER avec 0 apprenants pour cette entreprise → throw (sécurité)", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", 1000);
    const fcB = makeFormationCompany("fc-2", "client-B", 2000);
    const enrollments = [makeEnrollment("e-1", "l-1", "client-B", "X", "X")];
    const formation = makeSession({ formation_companies: [fcA, fcB], enrollments });
    expect(() => buildInvoiceLinesForCompany(formation, "client-A")).toThrow(/apprenant/i);
  });
});

// ──────────────────────────────────────────────
// calculateInvoiceTotals
// ──────────────────────────────────────────────

describe("calculateInvoiceTotals", () => {
  it("exempt=true: TVA = 0, TTC = HT", () => {
    const lines = [{ description: "X", quantity: 1, unit_price: 1000 }];
    const result = calculateInvoiceTotals(lines, 20, true);
    expect(result).toEqual({ amountHT: 1000, vatAmount: 0, amountTTC: 1000 });
  });

  it("exempt=false, rate=20%, HT 1000€ → TVA 200€, TTC 1200€", () => {
    const lines = [{ description: "X", quantity: 1, unit_price: 1000 }];
    const result = calculateInvoiceTotals(lines, 20, false);
    expect(result).toEqual({ amountHT: 1000, vatAmount: 200, amountTTC: 1200 });
  });

  it("multi-lignes: 3 lignes 500€ + qty=2 → HT 1500, TVA 300, TTC 1800", () => {
    const lines = [
      { description: "L1", quantity: 1, unit_price: 500 },
      { description: "L2", quantity: 1, unit_price: 500 },
      { description: "L3", quantity: 2, unit_price: 250 },
    ];
    const result = calculateInvoiceTotals(lines, 20, false);
    expect(result).toEqual({ amountHT: 1500, vatAmount: 300, amountTTC: 1800 });
  });

  it("rate 5.5% (taux réduit), HT 1000€ → TVA 55€", () => {
    const lines = [{ description: "X", quantity: 1, unit_price: 1000 }];
    const result = calculateInvoiceTotals(lines, 5.5, false);
    expect(result.vatAmount).toBeCloseTo(55, 2);
    expect(result.amountTTC).toBeCloseTo(1055, 2);
  });

  it("lines vide: 0 / 0 / 0", () => {
    const result = calculateInvoiceTotals([], 20, false);
    expect(result).toEqual({ amountHT: 0, vatAmount: 0, amountTTC: 0 });
  });

  it("arrondi à 2 décimales: HT 333.33 × 3 + TVA 20% = 1000.00 / 200.00 / 1200.00", () => {
    const lines = [
      { description: "L1", quantity: 1, unit_price: 333.33 },
      { description: "L2", quantity: 1, unit_price: 333.33 },
      { description: "L3", quantity: 1, unit_price: 333.34 },
    ];
    const result = calculateInvoiceTotals(lines, 20, false);
    expect(result.amountHT).toBeCloseTo(1000, 2);
    expect(result.vatAmount).toBeCloseTo(200, 2);
    expect(result.amountTTC).toBeCloseTo(1200, 2);
  });

  it("isExempt=true override le rate (rate=20 mais exempt → TVA 0)", () => {
    const lines = [{ description: "X", quantity: 1, unit_price: 100 }];
    const result = calculateInvoiceTotals(lines, 20, true);
    expect(result.vatAmount).toBe(0);
    expect(result.amountTTC).toBe(100);
  });
});
