import type { SupabaseClient } from "@supabase/supabase-js";

export interface TrainerTasksStatus {
  deroule: boolean;
  bilan: boolean | null; // null = aucun bilan demandé (avant Lot C)
  support: boolean;
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
export function computeTrainerTasksStatus(input: ComputeInput): TrainerTasksStatus {
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
 * Lot A : `bilanRequested=false` (aucun bilan formateur avant le Lot C).
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

  return computeTrainerTasksStatus({
    slots: (slots ?? []) as SlotModuleFields[],
    supportCount: supportCount ?? 0,
    bilanRequested: false,
    bilanAnswered: false,
  });
}
