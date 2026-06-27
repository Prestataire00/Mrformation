/**
 * PLAN-4 audit BMAD — service CRUD `formation_time_slots`.
 *
 * Avant : toute la logique Supabase était inline dans TabPlanning.tsx,
 * BulkSlotCreator.tsx, SlotEditDialog.tsx. Violation règle absolue #10
 * CLAUDE.md. Aucune défense en profondeur multi-tenant : la table
 * `formation_time_slots` n'a PAS de colonne `entity_id` (relation via
 * sessions.entity_id), donc sans vérification serveur on dépend des
 * policies RLS dont l'état prod est mauvais (cf memory project_rls_state.md
 * — ~50 tables avec allow_all USING(true)).
 *
 * Ce module centralise les opérations en :
 *  - vérifiant que la session appartient bien à `entityId` AVANT toute
 *    mutation (cf `assertSessionInEntity`)
 *  - injectant le `SupabaseClient` (testable)
 *  - retournant un `ServiceResult<T>` discriminé pour la gestion d'erreur
 *  - sélectionnant des colonnes explicites (pas de `select("*")`)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormationTimeSlot } from "@/lib/types";

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

const SLOT_COLUMNS =
  "id, session_id, title, start_time, end_time, slot_order, module_title, module_objectives, module_themes, module_exercises, color, created_at, updated_at";

export interface TimeSlotCreateInput {
  title?: string | null;
  start_time: string;
  end_time: string;
  slot_order?: number;
  module_title?: string | null;
  module_objectives?: string | null;
  module_themes?: string | null;
  module_exercises?: string | null;
  // Story 4.1 — couleur de fond du créneau (hex, palette UI) ; null = aucune.
  color?: string | null;
}

export type TimeSlotUpdateInput = Partial<TimeSlotCreateInput>;

/**
 * Vérifie que la session appartient bien à l'entité (defense in depth).
 * Renvoie ok=false 404 si la session n'existe pas dans l'entité.
 */
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
    return { ok: false, error: { message: "Session introuvable dans l'entité", code: "NOT_FOUND" } };
  }
  return { ok: true };
}

/** Liste les créneaux d'une session, tri par `slot_order` puis `start_time`. */
export async function fetchTimeSlots(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult<{ slots: FormationTimeSlot[] }>> {
  const guard = await assertSessionInEntity(supabase, sessionId, entityId);
  if (!guard.ok) return guard;

  const { data, error } = await supabase
    .from("formation_time_slots")
    .select(SLOT_COLUMNS)
    .eq("session_id", sessionId)
    .order("slot_order", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true, slots: (data as unknown as FormationTimeSlot[]) ?? [] };
}

/** Crée un créneau unique. */
export async function createTimeSlot(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
  input: TimeSlotCreateInput,
): Promise<ServiceResult<{ slot: FormationTimeSlot }>> {
  const guard = await assertSessionInEntity(supabase, sessionId, entityId);
  if (!guard.ok) return guard;

  const { data, error } = await supabase
    .from("formation_time_slots")
    .insert({ ...input, session_id: sessionId })
    .select(SLOT_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, error: { message: error?.message ?? "Insert failed", code: error?.code } };
  }
  return { ok: true, slot: data as unknown as FormationTimeSlot };
}

/** Bulk insert (BulkSlotCreator). */
export async function bulkCreateTimeSlots(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
  inputs: TimeSlotCreateInput[],
): Promise<ServiceResult<{ count: number }>> {
  if (inputs.length === 0) {
    return { ok: true, count: 0 };
  }
  const guard = await assertSessionInEntity(supabase, sessionId, entityId);
  if (!guard.ok) return guard;

  const rows = inputs.map((s) => ({ ...s, session_id: sessionId }));
  const { error } = await supabase.from("formation_time_slots").insert(rows);
  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true, count: rows.length };
}

/** Met à jour un créneau (partial). Double filtre id + session_id. */
export async function updateTimeSlot(
  supabase: SupabaseClient,
  slotId: string,
  sessionId: string,
  entityId: string,
  input: TimeSlotUpdateInput,
): Promise<ServiceResult<{ slot: FormationTimeSlot }>> {
  const guard = await assertSessionInEntity(supabase, sessionId, entityId);
  if (!guard.ok) return guard;

  const { data, error } = await supabase
    .from("formation_time_slots")
    .update(input)
    .eq("id", slotId)
    .eq("session_id", sessionId)
    .select(SLOT_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, error: { message: error?.message ?? "Update failed", code: error?.code } };
  }
  return { ok: true, slot: data as unknown as FormationTimeSlot };
}

/** Supprime un créneau unique. */
export async function deleteTimeSlot(
  supabase: SupabaseClient,
  slotId: string,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult<Record<never, never>>> {
  const guard = await assertSessionInEntity(supabase, sessionId, entityId);
  if (!guard.ok) return guard;

  const { error } = await supabase
    .from("formation_time_slots")
    .delete()
    .eq("id", slotId)
    .eq("session_id", sessionId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true };
}

/** Supprime tous les créneaux d'une session. */
export async function deleteAllTimeSlotsForSession(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult<Record<never, never>>> {
  const guard = await assertSessionInEntity(supabase, sessionId, entityId);
  if (!guard.ok) return guard;

  const { error } = await supabase
    .from("formation_time_slots")
    .delete()
    .eq("session_id", sessionId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true };
}
