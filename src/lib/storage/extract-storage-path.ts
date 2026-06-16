/**
 * Extrait `{ bucket, path }` d'un `file_url` Supabase Storage, qu'il soit :
 * - une URL publique  (`.../storage/v1/object/public/<bucket>/<path>?...`)
 * - une URL signée    (`.../storage/v1/object/sign/<bucket>/<path>?token=...`)
 * - un path interne nu (`<path>`) — alors `defaultBucket` est requis.
 *
 * Retourne `null` si l'entrée est vide, ou si c'est un path nu sans `defaultBucket`.
 * Fonction pure → partagée par l'endpoint signed-URL (RGPD Lot B).
 */
export function extractStoragePath(
  fileUrl: string | null | undefined,
  defaultBucket?: string,
): { bucket: string; path: string } | null {
  if (!fileUrl) return null;
  const m = fileUrl.match(
    /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?.*)?$/,
  );
  if (m) return { bucket: m[1], path: m[2] };
  if (defaultBucket) return { bucket: defaultBucket, path: fileUrl.replace(/\?.*$/, "") };
  return null;
}
