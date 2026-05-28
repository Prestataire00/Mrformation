import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase server client + next/cache.revalidatePath BEFORE importing the action.
const mockAuthGetUser = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { saveTemplate } from "@/app/(dashboard)/admin/emails/_actions/save-template";

const VALID_INPUT = {
  id: "11111111-1111-4111-8111-111111111111",
  initialUpdatedAt: "2026-05-28T12:00:00Z",
  name: "Convocation J-7",
  subject: "Convocation — {{formation}}",
  body: "Bonjour {{nom_apprenant}}, ...",
  category: "automation" as const,
};

beforeEach(() => {
  mockAuthGetUser.mockReset();
  mockFrom.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

/** Setup chain mock for `from('email_templates').select('updated_at').eq(...).maybeSingle()` then `.update(...).eq(...)` */
function setupSelectThenUpdate(opts: {
  selectResult: { data: { updated_at: string } | null; error: { message: string } | null };
  updateResult?: { error: { message: string } | null };
}) {
  const maybeSingleSelect = vi.fn().mockResolvedValue(opts.selectResult);
  const eqSelect = vi.fn().mockReturnValue({ maybeSingle: maybeSingleSelect });
  const select = vi.fn().mockReturnValue({ eq: eqSelect });

  const eqUpdate = vi.fn().mockResolvedValue(opts.updateResult ?? { error: null });
  const update = vi.fn().mockReturnValue({ eq: eqUpdate });

  // Each from() call returns this chain (first call = select, second = update)
  mockFrom.mockReturnValue({ select, update });
}

describe("saveTemplate Server Action", () => {
  it("retourne validation_failed si name vide", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const result = await saveTemplate({ ...VALID_INPUT, name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("validation_failed");
    }
  });

  it("retourne unauthorized si pas de user authentifié", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const result = await saveTemplate(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("retourne not_found si template absent", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    setupSelectThenUpdate({ selectResult: { data: null, error: null } });

    const result = await saveTemplate(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("retourne concurrent_edit si updated_at ne match plus", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    setupSelectThenUpdate({
      selectResult: { data: { updated_at: "2026-05-28T13:00:00Z" }, error: null },
    });

    const result = await saveTemplate(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok && "currentUpdatedAt" in result) {
      expect(result.error).toBe("concurrent_edit");
      expect(result.currentUpdatedAt).toBe("2026-05-28T13:00:00Z");
    } else {
      expect.fail("Expected concurrent_edit error with currentUpdatedAt");
    }
  });

  it("happy path : update + revalidatePath + retourne ok:true", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    setupSelectThenUpdate({
      selectResult: { data: { updated_at: VALID_INPUT.initialUpdatedAt }, error: null },
      updateResult: { error: null },
    });

    const result = await saveTemplate(VALID_INPUT);
    expect(result).toEqual({ ok: true });
  });

  it("propage l'erreur Supabase sur fetch updated_at", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    setupSelectThenUpdate({
      selectResult: { data: null, error: { message: "Connection error" } },
    });

    const result = await saveTemplate(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "Connection error" });
  });

  it("convertit sender_email vide en NULL (DB clean)", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    let capturedPayload: Record<string, unknown> | undefined;
    const maybeSingleSelect = vi
      .fn()
      .mockResolvedValue({ data: { updated_at: VALID_INPUT.initialUpdatedAt }, error: null });
    const eqSelect = vi.fn().mockReturnValue({ maybeSingle: maybeSingleSelect });
    const select = vi.fn().mockReturnValue({ eq: eqSelect });
    const eqUpdate = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockImplementation((payload) => {
      capturedPayload = payload;
      return { eq: eqUpdate };
    });
    mockFrom.mockReturnValue({ select, update });

    await saveTemplate({ ...VALID_INPUT, sender_email: "" });
    expect(capturedPayload).toBeDefined();
    expect(capturedPayload!.sender_email).toBeNull();
  });

  it("category enum accepté pour les 6 valeurs (validation Zod uniquement)", async () => {
    // Mock auth absent → unauthorized, mais on teste juste que Zod ne rejette pas
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const cats = ["transactional", "automation", "reminder", "batch", "campaign", "custom"];
    for (const cat of cats) {
      const result = await saveTemplate({ ...VALID_INPUT, category: cat as never });
      // Avec auth null, on s'arrête à "unauthorized" — preuve que Zod a accepté
      expect(result).toEqual({ ok: false, error: "unauthorized" });
    }
  });
});
