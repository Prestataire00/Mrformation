import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  softDeleteLearner,
  restoreLearner,
  deleteLearner,
} from "@/lib/services/learners";

describe("softDeleteLearner", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("update deleted_at avec NOW() et émet learner_soft_deleted", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const supabase = { from } as never;

    const result = await softDeleteLearner(supabase, "l1");

    expect(result.ok).toBe(true);
    expect(from).toHaveBeenCalledWith("learners");
    // L'appel à update doit poser deleted_at à une date (NOW() côté applicatif).
    const updatePayload = update.mock.calls[0][0] as { deleted_at: unknown };
    expect(updatePayload.deleted_at).toBeDefined();
    expect(eq).toHaveBeenCalledWith("id", "l1");

    const event = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => JSON.parse(c[0] as string) as { event: string; learner_id?: string })
      .find((e) => e.event === "learner_soft_deleted");
    expect(event).toBeDefined();
    expect(event?.learner_id).toBe("l1");
  });

  it("propage l'erreur Supabase", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "RLS denied", code: "42501" },
    });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const supabase = { from } as never;

    const result = await softDeleteLearner(supabase, "l1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("42501");
  });
});

describe("restoreLearner", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("update deleted_at à NULL et émet learner_restored", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const supabase = { from } as never;

    const result = await restoreLearner(supabase, "l1");

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({ deleted_at: null });
    expect(eq).toHaveBeenCalledWith("id", "l1");

    const event = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => JSON.parse(c[0] as string) as { event: string; learner_id?: string })
      .find((e) => e.event === "learner_restored");
    expect(event).toBeDefined();
    expect(event?.learner_id).toBe("l1");
  });

  it("propage l'erreur Supabase", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "boom", code: "PGRST500" },
    });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const supabase = { from } as never;

    const result = await restoreLearner(supabase, "l1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PGRST500");
  });
});

describe("deleteLearner", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Construit un faux client Supabase :
   *  - SELECT count sur enrollments joined sessions WHERE status='completed' → renvoie `linkedCount`
   *  - DELETE sur learners → renvoie `deleteError` (ou null)
   */
  function makeMock(opts: {
    linkedCount: number;
    deleteError?: { message: string; code: string } | null;
  }) {
    const eqStatus = vi.fn().mockResolvedValue({
      data: null,
      error: null,
      count: opts.linkedCount,
    });
    const eqLearner = vi.fn().mockReturnValue({ eq: eqStatus });
    const selectEnroll = vi.fn().mockReturnValue({ eq: eqLearner });

    const eqDelete = vi.fn().mockResolvedValue({
      data: null,
      error: opts.deleteError ?? null,
    });
    const deleteLearners = vi.fn().mockReturnValue({ eq: eqDelete });

    const from = vi.fn((table: string) => {
      if (table === "enrollments") return { select: selectEnroll };
      if (table === "learners") return { delete: deleteLearners };
      throw new Error(`Unexpected table: ${table}`);
    });

    return {
      supabase: { from } as never,
      selectEnroll,
      eqLearner,
      eqStatus,
      deleteLearners,
      eqDelete,
    };
  }

  it("happy path : aucune session 'completed' liée → hard-delete + mode hard", async () => {
    const { supabase, eqDelete } = makeMock({ linkedCount: 0 });

    const result = await deleteLearner(supabase, "l1");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mode).toBe("hard");
    expect(eqDelete).toHaveBeenCalledWith("id", "l1");

    const event = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => JSON.parse(c[0] as string) as { event: string; mode?: string; learner_id?: string })
      .find((e) => e.event === "learner_deleted");
    expect(event).toBeDefined();
    expect(event?.mode).toBe("hard");
    expect(event?.learner_id).toBe("l1");
  });

  it("blocked : apprenant lié à >= 1 session completed → ok=false + code LEARNER_SESSION_LINKED + message FR", async () => {
    const { supabase, deleteLearners } = makeMock({ linkedCount: 2 });

    const result = await deleteLearner(supabase, "l1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("LEARNER_SESSION_LINKED");
      expect(result.error.message).toBe(
        "Apprenant lié à une formation terminée, suppression impossible — utilisez l'archivage."
      );
    }
    // Aucune tentative de delete côté base.
    expect(deleteLearners).not.toHaveBeenCalled();

    const event = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => JSON.parse(c[0] as string) as { event: string; mode?: string; reason?: string })
      .find((e) => e.event === "learner_deleted");
    expect(event).toBeDefined();
    expect(event?.mode).toBe("blocked");
    expect(event?.reason).toBe("session_linked");
  });

  it("propage l'erreur Supabase sur le DELETE", async () => {
    const { supabase } = makeMock({
      linkedCount: 0,
      deleteError: { message: "FK violation", code: "23503" },
    });

    const result = await deleteLearner(supabase, "l1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("23503");
      expect(result.error.message).toBe("FK violation");
    }
  });

  it("propage l'erreur Supabase sur le SELECT count (pas d'attaque de la base ensuite)", async () => {
    const eqStatus = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "RLS denied", code: "42501" },
      count: null,
    });
    const eqLearner = vi.fn().mockReturnValue({ eq: eqStatus });
    const selectEnroll = vi.fn().mockReturnValue({ eq: eqLearner });
    const deleteLearners = vi.fn();

    const from = vi.fn((table: string) => {
      if (table === "enrollments") return { select: selectEnroll };
      if (table === "learners") return { delete: deleteLearners };
      throw new Error(`Unexpected table: ${table}`);
    });
    const supabase = { from } as never;

    const result = await deleteLearner(supabase, "l1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("42501");
    expect(deleteLearners).not.toHaveBeenCalled();
  });
});
