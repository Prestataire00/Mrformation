/**
 * Helpers de stockage des CV formateurs.
 *
 * Lot H audit BMAD : extrait de src/app/api/trainers/[id]/cv/route.ts pour
 * pouvoir tester unitairement la logique de path / bucket / purge sans
 * lancer une vraie requête HTTP.
 *
 * Le bucket cible est `elearning-documents` (privé). Le bucket legacy
 * `documents` (public) a été utilisé par l'ancien upload formateur et
 * doit être purgé lorsqu'un nouveau CV remplace un ancien.
 */

export const TRAINER_CV_BUCKET = "elearning-documents";
export const TRAINER_CV_LEGACY_BUCKET = "documents";

/**
 * Path déterministe du CV d'un formateur dans `elearning-documents`.
 *
 * Pourquoi déterministe : permet l'upsert pour remplacer un CV existant
 * sans laisser de fichier orphelin (bug Loris "Erreur lors du
 * remplacement d'un CV lorsqu'il y a déjà un CV" — Date.now() dans le
 * nom rendait l'upsert inopérant).
 */
export function getTrainerCvStoragePath(trainerId: string): string {
  return `trainers/cv/cv-${trainerId}.pdf`;
}

/**
 * Détecte le bucket de stockage d'un cv_url existant.
 *
 * Heuristique :
 *  - Si l'URL/path contient `/documents/` → bucket public legacy.
 *  - Si le path est de la forme `trainers/cv-<id>.pdf` (sans /cv/) →
 *    convention de l'ancien bucket `documents`.
 *  - Sinon → bucket actuel `elearning-documents`.
 *
 * Utilisé pour purger l'ancien fichier avant upload du nouveau, dans le
 * bon bucket (sinon la purge est silencieusement inopérante).
 */
export function detectCvBucket(
  previousCvUrl: string | null | undefined,
): typeof TRAINER_CV_BUCKET | typeof TRAINER_CV_LEGACY_BUCKET {
  if (!previousCvUrl) return TRAINER_CV_BUCKET;
  const isLegacy =
    previousCvUrl.includes("/documents/") ||
    /^trainers\/cv-[^/]+\.pdf$/.test(previousCvUrl);
  return isLegacy ? TRAINER_CV_LEGACY_BUCKET : TRAINER_CV_BUCKET;
}

/**
 * Extrait le path Storage propre depuis un cv_url qui peut être :
 *  - un path interne (`trainers/cv/cv-<id>.pdf`)
 *  - une URL publique signée ou non
 *    (`https://...supabase.co/storage/v1/object/public/<bucket>/<path>?token=...`)
 *
 * Renvoie une chaîne vide si l'URL est vide.
 */
export function extractCvStorageCleanPath(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign)\/[^/]+\//, "")
    .replace(/\?.*$/, "");
}

/**
 * Indique si une valeur `cv_url` est une URL HTTP (legacy bucket public).
 * Inverse : c'est un path Storage interne (bucket privé actuel).
 *
 * Utilisé par la route /api/trainers/[id]/cv/url pour décider entre
 * "retourner l'URL telle quelle" et "générer un signed URL".
 */
export function isHttpCvUrl(cvUrl: string | null | undefined): boolean {
  if (!cvUrl) return false;
  return /^https?:\/\//.test(cvUrl);
}
