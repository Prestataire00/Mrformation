import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthGetUser = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: mockAuthGetUser }, from: mockFrom }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { restoreTemplate } from "@/app/(dashboard)/admin/emails/_actions/restore-template";

const VALID_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mockAuthGetUser.mockReset();
  mockFrom.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function setupMocks(opts: {
  templateResult: { data: { id: string; entity_id: string; key: string | null; is_active: boolean } | null; error: { message: string } | null };
  updateResult?: { error: { message: string; code?: string } | null };
}) {
  const tplMaybeSingle = vi.fn().mockResolvedValue(opts.templateResult);
  const tplEq = vi.fn().mockReturnValue({ maybeSingle: tplMaybeSingle });
  const tplSelect = vi.fn().mockReturnValue({ eq: tplEq });

  const updEq = vi.fn().mockResolvedValue(opts.updateResult ?? { error: null });
  const upd = vi.fn().mockReturnValue({ eq: updEq });

  let call = 0;
  mockFrom.mockImplementation(() => {
    call += 1;
    if (call === 1) return { select: tplSelect, update: () => { throw new Error("unexpected"); } };
    return { select: () => { throw new Error("unexpected"); }, update: upd };
  });
}

describe("restoreTemplate Server Action", () => {
  it("unauthorized si pas de user", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const result = await restoreTemplate({ id: VALID_ID });
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("not_found si template absent", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    setupMocks({ templateResult: { data: null, error: null } });
    const result = await restoreTemplate({ id: VALID_ID });
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("happy path : UPDATE is_active = TRUE + ok:true", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    setupMocks({
      templateResult: {
        data: { id: VALID_ID, entity_id: "ent-1", key: "custom_key", is_active: false },
        error: null,
      },
    });
    const result = await restoreTemplate({ id: VALID_ID });
    expect(result).toEqual({ ok: true });
  });

  it("key_already_active si UPDATE viole l'index UNIQUE partial (code 23505)", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    setupMocks({
      templateResult: {
        data: { id: VALID_ID, entity_id: "ent-1", key: "reminder_invoice_first", is_active: false },
        error: null,
      },
      updateResult: { error: { message: "unique violation", code: "23505" } },
    });
    const result = await restoreTemplate({ id: VALID_ID });
    expect(result.ok).toBe(false);
    if (!result.ok && "conflictingKey" in result) {
      expect(result.error).toBe("key_already_active");
      expect(result.conflictingKey).toBe("reminder_invoice_first");
    } else {
      expect.fail("Expected key_already_active");
    }
  });
});
