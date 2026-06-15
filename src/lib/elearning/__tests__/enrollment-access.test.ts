import { describe, it, expect, vi } from "vitest";
import { isLearnerEnrolledInCourse } from "../enrollment-access";

type AnyClient = Parameters<typeof isLearnerEnrolledInCourse>[0];

function makeClient(opts: { learner?: { id: string } | null; enrollment?: { id: string } | null }) {
  const calls: Record<string, Record<string, unknown>> = { learners: {}, elearning_enrollments: {} };
  function chain(table: string, value: unknown) {
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: unknown) => {
        calls[table][col] = val;
        return builder;
      }),
      maybeSingle: vi.fn(async () => ({ data: value, error: null })),
    };
    return builder;
  }
  const client = {
    from: vi.fn((table: string) => {
      if (table === "learners") return chain("learners", opts.learner ?? null);
      if (table === "elearning_enrollments") return chain("elearning_enrollments", opts.enrollment ?? null);
      throw new Error(`table inattendue: ${table}`);
    }),
    __calls: calls,
  };
  return client as unknown as AnyClient & { __calls: typeof calls };
}

describe("isLearnerEnrolledInCourse", () => {
  it("true si l'apprenant a une inscription au cours", async () => {
    const client = makeClient({ learner: { id: "lrn-1" }, enrollment: { id: "enr-1" } });
    expect(await isLearnerEnrolledInCourse(client, "prof-1", "course-1")).toBe(true);
  });

  it("résout learners.id par profile_id, puis elearning_enrollments par learner.id + course_id", async () => {
    const client = makeClient({ learner: { id: "lrn-1" }, enrollment: { id: "enr-1" } });
    await isLearnerEnrolledInCourse(client, "prof-1", "course-1");
    expect(client.__calls.learners.profile_id).toBe("prof-1");
    expect(client.__calls.elearning_enrollments.learner_id).toBe("lrn-1");
    expect(client.__calls.elearning_enrollments.course_id).toBe("course-1");
  });

  it("false si aucune fiche apprenant", async () => {
    expect(await isLearnerEnrolledInCourse(makeClient({ learner: null }), "x", "course-1")).toBe(false);
  });

  it("false si apprenant non inscrit au cours", async () => {
    const client = makeClient({ learner: { id: "lrn-1" }, enrollment: null });
    expect(await isLearnerEnrolledInCourse(client, "prof-1", "course-1")).toBe(false);
  });
});
