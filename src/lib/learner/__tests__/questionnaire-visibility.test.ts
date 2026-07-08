import { describe, it, expect } from "vitest";
import { isLearnerQuestionnaireVisible } from "@/lib/learner/questionnaire-visibility";

describe("isLearnerQuestionnaireVisible", () => {
  it("cache le bilan formateur (quest_formateurs)", () => {
    expect(isLearnerQuestionnaireVisible("quest_formateurs")).toBe(false);
  });

  it("cache les questionnaires entreprise / manager / financeur", () => {
    expect(isLearnerQuestionnaireVisible("quest_entreprises")).toBe(false);
    expect(isLearnerQuestionnaireVisible("quest_managers")).toBe(false);
    expect(isLearnerQuestionnaireVisible("quest_financeurs")).toBe(false);
  });

  it("affiche TOUS les questionnaires apprenant d'emblée (pré, post, satisfaction)", () => {
    expect(isLearnerQuestionnaireVisible("auto_eval_pre")).toBe(true);
    expect(isLearnerQuestionnaireVisible("auto_eval_post")).toBe(true);
    expect(isLearnerQuestionnaireVisible("satisfaction_chaud")).toBe(true);
    expect(isLearnerQuestionnaireVisible("satisfaction_froid")).toBe(true);
    expect(isLearnerQuestionnaireVisible("eval_pendant")).toBe(true);
  });

  it("préserve les questionnaires legacy (quality_indicator_type null) → visible", () => {
    expect(isLearnerQuestionnaireVisible(null)).toBe(true);
    expect(isLearnerQuestionnaireVisible(undefined)).toBe(true);
  });
});
