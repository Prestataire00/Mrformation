import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveEmailTemplate,
  assertSeedComplete,
  REQUIRED_KEYS,
} from "@/lib/services/email-template-resolver";

type MockSupabase = {
  from: ReturnType<typeof vi.fn>;
};

/** Builder pour mocker la chaîne `.from().select().eq().eq().eq().maybeSingle()` */
function makeSupabaseMockMaybeSingle(response: { data: unknown; error: unknown }): MockSupabase {
  const maybeSingle = vi.fn().mockResolvedValue(response);
  const eq3 = vi.fn().mockReturnValue({ maybeSingle });
  const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

/** Builder pour mocker la chaîne `.from().select().eq().in().eq()` (assertSeedComplete) */
function makeSupabaseMockInList(response: { data: unknown; error: unknown }): MockSupabase {
  const eq2 = vi.fn().mockResolvedValue(response);
  const inList = vi.fn().mockReturnValue({ eq: eq2 });
  const eq1 = vi.fn().mockReturnValue({ in: inList });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

const ENTITY_ID = "11111111-1111-1111-1111-111111111111";

const FAKE_TEMPLATE = {
  id: "tpl-1",
  entity_id: ENTITY_ID,
  name: "Relance facture 1er rappel",
  subject: "Rappel — Facture {{reference}}",
  body: "Bonjour {{client}}",
  type: null,
  variables: [],
  created_at: "2026-05-28T00:00:00Z",
  key: "reminder_invoice_first",
  category: "reminder",
  is_active: true,
};

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("resolveEmailTemplate", () => {
  it("retourne le template quand trouvé (happy path)", async () => {
    const supabase = makeSupabaseMockMaybeSingle({ data: FAKE_TEMPLATE, error: null });

    const result = await resolveEmailTemplate(
      supabase as never,
      "reminder_invoice_first",
      ENTITY_ID,
    );

    expect(result).toEqual(FAKE_TEMPLATE);
    expect(supabase.from).toHaveBeenCalledWith("email_templates");
  });

  it("retourne null quand le template n'existe pas (graceful, jamais throw)", async () => {
    const supabase = makeSupabaseMockMaybeSingle({ data: null, error: null });

    const result = await resolveEmailTemplate(
      supabase as never,
      "reminder_invoice_first",
      ENTITY_ID,
    );

    expect(result).toBeNull();
  });

  it("retourne null si Supabase retourne une erreur (graceful, log emitted)", async () => {
    const supabase = makeSupabaseMockMaybeSingle({
      data: null,
      error: { message: "RLS denial", code: "42501" },
    });

    const result = await resolveEmailTemplate(
      supabase as never,
      "reminder_invoice_first",
      ENTITY_ID,
    );

    expect(result).toBeNull();
  });

  it("retourne null si key vide ou entityId vide (early return, pas de query)", async () => {
    const supabase = makeSupabaseMockMaybeSingle({ data: FAKE_TEMPLATE, error: null });

    const result1 = await resolveEmailTemplate(supabase as never, "", ENTITY_ID);
    const result2 = await resolveEmailTemplate(supabase as never, "reminder_invoice_first", "");

    expect(result1).toBeNull();
    expect(result2).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("émet un event email_template_resolved avec contexte sur succès", async () => {
    const logSpy = vi.spyOn(console, "log");
    const supabase = makeSupabaseMockMaybeSingle({ data: FAKE_TEMPLATE, error: null });

    await resolveEmailTemplate(supabase as never, "reminder_invoice_first", ENTITY_ID);

    const events = logSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string);
        } catch {
          return null;
        }
      })
      .filter((e) => e?.event === "email_template_resolved");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: "email_template_resolved",
      entity_id: ENTITY_ID,
      key: "reminder_invoice_first",
      template_id: "tpl-1",
      status: "ok",
    });
    expect(events[0].latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("émet un event email_template_missing au niveau error sur null", async () => {
    const logSpy = vi.spyOn(console, "log");
    const supabase = makeSupabaseMockMaybeSingle({ data: null, error: null });

    await resolveEmailTemplate(supabase as never, "reminder_invoice_first", ENTITY_ID);

    const events = logSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string);
        } catch {
          return null;
        }
      })
      .filter((e) => e?.event === "email_template_missing");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: "email_template_missing",
      entity_id: ENTITY_ID,
      key: "reminder_invoice_first",
      level: "error",
    });
  });
});

describe("assertSeedComplete", () => {
  it("retourne ok=true quand tous les keys requis sont présents", async () => {
    const allKeysData = REQUIRED_KEYS.map((key) => ({ key }));
    const supabase = makeSupabaseMockInList({ data: allKeysData, error: null });

    const result = await assertSeedComplete(supabase as never, ENTITY_ID);

    expect(result).toEqual({ ok: true, missing: [] });
  });

  it("retourne ok=false + liste des manquants si seed incomplet", async () => {
    // Simule seul 2 keys présents sur les 21+
    const partialData = [
      { key: "reminder_invoice_first" },
      { key: "opco_deposit" },
    ];
    const supabase = makeSupabaseMockInList({ data: partialData, error: null });

    const result = await assertSeedComplete(supabase as never, ENTITY_ID);

    expect(result.ok).toBe(false);
    expect(result.missing.length).toBe(REQUIRED_KEYS.length - 2);
    expect(result.missing).not.toContain("reminder_invoice_first");
    expect(result.missing).not.toContain("opco_deposit");
    expect(result.missing).toContain("reminder_quote_first");
  });

  it("retourne ok=false avec tous les keys missing si entityId vide (early return)", async () => {
    const supabase = makeSupabaseMockInList({ data: [], error: null });

    const result = await assertSeedComplete(supabase as never, "");

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([...REQUIRED_KEYS]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("retourne ok=false + log critical sur erreur Supabase", async () => {
    const logSpy = vi.spyOn(console, "log");
    const supabase = makeSupabaseMockInList({
      data: null,
      error: { message: "Connection error" },
    });

    const result = await assertSeedComplete(supabase as never, ENTITY_ID);

    expect(result.ok).toBe(false);

    const criticalEvents = logSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string);
        } catch {
          return null;
        }
      })
      .filter((e) => e?.event === "email_template_seed_incomplete" && e?.level === "critical");

    expect(criticalEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("émet un event email_template_seed_incomplete critical quand des keys manquent", async () => {
    const logSpy = vi.spyOn(console, "log");
    const supabase = makeSupabaseMockInList({
      data: [{ key: "reminder_invoice_first" }],
      error: null,
    });

    await assertSeedComplete(supabase as never, ENTITY_ID);

    const events = logSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(c[0] as string);
        } catch {
          return null;
        }
      })
      .filter((e) => e?.event === "email_template_seed_incomplete");

    expect(events).toHaveLength(1);
    expect(events[0].level).toBe("critical");
    expect(events[0].missing.length).toBeGreaterThan(0);
  });
});

describe("REQUIRED_KEYS", () => {
  it("contient les 8 keys core pipelines (em-b-1 à em-b-4)", () => {
    expect(REQUIRED_KEYS).toContain("reminder_invoice_first");
    expect(REQUIRED_KEYS).toContain("reminder_invoice_second");
    expect(REQUIRED_KEYS).toContain("reminder_invoice_final");
    expect(REQUIRED_KEYS).toContain("reminder_quote_first");
    expect(REQUIRED_KEYS).toContain("reminder_quote_second");
    expect(REQUIRED_KEYS).toContain("reminder_quote_final");
    expect(REQUIRED_KEYS).toContain("quote_sign_request");
    expect(REQUIRED_KEYS).toContain("opco_deposit");
  });

  it("contient au moins 10 keys batch_* (em-b-5)", () => {
    const batchKeys = REQUIRED_KEYS.filter((k) => k.startsWith("batch_"));
    expect(batchKeys.length).toBeGreaterThanOrEqual(10);
  });

  it("ne contient aucun doublon", () => {
    const set = new Set(REQUIRED_KEYS);
    expect(set.size).toBe(REQUIRED_KEYS.length);
  });
});
