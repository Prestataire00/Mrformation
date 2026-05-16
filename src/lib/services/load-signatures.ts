/**
 * Helper partagé : charge les signatures d'une session et retourne une Map
 * signer_id → signature_data (data URL base64).
 *
 * Utilisé par les routes d'émargement (collectif + individuel) pour afficher
 * les images de signatures réelles dans les PDF — apprenants ET formateurs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadSignaturesBySessionId(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{
  signaturesById: Map<string, string>;
  signedLearnerIds: Set<string>;
  totalCount: number;
}> {
  const { data: rows } = await supabase
    .from("signatures")
    .select("signer_id, signer_type, signature_data")
    .eq("session_id", sessionId);

  const signaturesById = new Map<string, string>();
  const signedLearnerIds = new Set<string>();
  const typed = (rows ?? []) as {
    signer_id: string | null;
    signer_type: string | null;
    signature_data: string | null;
  }[];

  for (const r of typed) {
    if (!r.signer_id) continue;
    if (r.signature_data) signaturesById.set(r.signer_id, r.signature_data);
    if (r.signer_type === "learner") signedLearnerIds.add(r.signer_id);
  }

  return { signaturesById, signedLearnerIds, totalCount: typed.length };
}
