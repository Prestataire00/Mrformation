import { describe, it, expect } from "vitest";
import { computeStageStats, computeLearnerStatuses } from "@/lib/utils/questionnaire-stats";

type Stage = { id: string; itemTypes: Array<{ category: "evaluation" | "satisfaction"; type: string; target: "learner" | "company" }> };

describe("computeStageStats", () => {
  it("retourne 0/0/0/0 pour un stage sans attribution", () => {
    const stage: Stage = {
      id: "before",
      itemTypes: [{ category: "evaluation", type: "eval_preformation", target: "learner" }],
    };
    const result = computeStageStats(stage, [], [], [], [], [], []);
    expect(result).toEqual({ attributed: 0, sent: 0, expectedSent: 0, answered: 0, rate: 0 });
  });

  it("retourne stats partiels pour un stage avec 1 attribution + 2 réponses sur 3 apprenants", () => {
    const stage: Stage = {
      id: "before",
      itemTypes: [{ category: "evaluation", type: "eval_preformation", target: "learner" }],
    };
    const evalAssignments = [{ questionnaire_id: "q1", evaluation_type: "eval_preformation" }];
    const satisAssignments: Array<Record<string, unknown>> = [];
    const tokens = [
      { questionnaire_id: "q1", learner_id: "L1" },
      { questionnaire_id: "q1", learner_id: "L2" },
      { questionnaire_id: "q1", learner_id: "L3" },
    ];
    const responses = [
      { questionnaire_id: "q1", learner_id: "L1" },
      { questionnaire_id: "q1", learner_id: "L2" },
    ];
    const learners = [{ learner: { id: "L1" } }, { learner: { id: "L2" } }, { learner: { id: "L3" } }];
    const companies: Array<Record<string, unknown>> = [];

    const result = computeStageStats(stage, evalAssignments, satisAssignments, tokens, responses, learners, companies);
    expect(result.attributed).toBe(1);
    expect(result.sent).toBe(3);
    expect(result.expectedSent).toBe(3);
    expect(result.answered).toBe(2);
    expect(result.rate).toBe(67); // 2/3 ≈ 66.67 → 67
  });

  it("retourne 100% pour un stage complet (tous apprenants ont répondu)", () => {
    const stage: Stage = {
      id: "before",
      itemTypes: [{ category: "evaluation", type: "eval_preformation", target: "learner" }],
    };
    const evalAssignments = [{ questionnaire_id: "q1", evaluation_type: "eval_preformation" }];
    const tokens = [
      { questionnaire_id: "q1", learner_id: "L1" },
      { questionnaire_id: "q1", learner_id: "L2" },
    ];
    const responses = [
      { questionnaire_id: "q1", learner_id: "L1" },
      { questionnaire_id: "q1", learner_id: "L2" },
    ];
    const learners = [{ learner: { id: "L1" } }, { learner: { id: "L2" } }];

    const result = computeStageStats(stage, evalAssignments, [], tokens, responses, learners, []);
    expect(result.attributed).toBe(1);
    expect(result.sent).toBe(2);
    expect(result.expectedSent).toBe(2);
    expect(result.answered).toBe(2);
    expect(result.rate).toBe(100);
  });
});

describe("computeLearnerStatuses", () => {
  it("retourne 'answered' pour les apprenants avec réponse", () => {
    const enrollments = [{ learner: { id: "L1", first_name: "Alice", last_name: "Martin" } }];
    const evalAssignments = [{ questionnaire_id: "q1", evaluation_type: "eval_preformation", questionnaire: { title: "Positionnement" } }];
    const tokens = [{ questionnaire_id: "q1", learner_id: "L1", expires_at: new Date(Date.now() + 86400000).toISOString() }];
    const responses = [{ questionnaire_id: "q1", learner_id: "L1", id: "r1" }];

    const result = computeLearnerStatuses(enrollments, evalAssignments, [], tokens, responses);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("answered");
    expect(result[0].learnerName).toBe("Alice Martin");
    expect(result[0].questionnaireTitle).toBe("Positionnement");
  });

  it("retourne 'sent' pour token actif sans réponse", () => {
    const enrollments = [{ learner: { id: "L1", first_name: "Bob", last_name: "Dupont" } }];
    const evalAssignments = [{ questionnaire_id: "q1", evaluation_type: "eval_preformation", questionnaire: { title: "Q" } }];
    const tokens = [{ questionnaire_id: "q1", learner_id: "L1", expires_at: new Date(Date.now() + 86400000).toISOString() }];
    const responses: Array<Record<string, unknown>> = [];

    const result = computeLearnerStatuses(enrollments, evalAssignments, [], tokens, responses);
    expect(result[0].status).toBe("sent");
  });

  it("retourne 'expired' pour token expiré sans réponse", () => {
    const enrollments = [{ learner: { id: "L1", first_name: "Carl", last_name: "X" } }];
    const evalAssignments = [{ questionnaire_id: "q1", evaluation_type: "eval_preformation", questionnaire: { title: "Q" } }];
    const tokens = [{ questionnaire_id: "q1", learner_id: "L1", expires_at: new Date(Date.now() - 86400000).toISOString() }];
    const responses: Array<Record<string, unknown>> = [];

    const result = computeLearnerStatuses(enrollments, evalAssignments, [], tokens, responses);
    expect(result[0].status).toBe("expired");
  });

  it("retourne 'not_sent' pour attribution sans token", () => {
    const enrollments = [{ learner: { id: "L1", first_name: "Diana", last_name: "Y" } }];
    const evalAssignments = [{ questionnaire_id: "q1", evaluation_type: "eval_preformation", questionnaire: { title: "Q" } }];
    const tokens: Array<Record<string, unknown>> = [];
    const responses: Array<Record<string, unknown>> = [];

    const result = computeLearnerStatuses(enrollments, evalAssignments, [], tokens, responses);
    expect(result[0].status).toBe("not_sent");
  });
});
