import { describe, it, expect, vi } from "vitest";
import { getQualiopiAudit, upsertQualiopiAudit } from "@/lib/services/qualiopi";

describe("getQualiopiAudit", () => {
  it("retourne l'audit existant", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        session_id: "s1",
        score: 75,
        manual_checks: { item1: true, item2: false },
        audited_at: "2026-05-01T10:00:00Z",
        audited_by: "user-1",
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as never;

    const result = await getQualiopiAudit(supabase, "s1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audit?.score).toBe(75);
      expect(result.audit?.manual_checks).toEqual({ item1: true, item2: false });
    }
    expect(from).toHaveBeenCalledWith("formation_qualiopi_audits");
    expect(eq).toHaveBeenCalledWith("session_id", "s1");
  });

  it("retourne audit=null si aucun audit n'existe (pas une erreur)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as never;

    const result = await getQualiopiAudit(supabase, "s1");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.audit).toBeNull();
  });

  it("propage l'erreur Supabase", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "RLS denied", code: "42501" },
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as never;

    const result = await getQualiopiAudit(supabase, "s1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("42501");
  });
});

describe("upsertQualiopiAudit", () => {
  it("upsert l'audit avec les champs fournis (onConflict session_id)", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as never;

    const result = await upsertQualiopiAudit(supabase, {
      sessionId: "s1",
      entityId: "e1",
      score: 80,
      manualChecks: { item1: true },
      auditedBy: "user-1",
    });

    expect(result.ok).toBe(true);
    expect(from).toHaveBeenCalledWith("formation_qualiopi_audits");
    const [payload, options] = upsert.mock.calls[0];
    expect(payload).toMatchObject({
      session_id: "s1",
      entity_id: "e1",
      score: 80,
      manual_checks: { item1: true },
      audited_by: "user-1",
    });
    expect(payload.audited_at).toBeDefined();
    expect(payload.updated_at).toBeDefined();
    expect(options).toEqual({ onConflict: "session_id" });
  });

  it("auditedBy null si non fourni", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as never;

    await upsertQualiopiAudit(supabase, {
      sessionId: "s1",
      entityId: "e1",
      score: 50,
      manualChecks: {},
    });

    const [payload] = upsert.mock.calls[0];
    expect(payload.audited_by).toBeNull();
  });

  it("propage l'erreur Supabase", async () => {
    const upsert = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "constraint violation", code: "23503" },
    });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as never;

    const result = await upsertQualiopiAudit(supabase, {
      sessionId: "s1",
      entityId: "e1",
      score: 50,
      manualChecks: {},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("23503");
  });
});
