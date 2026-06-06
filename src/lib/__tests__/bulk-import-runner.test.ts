/**
 * Pédagogie V2 Epic 2 — Story E2-S01
 *
 * Tests du helper `runBulkImportLearnerLoop` extrait de la Background Function
 * `learners-bulk-create-background.mts`.
 *
 * Couverture :
 *  - boucle 0 learner → results vides, pdfRows vide
 *  - 1 learner success → created_count=1, password EXCLU de results.learners[]
 *  - mix 3 learners (2 OK + 1 KO) → continue malgré l'erreur du learner KO
 *  - decideFinalStatus + buildAggregatedErrorMessage
 *  - logger structuré appelé à chaque learner
 *  - SEC-9 : password NEVER persisté dans results.learners[]
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runBulkImportLearnerLoop,
  decideFinalStatus,
  buildAggregatedErrorMessage,
  type BulkImportPayload,
  type StructuredLogger,
} from "@/lib/services/bulk-import-runner";

// Mock du module learner-account pour contrôler la création des apprenants.
vi.mock("@/lib/services/learner-account", () => ({
  createLearnerWithCredentials: vi.fn(),
}));

import { createLearnerWithCredentials } from "@/lib/services/learner-account";
const mockCreateLearner = vi.mocked(createLearnerWithCredentials);

type AnyClient = Parameters<typeof runBulkImportLearnerLoop>[0]["admin"];

/**
 * Mock Supabase client minimaliste pour le test du loop.
 * On n'intercepte que `from("enrollments").insert(...)`.
 */
function makeMockAdmin(opts: {
  enrollmentInsertError?: { message: string } | null;
} = {}): AnyClient {
  return {
    from: vi.fn(() => ({
      insert: vi
        .fn()
        .mockResolvedValue({ error: opts.enrollmentInsertError ?? null }),
    })),
  } as unknown as AnyClient;
}

const baseEntityId = "ent-uuid";
const baseSessionId = "session-uuid";
const baseJobId = "job-uuid";

describe("runBulkImportLearnerLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("boucle vide (0 learner) → results vides + pdfRows vide", async () => {
    const admin = makeMockAdmin();
    const payload: BulkImportPayload = {
      learners: [],
      entitySlug: "mr-formation",
    };
    const logs: Record<string, unknown>[] = [];
    const logger: StructuredLogger = (r) => logs.push(r);

    const { results, pdfRows } = await runBulkImportLearnerLoop({
      admin,
      entityId: baseEntityId,
      sessionId: baseSessionId,
      payload,
      jobId: baseJobId,
      logger,
    });

    expect(results.created_count).toBe(0);
    expect(results.enrolled_count).toBe(0);
    expect(results.error_count).toBe(0);
    expect(results.learners).toEqual([]);
    expect(pdfRows).toEqual([]);
    expect(mockCreateLearner).not.toHaveBeenCalled();
    expect(logs).toEqual([]); // pas de logs si pas de learners
  });

  it("1 learner success → created_count=1, password EXCLU de results.learners[]", async () => {
    const admin = makeMockAdmin();
    mockCreateLearner.mockResolvedValueOnce({
      learnerId: "learner-1",
      username: "marie.dupont",
      email: "marie@example.com",
      tempPassword: "Ab3KpZ8qX7Yn", // <-- doit JAMAIS apparaître dans results
      syntheticEmailUsed: false,
    });

    const payload: BulkImportPayload = {
      learners: [
        { firstName: "Marie", lastName: "Dupont", email: "marie@example.com" },
      ],
      entitySlug: "mr-formation",
    };

    const { results, pdfRows } = await runBulkImportLearnerLoop({
      admin,
      entityId: baseEntityId,
      sessionId: baseSessionId,
      payload,
      jobId: baseJobId,
      logger: () => {},
    });

    expect(results.created_count).toBe(1);
    expect(results.enrolled_count).toBe(1);
    expect(results.error_count).toBe(0);
    expect(results.learners).toHaveLength(1);
    expect(results.learners[0].learnerId).toBe("learner-1");
    expect(results.learners[0].username).toBe("marie.dupont");
    expect(results.learners[0].isError).toBe(false);

    // SEC-9 — Le password ne doit NULLE PART apparaître dans results.learners[].
    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain("Ab3KpZ8qX7Yn");

    // En revanche, le password DOIT être dans pdfRows (RAM uniquement).
    expect(pdfRows).toHaveLength(1);
    expect(pdfRows[0].password).toBe("Ab3KpZ8qX7Yn");
    expect(pdfRows[0].fullName).toBe("Marie Dupont");
    expect(pdfRows[0].identifier).toBe("marie.dupont");
  });

  it("mix 3 learners (2 OK + 1 KO milieu) → continue malgré l'erreur", async () => {
    const admin = makeMockAdmin();
    mockCreateLearner
      .mockResolvedValueOnce({
        learnerId: "L1",
        username: "alice.a",
        email: "a@x.com",
        tempPassword: "PW111111111A",
        syntheticEmailUsed: false,
      })
      .mockRejectedValueOnce(new Error("auth.admin.createUser failed"))
      .mockResolvedValueOnce({
        learnerId: "L3",
        username: "charlie.c",
        email: "c@x.com",
        tempPassword: "PW333333333C",
        syntheticEmailUsed: false,
      });

    const payload: BulkImportPayload = {
      learners: [
        { firstName: "Alice", lastName: "A", email: "a@x.com" },
        { firstName: "Bob", lastName: "B", email: "b@x.com" },
        { firstName: "Charlie", lastName: "C", email: "c@x.com" },
      ],
      entitySlug: "mr-formation",
    };

    const { results, pdfRows } = await runBulkImportLearnerLoop({
      admin,
      entityId: baseEntityId,
      sessionId: baseSessionId,
      payload,
      jobId: baseJobId,
      logger: () => {},
    });

    expect(results.created_count).toBe(2);
    expect(results.enrolled_count).toBe(2);
    expect(results.error_count).toBe(1);
    expect(results.learners).toHaveLength(3);

    expect(results.learners[0].isError).toBe(false);
    expect(results.learners[1].isError).toBe(true);
    expect(results.learners[1].errorMessage).toContain("createUser failed");
    expect(results.learners[2].isError).toBe(false);

    // pdfRows contient uniquement les 2 succès (les KO n'ont pas de credentials).
    expect(pdfRows).toHaveLength(2);
    expect(pdfRows[0].fullName).toBe("Alice A");
    expect(pdfRows[1].fullName).toBe("Charlie C");
  });

  it("enrollment KO ne bloque pas la création (created_count incrémenté, enrolled_count non)", async () => {
    const admin = makeMockAdmin({
      enrollmentInsertError: { message: "enrollment conflict" },
    });
    mockCreateLearner.mockResolvedValueOnce({
      learnerId: "L1",
      username: "u1",
      email: "u1@x.com",
      tempPassword: "ZZZZZZZZZZZZ",
      syntheticEmailUsed: false,
    });

    const payload: BulkImportPayload = {
      learners: [{ firstName: "U", lastName: "1", email: "u1@x.com" }],
      entitySlug: "mr-formation",
    };

    const { results } = await runBulkImportLearnerLoop({
      admin,
      entityId: baseEntityId,
      sessionId: baseSessionId,
      payload,
      jobId: baseJobId,
      logger: () => {},
    });

    expect(results.created_count).toBe(1);
    expect(results.enrolled_count).toBe(0);
    expect(results.learners[0].enrolled).toBe(false);
    expect(results.learners[0].errorMessage).toBe("enrollment conflict");
    expect(results.learners[0].isError).toBe(false); // pas une erreur de création
  });

  it("logger structuré appelé à chaque learner avec duration_ms", async () => {
    const admin = makeMockAdmin();
    mockCreateLearner.mockResolvedValue({
      learnerId: "X",
      username: "x",
      email: "x@x.com",
      tempPassword: "AAAAAAAAAAAA",
      syntheticEmailUsed: false,
    });

    const payload: BulkImportPayload = {
      learners: [
        { firstName: "A", lastName: "1" },
        { firstName: "B", lastName: "2" },
      ],
      entitySlug: "c3v-formation",
    };
    const logs: Record<string, unknown>[] = [];
    const logger: StructuredLogger = (r) => logs.push(r);

    await runBulkImportLearnerLoop({
      admin,
      entityId: baseEntityId,
      sessionId: baseSessionId,
      payload,
      jobId: baseJobId,
      logger,
    });

    // 1 log par learner attendu
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      job_id: baseJobId,
      step: "learner_processed",
      index: 0,
      total: 2,
      success: true,
    });
    expect(logs[0].duration_ms).toBeTypeOf("number");
    expect(logs[1]).toMatchObject({
      index: 1,
      total: 2,
      success: true,
    });
  });
});

describe("decideFinalStatus", () => {
  it("retourne 'failed' si created_count=0 et error_count>0", () => {
    expect(
      decideFinalStatus({
        created_count: 0,
        enrolled_count: 0,
        error_count: 3,
        learners: [],
      }),
    ).toBe("failed");
  });

  it("retourne 'completed' si au moins 1 succès même partiel", () => {
    expect(
      decideFinalStatus({
        created_count: 1,
        enrolled_count: 1,
        error_count: 2,
        learners: [],
      }),
    ).toBe("completed");
  });

  it("retourne 'completed' si 0 erreur", () => {
    expect(
      decideFinalStatus({
        created_count: 5,
        enrolled_count: 5,
        error_count: 0,
        learners: [],
      }),
    ).toBe("completed");
  });

  it("retourne 'completed' si 0 learner du tout (cas dégénéré)", () => {
    expect(
      decideFinalStatus({
        created_count: 0,
        enrolled_count: 0,
        error_count: 0,
        learners: [],
      }),
    ).toBe("completed");
  });
});

describe("buildAggregatedErrorMessage", () => {
  it("retourne un message si tous échouent", () => {
    expect(
      buildAggregatedErrorMessage({
        created_count: 0,
        enrolled_count: 0,
        error_count: 5,
        learners: [],
      }),
    ).toMatch(/Tous les apprenants ont échoué/);
  });

  it("retourne null si au moins 1 succès", () => {
    expect(
      buildAggregatedErrorMessage({
        created_count: 1,
        enrolled_count: 1,
        error_count: 2,
        learners: [],
      }),
    ).toBeNull();
  });
});
