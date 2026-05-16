/**
 * Helper magic-link pour les convocations apprenant.
 *
 * Génère ou réutilise un token `learner_access_tokens` avec
 * `purpose='convocation'` pour permettre à l'apprenant de scanner le QR
 * code de sa convocation et se logger automatiquement vers sa session.
 *
 * Stratégie : on réutilise les tokens existants non-expirés pour la même
 * (learner_id, session_id, purpose='convocation') — important pour que le
 * cache PDF fonctionne (même contenu HTML → même hash → cache hit).
 *
 * Token expire après `DEFAULT_VALIDITY_DAYS` jours (cf user pref : 30 jours
 * pour couvrir les convocations imprimées à l'avance).
 */

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CONVOCATION_VALIDITY_DAYS = 30;
const CONVOCATION_PURPOSE = "convocation";

interface MagicLinkInput {
  supabase: SupabaseClient;
  learnerId: string;
  sessionId: string;
  entityId: string;
  createdByUserId: string;
  validityDays?: number;
}

interface MagicLinkResult {
  token: string;
  url: string;
  reused: boolean;
  expiresAt: string;
}

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app").replace(/\/+$/, "");

/**
 * Retourne un magic link valide pour cette (learner, session). Réutilise
 * tout token existant non-expiré avec le même purpose ; sinon en crée un.
 *
 * Idempotent : appels répétés retournent le même token tant qu'il n'est
 * pas expiré → cache PDF stable.
 */
export async function getOrCreateConvocationMagicLink(
  input: MagicLinkInput,
): Promise<MagicLinkResult> {
  const { supabase, learnerId, sessionId, entityId, createdByUserId } = input;
  const validityDays = input.validityDays ?? CONVOCATION_VALIDITY_DAYS;

  // 1. Cherche un token non-expiré existant pour cette (learner, session, purpose)
  const nowIso = new Date().toISOString();
  const { data: existing } = await supabase
    .from("learner_access_tokens")
    .select("token, expires_at")
    .eq("learner_id", learnerId)
    .eq("session_id", sessionId)
    .eq("purpose", CONVOCATION_PURPOSE)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const exTyped = existing as { token: string; expires_at: string };
    return {
      token: exTyped.token,
      url: `${BASE_URL}/access/${exTyped.token}`,
      reused: true,
      expiresAt: exTyped.expires_at,
    };
  }

  // 2. Sinon : nouveau token
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);

  const { error } = await supabase.from("learner_access_tokens").insert({
    token,
    learner_id: learnerId,
    entity_id: entityId,
    session_id: sessionId,
    purpose: CONVOCATION_PURPOSE,
    expires_at: expiresAt.toISOString(),
    created_by: createdByUserId,
  });
  if (error) {
    throw new Error(`Création magic link convocation : ${error.message}`);
  }

  return {
    token,
    url: `${BASE_URL}/access/${token}`,
    reused: false,
    expiresAt: expiresAt.toISOString(),
  };
}
