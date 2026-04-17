import { describe, it, expect } from "vitest";
import type { Session } from "@/lib/types";

// Import the exported utility function
import { computeQualiopiScore } from "@/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi";

function makeFormation(overrides: Partial<Session> = {}): Session {
  return {
    id: "test-id",
    training_id: null,
    entity_id: "entity-1",
    title: "Formation Test",
    start_date: "2026-01-01",
    end_date: "2026-01-31",
    location: null,
    mode: "presentiel",
    status: "completed",
    max_participants: null,
    trainer_id: null,
    notes: null,
    type: "intra",
    domain: null,
    description: null,
    total_price: null,
    planned_hours: null,
    visio_link: null,
    manager_id: null,
    program_id: null,
    is_planned: true,
    is_completed: true,
    is_dpc: false,
    is_subcontracted: false,
    catalog_pre_registration: false,
    updated_at: "2026-01-01",
    created_at: "2026-01-01",
    formation_convention_documents: [],
    formation_evaluation_assignments: [],
    formation_satisfaction_assignments: [],
    formation_elearning_assignments: [],
    enrollments: [],
    ...overrides,
  } as Session;
}

describe("computeQualiopiScore", () => {
  it("formation sans rien → 0%", () => {
    const score = computeQualiopiScore(makeFormation());
    expect(score).toBe(0);
  });

  it("convention signee seule → score partiel", () => {
    const score = computeQualiopiScore(makeFormation({
      formation_convention_documents: [
        { id: "1", session_id: "test-id", doc_type: "convention_entreprise", owner_type: "company", owner_id: "c1", is_confirmed: true, is_sent: false, is_signed: true, requires_signature: true, created_at: "", updated_at: "" } as never,
      ],
    }));
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it("tous les items coches → score eleve", () => {
    const score = computeQualiopiScore(makeFormation({
      formation_convention_documents: [
        { id: "1", doc_type: "convention_entreprise", is_signed: true } as never,
        { id: "2", doc_type: "convocation", is_sent: true } as never,
        { id: "3", doc_type: "convention_intervention", is_signed: true } as never,
        { id: "4", doc_type: "certificat_realisation", is_sent: true } as never,
      ],
      formation_evaluation_assignments: [
        { id: "e1", evaluation_type: "eval_preformation", questionnaire_id: "q1" } as never,
        { id: "e2", evaluation_type: "eval_postformation", questionnaire_id: "q2" } as never,
      ],
      formation_satisfaction_assignments: [
        { id: "s1", questionnaire_id: "q3" } as never,
      ],
      formation_elearning_assignments: [
        { id: "el1" } as never,
      ],
    }));
    expect(score).toBeGreaterThanOrEqual(75);
  });

  it("le score est toujours entre 0 et 100", () => {
    const score = computeQualiopiScore(makeFormation());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
