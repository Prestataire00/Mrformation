import type { SupabaseClient } from "@supabase/supabase-js";
import { extractStoragePath } from "./extract-storage-path";

/**
 * Convertit une URL Storage en URL SIGNÉE temporaire, pour qu'un service externe
 * (docx-converter / CloudConvert) puisse récupérer un fichier d'un bucket PRIVÉ.
 *
 * Contexte : le durcissement RGPD a rendu les buckets privés ; les URLs publiques
 * `/storage/v1/object/public/...` renvoient désormais 400 pour un fetch externe.
 *
 * - URL déjà signée (`/object/sign/`) → renvoyée telle quelle.
 * - URL publique → on extrait {bucket, path} et on crée une URL signée (TTL).
 * - Extraction impossible ou erreur de signature → on renvoie l'URL d'origine (best-effort).
 */
export async function toSignedStorageUrl(
  supabase: SupabaseClient,
  url: string,
  ttlSeconds = 600,
): Promise<string> {
  if (!url || url.includes("/storage/v1/object/sign/")) return url;
  const loc = extractStoragePath(url);
  if (!loc) return url;
  const { data, error } = await supabase.storage
    .from(loc.bucket)
    .createSignedUrl(decodeURIComponent(loc.path), ttlSeconds);
  return error || !data?.signedUrl ? url : data.signedUrl;
}
