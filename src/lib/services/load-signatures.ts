/**
 * Helper partagé : charge les signatures d'une session.
 *
 * Retourne 3 structures :
 * - signaturesById : Map signer_id → signature_data (legacy, vue agrégée par
 *   personne, utilisé par emargement-collectif et autres)
 * - signaturesBySlotPerson : Map "slotId|signerId|signerType" → signature_data
 *   (vue par créneau, utilisé par planning-hebdo-signe)
 * - signedLearnerIds : Set des learner_id ayant au moins 1 signature
 *
 * Utilisé par les routes d'émargement pour afficher les images de signatures
 * réelles dans les PDF — apprenants ET formateurs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadSignaturesBySessionId(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{
  signaturesById: Map<string, string>;
  signaturesBySlotPerson: Map<string, string>;
  signedLearnerIds: Set<string>;
  totalCount: number;
}> {
  const { data: rows } = await supabase
    .from("signatures")
    .select("signer_id, signer_type, signature_data, time_slot_id")
    .eq("session_id", sessionId);

  const signaturesById = new Map<string, string>();
  const signaturesBySlotPerson = new Map<string, string>();
  const signedLearnerIds = new Set<string>();
  const typed = (rows ?? []) as {
    signer_id: string | null;
    signer_type: string | null;
    signature_data: string | null;
    time_slot_id: string | null;
  }[];

  for (const r of typed) {
    if (!r.signer_id) continue;
    if (r.signature_data) {
      signaturesById.set(r.signer_id, r.signature_data);
      if (r.time_slot_id && r.signer_type) {
        signaturesBySlotPerson.set(
          `${r.time_slot_id}|${r.signer_id}|${r.signer_type}`,
          r.signature_data,
        );
      }
    }
    if (r.signer_type === "learner") signedLearnerIds.add(r.signer_id);
  }

  return { signaturesById, signaturesBySlotPerson, signedLearnerIds, totalCount: typed.length };
}

/**
 * Doc types dont le rendu contient un tableau de signatures (émargement /
 * planning signé) et qui nécessitent donc le chargement des signatures
 * (signaturesBySlotPerson / signaturesById) côté generate-from-template.
 *
 * ⚠ Inclure les ALIAS du registry : `planning_semaine` est un alias de
 * `planning_hebdo_signe` (même template PLANNING_HEBDO_SIGNE_HTML). Oublier
 * l'alias = signatures jamais chargées pour ce doc_type → tableau émargement
 * vide (retour Loris « FEUILLE D'ÉMARGEMENT PLANNING : signatures absentes »).
 */
export const DOC_TYPES_WITH_SIGNATURE_TABLE = new Set<string>([
  "attestation_assiduite",
  "feuille_emargement",
  "feuille_emargement_collectif",
  "planning_hebdo_signe",
  "planning_semaine",
]);
