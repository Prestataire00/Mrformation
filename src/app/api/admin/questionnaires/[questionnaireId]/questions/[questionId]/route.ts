/**
 * Route PATCH d'édition d'une question (E1-S10 V1).
 *
 * Permet à un admin/super_admin de modifier une question d'un questionnaire
 * de SA propre entity (vérifié via questionnaire_id → questionnaires.entity_id).
 *
 * Spécificité E1-S10 V1 — Scoring rétroactif sans migration :
 * - Quand `correct_answer` change (à l'intérieur de `options` JSONB), on
 *   compte les `questionnaire_responses` impactées (réponses qui référencent
 *   cette question_id dans leur dict JSONB `responses`) AVANT l'UPDATE.
 * - On log un événement `question.scoring_corrected` dans `activity_log`
 *   avec les valeurs old/new + le compte affecté.
 * - Aucune mutation des `questionnaire_responses` : le score est recalculé
 *   à la volée par `computeResponseScore()` à chaque fetch (cf
 *   `src/lib/services/questionnaire-scoring.ts`).
 *
 * Pattern affected_responses_count :
 * - L'opérateur JSONB `?` (key exists) n'est pas exposé directement par
 *   PostgREST/supabase-js (filter ? indisponible). Fallback explicite :
 *   on fetch les responses du questionnaire et on filtre côté Node.
 * - V1 acceptable car les volumes restent modestes (<10k responses par
 *   questionnaire en pratique). Optimisation possible V2 via RPC.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { logAudit } from "@/lib/audit-log";

interface RouteContext {
  params: { questionnaireId: string; questionId: string };
}

/**
 * Body PATCH attendu (tous champs optionnels — patch partiel).
 *
 * `correct_answer` est stocké à l'intérieur de `options` JSONB (cf format
 * existant cf. questionnaire-scoring.ts), mais on accepte aussi qu'il
 * soit passé directement à la racine pour simplifier l'usage UI.
 */
interface PatchQuestionBody {
  text?: string;
  type?: string;
  is_required?: boolean;
  order_index?: number;
  options?: unknown;
  // Helper UX : si fourni à la racine, on l'injectera dans options.
  correct_answer?: unknown;
}

/**
 * Extrait `correct_answer` d'un blob `options` JSONB, quel que soit son
 * format (objet `{ correct_answer }` ou array nu).
 */
function extractCorrectAnswer(options: unknown): unknown {
  if (options && typeof options === "object" && !Array.isArray(options)) {
    return (options as { correct_answer?: unknown }).correct_answer;
  }
  return undefined;
}

/**
 * Construit le nouvel `options` JSONB en injectant `correct_answer`
 * si fourni à la racine du body (helper UX).
 */
function buildNextOptions(
  currentOptions: unknown,
  bodyOptions: unknown,
  bodyCorrectAnswer: unknown,
  correctAnswerProvided: boolean,
): unknown {
  // Si le body fournit explicitement `options`, on prend cette valeur.
  const base = bodyOptions !== undefined ? bodyOptions : currentOptions;

  if (!correctAnswerProvided) {
    return base;
  }

  // Injecter correct_answer dans base si c'est un objet, sinon créer un objet.
  if (base && typeof base === "object" && !Array.isArray(base)) {
    return { ...(base as Record<string, unknown>), correct_answer: bodyCorrectAnswer };
  }
  return { correct_answer: bodyCorrectAnswer };
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const { questionnaireId, questionId } = params;
  const supabase = auth.supabase;

  // 1. Vérifier que le questionnaire appartient à l'entity de l'admin.
  const { data: questionnaire, error: qnError } = await supabase
    .from("questionnaires")
    .select("id, entity_id")
    .eq("id", questionnaireId)
    .single();

  if (qnError || !questionnaire) {
    return NextResponse.json({ error: "Questionnaire introuvable" }, { status: 404 });
  }
  if (questionnaire.entity_id !== auth.profile.entity_id) {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  // 2. Vérifier que la question appartient bien au questionnaire.
  const { data: currentQuestion, error: qError } = await supabase
    .from("questions")
    .select("id, questionnaire_id, options")
    .eq("id", questionId)
    .single();

  if (qError || !currentQuestion) {
    return NextResponse.json({ error: "Question introuvable" }, { status: 404 });
  }
  if (currentQuestion.questionnaire_id !== questionnaireId) {
    return NextResponse.json(
      { error: "Question n'appartient pas à ce questionnaire" },
      { status: 400 },
    );
  }

  // 3. Parser le body.
  let body: PatchQuestionBody;
  try {
    body = (await request.json()) as PatchQuestionBody;
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const correctAnswerProvided = Object.prototype.hasOwnProperty.call(
    body,
    "correct_answer",
  );

  // 4. Calculer le nouvel options + détecter changement de correct_answer.
  const nextOptions = buildNextOptions(
    currentQuestion.options,
    body.options,
    body.correct_answer,
    correctAnswerProvided,
  );

  const oldCorrectAnswer = extractCorrectAnswer(currentQuestion.options);
  const newCorrectAnswer = extractCorrectAnswer(nextOptions);
  // Comparaison structurelle simple (JSON.stringify suffit pour scalaires
  // et arrays de scalaires utilisés ici ; pas de dates / undefined imbriqué).
  const correctAnswerChanged =
    JSON.stringify(oldCorrectAnswer) !== JSON.stringify(newCorrectAnswer);

  // 5. Si correct_answer change, compter les responses affectées AVANT l'UPDATE.
  //    Fallback JS : fetch toutes les responses du questionnaire et filtrer
  //    en JS (l'opérateur JSONB `?` n'est pas exposé par supabase-js).
  let affectedResponsesCount = 0;
  if (correctAnswerChanged) {
    const { data: allResponses, error: respError } = await supabase
      .from("questionnaire_responses")
      .select("id, responses")
      .eq("questionnaire_id", questionnaireId);

    if (respError) {
      return NextResponse.json(
        { error: "Erreur lors du comptage des réponses affectées" },
        { status: 500 },
      );
    }

    affectedResponsesCount = (allResponses ?? []).filter((row) => {
      const r = row.responses as Record<string, unknown> | null;
      if (!r || typeof r !== "object") return false;
      return Object.prototype.hasOwnProperty.call(r, questionId);
    }).length;
  }

  // 6. Construire le payload UPDATE (seulement les champs fournis).
  const updatePayload: Record<string, unknown> = {};
  if (body.text !== undefined) updatePayload.text = body.text;
  if (body.type !== undefined) updatePayload.type = body.type;
  if (body.is_required !== undefined) updatePayload.is_required = body.is_required;
  if (body.order_index !== undefined) updatePayload.order_index = body.order_index;
  if (body.options !== undefined || correctAnswerProvided) {
    updatePayload.options = nextOptions;
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: "Aucun champ à modifier" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("questions")
    .update(updatePayload)
    .eq("id", questionId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour" },
      { status: 500 },
    );
  }

  // 7. Audit log si correct_answer a changé (E1-S10 V1 AC #2).
  if (correctAnswerChanged) {
    logAudit({
      supabase,
      entityId: auth.profile.entity_id,
      userId: auth.user.id,
      action: "question.scoring_corrected",
      resourceType: "questions",
      resourceId: questionId,
      details: {
        questionnaire_id: questionnaireId,
        affected_responses_count: affectedResponsesCount,
        old_correct_answer: oldCorrectAnswer === undefined ? null : oldCorrectAnswer,
        new_correct_answer: newCorrectAnswer === undefined ? null : newCorrectAnswer,
      },
    });
  }

  return NextResponse.json({
    data: updated,
    correct_answer_changed: correctAnswerChanged,
    affected_responses_count: correctAnswerChanged ? affectedResponsesCount : null,
  });
}
