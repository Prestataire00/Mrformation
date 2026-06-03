/**
 * PLAN-6 audit BMAD — Détection des conflits formateurs cross-session.
 *
 * Problème métier : Jean est formateur sur la session A (lundi 9h-12h)
 * et aussi sur la session B (lundi 10h-13h). Aucun warning aujourd'hui
 * → l'admin double-booke un formateur sans s'en rendre compte.
 *
 * Approche :
 *  1. Lit les trainers assignés à la session courante (formation_trainers).
 *  2. Charge les autres assignations cross-session (sessions ≠ courante,
 *     même entité) de ces mêmes trainers.
 *  3. Charge les slots de ces autres sessions.
 *  4. Compare en mémoire chaque slot courant avec les slots externes
 *     via rangesOverlap() — défère le calcul d'overlap à un helper testable.
 *
 * Performance : 3 requêtes Supabase max, aucun N+1. L'agrégation est
 * côté client (négligeable pour <500 slots par session).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { rangesOverlap, type TimeRange } from "@/lib/utils/slot-overlap";

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

export interface TrainerConflict {
  /** Slot de la session courante qui est en conflit. */
  slotId: string;
  slotStart: string;
  slotEnd: string;
  /** Trainer concerné (assigné à la session courante ET en conflit). */
  trainerId: string;
  trainerName: string;
  /** Slot externe qui chevauche. */
  conflictingSlotId: string;
  conflictingSessionId: string;
  conflictingSessionTitle: string;
  conflictingStart: string;
  conflictingEnd: string;
}

interface TrainerAssignmentRow {
  trainer_id: string;
  session_id: string;
  trainer: { first_name: string | null; last_name: string | null } | null;
}

interface ExternalSlotRow {
  id: string;
  session_id: string;
  start_time: string;
  end_time: string;
  session: { title: string | null } | null;
}

interface CurrentSlot extends TimeRange {
  id: string;
}

export async function detectTrainerConflicts(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    entityId: string;
    currentSlots: CurrentSlot[];
    trainerIds: string[];
  },
): Promise<ServiceResult<{ conflicts: TrainerConflict[] }>> {
  const { sessionId, entityId, currentSlots, trainerIds } = params;

  if (trainerIds.length === 0 || currentSlots.length === 0) {
    return { ok: true, conflicts: [] };
  }

  // 1. Autres assignations cross-session (même entité).
  const { data: externalAssignments, error: assignErr } = await supabase
    .from("formation_trainers")
    .select("trainer_id, session_id, trainer:trainers(first_name, last_name), sessions!inner(entity_id)")
    .in("trainer_id", trainerIds)
    .neq("session_id", sessionId)
    .eq("sessions.entity_id", entityId);

  if (assignErr) {
    return { ok: false, error: { message: assignErr.message, code: assignErr.code } };
  }

  type RawRow = TrainerAssignmentRow & { sessions: { entity_id: string } | null };
  const rows = (externalAssignments ?? []) as unknown as RawRow[];

  if (rows.length === 0) {
    return { ok: true, conflicts: [] };
  }

  const externalSessionIds = Array.from(new Set(rows.map((r) => r.session_id)));
  // Map session_id → liste de trainers assignés (parmi nos trainers d'intérêt)
  const trainersBySession = new Map<string, Array<{ id: string; name: string }>>();
  for (const r of rows) {
    const name = `${r.trainer?.first_name ?? ""} ${r.trainer?.last_name ?? ""}`.trim() || "Formateur";
    const list = trainersBySession.get(r.session_id) ?? [];
    list.push({ id: r.trainer_id, name });
    trainersBySession.set(r.session_id, list);
  }

  // 2. Slots des sessions externes
  const { data: externalSlots, error: slotsErr } = await supabase
    .from("formation_time_slots")
    .select("id, session_id, start_time, end_time, session:sessions(title)")
    .in("session_id", externalSessionIds);

  if (slotsErr) {
    return { ok: false, error: { message: slotsErr.message, code: slotsErr.code } };
  }

  const slots = (externalSlots ?? []) as unknown as ExternalSlotRow[];

  // 3. Détecte les conflits par produit cartésien (currentSlots × externalSlots).
  const conflicts: TrainerConflict[] = [];
  for (const current of currentSlots) {
    for (const external of slots) {
      if (!rangesOverlap(current, external)) continue;
      const assignedTrainers = trainersBySession.get(external.session_id) ?? [];
      for (const t of assignedTrainers) {
        conflicts.push({
          slotId: current.id,
          slotStart: current.start_time,
          slotEnd: current.end_time,
          trainerId: t.id,
          trainerName: t.name,
          conflictingSlotId: external.id,
          conflictingSessionId: external.session_id,
          conflictingSessionTitle: external.session?.title || "Session sans titre",
          conflictingStart: external.start_time,
          conflictingEnd: external.end_time,
        });
      }
    }
  }

  return { ok: true, conflicts };
}
