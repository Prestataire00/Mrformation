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

describe("removeCompanyFromSession", () => {
  it("delete la ligne formation_companies par id + session_id", async () => {
    const eq2 = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const deleteFn = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ delete: deleteFn });
    const supabase = { from } as never;

    const result = await removeCompanyFromSession(supabase, "fc-id", "s1");

    expect(result.ok).toBe(true);
    expect(from).toHaveBeenCalledWith("formation_companies");
    expect(eq1).toHaveBeenCalledWith("id", "fc-id");
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

    const result = await removeCompanyFromSession(supabase, "fc-id", "s1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("42501");
    }
  });
});
