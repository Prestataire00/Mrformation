import { describe, it, expect, vi } from "vitest";
import { isLearnerEnrolledInSession } from "../learner-session-access";

type AnyClient = Parameters<typeof isLearnerEnrolledInSession>[0];

/**
 * Mock client Supabase pour isLearnerEnrolledInSession.
 * Multi-fiche : `learners` renvoie une LISTE de fiches (un profil partagé peut
 * en avoir plusieurs — apprenant sans email), et `enrollments` est filtré par
 * `.in("learner_id", [...])`. Enregistre les filtres `.eq()`/`.in()` par table.
 */
function makeClient(opts: {
  learners?: Array<{ id: string }>;
  enrollments?: Array<{ id: string }>;
}) {
  const calls: Record<string, Record<string, unknown>> = {
    learners: {},
    enrollments: {},
  };

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
      if (table === "enrollments") return chain("enrollments", opts.enrollments ?? []);
      throw new Error(`table inattendue: ${table}`);
    }),
    __calls: calls,
  };

  return client as unknown as AnyClient & { __calls: typeof calls };
}

describe("isLearnerEnrolledInSession", () => {
  it("retourne true quand l'apprenant existe ET a une inscription signable", async () => {
    const client = makeClient({ learners: [{ id: "learner-1" }], enrollments: [{ id: "enr-1" }] });
    expect(await isLearnerEnrolledInSession(client, "profile-1", "session-1")).toBe(true);
  });

  it("résout l'apprenant par profile_id, puis enrollments par learner.id résolus via .in (pas par profile_id)", async () => {
    const client = makeClient({ learners: [{ id: "learner-1" }], enrollments: [{ id: "enr-1" }] });
    await isLearnerEnrolledInSession(client, "profile-1", "session-1");
    expect(client.__calls.learners.profile_id).toBe("profile-1");
    expect(client.__calls.enrollments.learner_id).toEqual(["learner-1"]);
    expect(client.__calls.enrollments.session_id).toBe("session-1");
  });

  it("filtre sur des statuts signables incluant 'registered' (et non 'active' inexistant)", async () => {
    const client = makeClient({ learners: [{ id: "learner-1" }], enrollments: [{ id: "enr-1" }] });
    await isLearnerEnrolledInSession(client, "profile-1", "session-1");
    const statuses = client.__calls.enrollments.status as string[];
    expect(Array.isArray(statuses)).toBe(true);
    expect(statuses).toContain("registered");
    expect(statuses).not.toContain("cancelled");
    expect(statuses).not.toContain("active");
  });

  it("retourne false si aucune fiche apprenant pour ce profile_id", async () => {
    const client = makeClient({ learners: [] });
    expect(await isLearnerEnrolledInSession(client, "profile-inconnu", "session-1")).toBe(false);
  });

  it("retourne false si l'apprenant existe mais sans inscription signable", async () => {
    const client = makeClient({ learners: [{ id: "learner-1" }], enrollments: [] });
    expect(await isLearnerEnrolledInSession(client, "profile-1", "session-1")).toBe(false);
  });

  it("multi-fiche (compte partagé) : teste TOUTES les fiches via .in et reste true si l'une est inscrite", async () => {
    // Avant le fix, `.single()` échouait avec 2 fiches → « non inscrit » à tort.
    const client = makeClient({
      learners: [{ id: "learner-a" }, { id: "learner-b" }],
      enrollments: [{ id: "enr-b" }],
    });
    expect(await isLearnerEnrolledInSession(client, "profile-1", "session-1")).toBe(true);
    expect(client.__calls.enrollments.learner_id).toEqual(["learner-a", "learner-b"]);
  });
});
