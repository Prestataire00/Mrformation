import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthGetUser = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: mockAuthGetUser }, from: mockFrom }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { duplicateTemplateToEntity } from "@/app/(dashboard)/admin/emails/_actions/duplicate-to-entity";

const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_A = "22222222-2222-4222-8222-222222222222";
const ENTITY_B = "33333333-3333-4333-8333-333333333333";
const VALID_INPUT = { templateId: TEMPLATE_ID, targetEntityId: ENTITY_B };

beforeEach(() => {
  mockAuthGetUser.mockReset();
  mockFrom.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/**
 * Setup chain mock pour :
 *   1. profiles → select('role').eq('id', user.id).single()
 *   2. email_templates → select('*').eq('id', templateId).maybeSingle() (source fetch)
 *   3. email_templates → insert(payload).select('id').single() (copy insert)
 */
function setupMocks(opts: {
  profile: { data: { role: string } | null; error: { message: string } | null };
  source?: { data: Record<string, unknown> | null; error: { message: string } | null };
  insert?: { data: { id: string } | null; error: { message: string } | null };
}) {
  // profiles chain
  const profileSingle = vi.fn().mockResolvedValue(opts.profile);
  const profileEq = vi.fn().mockReturnValue({ single: profileSingle });
  const profileSelect = vi.fn().mockReturnValue({ eq: profileEq });

  // source chain
  const sourceMaybeSingle = vi.fn().mockResolvedValue(opts.source ?? { data: null, error: null });
  const sourceEq = vi.fn().mockReturnValue({ maybeSingle: sourceMaybeSingle });
  const sourceSelect = vi.fn().mockReturnValue({ eq: sourceEq });

  // insert chain
  const insertSingle = vi.fn().mockResolvedValue(opts.insert ?? { data: { id: "copy-id" }, error: null });
  const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
  const insert = vi.fn().mockReturnValue({ select: insertSelect });

  let emailTemplatesCallCount = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === "profiles") return { select: profileSelect };
    if (table === "email_templates") {
      emailTemplatesCallCount += 1;
      if (emailTemplatesCallCount === 1) return { select: sourceSelect, insert: () => { throw new Error("unexpected"); } };
      return { select: () => { throw new Error("unexpected"); }, insert };
    }
    return {};
  });
}

describe("duplicateTemplateToEntity Server Action", () => {
  it("unauthorized si pas de user", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const result = await duplicateTemplateToEntity(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("forbidden si role !== 'super_admin'", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    setupMocks({ profile: { data: { role: "admin" }, error: null } });
    const result = await duplicateTemplateToEntity(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("forbidden si role = 'trainer' (NFR-EML-SEC-5 server check)", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    setupMocks({ profile: { data: { role: "trainer" }, error: null } });
    const result = await duplicateTemplateToEntity(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("not_found si template source absent", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    setupMocks({
      profile: { data: { role: "super_admin" }, error: null },
      source: { data: null, error: null },
    });
    const result = await duplicateTemplateToEntity(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("same_entity si on tente de dupliquer vers l'entité source", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    setupMocks({
      profile: { data: { role: "super_admin" }, error: null },
      source: {
        data: { id: TEMPLATE_ID, entity_id: ENTITY_B, name: "T", subject: "S", body: "B" },
        error: null,
      },
    });
    const result = await duplicateTemplateToEntity(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "same_entity" });
  });

  it("happy path : super_admin duplique entité A → entité B + retourne copyId", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    let capturedPayload: Record<string, unknown> | undefined;

    const profileSingle = vi.fn().mockResolvedValue({ data: { role: "super_admin" }, error: null });
    const profileEq = vi.fn().mockReturnValue({ single: profileSingle });
    const profileSelect = vi.fn().mockReturnValue({ eq: profileEq });

    const sourceData = {
      id: TEMPLATE_ID,
      entity_id: ENTITY_A,
      name: "Original",
      subject: "Sujet",
      body: "Body",
      key: "reminder_invoice_first",
      category: "reminder",
      is_active: true,
      created_at: "2026-01-01",
      updated_at: "2026-02-01",
    };
    const sourceMaybeSingle = vi.fn().mockResolvedValue({ data: sourceData, error: null });
    const sourceEq = vi.fn().mockReturnValue({ maybeSingle: sourceMaybeSingle });
    const sourceSelect = vi.fn().mockReturnValue({ eq: sourceEq });

    const insertSingle = vi.fn().mockResolvedValue({ data: { id: "new-copy-id" }, error: null });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insert = vi.fn().mockImplementation((payload) => {
      capturedPayload = payload;
      return { select: insertSelect };
    });

    let emailCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return { select: profileSelect };
      if (table === "email_templates") {
        emailCallCount += 1;
        if (emailCallCount === 1) return { select: sourceSelect };
        return { insert };
      }
      return {};
    });

    const result = await duplicateTemplateToEntity(VALID_INPUT);
    expect(result).toEqual({ ok: true, copyId: "new-copy-id" });

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload!.entity_id).toBe(ENTITY_B);
    expect(capturedPayload!.key).toBeNull(); // reset pour éviter collision UNIQUE
    expect(capturedPayload!.name).toBe("[Copie] Original");
    expect(capturedPayload!.created_by).toBe("u1");
    expect(capturedPayload!.is_active).toBe(true);
    expect(capturedPayload!.id).toBeUndefined(); // ID source omis
  });
});
