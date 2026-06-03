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

/**
 * PLAN-9 audit BMAD — charge la "charge de travail" hebdomadaire de
 * plusieurs formateurs sur une plage donnée, cross-session, même entité.
 *
 * Retourne par trainer la liste de ses slots qui chevauchent [from, to],
 * avec un flag isCurrentSession pour distinguer les slots de la session
 * courante vs les autres.
 *
 * Usage : vue "Par formateur" du TabPlanning. Permet de voir d'un coup
 * d'œil quel formateur est saturé / disponible sur la semaine.
 */
export interface TrainerLoadSlot {
  id: string;
  sessionId: string;
  sessionTitle: string;
  start_time: string;
  end_time: string;
  isCurrentSession: boolean;
}

export interface TrainerLoad {
  trainerId: string;
  name: string;
  slots: TrainerLoadSlot[];
}

export async function fetchTrainerWeeklyLoad(
  supabase: SupabaseClient,
  params: {
    entityId: string;
    trainerIds: string[];
    currentSessionId: string;
    fromIso: string;
    toIso: string;
  },
): Promise<ServiceResult<{ loads: TrainerLoad[] }>> {
  const { entityId, trainerIds, currentSessionId, fromIso, toIso } = params;

  if (trainerIds.length === 0) {
    return { ok: true, loads: [] };
  }

  // 1. Toutes les assignations formateurs sur ces trainers, même entité.
  const { data: assignments, error: assignErr } = await supabase
    .from("formation_trainers")
    .select("trainer_id, session_id, trainer:trainers(first_name, last_name), sessions!inner(entity_id, title)")
    .in("trainer_id", trainerIds)
    .eq("sessions.entity_id", entityId);

  if (assignErr) {
    return { ok: false, error: { message: assignErr.message, code: assignErr.code } };
  }

  type AssignRow = {
    trainer_id: string;
    session_id: string;
    trainer: { first_name: string | null; last_name: string | null } | null;
    sessions: { entity_id: string; title: string | null } | null;
  };
  const rows = (assignments ?? []) as unknown as AssignRow[];

  if (rows.length === 0) {
    return { ok: true, loads: [] };
  }

  // Map : session_id → titre, et trainer_id → set de session_ids assignées.
  const sessionTitleById = new Map<string, string>();
  const sessionsByTrainer = new Map<string, Set<string>>();
  const trainerNameById = new Map<string, string>();
  for (const r of rows) {
    sessionTitleById.set(r.session_id, r.sessions?.title || "Session sans titre");
    const set = sessionsByTrainer.get(r.trainer_id) ?? new Set<string>();
    set.add(r.session_id);
    sessionsByTrainer.set(r.trainer_id, set);
    const name = `${r.trainer?.first_name ?? ""} ${r.trainer?.last_name ?? ""}`.trim() || "Formateur";
    trainerNameById.set(r.trainer_id, name);
  }

  // 2. Slots de toutes ces sessions qui chevauchent [fromIso, toIso].
  const allSessionIds = Array.from(new Set(rows.map((r) => r.session_id)));
  const { data: slots, error: slotsErr } = await supabase
    .from("formation_time_slots")
    .select("id, session_id, start_time, end_time")
    .in("session_id", allSessionIds)
    .gte("end_time", fromIso)
    .lte("start_time", toIso);

  if (slotsErr) {
    return { ok: false, error: { message: slotsErr.message, code: slotsErr.code } };
  }

  type SlotRow = { id: string; session_id: string; start_time: string; end_time: string };
  const slotRows = (slots ?? []) as unknown as SlotRow[];

  // 3. Agrégation côté client : pour chaque trainer, filtrer les slots
  // dont session_id est dans son set d'assignations.
  const loads: TrainerLoad[] = trainerIds.map((tid) => {
    const allowedSessions = sessionsByTrainer.get(tid) ?? new Set<string>();
    const trainerSlots = slotRows
      .filter((s) => allowedSessions.has(s.session_id))
      .map((s) => ({
        id: s.id,
        sessionId: s.session_id,
        sessionTitle: sessionTitleById.get(s.session_id) ?? "Session",
        start_time: s.start_time,
        end_time: s.end_time,
        isCurrentSession: s.session_id === currentSessionId,
      }));
    return {
      trainerId: tid,
      name: trainerNameById.get(tid) ?? "Formateur",
      slots: trainerSlots,
    };
  });

  return { ok: true, loads };
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
