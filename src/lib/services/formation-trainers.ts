import { SupabaseClient } from "@supabase/supabase-js";
import { FormationTrainer } from "@/lib/types";

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
  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  if (!data) {
    return {
      ok: false,
      error: { message: "Session introuvable dans l'entité", code: "NOT_FOUND" },
    };
  }
  return { ok: true };
}

export async function updateFormationTrainer(
  supabase: SupabaseClient,
  formationTrainerId: string,
  sessionId: string,
  entityId: string,
  input: {
    role: string;
    hourly_rate: number | null;
    daily_rate: number | null;
    hours_done: number | null;
    agreed_cost_ht: number | null;
  },
): Promise<ServiceResult<{ trainer: FormationTrainer }>> {
  const guard = await assertSessionInEntity(supabase, sessionId, entityId);
  if (!guard.ok) return guard;

  const { data, error } = await supabase
    .from("formation_trainers")
    .update({
      role: input.role,
      hourly_rate: input.hourly_rate,
      daily_rate: input.daily_rate,
      hours_done: input.hours_done,
      agreed_cost_ht: input.agreed_cost_ht,
    })
    .eq("id", formationTrainerId)
    .eq("session_id", sessionId)
    .select("*, trainer:trainers(*)")
    .single();

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true, trainer: data as FormationTrainer };
}
