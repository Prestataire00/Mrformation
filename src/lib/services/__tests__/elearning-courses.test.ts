import { describe, it, expect, vi } from "vitest";
import { mergeAssignableCourses, type AssignableCourse } from "@/lib/services/elearning-courses";

describe("mergeAssignableCourses", () => {
  it("fusionne les cours IA publiés et les cours programme publiés", () => {
    const ai = [
      { id: "ai-1", title: "Cours IA", status: "published", estimated_duration_minutes: 60 },
    ];
    const programs = [
      { id: "pr-1", title: "Cours prog", content: { type: "elearning", status: "published", modules: [{ duration_minutes: 20 }, { duration_minutes: 10 }] } },
      { id: "pr-2", title: "Brouillon", content: { type: "elearning", status: "draft", modules: [] } },
      { id: "pr-3", title: "Formation", content: { type: "training", status: "published", modules: [] } },
    ];
    const res: AssignableCourse[] = mergeAssignableCourses(ai, programs);
    expect(res).toHaveLength(2); // ai-1 + pr-1 (pr-2 draft, pr-3 pas elearning)
    expect(res.find((c) => c.id === "ai-1")?.source).toBe("ai");
    expect(res.find((c) => c.id === "pr-1")?.source).toBe("program");
    expect(res.find((c) => c.id === "pr-1")?.title).toBe("Cours prog");
    expect(res.find((c) => c.id === "pr-1")?.duration_minutes).toBe(30);
  });

  it("ignore les programmes sans content.type=elearning ou non publiés", () => {
    const res = mergeAssignableCourses([], [
      { id: "x", title: "Brouillon", content: { type: "elearning", status: "draft", modules: [] } },
      { id: "y", title: "Vide", content: null },
    ]);
    expect(res).toHaveLength(0);
  });
});

describe("getAssignableElearningCourses", () => {
  it("interroge les 2 tables filtrées par entity_id", async () => {
    const aiChain = { select: vi.fn(() => aiChain), eq: vi.fn(() => aiChain), order: vi.fn(() => Promise.resolve({ data: [], error: null })) };
    const prChain = { select: vi.fn(() => prChain), eq: vi.fn(() => prChain), order: vi.fn(() => Promise.resolve({ data: [], error: null })) };
    const supabase = { from: vi.fn((t: string) => (t === "elearning_courses" ? aiChain : prChain)) } as never;
    const { getAssignableElearningCourses } = await import("@/lib/services/elearning-courses");
    const res = await getAssignableElearningCourses(supabase, "ent-A");
    expect(res).toEqual([]);
    expect(aiChain.eq).toHaveBeenCalledWith("entity_id", "ent-A");
    expect(prChain.eq).toHaveBeenCalledWith("entity_id", "ent-A");
  });
});
