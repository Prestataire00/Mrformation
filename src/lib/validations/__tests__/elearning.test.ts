import { describe, it, expect } from "vitest";
import {
  elearningHubCourseSchema,
  elearningDurationSchema,
  elearningCreateConfigSchema,
  getElearningFormErrors,
  type ElearningHubCourseInput,
} from "../elearning";

const validHubForm: ElearningHubCourseInput = {
  title: "Excel niveau 1",
  description: "",
  objectives: "",
  status: "draft",
  modules: [{ id: 1, title: "Module 1", duration_minutes: 30 }],
};

describe("elearningHubCourseSchema", () => {
  it("accepte un formulaire minimal valide", () => {
    const result = elearningHubCourseSchema.safeParse(validHubForm);
    expect(result.success).toBe(true);
  });

  it("rejette un titre vide", () => {
    const result = elearningHubCourseSchema.safeParse({ ...validHubForm, title: "" });
    expect(result.success).toBe(false);
  });

  it("rejette zéro module", () => {
    const result = elearningHubCourseSchema.safeParse({ ...validHubForm, modules: [] });
    expect(result.success).toBe(false);
  });

  it("rejette un module sans titre", () => {
    const result = elearningHubCourseSchema.safeParse({
      ...validHubForm,
      modules: [{ id: 1, title: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("convertit string '15' en number pour duration_minutes", () => {
    const result = elearningHubCourseSchema.safeParse({
      ...validHubForm,
      modules: [{ id: 1, title: "M1", duration_minutes: "15" as unknown as number }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.modules[0].duration_minutes).toBe(15);
  });

  it("convertit '' en null pour description / objectives", () => {
    const result = elearningHubCourseSchema.safeParse(validHubForm);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeNull();
      expect(result.data.objectives).toBeNull();
    }
  });

  it("rejette un status invalide", () => {
    const result = elearningHubCourseSchema.safeParse({
      ...validHubForm,
      status: "anything" as unknown as "draft",
    });
    expect(result.success).toBe(false);
  });
});

describe("elearningDurationSchema", () => {
  it("accepte une durée numérique positive", () => {
    expect(elearningDurationSchema.safeParse({ estimated_duration_minutes: 60 }).success).toBe(true);
  });

  it("accepte une durée string '90'", () => {
    const r = elearningDurationSchema.safeParse({ estimated_duration_minutes: "90" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.estimated_duration_minutes).toBe(90);
  });

  it("rejette une durée 0 ou négative", () => {
    expect(elearningDurationSchema.safeParse({ estimated_duration_minutes: 0 }).success).toBe(false);
    expect(elearningDurationSchema.safeParse({ estimated_duration_minutes: -1 }).success).toBe(false);
  });

  it("rejette une durée vide", () => {
    expect(elearningDurationSchema.safeParse({ estimated_duration_minutes: "" }).success).toBe(false);
  });
});

describe("elearningCreateConfigSchema", () => {
  const valid = {
    title: "Formation X",
    description: "",
    objectives: "",
    course_type: "complete" as const,
    num_chapters: 5,
    final_quiz_target_count: 10,
    gamma_theme_id: "",
  };

  it("accepte une config valide", () => {
    expect(elearningCreateConfigSchema.safeParse(valid).success).toBe(true);
  });

  it("rejette course_type invalide", () => {
    expect(
      elearningCreateConfigSchema.safeParse({ ...valid, course_type: "invalid" as never }).success,
    ).toBe(false);
  });

  it("rejette num_chapters hors plage [1, 20]", () => {
    expect(elearningCreateConfigSchema.safeParse({ ...valid, num_chapters: 0 }).success).toBe(false);
    expect(elearningCreateConfigSchema.safeParse({ ...valid, num_chapters: 21 }).success).toBe(false);
  });
});

describe("getElearningFormErrors", () => {
  it("renvoie une map champ → message", () => {
    const r = elearningHubCourseSchema.safeParse({ ...validHubForm, title: "", modules: [] });
    const errors = getElearningFormErrors<ElearningHubCourseInput>(r);
    expect(errors.title).toBeDefined();
    expect(errors.modules).toBeDefined();
  });

  it("renvoie une map vide quand le parse réussit", () => {
    const r = elearningHubCourseSchema.safeParse(validHubForm);
    const errors = getElearningFormErrors<ElearningHubCourseInput>(r);
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
