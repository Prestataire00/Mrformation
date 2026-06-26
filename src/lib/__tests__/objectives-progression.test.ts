import { describe, it, expect, vi } from "vitest";
import { loadObjectivesProgression } from "@/lib/services/load-session-aggregates";

/**
 * Tests de la fonction loadObjectivesProgression.
 * Fixtures simulant les réponses program_objectives (clés {qid}::obj_{i})
 * et _objectives_snapshot, pour les questionnaires auto_eval_pre / auto_eval_post.
 */

const Q_PRE = "q-pre-id";
const Q_POST = "q-post-id";
// En prod, le questionnaire "avant" et "après" sont DISTINCTS : chacun a sa
// propre question placeholder program_objectives → des question_id différents.
// Les fixtures DOIVENT le refléter (sinon le bug d'agrégation reste masqué).
const QID_PRE_QUESTION = "question-pre-uuid";
const QID_POST_QUESTION = "question-post-uuid";
const SESSION_ID = "session-1";

function makeResponse(
  questionnaireId: string,
  questionId: string,
  ratings: (number | null)[],
  objectives: string[],
) {
  const responses: Record<string, unknown> = {
    _objectives_snapshot: { [questionId]: objectives },
  };
  ratings.forEach((r, i) => {
    if (r !== null) responses[`${questionId}::obj_${i}`] = r;
  });
  return { questionnaire_id: questionnaireId, responses };
}

/**
 * Mock Supabase chaînable pour loadObjectivesProgression.
 * Supporte les appels : from().select().eq().in()  → renvoie { data }
 */
function mockSupabase(
  assignments: Array<{ questionnaire_id: string; evaluation_type: string }>,
  responses: Array<{ questionnaire_id: string; responses: Record<string, unknown> | null }>,
) {
  const from = vi.fn((table: string) => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    let currentTable = table;

    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn((col: string, values: string[]) => {
      // Retourne directement les données filtrées
      if (currentTable === "formation_evaluation_assignments") {
        return {
          data: assignments.filter((a) =>
            values.includes(a.evaluation_type),
          ),
        };
      }
      if (currentTable === "questionnaire_responses") {
        // On a déjà eq session_id, maintenant in questionnaire_id
        return {
          // Simuler le chaînage eq après in
          eq: vi.fn(() => ({
            data: responses.filter((r) =>
              values.includes(r.questionnaire_id),
            ),
          })),
        };
      }
      return { data: [] };
    });

    // Pour la première query (assignments), eq + in sont chainés
    // from("formation_evaluation_assignments").select(...).eq("session_id", ...).in("evaluation_type", [...])
    // Pour responses : from("questionnaire_responses").select(...).in("questionnaire_id", [...]).eq("session_id", ...)
    currentTable = table;
    return chain;
  });

  return { from } as never;
}

const OBJECTIVES = ["Maîtriser les fondamentaux", "Appliquer en situation réelle", "Évaluer les résultats"];

describe("loadObjectivesProgression", () => {
  it("avant ET après remplis → moyennes et écarts corrects par objectif", async () => {
    const supabase = mockSupabase(
      [
        { questionnaire_id: Q_PRE, evaluation_type: "auto_eval_pre" },
        { questionnaire_id: Q_POST, evaluation_type: "auto_eval_post" },
      ],
      [
        // Apprenant 1 : avant [2, 3, 1], après [4, 4, 3]
        makeResponse(Q_PRE, QID_PRE_QUESTION, [2, 3, 1], OBJECTIVES),
        makeResponse(Q_POST, QID_POST_QUESTION, [4, 4, 3], OBJECTIVES),
        // Apprenant 2 : avant [3, 2, 2], après [5, 3, 4]
        makeResponse(Q_PRE, QID_PRE_QUESTION, [3, 2, 2], OBJECTIVES),
        makeResponse(Q_POST, QID_POST_QUESTION, [5, 3, 4], OBJECTIVES),
      ],
    );

    const result = await loadObjectivesProgression(supabase, SESSION_ID);

    expect(result).toHaveLength(3);

    // Objectif 0 : avant (2+3)/2=2.5, après (4+5)/2=4.5, Δ=2
    expect(result[0].objective).toBe("Maîtriser les fondamentaux");
    expect(result[0].avgBefore).toBe(2.5);
    expect(result[0].avgAfter).toBe(4.5);
    expect(result[0].delta).toBe(2);

    // Objectif 1 : avant (3+2)/2=2.5, après (4+3)/2=3.5, Δ=1
    expect(result[1].objective).toBe("Appliquer en situation réelle");
    expect(result[1].avgBefore).toBe(2.5);
    expect(result[1].avgAfter).toBe(3.5);
    expect(result[1].delta).toBe(1);

    // Objectif 2 : avant (1+2)/2=1.5, après (3+4)/2=3.5, Δ=2
    expect(result[2].objective).toBe("Évaluer les résultats");
    expect(result[2].avgBefore).toBe(1.5);
    expect(result[2].avgAfter).toBe(3.5);
    expect(result[2].delta).toBe(2);
  });

  it("objectifs réordonnés entre avant et après → matchés par libellé (pas par index)", async () => {
    // Le programme a été réordonné entre le positionnement et l'auto-éval.
    const POST_REORDERED = [OBJECTIVES[2], OBJECTIVES[0], OBJECTIVES[1]]; // C, A, B
    const supabase = mockSupabase(
      [
        { questionnaire_id: Q_PRE, evaluation_type: "auto_eval_pre" },
        { questionnaire_id: Q_POST, evaluation_type: "auto_eval_post" },
      ],
      [
        makeResponse(Q_PRE, QID_PRE_QUESTION, [2, 3, 1], OBJECTIVES), // A=2, B=3, C=1
        makeResponse(Q_POST, QID_POST_QUESTION, [3, 4, 4], POST_REORDERED), // C=3, A=4, B=4
      ],
    );

    const result = await loadObjectivesProgression(supabase, SESSION_ID);
    const byLabel = Object.fromEntries(result.map((p) => [p.objective, p]));

    // Matching par libellé : A 2→4 (Δ2), B 3→4 (Δ1), C 1→3 (Δ2)
    expect(byLabel[OBJECTIVES[0]]).toMatchObject({ avgBefore: 2, avgAfter: 4, delta: 2 });
    expect(byLabel[OBJECTIVES[1]]).toMatchObject({ avgBefore: 3, avgAfter: 4, delta: 1 });
    expect(byLabel[OBJECTIVES[2]]).toMatchObject({ avgBefore: 1, avgAfter: 3, delta: 2 });
  });

  it("un seul questionnaire rempli (avant) → côté partiel, delta null", async () => {
    const supabase = mockSupabase(
      [
        { questionnaire_id: Q_PRE, evaluation_type: "auto_eval_pre" },
      ],
      [
        makeResponse(Q_PRE, QID_PRE_QUESTION, [3, 4, 2], OBJECTIVES),
      ],
    );

    const result = await loadObjectivesProgression(supabase, SESSION_ID);

    expect(result).toHaveLength(3);
    expect(result[0].avgBefore).toBe(3);
    expect(result[0].avgAfter).toBeNull();
    expect(result[0].delta).toBeNull();
  });

  it("un seul questionnaire rempli (après) → côté partiel, delta null", async () => {
    const supabase = mockSupabase(
      [
        { questionnaire_id: Q_POST, evaluation_type: "auto_eval_post" },
      ],
      [
        makeResponse(Q_POST, QID_POST_QUESTION, [4, 5, 3], OBJECTIVES),
      ],
    );

    const result = await loadObjectivesProgression(supabase, SESSION_ID);

    expect(result).toHaveLength(3);
    expect(result[0].avgBefore).toBeNull();
    expect(result[0].avgAfter).toBe(4);
    expect(result[0].delta).toBeNull();
  });

  it("objectifs vides → retourne []", async () => {
    const supabase = mockSupabase(
      [
        { questionnaire_id: Q_PRE, evaluation_type: "auto_eval_pre" },
      ],
      [
        // Réponse sans _objectives_snapshot
        { questionnaire_id: Q_PRE, responses: { someKey: 3 } },
      ],
    );

    const result = await loadObjectivesProgression(supabase, SESSION_ID);
    expect(result).toEqual([]);
  });

  it("aucune attribution → retourne []", async () => {
    const supabase = mockSupabase([], []);
    const result = await loadObjectivesProgression(supabase, SESSION_ID);
    expect(result).toEqual([]);
  });

  it("aucune réponse → retourne []", async () => {
    const supabase = mockSupabase(
      [
        { questionnaire_id: Q_PRE, evaluation_type: "auto_eval_pre" },
        { questionnaire_id: Q_POST, evaluation_type: "auto_eval_post" },
      ],
      [],
    );

    const result = await loadObjectivesProgression(supabase, SESSION_ID);
    expect(result).toEqual([]);
  });

  it("isolation par session : seuls les assignments de la session comptent", async () => {
    // Le mock ne retourne que les assignments du session_id passé
    // → pas de pollution croisée
    const supabase = mockSupabase(
      [
        { questionnaire_id: Q_PRE, evaluation_type: "auto_eval_pre" },
        { questionnaire_id: Q_POST, evaluation_type: "auto_eval_post" },
      ],
      [
        makeResponse(Q_PRE, QID_PRE_QUESTION, [2, 3, 1], OBJECTIVES),
        makeResponse(Q_POST, QID_POST_QUESTION, [4, 4, 3], OBJECTIVES),
      ],
    );

    // Vérifie que from() est appelé avec les bonnes tables et que eq("session_id") est invoqué
    const result = await loadObjectivesProgression(supabase, SESSION_ID);
    expect(result).toHaveLength(3);

    // Vérifie que le mock Supabase a bien été appelé avec session_id
    const fromCalls = (supabase as { from: ReturnType<typeof vi.fn> }).from.mock.calls;
    expect(fromCalls[0][0]).toBe("formation_evaluation_assignments");
    expect(fromCalls[1][0]).toBe("questionnaire_responses");
  });
});
