import { SupabaseClient } from "@supabase/supabase-js";
import type { BpfTraineeTypeValue } from "@/lib/bpf-enums";

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

async function assertSessionInEntity(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult<Record<never, never>>> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  if (!data) {
    return { ok: false, error: { message: "Session introuvable dans l'entité", code: "NOT_FOUND" } };
  }
  return { ok: true };
}

/**
 * Met à jour la fiche stagiaire depuis la formation :
 *  - champs apprenant (learners) — ciblés sur `learners.id` + `entity_id`
 *    (jamais `profile_id`, non unique) ;
 *  - type BPF de l'inscription (enrollments.bpf_trainee_type) — le champ qui
 *    pilote réellement le calcul BPF (Cadre F-1).
 */
export async function updateFormationLearnerSheet(
  supabase: SupabaseClient,
  input: {
    learnerId: string;
    enrollmentId: string;
    sessionId: string;
    entityId: string;
    learner: { first_name: string; last_name: string; email: string };
    bpfTraineeType: BpfTraineeTypeValue;
  },
): Promise<ServiceResult<Record<never, never>>> {
  const guard = await assertSessionInEntity(supabase, input.sessionId, input.entityId);
  if (!guard.ok) return guard;

  const { error: learnerErr } = await supabase
    .from("learners")
    .update({
      first_name: input.learner.first_name,
      last_name: input.learner.last_name,
      email: input.learner.email || null,
    })
    .eq("id", input.learnerId)
    .eq("entity_id", input.entityId);
  if (learnerErr) {
    return { ok: false, error: { message: learnerErr.message, code: learnerErr.code } };
  }

  const { error: enrollErr } = await supabase
    .from("enrollments")
    .update({ bpf_trainee_type: input.bpfTraineeType })
    .eq("id", input.enrollmentId)
    .eq("session_id", input.sessionId);
  if (enrollErr) {
    return { ok: false, error: { message: enrollErr.message, code: enrollErr.code } };
  }

  return { ok: true };
}
