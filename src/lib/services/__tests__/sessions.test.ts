import { describe, it, expect, vi } from "vitest";
import {
  getSessionIdsByClient,
  linkSessionToCompany,
  createSessionWithOptionalCompany,
  updateSession,
  resolveCatalogPrice,
  updateSessionField,
  duplicateSession,
  deleteSession,
  sendVisioLinkToLearners,
} from "@/lib/services/sessions";

// Type minimal du client Supabase utilisé par les helpers
type MockSupabase = {
  from: ReturnType<typeof vi.fn>;
};

function makeSupabaseMock(response: { data: unknown; error: unknown }): MockSupabase {
  const eq = vi.fn().mockResolvedValue(response);
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

describe("getSessionIdsByClient", () => {
  it("retourne les session_ids liés à un client_id via formation_companies", async () => {
    const supabase = makeSupabaseMock({
      data: [{ session_id: "s1" }, { session_id: "s2" }],
      error: null,
    });

    const result = await getSessionIdsByClient(supabase as never, "client-1");

    expect(result).toEqual({ ok: true, sessionIds: ["s1", "s2"] });
    expect(supabase.from).toHaveBeenCalledWith("formation_companies");
  });

  it("retourne un tableau vide quand aucune session liée", async () => {
    const supabase = makeSupabaseMock({ data: [], error: null });
    const result = await getSessionIdsByClient(supabase as never, "client-no-match");
    expect(result).toEqual({ ok: true, sessionIds: [] });
  });

  it("propage l'erreur Supabase", async () => {
    const supabase = makeSupabaseMock({
      data: null,
      error: { message: "DB down", code: "PGRST500" },
    });
    const result = await getSessionIdsByClient(supabase as never, "client-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("DB down");
    }
  });
});

describe("linkSessionToCompany", () => {
  it("upsert une ligne formation_companies avec amount", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as never;

    const result = await linkSessionToCompany(supabase, {
      sessionId: "s1",
      clientId: "c1",
      amount: 1000,
    });

    expect(result.ok).toBe(true);
    expect(from).toHaveBeenCalledWith("formation_companies");
    expect(upsert).toHaveBeenCalledWith(
      { session_id: "s1", client_id: "c1", amount: 1000 },
      { onConflict: "session_id,client_id" }
    );
  });

  it("upsert sans amount si non fourni", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as never;

    await linkSessionToCompany(supabase, { sessionId: "s1", clientId: "c1" });

    expect(upsert).toHaveBeenCalledWith(
      { session_id: "s1", client_id: "c1", amount: null },
      { onConflict: "session_id,client_id" }
    );
  });

  it("propage l'erreur Supabase", async () => {
    const upsert = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "FK violation", code: "23503" },
    });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as never;

    const result = await linkSessionToCompany(supabase, { sessionId: "s1", clientId: "c1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("FK violation");
      expect(result.error.code).toBe("23503");
    }
  });
});

describe("createSessionWithOptionalCompany", () => {
  function makeSupabaseForCreate(opts: {
    insertSession: { data: unknown; error: unknown };
    insertFormationCompanies?: { data: unknown; error: unknown };
    deleteSession?: { data: unknown; error: unknown };
  }) {
    const insertSingleSession = vi.fn().mockResolvedValue(opts.insertSession);
    const selectAfterInsertSession = vi.fn().mockReturnValue({ single: insertSingleSession });
    const insertSession = vi.fn().mockReturnValue({ select: selectAfterInsertSession });

    const insertFormationCompanies = vi.fn().mockResolvedValue(
      opts.insertFormationCompanies ?? { data: null, error: null }
    );

    const eqDelete = vi.fn().mockResolvedValue(opts.deleteSession ?? { data: null, error: null });
    const deleteSession = vi.fn().mockReturnValue({ eq: eqDelete });

    const from = vi.fn((table: string) => {
      if (table === "sessions") {
        return { insert: insertSession, delete: deleteSession };
      }
      if (table === "formation_companies") {
        return { insert: insertFormationCompanies };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    return { supabase: { from } as never, insertSession, insertFormationCompanies, eqDelete };
  }

  it("crée la session sans client_id et n'appelle pas formation_companies si clientId absent", async () => {
    const { supabase, insertSession, insertFormationCompanies } = makeSupabaseForCreate({
      insertSession: { data: { id: "s1", title: "Test" }, error: null },
    });

    const result = await createSessionWithOptionalCompany(supabase, {
      sessionData: { entity_id: "e1", title: "Test" },
      clientId: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session).toEqual({ id: "s1", title: "Test" });
    expect(insertSession).toHaveBeenCalledTimes(1);
    expect(insertFormationCompanies).not.toHaveBeenCalled();
  });

  it("crée la session et upsert formation_companies si clientId fourni", async () => {
    const { supabase, insertFormationCompanies } = makeSupabaseForCreate({
      insertSession: { data: { id: "s1", title: "T" }, error: null },
    });

    const result = await createSessionWithOptionalCompany(supabase, {
      sessionData: { entity_id: "e1", title: "T", price: 500 },
      clientId: "c1",
    });

    expect(result.ok).toBe(true);
    expect(insertFormationCompanies).toHaveBeenCalledWith({
      session_id: "s1",
      client_id: "c1",
      amount: 500,
    });
  });

  it("rollback (delete session) si insert formation_companies échoue", async () => {
    const { supabase, eqDelete } = makeSupabaseForCreate({
      insertSession: { data: { id: "s1" }, error: null },
      insertFormationCompanies: { data: null, error: { message: "FK error", code: "23503" } },
    });

    const result = await createSessionWithOptionalCompany(supabase, {
      sessionData: { entity_id: "e1", title: "T" },
      clientId: "c1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("FK error");
    expect(eqDelete).toHaveBeenCalledWith("id", "s1");
  });

  it("retourne l'erreur si l'insert session échoue (pas de tentative formation_companies)", async () => {
    const { supabase, insertFormationCompanies } = makeSupabaseForCreate({
      insertSession: { data: null, error: { message: "RLS denied", code: "42501" } },
    });

    const result = await createSessionWithOptionalCompany(supabase, {
      sessionData: { entity_id: "e1", title: "T" },
      clientId: "c1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("RLS denied");
    expect(insertFormationCompanies).not.toHaveBeenCalled();
  });

  it("log un console.error si le rollback delete échoue", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { supabase } = makeSupabaseForCreate({
      insertSession: { data: { id: "s1" }, error: null },
      insertFormationCompanies: { data: null, error: { message: "FK error", code: "23503" } },
      deleteSession: { data: null, error: { message: "delete failed", code: "PGRST500" } },
    });

    const result = await createSessionWithOptionalCompany(supabase, {
      sessionData: { entity_id: "e1", title: "T" },
      clientId: "c1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("FK error"); // l'erreur originale, pas celle du rollback
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[sessions] rollback delete failed",
      expect.objectContaining({ sessionId: "s1" })
    );

    consoleErrorSpy.mockRestore();
  });
});

describe("updateSession", () => {
  it("update une session avec les champs fournis", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const supabase = { from } as never;

    const result = await updateSession(supabase, "s1", { total_price: 1500, notes: "test" });

    expect(result.ok).toBe(true);
    expect(from).toHaveBeenCalledWith("sessions");
    expect(update).toHaveBeenCalledWith({ total_price: 1500, notes: "test" });
    expect(eq).toHaveBeenCalledWith("id", "s1");
  });

  it("update avec un seul champ fonctionne", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const supabase = { from } as never;

    const result = await updateSession(supabase, "s1", { total_price: 2000 });

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({ total_price: 2000 });
  });

  it("propage l'erreur Supabase", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "RLS denied", code: "42501" },
    });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const supabase = { from } as never;

    const result = await updateSession(supabase, "s1", { total_price: 1500 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("RLS denied");
      expect(result.error.code).toBe("42501");
    }
  });
});

describe("resolveCatalogPrice", () => {
  function makeMock(response: { data: unknown; error: unknown }) {
    const single = vi.fn().mockResolvedValue(response);
    const eq2 = vi.fn().mockReturnValue({ single });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });
    return { supabase: { from } as never, from, select, eq1, eq2, single };
  }

  it("retourne le prix catalogue depuis trainings.price_per_person", async () => {
    const { supabase, from, eq1, eq2 } = makeMock({
      data: { price_per_person: 1500 },
      error: null,
    });

    const result = await resolveCatalogPrice(supabase, "t1", "e1");

    expect(result).toBe(1500);
    expect(from).toHaveBeenCalledWith("trainings");
    expect(eq1).toHaveBeenCalledWith("id", "t1");
    expect(eq2).toHaveBeenCalledWith("entity_id", "e1");
  });

  it("retourne null si le training n'a pas de price_per_person", async () => {
    const { supabase } = makeMock({
      data: { price_per_person: null },
      error: null,
    });

    const result = await resolveCatalogPrice(supabase, "t1", "e1");

    expect(result).toBeNull();
  });

  it("retourne null si le training n'existe pas (RLS ou ID invalide)", async () => {
    const { supabase } = makeMock({
      data: null,
      error: null,
    });

    const result = await resolveCatalogPrice(supabase, "t-inexistant", "e1");

    expect(result).toBeNull();
  });

  it("retourne null silencieusement si Supabase remonte une erreur", async () => {
    const { supabase } = makeMock({
      data: null,
      error: { message: "RLS denied", code: "42501" },
    });

    const result = await resolveCatalogPrice(supabase, "t1", "e1");

    expect(result).toBeNull();
  });
});

describe("updateSessionField", () => {
  it("filtre par id ET entity_id", async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = [];
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(function (this: object, col: string, val: unknown) {
            eqCalls.push({ col, val });
            return Object.assign(this, {
              eq: vi.fn(function (col2: string, val2: unknown) {
                eqCalls.push({ col: col2, val: val2 });
                return Promise.resolve({ error: null });
              }),
            });
          }),
        })),
      })),
    };
    const res = await updateSessionField(supabase as never, "SESS-1", "ENT-A", { description: "x" });
    expect(res.ok).toBe(true);
    expect(eqCalls).toContainEqual({ col: "id", val: "SESS-1" });
    expect(eqCalls).toContainEqual({ col: "entity_id", val: "ENT-A" });
  });

  it("retourne { ok: false, error: { message } } sur erreur Supabase", async () => {
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: { message: "DB error", code: "42P01" } })),
          })),
        })),
      })),
    };
    const res = await updateSessionField(supabase as never, "SESS-1", "ENT-A", { description: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toBe("DB error");
      expect(res.error.code).toBe("42P01");
    }
  });
});

describe("duplicateSession", () => {
  it("copie les champs source + suffixe (copie) + status='upcoming'", async () => {
    const source = {
      training_id: "T1", entity_id: "ENT-A", title: "Formation X",
      start_date: "2026-01-01", end_date: "2026-01-31", location: "Paris",
      mode: "presentiel", max_participants: 10, notes: null, type: "intra",
      domain: null, description: "desc", total_price: 1000, planned_hours: 14,
      program_id: null,
    };
    let inserted: Record<string, unknown> = {};
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "sessions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({ data: source, error: null })),
            insert: vi.fn((payload: Record<string, unknown>) => {
              inserted = payload;
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn(async () => ({ data: { id: "NEW-ID" }, error: null })),
              };
            }),
          };
        }
        return {};
      }),
    };
    const res = await duplicateSession(supabase as never, "SESS-1", "ENT-A");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.newId).toBe("NEW-ID");
    }
    expect(inserted.title).toBe("Formation X (copie)");
    expect(inserted.status).toBe("upcoming");
    expect(inserted.training_id).toBe("T1");
    expect(inserted.total_price).toBe(1000);
  });

  it("retourne erreur si session introuvable", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({ data: null, error: null })),
      })),
    };
    const res = await duplicateSession(supabase as never, "SESS-UNKNOWN", "ENT-A");
    expect(res.ok).toBe(false);
  });
});

describe("deleteSession", () => {
  it("exécute un seul DELETE filtré par id + entity_id", async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = [];
    const supabase = {
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(function (this: object, col: string, val: unknown) {
            eqCalls.push({ col, val });
            return Object.assign(this, {
              eq: vi.fn(function (col2: string, val2: unknown) {
                eqCalls.push({ col: col2, val: val2 });
                return Promise.resolve({ error: null });
              }),
            });
          }),
        })),
      })),
    };
    const res = await deleteSession(supabase as never, "SESS-1", "ENT-A");
    expect(res.ok).toBe(true);
    expect(eqCalls).toContainEqual({ col: "id", val: "SESS-1" });
    expect(eqCalls).toContainEqual({ col: "entity_id", val: "ENT-A" });
  });
});

describe("sendVisioLinkToLearners", () => {
  it("refuse si visio_link absent", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({
          data: { id: "S1", title: "F", start_date: "2026-01-01", end_date: "2026-01-31", location: null, visio_link: null, entity_id: "ENT-A" },
          error: null,
        })),
      })),
    };
    const res = await sendVisioLinkToLearners(supabase as never, "S1", "ENT-A");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain("visio");
    }
  });

  it("refuse si session pas dans entityId", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({ data: null, error: null })),
      })),
    };
    const res = await sendVisioLinkToLearners(supabase as never, "S1", "ENT-A");
    expect(res.ok).toBe(false);
  });

  it("0 learners inscrits → enqueued=0, skipped=0", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "sessions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({
              data: { id: "S1", title: "F", start_date: "2026-01-01", end_date: "2026-01-31", location: "Paris", visio_link: "https://meet.example.com/abc", entity_id: "ENT-A" },
              error: null,
            })),
          };
        }
        if (table === "enrollments") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn(() => Promise.resolve({ data: [], error: null })),
          };
        }
        return {};
      }),
    };
    const res = await sendVisioLinkToLearners(supabase as never, "S1", "ENT-A");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.enqueued).toBe(0);
      expect(res.skipped).toBe(0);
    }
  });

  it("learner sans email → skipped=1, enqueued=0", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "sessions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({
              data: { id: "S1", title: "F", start_date: "2026-01-01", end_date: "2026-01-31", location: null, visio_link: "https://meet.example.com/abc", entity_id: "ENT-A" },
              error: null,
            })),
          };
        }
        if (table === "enrollments") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn(() => Promise.resolve({
              data: [{ learner: { id: "L1", email: null, first_name: "Jean", last_name: "Dupont" } }],
              error: null,
            })),
          };
        }
        if (table === "email_history") {
          return { insert: vi.fn(() => Promise.resolve({ data: null, error: null })) };
        }
        return {};
      }),
    };
    const res = await sendVisioLinkToLearners(supabase as never, "S1", "ENT-A");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.enqueued).toBe(0);
      expect(res.skipped).toBe(1);
    }
  });
});
