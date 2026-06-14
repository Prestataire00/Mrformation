import { describe, it, expect, vi } from "vitest";
import { isLearnerEnrolledInSession } from "../learner-session-access";

type AnyClient = Parameters<typeof isLearnerEnrolledInSession>[0];

/**
 * Mock client Supabase pour isLearnerEnrolledInSession.
 * Simule : SELECT learners WHERE profile_id → SELECT enrollments WHERE
 * session_id + learner_id + status signable. Enregistre les filtres pour
 * vérifier le câblage (résolution profile_id → learner.id → enrollments).
 */
function makeClient(opts: {
  learner?: { id: string } | null;
  enrollment?: { id: string } | null;
}) {
  const calls: Record<string, Record<string, unknown>> = {
    learners: {},
    enrollments: {},
  };

  function chain(table: string, value: unknown) {
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
      single: vi.fn(async () => ({ data: value, error: value ? null : { message: "not found" } })),
      maybeSingle: vi.fn(async () => ({ data: value, error: null })),
    };
    return builder;
  }

  const client = {
    from: vi.fn((table: string) => {
      if (table === "learners") return chain("learners", opts.learner ?? null);
      if (table === "enrollments") return chain("enrollments", opts.enrollment ?? null);
      throw new Error(`table inattendue: ${table}`);
    }),
    __calls: calls,
  };

  return client as unknown as AnyClient & { __calls: typeof calls };
}

describe("isLearnerEnrolledInSession", () => {
  it("retourne true quand l'apprenant existe ET a une inscription signable", async () => {
    const client = makeClient({ learner: { id: "learner-1" }, enrollment: { id: "enr-1" } });
    expect(await isLearnerEnrolledInSession(client, "profile-1", "session-1")).toBe(true);
  });

  it("résout l'apprenant par profile_id, puis enrollments par learner.id (pas par profile_id)", async () => {
    const client = makeClient({ learner: { id: "learner-1" }, enrollment: { id: "enr-1" } });
    await isLearnerEnrolledInSession(client, "profile-1", "session-1");
    expect(client.__calls.learners.profile_id).toBe("profile-1");
    expect(client.__calls.enrollments.learner_id).toBe("learner-1");
    expect(client.__calls.enrollments.session_id).toBe("session-1");
  });

  it("filtre sur des statuts signables incluant 'registered' (et non 'active' inexistant)", async () => {
    const client = makeClient({ learner: { id: "learner-1" }, enrollment: { id: "enr-1" } });
    await isLearnerEnrolledInSession(client, "profile-1", "session-1");
    const statuses = client.__calls.enrollments.status as string[];
    expect(Array.isArray(statuses)).toBe(true);
    expect(statuses).toContain("registered");
    expect(statuses).not.toContain("cancelled");
    expect(statuses).not.toContain("active");
  });

  it("retourne false si aucune fiche apprenant pour ce profile_id", async () => {
    const client = makeClient({ learner: null });
    expect(await isLearnerEnrolledInSession(client, "profile-inconnu", "session-1")).toBe(false);
  });

  it("retourne false si l'apprenant existe mais sans inscription signable", async () => {
    const client = makeClient({ learner: { id: "learner-1" }, enrollment: null });
    expect(await isLearnerEnrolledInSession(client, "profile-1", "session-1")).toBe(false);
  });
});
