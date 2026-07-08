/**
 * Calcul de l'assiduité (présence) d'un apprenant à partir de ses créneaux
 * d'émargement signés. Fonction pure → testable, sans Supabase ni React.
 *
 * Convention : un apprenant émarge un `formation_time_slots` ; la signature porte
 * `signer_id = learners.id` (cf. [[project_signatures_signer_id_convention]]). La
 * route appelante fournit, par session, les créneaux et les ids de créneaux signés.
 */

export interface AttendanceSlot {
  id: string;
  start_time: string;
  end_time: string;
}

export interface AttendanceSessionInput {
  session_id: string;
  title: string;
  slots: AttendanceSlot[];
  /** Ids des créneaux émargés par l'apprenant (peut contenir des doublons). */
  signedSlotIds: string[];
}

export interface SessionAttendance {
  session_id: string;
  title: string;
  signed_slots: number;
  total_slots: number;
  /** Taux de présence en % (créneaux signés / total). */
  rate_pct: number;
  signed_hours: number;
  total_hours: number;
}

export interface LearnerAttendance {
  sessions: SessionAttendance[];
  overall_rate_pct: number;
  total_signed_hours: number;
}

function slotHours(s: AttendanceSlot): number {
  const h = (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 3_600_000;
  return h > 0 ? h : 0;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Ligne de signature brute (table `signatures`) pour un lookup slot-aware. */
export interface SlotSignatureRow {
  signer_id: string | null;
  time_slot_id: string | null;
}

/** Assiduité pré-calculée d'un apprenant pour l'attestation d'assiduité. */
export interface AttestationAttendance {
  signedHours: number;
  totalHours: number;
  ratePct: number;
}

/**
 * Calcule l'assiduité par créneau d'UN apprenant pour l'attestation d'assiduité,
 * en réutilisant `computeLearnerAttendance`. Base du taux = heures
 * (`signedHours / totalHours`).
 *
 * Retourne `null` — signal « retomber sur l'heuristique legacy (présence
 * intégrale) » — quand aucun calcul slot-level n'est possible :
 *   - la session n'a aucun créneau (`slots` vide), OU
 *   - l'apprenant n'a aucune signature slot-level (toutes à `time_slot_id` NULL,
 *     émargement legacy non slot-aware).
 */
export function computeAttestationAttendance(
  slots: AttendanceSlot[],
  signatureRows: SlotSignatureRow[],
  learnerId: string,
): AttestationAttendance | null {
  if (slots.length === 0) return null;
  const signedSlotIds = signatureRows
    .filter((s) => s.signer_id === learnerId && s.time_slot_id)
    .map((s) => s.time_slot_id as string);
  if (signedSlotIds.length === 0) return null;

  const [session] = computeLearnerAttendance([
    { session_id: "", title: "", slots, signedSlotIds },
  ]).sessions;

  const totalHours = session.total_hours;
  const signedHours = session.signed_hours;
  // Créneaux dégénérés (durées nulles/négatives) ou signatures orphelines
  // (time_slot_id absent des créneaux de la session) → 0h calculé. On préfère
  // retomber sur le fallback legacy (présence intégrale) plutôt qu'imprimer un
  // faux « 0 heure / 0 % » sur un document légal Qualiopi.
  if (totalHours <= 0 || signedHours <= 0) return null;
  // Taux affiché avec 2 décimales dans l'attestation → arrondi à 2 décimales
  // (ex. 3h/7h = 42.857… → 42.86).
  const ratePct = Math.round((signedHours / totalHours) * 10000) / 100;
  return { signedHours, totalHours, ratePct };
}

export function computeLearnerAttendance(
  sessions: AttendanceSessionInput[],
): LearnerAttendance {
  const out: SessionAttendance[] = [];
  let sumSigned = 0;
  let sumTotal = 0;
  let sumSignedHours = 0;

  for (const s of sessions) {
    const signedSet = new Set(s.signedSlotIds);
    const signedSlots = s.slots.filter((sl) => signedSet.has(sl.id));
    const total_slots = s.slots.length;
    const signed_slots = signedSlots.length;
    const total_hours = s.slots.reduce((a, sl) => a + slotHours(sl), 0);
    const signed_hours = signedSlots.reduce((a, sl) => a + slotHours(sl), 0);

    out.push({
      session_id: s.session_id,
      title: s.title,
      signed_slots,
      total_slots,
      rate_pct: total_slots > 0 ? Math.round((signed_slots / total_slots) * 100) : 0,
      signed_hours: round1(signed_hours),
      total_hours: round1(total_hours),
    });

    sumSigned += signed_slots;
    sumTotal += total_slots;
    sumSignedHours += signed_hours;
  }

  return {
    sessions: out,
    overall_rate_pct: sumTotal > 0 ? Math.round((sumSigned / sumTotal) * 100) : 0,
    total_signed_hours: round1(sumSignedHours),
  };
}
