import { describe, it, expect } from "vitest";
import { isCorrect, computeResponseScore } from "@/lib/services/questionnaire-scoring";

describe("isCorrect — nouvelle colonne correct_answer", () => {
  it("QCM par texte d'option : bonne réponse", () => {
    const q = { id: "q1", type: "multiple_choice", options: ["Lyon", "Paris", "Nice"], correct_answer: "Paris" };
    expect(isCorrect(q, "Paris")).toBe(true);
    expect(isCorrect(q, "Lyon")).toBe(false);
  });

  it("QCM insensible à la casse/accents", () => {
    const q = { id: "q1", type: "multiple_choice", options: ["Éléphant", "Chat"], correct_answer: "Éléphant" };
    expect(isCorrect(q, "elephant")).toBe(true);
  });

  it("oui/non : bonne réponse", () => {
    const q = { id: "q2", type: "yes_no", options: null, correct_answer: "oui" };
    expect(isCorrect(q, "oui")).toBe(true);
    expect(isCorrect(q, "non")).toBe(false);
  });

  it("sans correct_answer → non scorable (null)", () => {
    const q = { id: "q3", type: "multiple_choice", options: ["A", "B"], correct_answer: null };
    expect(isCorrect(q, "A")).toBe(null);
  });

  it("legacy : format objet options.correct_answer (index) reste supporté", () => {
    const q = { id: "q4", type: "multiple_choice", options: { options: ["A", "B", "C"], correct_answer: 1 } };
    expect(isCorrect(q, "B")).toBe(true);
    expect(isCorrect(q, "A")).toBe(false);
  });
});

describe("computeResponseScore — total_scorable", () => {
  it("compte les questions avec la nouvelle colonne, ignore les non notées", () => {
    const questions = [
      { id: "q1", type: "multiple_choice", options: ["A", "B"], correct_answer: "A" },
      { id: "q2", type: "yes_no", options: null, correct_answer: "non" },
      { id: "q3", type: "rating", options: null, correct_answer: null },
    ];
    const res = computeResponseScore({ q1: "A", q2: "oui", q3: "5" }, questions);
    expect(res.total_scorable).toBe(2);
    expect(res.correct).toBe(1);
    expect(res.score_percent).toBe(50);
  });

  it("questionnaire 100% satisfaction (aucune correct_answer) → score_percent null", () => {
    const questions = [{ id: "q1", type: "rating", options: null, correct_answer: null }];
    const res = computeResponseScore({ q1: "5" }, questions);
    expect(res.score_percent).toBe(null);
  });
});
