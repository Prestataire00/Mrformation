/**
 * Calcule les heures réalisées d'un formateur sur une session en réconciliant
 * les signatures d'émargement (signer_type='trainer') avec les time_slots.
 *
 * Source de vérité unique remplaçant la fonction inline `getTrainerStats`
 * du composant ResumeTrainers (extraction pour testabilité).
 *
 * Pure — pas de Supabase, opère sur les relations déjà chargées de la session.
 */

import type { Session } from "@/lib/types";

export interface TrainerStats {
  /** Heures cumulées, arrondi à 0.1 près. */
  hours: number;
  /** Dates uniques (format JJ/MM/AAAA, fuseau Europe/Paris) où le trainer a signé. */
  dates: string[];
  /** Nombre de slots signés. */
  slotCount: number;
}

export function getTrainerStats(
  formation: Pick<Session, "formation_time_slots" | "signatures">,
  trainerId: string,
  trainerProfileId?: string | null,
): TrainerStats {
  const signatures = formation.signatures ?? [];
  const timeSlots = formation.formation_time_slots ?? [];

  // ⚠️ Convention `signatures.signer_id` incohérente côté formateur :
  // `/api/emargement/sign` stocke `trainers.id`, `/api/signatures` (page
  // d'émargement formateur) stocke `profile_id`. On matche donc les deux.
  const signedSlotIds = signatures
    .filter(
      (s) =>
        s.signer_type === "trainer" &&
        (s.signer_id === trainerId ||
          (trainerProfileId != null && s.signer_id === trainerProfileId)),
    )
    .map((s) => s.time_slot_id);

  const signedSlots = timeSlots.filter((ts) => signedSlotIds.includes(ts.id));

  let totalHours = 0;
  const dates = new Set<string>();

  for (const slot of signedSlots) {
    const start = new Date(slot.start_time);
    const end = new Date(slot.end_time);
    totalHours += (end.getTime() - start.getTime()) / 3600000;
    dates.add(
      start.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Europe/Paris",
      }),
    );
  }

  return {
    hours: Math.round(totalHours * 10) / 10,
    dates: [...dates].sort(),
    slotCount: signedSlots.length,
  };
}
