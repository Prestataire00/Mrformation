import type { SupabaseClient } from "@supabase/supabase-js";
import { type ServiceResult } from "./prospect-search";

/**
 * Planning : matching session ↔ jour basé sur les vrais créneaux
 * (`formation_time_slots`), au lieu du span `start_date→end_date` (qui faisait
 * apparaître une session « tout le temps »). Bugfix 2026-06-27.
 */

export interface PlanningSlot {
  session_id: string;
  start_time: string;
}

/** Charge les créneaux des sessions données (filtré par session_id → entité-safe). */
export async function fetchSessionSlots(
  supabase: SupabaseClient,
  sessionIds: string[],
): Promise<ServiceResult<{ slots: PlanningSlot[] }>> {
  if (sessionIds.length === 0) {
    return { ok: true, slots: [] };
  }
  const { data, error } = await supabase
    .from("formation_time_slots")
    .select("session_id, start_time")
    .in("session_id", sessionIds)
    // Limite explicite : évite la troncature silencieuse au cap PostgREST par défaut.
    .limit(5000);
  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true, slots: (data as PlanningSlot[]) ?? [] };
}

// Clé de jour figée sur Europe/Paris (comme `formatTime` du planning) : un
// créneau stocké en UTC tombe sur le bon jour civil, quel que soit le fuseau
// du navigateur/serveur. `en-CA` formate en `YYYY-MM-DD`.
const PARIS_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Clé de jour `YYYY-MM-DD` (Europe/Paris) pour un objet Date. */
export function dayKeyFromDate(d: Date): string {
  return PARIS_DAY_FMT.format(d);
}

/** Clé de jour `YYYY-MM-DD` (Europe/Paris) pour un ISO (timestamptz). */
export function dayKeyFromIso(iso: string): string {
  return PARIS_DAY_FMT.format(new Date(iso));
}

export interface SlotDayIndex {
  /** Sessions ayant au moins un créneau (sinon → fallback span côté appelant). */
  sessionsWithSlots: Set<string>;
  /** sessionId → ensemble des jours (clé locale) ayant un créneau. */
  slotDaysBySession: Map<string, Set<string>>;
}

export function buildSlotDayIndex(slots: PlanningSlot[]): SlotDayIndex {
  const sessionsWithSlots = new Set<string>();
  const slotDaysBySession = new Map<string, Set<string>>();
  for (const s of slots) {
    if (!s.session_id || !s.start_time) continue;
    sessionsWithSlots.add(s.session_id);
    let days = slotDaysBySession.get(s.session_id);
    if (!days) {
      days = new Set<string>();
      slotDaysBySession.set(s.session_id, days);
    }
    days.add(dayKeyFromIso(s.start_time));
  }
  return { sessionsWithSlots, slotDaysBySession };
}

/**
 * Vrai/faux si la session a (ou non) un créneau ce jour-là.
 * `null` quand la session n'a AUCUN créneau → l'appelant applique le fallback span.
 */
export function slotDayLookup(
  index: SlotDayIndex,
  sessionId: string,
  dayKey: string,
): boolean | null {
  if (!index.sessionsWithSlots.has(sessionId)) return null;
  return index.slotDaysBySession.get(sessionId)?.has(dayKey) ?? false;
}
