import { describe, it, expect, vi } from "vitest";
import { isLearnerEnrolledInCourse } from "../enrollment-access";

type AnyClient = Parameters<typeof isLearnerEnrolledInCourse>[0];

/**
 * Mock client Supabase. Multi-fiche : `learners` renvoie une LISTE de fiches
 * (un profil partagé peut en avoir plusieurs — apprenant sans email), et
 * `elearning_enrollments` est filtré par `.in("learner_id", [...])`.
 */
function makeClient(opts: {
  learners?: Array<{ id: string }>;
  enrollments?: Array<{ id: string }>;
}) {
  const calls: Record<string, Record<string, unknown>> = { learners: {}, elearning_enrollments: {} };
  function chain(table: string, result: unknown) {
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: unknown) => {
        calls[table][col] = val;
        return builder;
      }),
      in: vi.fn((col: string, vals: unknown) => {
        calls[table][col] = vals;
        return builder;
      }),
      limit: vi.fn(() => builder),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: result, error: null }),
    };
    return builder;
  }
  const client = {
    from: vi.fn((table: string) => {
      if (table === "learners") return chain("learners", opts.learners ?? []);
      if (table === "elearning_enrollments") return chain("elearning_enrollments", opts.enrollments ?? []);
      throw new Error(`table inattendue: ${table}`);
    }),
    __calls: calls,
  };
  return client as unknown as AnyClient & { __calls: typeof calls };
}

describe("isLearnerEnrolledInCourse", () => {
  it("true si l'apprenant a une inscription au cours", async () => {
    const client = makeClient({ learners: [{ id: "lrn-1" }], enrollments: [{ id: "enr-1" }] });
    expect(await isLearnerEnrolledInCourse(client, "prof-1", "course-1")).toBe(true);
  });

  it("résout learners par profile_id, puis elearning_enrollments par learner.id résolus (.in) + course_id", async () => {
    const client = makeClient({ learners: [{ id: "lrn-1" }], enrollments: [{ id: "enr-1" }] });
    await isLearnerEnrolledInCourse(client, "prof-1", "course-1");
    expect(client.__calls.learners.profile_id).toBe("prof-1");
    expect(client.__calls.elearning_enrollments.learner_id).toEqual(["lrn-1"]);
    expect(client.__calls.elearning_enrollments.course_id).toBe("course-1");
  });

  it("false si aucune fiche apprenant", async () => {
    expect(await isLearnerEnrolledInCourse(makeClient({ learners: [] }), "x", "course-1")).toBe(false);
  });

  it("false si apprenant non inscrit au cours", async () => {
    const client = makeClient({ learners: [{ id: "lrn-1" }], enrollments: [] });
    expect(await isLearnerEnrolledInCourse(client, "prof-1", "course-1")).toBe(false);
  });

  it("multi-fiche (compte partagé) : teste TOUTES les fiches via .in, true si l'une est inscrite", async () => {
    // Avant le fix, `.maybeSingle()` échouait à ≥ 2 fiches → « non inscrit » à tort
    // → lecteur e-learning inaccessible pour le compte partagé.
    const client = makeClient({
      learners: [{ id: "lrn-a" }, { id: "lrn-b" }],
      enrollments: [{ id: "enr-b" }],
    });
    expect(await isLearnerEnrolledInCourse(client, "prof-1", "course-1")).toBe(true);
    expect(client.__calls.elearning_enrollments.learner_id).toEqual(["lrn-a", "lrn-b"]);
  });
});
