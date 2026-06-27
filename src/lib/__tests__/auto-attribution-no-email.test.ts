import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Mock de l'envoi d'email : on vérifie qu'il N'est PAS appelé en mode in-app.
const enqueueEmailMock = vi.fn();
vi.mock("@/lib/services/email-queue", () => ({
  enqueueEmail: (...args: unknown[]) => enqueueEmailMock(...args),
}));

import {
  resolveQuestionnaireIdForRule,
  executeRuleForSession,
  type RuleInfo,
} from "@/lib/automation/execute-rule";

/**
 * SPEC spec-p1-auto-attribution-sans-email — découplage attribution / email.
 * Vérifie : l'attribution crée l'assignment ET le miroir questionnaire_sessions ;
 * en mode send_email=false aucun email n'est mis en file ; le chemin email
 * historique (autres règles) reste intact.
 */

function ruleOf(document_type: string, send_email?: boolean | null): RuleInfo {
  return {
    id: "r1", trigger_type: "on_enrollment", document_type, days_offset: 0,
    recipient_type: "learners", template_id: null, condition_subcontracted: null,
    name: null, send_email,
  };
}

interface TableResult {
  maybeSingle?: { data: unknown };
  rows?: unknown[];
}

/** Mock Supabase thenable : `await chain` → { data: rows }. */
function mockSupabase(config: Record<string, TableResult>) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const upserts: Array<{ table: string; row: Record<string, unknown>; opts?: unknown }> = [];
  const from = (table: string) => {
    const cfg = config[table] ?? {};
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) {
      chain[m] = () => chain;
    }
    chain.maybeSingle = async () => cfg.maybeSingle ?? { data: null };
    chain.insert = async (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      return { error: null };
    };
    chain.upsert = async (row: Record<string, unknown>, opts?: unknown) => {
      upserts.push({ table, row, opts });
      return { error: null };
    };
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: cfg.rows ?? [], error: null });
    return chain;
  };
  return { supabase: { from } as never, inserts, upserts };
}

beforeEach(() => enqueueEmailMock.mockClear());

describe("resolveQuestionnaireIdForRule — miroir questionnaire_sessions", () => {
  it("crée l'assignment ET upserte le miroir questionnaire_sessions (visibilité in-app)", async () => {
    const { supabase, inserts, upserts } = mockSupabase({
      formation_evaluation_assignments: { maybeSingle: { data: null } },
      questionnaires: { maybeSingle: { data: { id: "Q-DEFAULT" } } },
      questionnaire_sessions: {},
    });
    const res = await resolveQuestionnaireIdForRule(supabase, ruleOf("questionnaire_positionnement"), "S1", "ent-A");
    expect(res).toBe("Q-DEFAULT");
    expect(inserts.some((i) => i.table === "formation_evaluation_assignments")).toBe(true);
    const mirror = upserts.find((u) => u.table === "questionnaire_sessions");
    expect(mirror?.row).toEqual({ questionnaire_id: "Q-DEFAULT", session_id: "S1" });
    // L'idempotence du miroir repose sur la PK (questionnaire_id, session_id).
    expect(mirror?.opts).toEqual({ onConflict: "questionnaire_id,session_id" });
  });
});

describe("executeRuleForSession — mode in-app (send_email=false)", () => {
  const session = { id: "S1", entity_id: "ent-A", title: "Form", start_date: null, end_date: null, location: null } as never;

  it("attribue (assignment + miroir) SANS envoyer d'email", async () => {
    const { supabase, inserts, upserts } = mockSupabase({
      enrollments: { rows: [{ learner: { id: "L1", email: "l@x.fr", first_name: "A", last_name: "B" } }] },
      formation_evaluation_assignments: { maybeSingle: { data: null } },
      questionnaires: { maybeSingle: { data: { id: "Q-DEFAULT" } } },
      questionnaire_sessions: {},
    });
    const res = await executeRuleForSession(supabase, {
      rule: ruleOf("questionnaire_positionnement", false),
      session,
      template: null,
      customTemplatesById: {},
    });
    expect(res.enqueued).toBe(0);
    expect(enqueueEmailMock).not.toHaveBeenCalled();
    expect(inserts.some((i) => i.table === "formation_evaluation_assignments")).toBe(true);
    expect(upserts.some((u) => u.table === "questionnaire_sessions")).toBe(true);
  });

  it("régression : une règle non-questionnaire (email) envoie toujours l'email", async () => {
    const { supabase } = mockSupabase({
      enrollments: { rows: [{ learner: { id: "L1", email: "l@x.fr", first_name: "A", last_name: "B" } }] },
    });
    const res = await executeRuleForSession(supabase, {
      rule: ruleOf("email"), // send_email undefined → comportement historique
      session,
      template: null,
      customTemplatesById: {},
    });
    expect(res.enqueued).toBe(1);
    expect(enqueueEmailMock).toHaveBeenCalledTimes(1);
  });

  it("régression : un questionnaire avec send_email=true emprunte le chemin email historique (pas la branche in-app)", async () => {
    const { supabase } = mockSupabase({
      enrollments: { rows: [{ learner: { id: "L1", email: "l@x.fr", first_name: "A", last_name: "B" } }] },
      formation_satisfaction_assignments: { maybeSingle: { data: null } },
      questionnaires: { maybeSingle: { data: { id: "Q-DEFAULT" } } },
      questionnaire_sessions: {},
      questionnaire_tokens: { rows: [] },
    });
    const res = await executeRuleForSession(supabase, {
      rule: ruleOf("questionnaire_satisfaction", true),
      session,
      template: null,
      customTemplatesById: {},
    });
    // send_email=true ⇒ NON pris par la branche in-app ⇒ email envoyé comme avant.
    expect(enqueueEmailMock).toHaveBeenCalled();
    expect(res.enqueued).toBeGreaterThanOrEqual(1);
  });
});

describe("migration add_automation_rules_send_email_flag.sql", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/add_automation_rules_send_email_flag.sql"),
    "utf8",
  );

  it("ajoute la colonne send_email de façon idempotente (défaut true)", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS send_email BOOLEAN DEFAULT true/);
  });

  it("désactive l'email pour les 3 questionnaires actifs", () => {
    expect(sql).toContain("questionnaire_positionnement");
    expect(sql).toContain("questionnaire_autoevaluation");
    expect(sql).toContain("questionnaire_satisfaction");
    expect(sql).toMatch(/SET send_email = false/);
  });
});
