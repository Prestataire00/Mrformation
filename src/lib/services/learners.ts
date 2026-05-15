import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/logger";

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

/**
 * Message utilisateur (FR) renvoyé quand un apprenant est lié à une session terminée.
 * Exposé comme constante pour pouvoir être réutilisé dans l'UI (toast) sans risque
 * de divergence avec le service.
 */
export const LEARNER_SESSION_LINKED_MESSAGE =
  "Apprenant lié à une formation terminée, suppression impossible — utilisez l'archivage.";

/**
 * Soft-delete d'un apprenant — pose simplement `deleted_at = NOW()` côté applicatif.
 * Toujours OK quel que soit l'historique : c'est précisément le chemin à privilégier
 * pour les apprenants liés à une session `completed` (rétention Qualiopi 10 ans).
 */
export async function softDeleteLearner(
  supabase: SupabaseClient,
  learnerId: string
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("learners")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", learnerId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  logEvent("learner_soft_deleted", { learner_id: learnerId });
  return { ok: true };
}

/**
 * Restaure un apprenant précédemment archivé en remettant `deleted_at` à NULL.
 */
export async function restoreLearner(
  supabase: SupabaseClient,
  learnerId: string
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("learners")
    .update({ deleted_at: null })
    .eq("id", learnerId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  logEvent("learner_restored", { learner_id: learnerId });
  return { ok: true };
}

/**
 * Smart delete (Story 5.4 / FR20).
 *
 * Vérifie d'abord si l'apprenant possède un enrollment sur une session
 * `status = 'completed'`. Si oui → renvoie une erreur métier explicite
 * (sans toucher la base) que l'UI peut transformer en proposition d'archivage.
 * Sinon → hard-delete classique.
 *
 * Le trigger DB `prevent_hard_delete_session_linked_learner` constitue une
 * défense en profondeur si jamais quelqu'un contournait ce helper.
 */
export async function deleteLearner(
  supabase: SupabaseClient,
  learnerId: string
): Promise<ServiceResult<{ mode: "hard" | "soft_required" }>> {
  // 1. Compte les enrollments liés à une session terminée.
  const { count, error: countError } = await supabase
    .from("enrollments")
    .select("id, sessions!inner(status)", { count: "exact", head: false })
    .eq("learner_id", learnerId)
    .eq("sessions.status", "completed");

  if (countError) {
    return {
      ok: false,
      error: { message: countError.message, code: countError.code },
    };
  }

  if ((count ?? 0) > 0) {
    logEvent("learner_deleted", {
      learner_id: learnerId,
      mode: "blocked",
      reason: "session_linked",
    });
    return {
      ok: false,
      error: {
        message: LEARNER_SESSION_LINKED_MESSAGE,
        code: "LEARNER_SESSION_LINKED",
      },
    };
  }

  // 2. Hard-delete autorisé.
  const { error: deleteError } = await supabase
    .from("learners")
    .delete()
    .eq("id", learnerId);

  if (deleteError) {
    return {
      ok: false,
      error: { message: deleteError.message, code: deleteError.code },
    };
  }

  logEvent("learner_deleted", { learner_id: learnerId, mode: "hard" });
  return { ok: true, mode: "hard" };
}
