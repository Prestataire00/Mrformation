import { describe, it, expect, vi } from "vitest";
import { getSessionIdsByClient } from "@/lib/services/sessions";

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
