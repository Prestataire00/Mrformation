import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pédagogie V2 Epic 3 — Service CRUD pour les e-learning par défaut d'un programme.
 *
 * Spec : bmad_output/planning-artifacts/spec-restructuration-pedagogique-2026-06-04.md
 *
 * Le programme propose des e-learning par défaut qui sont snapshotés vers la
 * session à la création (cf. Epic 2 — copyProgramElearningToSession). Ce
 * service expose l'API CRUD pour gérer ces defaults depuis la fiche programme.
 */

export type ProgramElearningDefault = {
  id: string;
  elearning_course_id: string;
  order_index: number;
  is_mandatory_before_session_default: boolean;
  allow_free_progress_default: boolean;
};

/**
 * Liste les e-learning par défaut d'un programme, triés par order_index.
 * RLS filtre déjà par entity_id du programme parent (cf. migration Epic 1).
 */
export async function listProgramElearningDefaults(
  supabase: SupabaseClient,
  programId: string,
): Promise<ProgramElearningDefault[]> {
  const { data, error } = await supabase
    .from("program_elearning_courses")
    .select("id, elearning_course_id, order_index, is_mandatory_before_session_default, allow_free_progress_default")
    .eq("program_id", programId)
    .order("order_index", { ascending: true });

  if (error) {
    console.error("[program-elearning-defaults] list error:", error);
    return [];
  }

  return (data ?? []) as ProgramElearningDefault[];
}

/**
 * Ajoute un e-learning aux defaults d'un programme. Idempotent via UNIQUE
 * constraint (program_id, elearning_course_id) — si déjà attaché, no-op.
 *
 * Le order_index est calculé automatiquement (max + 1) si non précisé.
 */
export async function addProgramElearningDefault(
  supabase: SupabaseClient,
  params: {
    programId: string;
    elearningCourseId: string;
    isMandatoryBeforeSession?: boolean;
    allowFreeProgress?: boolean;
    orderIndex?: number;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { programId, elearningCourseId } = params;

  // Calcule order_index si non fourni (= max existant + 1).
  let orderIndex = params.orderIndex;
  if (orderIndex === undefined) {
    const existing = await listProgramElearningDefaults(supabase, programId);
    orderIndex = existing.length > 0 ? Math.max(...existing.map((e) => e.order_index)) + 1 : 0;
  }

  const { error } = await supabase
    .from("program_elearning_courses")
    .upsert(
      {
        program_id: programId,
        elearning_course_id: elearningCourseId,
        order_index: orderIndex,
        is_mandatory_before_session_default: params.isMandatoryBeforeSession ?? false,
        allow_free_progress_default: params.allowFreeProgress ?? true,
      },
      { onConflict: "program_id,elearning_course_id", ignoreDuplicates: false },
    );

  if (error) {
    console.error("[program-elearning-defaults] add error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Retire un e-learning des defaults d'un programme.
 * Ne touche pas aux sessions déjà créées (sécurité commerciale — pattern
 * snapshot d'Epic 2 : les instances sont indépendantes).
 */
export async function removeProgramElearningDefault(
  supabase: SupabaseClient,
  params: { programId: string; elearningCourseId: string },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("program_elearning_courses")
    .delete()
    .eq("program_id", params.programId)
    .eq("elearning_course_id", params.elearningCourseId);

  if (error) {
    console.error("[program-elearning-defaults] remove error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Met à jour les paramètres pédagogiques d'un e-learning attaché.
 */
export async function updateProgramElearningDefault(
  supabase: SupabaseClient,
  params: {
    programId: string;
    elearningCourseId: string;
    isMandatoryBeforeSession?: boolean;
    allowFreeProgress?: boolean;
    orderIndex?: number;
  },
): Promise<{ ok: boolean; error?: string }> {
  const updates: Record<string, unknown> = {};
  if (params.isMandatoryBeforeSession !== undefined) {
    updates.is_mandatory_before_session_default = params.isMandatoryBeforeSession;
  }
  if (params.allowFreeProgress !== undefined) {
    updates.allow_free_progress_default = params.allowFreeProgress;
  }
  if (params.orderIndex !== undefined) {
    updates.order_index = params.orderIndex;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: true };
  }

  const { error } = await supabase
    .from("program_elearning_courses")
    .update(updates)
    .eq("program_id", params.programId)
    .eq("elearning_course_id", params.elearningCourseId);

  if (error) {
    console.error("[program-elearning-defaults] update error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
