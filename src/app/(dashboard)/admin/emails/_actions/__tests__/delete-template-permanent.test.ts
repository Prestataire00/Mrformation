import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthGetUser = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: mockAuthGetUser }, from: mockFrom }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteTemplatePermanent } from "@/app/(dashboard)/admin/emails/_actions/delete-template-permanent";

const VALID_ID = "11111111-1111-4111-8111-111111111111";
const VALID_INPUT = { id: VALID_ID, confirmText: "supprimer" as const };

beforeEach(() => {
  mockAuthGetUser.mockReset();
  mockFrom.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function setupMocks(opts: {
  templateResult: { data: { id: string; entity_id: string; name: string; key: string | null } | null; error: { message: string } | null };
  formationRulesData?: Array<{ id: string; name: string }>;
  crmRulesData?: Array<{ id: string; name: string; config: Record<string, unknown> }>;
  deleteResult?: { error: { message: string } | null };
}) {
  const tplMaybeSingle = vi.fn().mockResolvedValue(opts.templateResult);
  const tplEq = vi.fn().mockReturnValue({ maybeSingle: tplMaybeSingle });
  const tplSelect = vi.fn().mockReturnValue({ eq: tplEq });

  const formationRulesEq = vi.fn().mockResolvedValue({ data: opts.formationRulesData ?? [], error: null });
  const formationRulesSelect = vi.fn().mockReturnValue({ eq: formationRulesEq });

  const crmRulesFilter = vi.fn().mockResolvedValue({ data: opts.crmRulesData ?? [], error: null });
  const crmRulesSelect = vi.fn().mockReturnValue({ filter: crmRulesFilter });

  const deleteEq = vi.fn().mockResolvedValue(opts.deleteResult ?? { error: null });
  const del = vi.fn().mockReturnValue({ eq: deleteEq });

  mockFrom.mockImplementation((table: string) => {
    if (table === "email_templates") {
      // Selon l'ordre du call : 1er = fetch, dernier = delete
      // On regarde si .select() ou .delete() est appelé
      return {
        select: tplSelect,
        delete: del,
      };
    }
    if (table === "formation_automation_rules") return { select: formationRulesSelect };
    if (table === "crm_automation_rules") return { select: crmRulesSelect };
    return {};
  });
}

describe("deleteTemplatePermanent Server Action", () => {
  it("validation_failed si confirmText différent de 'supprimer'", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const result = await deleteTemplatePermanent({
      id: VALID_ID,
      confirmText: "delete" as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("validation_failed");
  });

  it("unauthorized si pas de user", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const result = await deleteTemplatePermanent(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("not_found si template absent", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    setupMocks({ templateResult: { data: null, error: null } });
    const result = await deleteTemplatePermanent(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("referenced_by_rules si template référencé par formation_automation_rules", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    setupMocks({
      templateResult: { data: { id: VALID_ID, entity_id: "ent-1", name: "Test", key: null }, error: null },
      formationRulesData: [{ id: "rule-1", name: "Rule A" }],
    });
    const result = await deleteTemplatePermanent(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok && "references" in result) {
      expect(result.error).toBe("referenced_by_rules");
      expect(result.references).toHaveLength(1);
      expect(result.references[0]).toMatch(/Formation: Rule A/);
    } else {
      expect.fail("Expected referenced_by_rules");
    }
  });

  it("referenced_by_rules combine formation + CRM rules", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    setupMocks({
      templateResult: { data: { id: VALID_ID, entity_id: "ent-1", name: "Test", key: null }, error: null },
      formationRulesData: [{ id: "rule-1", name: "Formation Rule" }],
      crmRulesData: [{ id: "rule-2", name: "CRM Rule", config: { template_id: VALID_ID } }],
    });
    const result = await deleteTemplatePermanent(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok && "references" in result) {
      expect(result.references).toHaveLength(2);
      expect(result.references[0]).toMatch(/Formation: Formation Rule/);
      expect(result.references[1]).toMatch(/CRM: CRM Rule/);
    } else {
      expect.fail("Expected referenced_by_rules");
    }
  });

  it("happy path : DELETE + ok:true si aucune référence", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    setupMocks({
      templateResult: { data: { id: VALID_ID, entity_id: "ent-1", name: "Test", key: null }, error: null },
      formationRulesData: [],
      crmRulesData: [],
    });
    const result = await deleteTemplatePermanent(VALID_INPUT);
    expect(result).toEqual({ ok: true });
  });
});
