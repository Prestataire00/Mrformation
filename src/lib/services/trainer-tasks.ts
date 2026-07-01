import type { SupabaseClient } from "@supabase/supabase-js";

export interface TrainerTasksStatus {
  deroule: boolean;
  bilan: boolean | null; // null = aucun bilan demandé (avant Lot C)
  support: boolean;
  bilanQuestionnaireId: string | null;
}

interface SlotModuleFields {
  module_title?: string | null;
  module_objectives?: string | null;
  module_themes?: string | null;
  module_exercises?: string | null;
}

interface ComputeInput {
  slots: SlotModuleFields[];
  supportCount: number;
  bilanRequested: boolean;
  bilanAnswered: boolean;
}

const hasText = (v: string | null | undefined): boolean =>
  typeof v === "string" && v.trim().length > 0;

/** Cœur pur : dérive le statut des 3 tâches depuis les données agrégées. */
export function computeTrainerTasksStatus(input: ComputeInput): Omit<TrainerTasksStatus, "bilanQuestionnaireId"> {
  const deroule = input.slots.some(
    (s) =>
      hasText(s.module_title) ||
      hasText(s.module_objectives) ||
      hasText(s.module_themes) ||
      hasText(s.module_exercises),
  );
  return {
    deroule,
    support: input.supportCount > 0,
    bilan: input.bilanRequested ? input.bilanAnswered : null,
  };
}

/**
 * Résout le statut des tâches pour une session (formateur↔admin).
 * Lot C : branche le bilan formateur via formation_satisfaction_assignments (target_type='trainer').
 */
export async function resolveTrainerTasksStatus(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<TrainerTasksStatus> {
  const { data: slots } = await supabase
    .from("formation_time_slots")
    .select("module_title, module_objectives, module_themes, module_exercises")
    .eq("session_id", sessionId);

  const { count: supportCount } = await supabase
    .from("trainer_course_sessions")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  // Bilan formateur : attribution target_type='trainer' sur la session.
  const { data: bilanAssign } = await supabase
    .from("formation_satisfaction_assignments")
    .select("questionnaire_id")
    .eq("session_id", sessionId)
    .eq("target_type", "trainer")
    .limit(1)
    .maybeSingle();
  const bilanQuestionnaireId = (bilanAssign?.questionnaire_id as string | undefined) ?? null;

  let bilanAnswered = false;
  if (bilanQuestionnaireId) {
    const { count } = await supabase
      .from("questionnaire_responses")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("questionnaire_id", bilanQuestionnaireId)
      .not("trainer_id", "is", null);
    bilanAnswered = (count ?? 0) > 0;
  }

  const base = computeTrainerTasksStatus({
    slots: (slots ?? []) as SlotModuleFields[],
    supportCount: supportCount ?? 0,
    bilanRequested: bilanQuestionnaireId !== null,
    bilanAnswered,
  });
  return { ...base, bilanQuestionnaireId };
}
