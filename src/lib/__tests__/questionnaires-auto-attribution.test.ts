import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  resolveQuestionnaireIdForRule,
  isQuestionnaireRule,
  type RuleInfo,
} from "@/lib/automation/execute-rule";

/**
 * Goal A — Auto-attribution des questionnaires Qualiopi.
 * Couvre : mapping document_type, lazy-resolve + création d'assignment,
 * skip propre, isolation entity_id, et idempotence du seed SQL.
 */

function ruleOf(document_type: string): RuleInfo {
  return {
    id: "r1", trigger_type: "on_enrollment", document_type, days_offset: 0,
    recipient_type: "learners", template_id: null, condition_subcontracted: null, name: null,
  };
}

/** Mock Supabase chaînable, résultats configurables par table. */
function mockSupabase(config: Record<string, { maybeSingle?: { data: unknown }; insertError?: { message?: string; code?: string } }>) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const eqCalls: Array<{ table: string; col: string; val: unknown }> = [];
  const tablesQueried: string[] = [];
  const from = vi.fn((table: string) => {
    tablesQueried.push(table);
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, val: unknown) => { eqCalls.push({ table, col, val }); return chain; }),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => config[table]?.maybeSingle ?? { data: null }),
      insert: vi.fn(async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return { error: config[table]?.insertError ?? null };
      }),
    };
    return chain;
  });
  return { supabase: { from } as never, inserts, eqCalls, tablesQueried };
}

describe("isQuestionnaireRule", () => {
  it("reconnaît le nouveau type questionnaire_autoevaluation", () => {
    expect(isQuestionnaireRule(ruleOf("questionnaire_autoevaluation"))).toBe(true);
  });
});

describe("resolveQuestionnaireIdForRule — assignment explicite (priorité)", () => {
  it("retourne le questionnaire déjà attribué à la session sans rien créer", async () => {
    const { supabase, inserts, tablesQueried } = mockSupabase({
      formation_evaluation_assignments: { maybeSingle: { data: { questionnaire_id: "Q-MANUEL" } } },
    });
    const res = await resolveQuestionnaireIdForRule(supabase, ruleOf("questionnaire_positionnement"), "S1", "ent-A");
    expect(res).toBe("Q-MANUEL");
    expect(inserts).toHaveLength(0);
    expect(tablesQueried).not.toContain("questionnaires"); // pas de fallback déclenché
  });
});

describe("resolveQuestionnaireIdForRule — auto-attribution (lazy)", () => {
  it("résout le questionnaire default d'entité et crée l'assignment éval (auto_eval_post)", async () => {
    const { supabase, inserts, eqCalls } = mockSupabase({
      formation_evaluation_assignments: { maybeSingle: { data: null } },
      questionnaires: { maybeSingle: { data: { id: "Q-DEFAULT" } } },
    });
    const res = await resolveQuestionnaireIdForRule(supabase, ruleOf("questionnaire_autoevaluation"), "S1", "ent-A");
    expect(res).toBe("Q-DEFAULT");
    expect(inserts).toEqual([{
      table: "formation_evaluation_assignments",
      row: { session_id: "S1", questionnaire_id: "Q-DEFAULT", evaluation_type: "auto_eval_post", learner_id: null },
    }]);
    // Isolation : le questionnaire default est cherché dans l'entité de la session.
    expect(eqCalls).toContainEqual({ table: "questionnaires", col: "entity_id", val: "ent-A" });
    expect(eqCalls).toContainEqual({ table: "questionnaires", col: "quality_indicator_type", val: "auto_eval_post" });
  });

  it("crée un assignment satisfaction (target_type learner) pour questionnaire_satisfaction", async () => {
    const { supabase, inserts } = mockSupabase({
      formation_satisfaction_assignments: { maybeSingle: { data: null } },
      questionnaires: { maybeSingle: { data: { id: "Q-SAT" } } },
    });
    const res = await resolveQuestionnaireIdForRule(supabase, ruleOf("questionnaire_satisfaction"), "S1", "ent-A");
    expect(res).toBe("Q-SAT");
    expect(inserts[0]).toEqual({
      table: "formation_satisfaction_assignments",
      row: { session_id: "S1", questionnaire_id: "Q-SAT", satisfaction_type: "satisfaction_chaud", target_type: "learner", target_id: null },
    });
  });

  it("skip propre (null, aucun insert) si l'entité n'a pas de questionnaire default", async () => {
    const { supabase, inserts } = mockSupabase({
      formation_evaluation_assignments: { maybeSingle: { data: null } },
      questionnaires: { maybeSingle: { data: null } },
    });
    const res = await resolveQuestionnaireIdForRule(supabase, ruleOf("questionnaire_positionnement"), "S1", "ent-A");
    expect(res).toBe(null);
    expect(inserts).toHaveLength(0);
  });

  it("retourne null sans chercher de default si entityId absent (rétro-compat)", async () => {
    const { supabase, tablesQueried } = mockSupabase({
      formation_evaluation_assignments: { maybeSingle: { data: null } },
    });
    const res = await resolveQuestionnaireIdForRule(supabase, ruleOf("questionnaire_positionnement"), "S1");
    expect(res).toBe(null);
    expect(tablesQueried).not.toContain("questionnaires");
  });

  it("retourne null pour un document_type hors mapping", async () => {
    const { supabase } = mockSupabase({});
    const res = await resolveQuestionnaireIdForRule(supabase, ruleOf("convocation"), "S1", "ent-A");
    expect(res).toBe(null);
  });

  it("avale une violation d'unicité (23505) sur l'assignment concurrent et renvoie le questionnaire", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = mockSupabase({
      formation_evaluation_assignments: { maybeSingle: { data: null }, insertError: { code: "23505", message: "duplicate key value" } },
      questionnaires: { maybeSingle: { data: { id: "Q-DEFAULT" } } },
    });
    const res = await resolveQuestionnaireIdForRule(supabase, ruleOf("questionnaire_positionnement"), "S1", "ent-A");
    expect(res).toBe("Q-DEFAULT"); // bénin : l'envoi du lien n'est pas bloqué
    expect(errSpy).not.toHaveBeenCalled(); // pas loggé comme erreur
    errSpy.mockRestore();
  });
});

describe("seed migration SQL — idempotence & couverture multi-tenant", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/seed_questionnaires_auto_attribution.sql"),
    "utf-8",
  );

  it("cible les 2 entités MR + C3V", () => {
    expect(sql).toContain("mr-formation");
    expect(sql).toContain("c3v-formation");
  });

  it("crée les 2 questionnaires program_objectives (auto_eval_pre + auto_eval_post)", () => {
    expect(sql).toContain("auto_eval_pre");
    expect(sql).toContain("auto_eval_post");
    expect(sql).toContain("program_objectives");
  });

  it("seede les 3 règles aux bons triggers", () => {
    expect(sql).toContain("on_enrollment");
    expect(sql).toContain("on_session_completion");
    expect(sql).toContain("questionnaire_positionnement");
    expect(sql).toContain("questionnaire_autoevaluation");
    expect(sql).toContain("questionnaire_satisfaction");
  });

  it("est idempotent (gardes WHERE NOT EXISTS sur les règles)", () => {
    expect(sql).toMatch(/WHERE NOT EXISTS/i);
    // Une garde par règle seedée (positionnement, autoeval, satisfaction).
    expect((sql.match(/WHERE NOT EXISTS/gi) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("garantit l'unicité des assignments masse (index partiels + dédoublonnage)", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uniq_fea_session_evaltype_mass/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uniq_fsa_session_sattype_target_mass/);
    expect(sql).toMatch(/WHERE learner_id IS NULL/);
    expect(sql).toMatch(/WHERE target_id IS NULL/);
    expect(sql).toMatch(/DELETE FROM formation_evaluation_assignments/);
  });

  it("est auto-suffisant pour le type de question program_objectives", () => {
    expect(sql).toMatch(/questions_type_check/);
  });
});
