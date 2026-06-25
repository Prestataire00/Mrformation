import { describe, it, expect, vi } from "vitest";
import {
  enrollLearner,
  createLearnerAndEnroll,
  removeEnrollment,
} from "@/lib/services/enrollments";

describe("enrollLearner", () => {
  it("insert un enrollment avec le client_id fourni", async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as never;

    const result = await enrollLearner(supabase, {
      sessionId: "s1",
      learnerId: "l1",
      clientId: "c1",
    });

    expect(result.ok).toBe(true);
    expect(from).toHaveBeenCalledWith("enrollments");
    expect(insert).toHaveBeenCalledWith({
      session_id: "s1",
      learner_id: "l1",
      client_id: "c1",
      status: "registered",
    });
  });

  it("accepte un status custom", async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as never;

    await enrollLearner(supabase, {
      sessionId: "s1",
      learnerId: "l1",
      clientId: "c1",
      status: "confirmed",
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: "confirmed" }));
  });

  it("accepte un clientId null (cas legacy / mono-entreprise sans formation_companies)", async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as never;

    const result = await enrollLearner(supabase, {
      sessionId: "s1",
      learnerId: "l1",
      clientId: null,
    });

    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ client_id: null }));
  });

  it("propage l'erreur Supabase (unique constraint = déjà inscrit)", async () => {
    const insert = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "duplicate key", code: "23505" },
    });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as never;

    const result = await enrollLearner(supabase, {
      sessionId: "s1",
      learnerId: "l1",
      clientId: "c1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("23505");
  });

  it("ne throw PAS si l'appel Supabase rejette (coupure réseau) → ServiceResult", async () => {
    // Sans le try/catch du service, l'exception figerait le bouton « Ajouter »
    // (spinner bloqué, aucun toast). On doit récupérer un ServiceResult.
    const insert = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as never;

    const result = await enrollLearner(supabase, { sessionId: "s1", learnerId: "l1", clientId: "c1" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("Failed to fetch");
  });
});

describe("createLearnerAndEnroll", () => {
  function makeMock(opts: {
    createLearner: { data: unknown; error: unknown };
    enroll?: { data: unknown; error: unknown };
    deleteLearner?: { data: unknown; error: unknown };
  }) {
    const single = vi.fn().mockResolvedValue(opts.createLearner);
    const selectAfterInsert = vi.fn().mockReturnValue({ single });
    const insertLearner = vi.fn().mockReturnValue({ select: selectAfterInsert });

    const insertEnroll = vi.fn().mockResolvedValue(opts.enroll ?? { data: null, error: null });

    const eqDelete = vi.fn().mockResolvedValue(opts.deleteLearner ?? { data: null, error: null });
    const deleteLearner = vi.fn().mockReturnValue({ eq: eqDelete });

    const from = vi.fn((table: string) => {
      if (table === "learners") return { insert: insertLearner, delete: deleteLearner };
      if (table === "enrollments") return { insert: insertEnroll };
      throw new Error(`Unexpected table: ${table}`);
    });
    return { supabase: { from } as never, insertLearner, insertEnroll, eqDelete };
  }

  it("crée le learner et l'inscrit (happy path)", async () => {
    const { supabase, insertEnroll } = makeMock({
      createLearner: { data: { id: "l1", first_name: "Anne" }, error: null },
    });

    const result = await createLearnerAndEnroll(supabase, {
      firstName: "Anne",
      lastName: "Martin",
      email: "anne@example.com",
      entityId: "e1",
      sessionId: "s1",
      clientId: "c1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.learner.id).toBe("l1");
    expect(insertEnroll).toHaveBeenCalledWith({
      session_id: "s1",
      learner_id: "l1",
      client_id: "c1",
      status: "registered",
    });
  });

  it("retourne l'erreur si la création du learner échoue (pas de tentative d'enroll)", async () => {
    const { supabase, insertEnroll } = makeMock({
      createLearner: { data: null, error: { message: "RLS denied", code: "42501" } },
    });

    const result = await createLearnerAndEnroll(supabase, {
      firstName: "Anne",
      lastName: "Martin",
      email: null,
      entityId: "e1",
      sessionId: "s1",
      clientId: "c1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("RLS denied");
    expect(insertEnroll).not.toHaveBeenCalled();
  });

  it("rollback (delete learner) si l'enrollment échoue", async () => {
    const { supabase, eqDelete } = makeMock({
      createLearner: { data: { id: "l1" }, error: null },
      enroll: { data: null, error: { message: "FK error", code: "23503" } },
    });

    const result = await createLearnerAndEnroll(supabase, {
      firstName: "Anne",
      lastName: "Martin",
      email: null,
      entityId: "e1",
      sessionId: "s1",
      clientId: "c1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("FK error");
    expect(eqDelete).toHaveBeenCalledWith("id", "l1");
  });

  it("log un console.error si le rollback delete échoue", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { supabase } = makeMock({
      createLearner: { data: { id: "l1" }, error: null },
      enroll: { data: null, error: { message: "FK error", code: "23503" } },
      deleteLearner: { data: null, error: { message: "delete failed", code: "PGRST500" } },
    });

    const result = await createLearnerAndEnroll(supabase, {
      firstName: "Anne",
      lastName: "Martin",
      email: null,
      entityId: "e1",
      sessionId: "s1",
      clientId: "c1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("FK error"); // erreur originale, pas rollback
    expect(spy).toHaveBeenCalledWith(
      "[enrollments] rollback delete learner failed",
      expect.objectContaining({ learnerId: "l1" })
    );
    spy.mockRestore();
  });

  it("ne throw PAS si la création du learner rejette (réseau) → ServiceResult", async () => {
    const single = vi.fn().mockRejectedValue(new Error("network down"));
    const selectAfterInsert = vi.fn().mockReturnValue({ single });
    const insertLearner = vi.fn().mockReturnValue({ select: selectAfterInsert });
    const from = vi.fn((table: string) =>
      table === "learners" ? { insert: insertLearner } : { insert: vi.fn() }
    );
    const supabase = { from } as never;

    const result = await createLearnerAndEnroll(supabase, {
      firstName: "Anne", lastName: "Martin", email: null, entityId: "e1", sessionId: "s1", clientId: "c1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("network down");
  });
});

describe("removeEnrollment", () => {
  it("delete l'enrollment par id + session_id", async () => {
    const eq2 = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const deleteFn = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ delete: deleteFn });
    const supabase = { from } as never;

    const result = await removeEnrollment(supabase, "enr-id", "s1");

    expect(result.ok).toBe(true);
    expect(from).toHaveBeenCalledWith("enrollments");
    expect(eq1).toHaveBeenCalledWith("id", "enr-id");
    expect(eq2).toHaveBeenCalledWith("session_id", "s1");
  });

  it("propage l'erreur Supabase", async () => {
    const eq2 = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "RLS denied", code: "42501" },
    });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const deleteFn = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ delete: deleteFn });
    const supabase = { from } as never;

    const result = await removeEnrollment(supabase, "enr-id", "s1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("42501");
  });

  it("ne throw PAS si l'appel Supabase rejette (réseau) → ServiceResult", async () => {
    const eq2 = vi.fn().mockRejectedValue(new Error("network"));
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const deleteFn = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ delete: deleteFn });
    const supabase = { from } as never;

    const result = await removeEnrollment(supabase, "enr-id", "s1");

    expect(result.ok).toBe(false);
  });
});
