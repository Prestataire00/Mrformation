/**
 * Cache serveur des PDFs générés via CloudConvert.
 *
 * Pourquoi : sans ce cache, chaque preview/envoi déclenchait une nouvelle
 * conversion CloudConvert (5-15 sec + coût $0.01 + quota gratuit 25/jour).
 * Avec ce cache, on ne paie qu'à la 1ère génération ; les previews suivants
 * sont instantanés et gratuits tant que rien n'a changé.
 *
 * Stratégie d'invalidation par contenu :
 *   - Hash basé sur tous les inputs qui influencent le PDF :
 *     template_id ou doc_type, contexte (session/learner/client/trainer ids),
 *     updated_at des entités impliquées, custom variables.
 *   - Si l'admin modifie un template Word → updated_at change → nouveau hash
 *     → cache miss → nouveau PDF généré.
 *
 * Storage : bucket privé `pdf-cache`, path `{entity_id}/{hash}.pdf`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const CACHE_BUCKET = "pdf-cache";

export interface CacheKeyInputs {
  entity_id: string;
  template_id?: string | null;
  doc_type?: string | null;
  session_id?: string | null;
  learner_id?: string | null;
  client_id?: string | null;
  trainer_id?: string | null;
  custom_variables?: Record<string, string> | null;
  /** updated_at du template — fait invalider le cache quand template modifié */
  template_updated_at?: string | null;
  /** updated_at de la session — fait invalider quand session modifiée */
  session_updated_at?: string | null;
  /** updated_at du learner */
  learner_updated_at?: string | null;
  /** updated_at du client */
  client_updated_at?: string | null;
  /** updated_at du trainer */
  trainer_updated_at?: string | null;
}

/**
 * Calcule un hash SHA-256 stable depuis les inputs. Utilisé comme path Storage.
 */
export function computeCacheKey(inputs: CacheKeyInputs): string {
  // Sérialise dans un ordre déterministe pour stabilité
  const ordered = {
    template_id: inputs.template_id ?? "",
    doc_type: inputs.doc_type ?? "",
    session_id: inputs.session_id ?? "",
    learner_id: inputs.learner_id ?? "",
    client_id: inputs.client_id ?? "",
    trainer_id: inputs.trainer_id ?? "",
    template_updated_at: inputs.template_updated_at ?? "",
    session_updated_at: inputs.session_updated_at ?? "",
    learner_updated_at: inputs.learner_updated_at ?? "",
    client_updated_at: inputs.client_updated_at ?? "",
    trainer_updated_at: inputs.trainer_updated_at ?? "",
    custom_variables: inputs.custom_variables ? JSON.stringify(sortedKeys(inputs.custom_variables)) : "",
  };

  const json = JSON.stringify(ordered);
  return createHash("sha256").update(json).digest("hex");
}

function sortedKeys<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).sort((a, b) => a[0].localeCompare(b[0]))) as T;
}

/**
 * Tente de récupérer un PDF déjà mis en cache. Retourne null si absent.
 */
export async function getCachedPdf(
  supabase: SupabaseClient,
  entity_id: string,
  cacheKey: string
): Promise<Buffer | null> {
  const path = `${entity_id}/${cacheKey}.pdf`;
  const { data, error } = await supabase.storage.from(CACHE_BUCKET).download(path);
  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Stocke un PDF dans le cache pour réutilisation future.
 * Échec d'upload silencieux : si Storage en panne, on ne bloque pas la réponse.
 */
export async function setCachedPdf(
  supabase: SupabaseClient,
  entity_id: string,
  cacheKey: string,
  pdfBuffer: Buffer
): Promise<void> {
  const path = `${entity_id}/${cacheKey}.pdf`;
  const { error } = await supabase.storage
    .from(CACHE_BUCKET)
    .upload(path, pdfBuffer, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: true,
    });
  if (error) {
    console.warn(`[pdf-cache] Failed to cache ${path}:`, error.message);
  }
}
