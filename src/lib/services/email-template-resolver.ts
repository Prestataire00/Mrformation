import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent, logger } from "@/lib/logger";
import type { EmailTemplate } from "@/lib/types";

/**
 * Liste exhaustive des `key` "système" attendus par les pipelines existants
 * (cf. cadrage-module-emails.md §2.1 — 7 pipelines actuels + 15+ batch sends).
 *
 * Le seed de em-a-3 crée 1 ligne par `key` par entité. Le cron de chaque
 * pipeline appelle `assertSeedComplete(entityId)` au boot pour détecter
 * les manques avant traitement.
 */
export const REQUIRED_KEYS = [
  // Invoice reminders (em-b-1)
  "reminder_invoice_first",
  "reminder_invoice_second",
  "reminder_invoice_final",
  // Quote reminders (em-b-2)
  "reminder_quote_first",
  "reminder_quote_second",
  "reminder_quote_final",
  // Quote sign-request (em-b-3)
  "quote_sign_request",
  // OPCO deposit (em-b-4)
  "opco_deposit",
  // Batch document sends (em-b-5) — keys batch_<docType>
  "batch_convocation",
  "batch_attestation_assiduite",
  "batch_certificat_realisation",
  "batch_attestation_competences",
  "batch_attestation_abandon",
  "batch_avis_habilitation_electrique",
  "batch_certificat_travail_hauteur",
  "batch_attestation_aipr",
  "batch_reponses_satisfaction",
  "batch_resultats_evaluations",
  "batch_cgv",
  "batch_politique_confidentialite",
  "batch_bilans_poe",
  "batch_programme",
  "batch_convention_entreprise",
  "batch_convention_intervention",
] as const;

export type RequiredKey = (typeof REQUIRED_KEYS)[number];

/**
 * Récupère un template email actif pour une entité par sa clef sémantique.
 *
 * - Retourne le template si trouvé.
 * - Retourne `null` si non trouvé (template absent ou inactif) — JAMAIS throw.
 *   Le caller doit gérer le cas null (typiquement : skip envoi + log fail).
 * - Émet un event `email_template_resolved` (succès) ou
 *   `email_template_missing` (null) avec contexte structuré pour
 *   diagnostic via Netlify Logs / Sentry.
 *
 * Latence cible : < 50ms P95 (NFR-EML-PERF-1) couverte par l'index unique
 * partiel `email_templates_entity_key_uniq (entity_id, key) WHERE key IS NOT
 * NULL AND is_active = TRUE` créé par em-a-1.
 *
 * Multi-tenancy : repose sur RLS `email_templates_admin_all` /
 * `email_templates_trainer_read` qui filtrent déjà par entity_id côté DB.
 * Le filter applicatif `.eq("entity_id", entityId)` est ceinture+bretelles
 * pour défense en profondeur.
 */
export async function resolveEmailTemplate(
  supabase: SupabaseClient,
  key: RequiredKey | string,
  entityId: string,
): Promise<EmailTemplate | null> {
  if (!key || !entityId) {
    logger.warn("resolveEmailTemplate appelé avec args invalides", { key, entityId });
    return null;
  }

  const start = Date.now();

  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .eq("entity_id", entityId)
    .eq("key", key)
    .eq("is_active", true)
    .maybeSingle();

  const latency_ms = Date.now() - start;

  if (error) {
    logger.error("resolveEmailTemplate erreur Supabase", error, {
      entity_id: entityId,
      key,
      latency_ms,
    });
    logEvent("email_template_resolved", {
      entity_id: entityId,
      key,
      latency_ms,
      status: "error",
      error: error.message,
    });
    return null;
  }

  if (!data) {
    logEvent("email_template_missing", {
      entity_id: entityId,
      key,
      latency_ms,
      level: "error",
    });
    return null;
  }

  logEvent("email_template_resolved", {
    entity_id: entityId,
    key,
    template_id: data.id,
    latency_ms,
    status: "ok",
  });

  return data as EmailTemplate;
}

/**
 * Vérifie au boot de chaque cron consommateur (em-b-1 à em-b-5) que tous
 * les `key` "système" requis sont seedés et actifs pour l'entité.
 *
 * Retourne :
 *   - `{ ok: true, missing: [] }` si tous présents
 *   - `{ ok: false, missing: [...] }` si manquants, ET émet un event
 *     `email_template_seed_incomplete` au niveau "critical" pour alerter
 *     Wissam via Netlify Logs / Sentry.
 *
 * Le caller (route cron) DOIT vérifier `result.ok` et :
 *   - si ok=true → procéder au traitement normal
 *   - si ok=false → soit 500 + abort (recommandé), soit traiter ce qui
 *     est possible en fail-soft (selon criticité du cron).
 *
 * Cf. architecture §Risques #1 : protège contre une seed migration
 * appliquée partiellement (= certaines lignes manquent).
 */
export async function assertSeedComplete(
  supabase: SupabaseClient,
  entityId: string,
): Promise<{ ok: boolean; missing: string[] }> {
  if (!entityId) {
    return { ok: false, missing: [...REQUIRED_KEYS] };
  }

  const { data, error } = await supabase
    .from("email_templates")
    .select("key")
    .eq("entity_id", entityId)
    .in("key", REQUIRED_KEYS as unknown as string[])
    .eq("is_active", true);

  if (error) {
    logger.error("assertSeedComplete erreur Supabase", error, { entity_id: entityId });
    logEvent("email_template_seed_incomplete", {
      entity_id: entityId,
      missing: [...REQUIRED_KEYS],
      error: error.message,
      level: "critical",
    });
    return { ok: false, missing: [...REQUIRED_KEYS] };
  }

  const present = new Set((data ?? []).map((r) => r.key as string));
  const missing = REQUIRED_KEYS.filter((k) => !present.has(k));

  if (missing.length > 0) {
    logEvent("email_template_seed_incomplete", {
      entity_id: entityId,
      missing,
      level: "critical",
    });
    return { ok: false, missing };
  }

  return { ok: true, missing: [] };
}
