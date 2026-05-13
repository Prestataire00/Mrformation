import { describe, it, expect, vi } from "vitest";
import {
  getSessionIdsByClient,
  linkSessionToCompany,
  createSessionWithOptionalCompany,
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
});
