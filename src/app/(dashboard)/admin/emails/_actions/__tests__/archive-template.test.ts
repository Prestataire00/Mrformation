import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthGetUser = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { archiveTemplate } from "@/app/(dashboard)/admin/emails/_actions/archive-template";

const VALID_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mockAuthGetUser.mockReset();
  mockFrom.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

/**
 * Setup mock for 3 sequential .from() calls :
 *   1. email_templates → select fetch template
 *   2. email_template_usage → select usage_count
 *   3. email_templates → update is_active
 */
function setupArchiveMocks(opts: {
  templateResult: { data: { id: string; entity_id: string; is_active: boolean } | null; error: { message: string } | null };
  usageResult: { data: { usage_count: number } | null; error: { message: string } | null };
  updateResult?: { error: { message: string } | null };
}) {
  const templateSelectMaybeSingle = vi.fn().mockResolvedValue(opts.templateResult);
  const templateSelectEq = vi.fn().mockReturnValue({ maybeSingle: templateSelectMaybeSingle });
  const templateSelect = vi.fn().mockReturnValue({ eq: templateSelectEq });

  const usageSelectMaybeSingle = vi.fn().mockResolvedValue(opts.usageResult);
  const usageSelectEq = vi.fn().mockReturnValue({ maybeSingle: usageSelectMaybeSingle });
  const usageSelect = vi.fn().mockReturnValue({ eq: usageSelectEq });

  const updateEq = vi.fn().mockResolvedValue(opts.updateResult ?? { error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });

  let callCount = 0;
  mockFrom.mockImplementation((table: string) => {
    callCount += 1;
    if (table === "email_templates" && callCount === 1) {
      return { select: templateSelect, update: () => { throw new Error("unexpected"); } };
    }
    if (table === "email_template_usage") {
      return { select: usageSelect };
    }
    if (table === "email_templates") {
      return { select: () => { throw new Error("unexpected"); }, update };
    }
    return {};
  });
}

describe("archiveTemplate Server Action", () => {
  it("retourne unauthorized si pas de user", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const result = await archiveTemplate({ id: VALID_ID });
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("retourne not_found si template absent", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    setupArchiveMocks({
      templateResult: { data: null, error: null },
      usageResult: { data: null, error: null },
    });
    const result = await archiveTemplate({ id: VALID_ID });
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("retourne in_use + usageCount si template référencé par des automations", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    setupArchiveMocks({
      templateResult: { data: { id: VALID_ID, entity_id: "ent-1", is_active: true }, error: null },
      usageResult: { data: { usage_count: 3 }, error: null },
    });
    const result = await archiveTemplate({ id: VALID_ID });
    expect(result).toEqual({ ok: false, error: "in_use", usageCount: 3 });
  });

  it("happy path : archive (is_active=FALSE) si usage_count = 0", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    setupArchiveMocks({
      templateResult: { data: { id: VALID_ID, entity_id: "ent-1", is_active: true }, error: null },
      usageResult: { data: null, error: null }, // vue retourne 0 ligne = pas d'usage
    });
    const result = await archiveTemplate({ id: VALID_ID });
    expect(result).toEqual({ ok: true });
  });

  it("archive autorisé en fail-safe si la vue usage retourne une erreur", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    setupArchiveMocks({
      templateResult: { data: { id: VALID_ID, entity_id: "ent-1", is_active: true }, error: null },
      usageResult: { data: null, error: { message: "view not yet deployed" } },
    });
    const result = await archiveTemplate({ id: VALID_ID });
    expect(result).toEqual({ ok: true });
  });

  it("propage erreur Supabase sur fetch template", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    setupArchiveMocks({
      templateResult: { data: null, error: { message: "RLS denial" } },
      usageResult: { data: null, error: null },
    });
    const result = await archiveTemplate({ id: VALID_ID });
    expect(result).toEqual({ ok: false, error: "RLS denial" });
  });

  it("propage erreur Supabase sur update is_active", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    setupArchiveMocks({
      templateResult: { data: { id: VALID_ID, entity_id: "ent-1", is_active: true }, error: null },
      usageResult: { data: null, error: null },
      updateResult: { error: { message: "update failed" } },
    });
    const result = await archiveTemplate({ id: VALID_ID });
    expect(result).toEqual({ ok: false, error: "update failed" });
  });
});
