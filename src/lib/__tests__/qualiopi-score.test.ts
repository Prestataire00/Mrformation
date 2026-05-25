import { describe, it, expect } from "vitest";
import type { Session } from "@/lib/types";
import {
  buildQualiopiItems,
  computeQualiopiScore,
} from "@/lib/services/qualiopi-score";

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

describe("buildQualiopiItems", () => {
  it("formation vide → 8 items, tous à false ou 0%", () => {
    const items = buildQualiopiItems(makeFormation());
    expect(items).toHaveLength(8);
    expect(items.filter(i => i.value === false)).toHaveLength(8);
  });

  it("formation sous-traitée → 10 items (8 + 2 sous-traitance)", () => {
    const items = buildQualiopiItems(makeFormation({ is_subcontracted: true }));
    expect(items).toHaveLength(10);
    expect(items.filter(i => i.category === "sous_traitance")).toHaveLength(2);
  });

  it("manualChecks fournis → l'item manuel adopte la valeur", () => {
    const items = buildQualiopiItems(
      makeFormation({ is_subcontracted: true }),
      { manualChecks: { docs_post_formation_received: true } },
    );
    const manual = items.find(i => i.id === "docs_post_formation_received");
    expect(manual?.value).toBe(true);
  });

  it("responseCounts à 0/N → auto_percent à 0%", () => {
    const items = buildQualiopiItems(makeFormation({
      formation_evaluation_assignments: [
        { id: "e1", evaluation_type: "eval_preformation", questionnaire_id: "q1" } as never,
      ],
      enrollments: [{ learner_id: "l1" } as never],
    }), {
      responseCounts: { eval_preformation: { total: 1, done: 0 } },
    });
    const item = items.find(i => i.id === "eval_preformation");
    expect(item?.type).toBe("auto_percent");
    expect(item?.percent).toBe(0);
  });

  it("responseCounts à 100% → auto_percent à 100%", () => {
    const items = buildQualiopiItems(makeFormation({
      formation_evaluation_assignments: [
        { id: "e1", evaluation_type: "eval_preformation", questionnaire_id: "q1" } as never,
      ],
      enrollments: [{ learner_id: "l1" } as never],
    }), {
      responseCounts: { eval_preformation: { total: 1, done: 1 } },
    });
    const item = items.find(i => i.id === "eval_preformation");
    expect(item?.percent).toBe(100);
  });
});

describe("computeQualiopiScore", () => {
  it("formation vide → 0%", () => {
    expect(computeQualiopiScore(makeFormation())).toBe(0);
  });

  it("convention signée seule → 1/8 ≈ 13%", () => {
    const score = computeQualiopiScore(makeFormation({
      formation_convention_documents: [
        { id: "1", doc_type: "convention_entreprise", is_signed: true } as never,
      ],
    }));
    expect(score).toBe(13);
  });

  it("tous documents OK + questionnaires 100% → 100%", () => {
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
      formation_elearning_assignments: [{ id: "el1" } as never],
      enrollments: [{ learner_id: "l1" } as never],
    }), {
      responseCounts: {
        eval_preformation: { total: 1, done: 1 },
        eval_postformation: { total: 1, done: 1 },
        satisfaction: { total: 1, done: 1 },
      },
    });
    expect(score).toBe(100);
  });

  it("le score est toujours entre 0 et 100", () => {
    const s = computeQualiopiScore(makeFormation());
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});
