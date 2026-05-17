import { describe, it, expect, vi } from "vitest";
import { addCompanyToSession, removeCompanyFromSession } from "@/lib/services/formation-companies";

describe("addCompanyToSession", () => {
  it("insert une ligne formation_companies avec tous les champs", async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as never;

    const result = await addCompanyToSession(supabase, {
      sessionId: "s1",
      clientId: "c1",
      amount: 1500,
      email: "client@example.com",
      reference: "PO-123",
    });

    expect(result.ok).toBe(true);
    expect(from).toHaveBeenCalledWith("formation_companies");
    expect(insert).toHaveBeenCalledWith({
      session_id: "s1",
      client_id: "c1",
      amount: 1500,
      email: "client@example.com",
      reference: "PO-123",
    });
  });

  it("insert avec amount/email/reference null si non fournis", async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as never;

    await addCompanyToSession(supabase, { sessionId: "s1", clientId: "c1" });

    expect(insert).toHaveBeenCalledWith({
      session_id: "s1",
      client_id: "c1",
      amount: null,
      email: null,
      reference: null,
    });
  });

  it("propage l'erreur Supabase (unique constraint)", async () => {
    const insert = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "duplicate key value violates unique constraint", code: "23505" },
    });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as never;

    const result = await addCompanyToSession(supabase, { sessionId: "s1", clientId: "c1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("23505");
    }
  });
});

/**
 * Mock Supabase client qui gère :
 *  - select().eq().eq().maybeSingle() (lookup client_id avant delete)
 *  - delete().eq().eq() (delete formation_companies)
 *  - delete().eq().eq().eq().eq() (cleanup docs orphelins)
 *  - select().eq() (sync total_price : lecture sum amounts)
 *  - update().eq() (sync total_price : update sessions)
 *
 * Configuration : on retourne un client_id par défaut, et override le delete
 * formation_companies pour tester success/error.
 */
function buildSupabaseMock(opts: {
  deleteError?: { message: string; code?: string } | null;
  clientId?: string | null;
} = {}) {
  const clientId = opts.clientId ?? "client-1";

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "formation_companies") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { client_id: clientId }, error: null }),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: opts.deleteError ?? null }),
            }),
          }),
        };
      }
      if (table === "documents") {
        // Mock pour cleanup docs orphelins (delete enchainé sur 4 eq)
        const chainEq = (depth: number): unknown => depth >= 4
          ? Promise.resolve({ data: null, error: null })
          : { eq: vi.fn().mockReturnValue(chainEq(depth + 1)) };
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(chainEq(1)),
          }),
        };
      }
      if (table === "sessions") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      // Default : pour la lecture des amounts dans syncSessionTotalPrice
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    }),
  };
}

describe("removeCompanyFromSession", () => {
  it("delete la ligne formation_companies + cleanup docs + sync prix", async () => {
    const supabase = buildSupabaseMock() as never;
    const result = await removeCompanyFromSession(supabase, "fc-id", "s1");
    expect(result.ok).toBe(true);
  });

  it("propage l'erreur Supabase si le delete formation_companies échoue", async () => {
    const supabase = buildSupabaseMock({
      deleteError: { message: "RLS denied", code: "42501" },
    }) as never;
    const result = await removeCompanyFromSession(supabase, "fc-id", "s1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("42501");
    }
  });
});
