import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionQuestionnaireMeta } from "@/lib/services/load-session-aggregates";

/**
 * SPEC spec-p3-extraction-reponses-evaluations — découverte drift-proof des
 * questionnaires d'une session. Le bug : l'extraction ne lisait que
 * `questionnaire_sessions` (alimentée par un trigger miroir non garanti
 * déployé) ; le fix UNION-ne `questionnaire_sessions` + `formation_*_assignments`.
 */

type Row = {
  questionnaire_id: string;
  questionnaires: { id: string; type: string; title: string | null } | null;
};

/**
 * Mock Supabase minimal : from(table).select(...).eq(...) → Promise<{ data }>.
 * `.eq()` renvoie une vraie Promise pour refléter le contrat async (le helper
 * await via Promise.all), pas un objet synchrone.
 */
function mockSupabase(config: Record<string, Row[]>): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => Promise.resolve({ data: config[table] ?? [], error: null }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const qrow = (id: string, type: string, title = `T-${id}`): Row => ({
  questionnaire_id: id,
  questionnaires: { id, type, title },
});

describe("getSessionQuestionnaireMeta", () => {
  it("découvre les questionnaires attribués via assignment même si le miroir est vide (trigger non déployé)", async () => {
    const supabase = mockSupabase({
      questionnaire_sessions: [],
      formation_evaluation_assignments: [qrow("q-eval", "evaluation")],
    });
    const res = await getSessionQuestionnaireMeta(supabase, "s1", "evaluation");
    expect(res).toEqual([{ id: "q-eval", title: "T-q-eval" }]);
  });

  it("découvre toujours les questionnaires legacy (mirror seul) — pas de régression", async () => {
    const supabase = mockSupabase({
      questionnaire_sessions: [qrow("q-legacy", "satisfaction")],
      formation_satisfaction_assignments: [],
    });
    const res = await getSessionQuestionnaireMeta(supabase, "s1", "satisfaction");
    expect(res.map((q) => q.id)).toEqual(["q-legacy"]);
  });

  it("dédoublonne un questionnaire présent dans les deux sources", async () => {
    const supabase = mockSupabase({
      questionnaire_sessions: [qrow("q-dup", "evaluation")],
      formation_evaluation_assignments: [qrow("q-dup", "evaluation")],
    });
    const res = await getSessionQuestionnaireMeta(supabase, "s1", "evaluation");
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("q-dup");
  });

  it("filtre par type (un assignment pointant un autre type est exclu)", async () => {
    const supabase = mockSupabase({
      questionnaire_sessions: [],
      formation_evaluation_assignments: [
        qrow("q-eval", "evaluation"),
        qrow("q-wrong", "satisfaction"),
      ],
    });
    const res = await getSessionQuestionnaireMeta(supabase, "s1", "evaluation");
    expect(res.map((q) => q.id)).toEqual(["q-eval"]);
  });

  it("dédoublonne une attribution satisfaction en masse (plusieurs lignes, même questionnaire)", async () => {
    const supabase = mockSupabase({
      questionnaire_sessions: [],
      formation_satisfaction_assignments: [
        qrow("q-sat", "satisfaction"),
        qrow("q-sat", "satisfaction"),
        qrow("q-sat", "satisfaction"),
      ],
    });
    const res = await getSessionQuestionnaireMeta(supabase, "s1", "satisfaction");
    expect(res).toHaveLength(1);
  });

  it("renvoie [] quand aucune source ne contient de questionnaire", async () => {
    const supabase = mockSupabase({ questionnaire_sessions: [], formation_evaluation_assignments: [] });
    const res = await getSessionQuestionnaireMeta(supabase, "s1", "evaluation");
    expect(res).toEqual([]);
  });

  it("tolère un title null (fallback chaîne vide)", async () => {
    const supabase = mockSupabase({
      questionnaire_sessions: [],
      formation_evaluation_assignments: [
        { questionnaire_id: "q-x", questionnaires: { id: "q-x", type: "evaluation", title: null } },
      ],
    });
    const res = await getSessionQuestionnaireMeta(supabase, "s1", "evaluation");
    expect(res).toEqual([{ id: "q-x", title: "" }]);
  });
});
