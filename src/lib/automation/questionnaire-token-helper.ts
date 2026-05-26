import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Helpers pour la génération de tokens publics de questionnaire (Chantier 2c).
 *
 * Utilisés par les 2 crons questionnaires (auto-send + run-cron via execute-rule)
 * pour insérer un lien `/questionnaire/<token>` dans le corps des emails.
 *
 * Source : docs/superpowers/specs/2026-05-26-questionnaires-p0-5-auto-qualiopi-design.md §4
 */

export interface EnsureTokenResult {
  token: string;
  expiresAt: string;
  wasCreated: boolean;
}

const TOKEN_LIFETIME_DAYS = 90;

/**
 * Récupère un token public actif pour (session, questionnaire, learner)
 * ou en crée un nouveau si aucun n'est actif.
 *
 * Idempotent : appel multiple → même token (sauf si le précédent a expiré).
 * Gère la race condition 23505 (UNIQUE constraint) via retry SELECT.
 */
export async function ensureQuestionnaireToken(
  supabase: SupabaseClient,
  sessionId: string,
  questionnaireId: string,
  learnerId: string,
  entityId: string,
): Promise<EnsureTokenResult> {
  // 1. Chercher un token existant non-utilisé et non-expiré
  const { data: existing } = await supabase
    .from("questionnaire_tokens")
    .select("token, expires_at")
    .eq("session_id", sessionId)
    .eq("questionnaire_id", questionnaireId)
    .eq("learner_id", learnerId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (existing) {
    return {
      token: existing.token as string,
      expiresAt: existing.expires_at as string,
      wasCreated: false,
    };
  }

  // 2. INSERT nouveau token
  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: newToken, error } = await supabase
    .from("questionnaire_tokens")
    .insert({
      session_id: sessionId,
      questionnaire_id: questionnaireId,
      learner_id: learnerId,
      entity_id: entityId,
      expires_at: expiresAt,
    })
    .select("token, expires_at")
    .single();

  if (newToken) {
    return {
      token: newToken.token as string,
      expiresAt: newToken.expires_at as string,
      wasCreated: true,
    };
  }

  // 3. Race condition 23505 : retry SELECT
  if (error?.code === "23505") {
    const { data: raceToken } = await supabase
      .from("questionnaire_tokens")
      .select("token, expires_at")
      .eq("session_id", sessionId)
      .eq("questionnaire_id", questionnaireId)
      .eq("learner_id", learnerId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (raceToken) {
      return {
        token: raceToken.token as string,
        expiresAt: raceToken.expires_at as string,
        wasCreated: false,
      };
    }
  }

  throw new Error(`Failed to ensure questionnaire token: ${error?.message ?? "unknown error"}`);
}

/**
 * Construit l'URL publique du questionnaire pour un token donné.
 * Utilise NEXT_PUBLIC_APP_URL ou un fallback hardcodé.
 */
export function buildPublicQuestionnaireUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app";
  return `${baseUrl}/questionnaire/${token}`;
}
