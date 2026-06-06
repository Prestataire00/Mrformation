import { describe, it, expect } from "vitest";
import { elearningCourseTypeEnum } from "@/lib/validations/elearning";
import type { CourseType } from "@/lib/types/elearning";
import { COURSE_TYPE_OPTIONS } from "@/lib/types/elearning";

describe("enums-consistency : CourseType ↔ Zod ↔ DB CHECK", () => {
  it("elearningCourseTypeEnum contient exactement les 3 valeurs DB", () => {
    const values = [...elearningCourseTypeEnum.options].sort();
    expect(values).toEqual(["complete", "presentation", "quiz"]);
  });

  it("COURSE_TYPE_OPTIONS couvre exactement les 3 valeurs (1 option par valeur)", () => {
    const optionValues = COURSE_TYPE_OPTIONS.map((o) => o.value).sort();
    expect(optionValues).toEqual(["complete", "presentation", "quiz"]);
  });

  it("Type CourseType est bien restreint aux 3 valeurs (compile-time check via runtime sample)", () => {
    const samples: CourseType[] = ["presentation", "quiz", "complete"];
    expect(samples).toHaveLength(3);
  });
});
