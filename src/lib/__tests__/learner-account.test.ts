import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLearnerWithCredentials } from "@/lib/services/learner-account";

type AnyClient = Parameters<typeof createLearnerWithCredentials>[0];

/**
 * Helper mock client Supabase pour les tests unitaires de
 * createLearnerWithCredentials. Simule l'enchaînement
 * INSERT learners → auth.admin.createUser → upsert profiles → UPDATE learners.
 */
function makeMockClient(opts: {
  insertReturns?: { id: string; username: string };
  insertError?: { code?: string; message?: string } | null;
  insertRetryThenOk?: number; // nombre de fail 23505 avant succès
  authCreateError?: { message: string } | null;
} = {}): AnyClient {
  let insertAttempt = 0;
  const insertReturns = opts.insertReturns ?? { id: "learner-uuid", username: "marie.dupont" };

  const learnersChain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(async () => {
      if (opts.insertError) return { data: null, error: opts.insertError };
      if (opts.insertRetryThenOk !== undefined && insertAttempt < opts.insertRetryThenOk) {
        insertAttempt++;
        return { data: null, error: { code: "23505", message: "username collision" } };
      }
      return { data: insertReturns, error: null };
    }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  };

  const profilesChain = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "learners") return learnersChain;
      if (table === "profiles") return profilesChain;
      return {};
    }),
    auth: {
      admin: {
        createUser: vi.fn().mockImplementation(async () => {
          if (opts.authCreateError) return { data: { user: null }, error: opts.authCreateError };
          return { data: { user: { id: "auth-user-uuid" } }, error: null };
        }),
      },
    },
  } as unknown as AnyClient;
}

describe("createLearnerWithCredentials", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("crée un learner avec email réel si fourni", async () => {
    const client = makeMockClient();
    const result = await createLearnerWithCredentials(client, {
      entityId: "ent-1",
      entitySlug: "mr-formation",
      firstName: "Marie",
      lastName: "Dupont",
      email: "marie@example.com",
    });
    expect(result.email).toBe("marie@example.com");
    expect(result.syntheticEmailUsed).toBe(false);
    expect(result.tempPassword).toHaveLength(12);
    expect(result.learnerId).toBe("learner-uuid");
    expect(result.username).toBe("marie.dupont");
  });

  it("génère un email synthétique si pas d'email", async () => {
    const client = makeMockClient();
    const result = await createLearnerWithCredentials(client, {
      entityId: "ent-1",
      entitySlug: "mr-formation",
      firstName: "Jean",
      lastName: "Martin",
    });
    expect(result.syntheticEmailUsed).toBe(true);
    expect(result.email).toMatch(/@learner\.mr-formation\.local$/);
    expect(result.email).toContain("jean.martin");
  });

  it("génère un email synthétique si email est string vide ou whitespace", async () => {
    const client = makeMockClient();
    const result = await createLearnerWithCredentials(client, {
      entityId: "ent-1",
      entitySlug: "c3v-formation",
      firstName: "Sophie",
      lastName: "Bernard",
      email: "   ",
    });
    expect(result.syntheticEmailUsed).toBe(true);
    expect(result.email).toMatch(/@learner\.c3v-formation\.local$/);
  });

  it("temp_password contient au moins 1 digit et 1 lettre, 12 chars", async () => {
    const client = makeMockClient();
    const r = await createLearnerWithCredentials(client, {
      entityId: "e",
      entitySlug: "s",
      firstName: "A",
      lastName: "B",
    });
    expect(r.tempPassword).toHaveLength(12);
    expect(/[a-zA-Z]/.test(r.tempPassword)).toBe(true);
    expect(/[2-9]/.test(r.tempPassword)).toBe(true);
    // Pas de caractères ambigus
    expect(/[O0Il1]/.test(r.tempPassword)).toBe(false);
  });

  it("retry sur collision 23505 jusqu'à succès", async () => {
    const client = makeMockClient({ insertRetryThenOk: 2 });
    const r = await createLearnerWithCredentials(client, {
      entityId: "e",
      entitySlug: "s",
      firstName: "Marie",
      lastName: "Dupont",
    });
    expect(r.learnerId).toBe("learner-uuid");
  });

  it("throw si createUser échoue (rollback applicatif sur learners)", async () => {
    const client = makeMockClient({
      authCreateError: { message: "email already exists" },
    });
    await expect(
      createLearnerWithCredentials(client, {
        entityId: "e",
        entitySlug: "s",
        firstName: "A",
        lastName: "B",
      }),
    ).rejects.toThrow(/auth.admin.createUser failed/);
  });
});
