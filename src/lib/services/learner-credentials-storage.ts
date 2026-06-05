/**
 * Pédagogie V2 Epic 2.5 — TASK 11 — Upload PDF credentials → Storage
 *
 * Uploade le PDF généré par `generateLearnerCredentialsPDF` dans le
 * bucket privé `learner-credentials` et retourne une signed URL valable
 * 24h (TTL court car le PDF contient des mots de passe temporaires en
 * clair — l'admin doit le télécharger immédiatement et le distribuer).
 *
 * Path convention :
 *   `<entityId>/<sessionId>/credentials_<timestamp>.pdf`
 *
 * Le bucket est privé (cf migration `add_learner_credentials_bucket.sql`)
 * et les RLS imposent owner=admin de l'entité. L'upload via service_role
 * (admin client) bypasse les RLS mais respecte la convention de path
 * pour que les RLS s'appliquent ensuite sur les downloads via session
 * authentifiée d'admin.
 *
 * Retourne `null` si l'upload échoue (le caller doit afficher un toast
 * d'erreur — le PDF Blob reste en mémoire côté admin et il peut le
 * télécharger directement en fallback).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const LEARNER_CREDENTIALS_BUCKET = "learner-credentials";

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24; // 24h

export interface UploadLearnerCredentialsPDFParams {
  entityId: string;
  sessionId: string;
  pdfBlob: Blob;
}

export interface UploadLearnerCredentialsPDFResult {
  path: string;
  signedUrl: string;
}

/**
 * Upload + signed URL en une étape.
 *
 * @param supabase client service_role (bypass RLS — appelé depuis une
 *   route admin authentifiée qui a déjà vérifié le rôle).
 * @returns `{ path, signedUrl }` ou `null` si upload ou signature KO.
 */
export async function uploadLearnerCredentialsPDF(
  supabase: SupabaseClient,
  params: UploadLearnerCredentialsPDFParams,
): Promise<UploadLearnerCredentialsPDFResult | null> {
  const { entityId, sessionId, pdfBlob } = params;

  if (!entityId || !sessionId) {
    console.warn("[learner-credentials-storage] entityId et sessionId requis");
    return null;
  }

  const timestamp = Date.now();
  const path = `${entityId}/${sessionId}/credentials_${timestamp}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(LEARNER_CREDENTIALS_BUCKET)
    .upload(path, pdfBlob, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    console.error("[learner-credentials-storage] upload failed:", uploadError);
    return null;
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(LEARNER_CREDENTIALS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (signedError || !signed?.signedUrl) {
    console.error("[learner-credentials-storage] createSignedUrl failed:", signedError);
    // Le fichier est uploadé mais on ne peut pas le signer — on retourne
    // null et l'admin devra utiliser le fallback download direct depuis
    // le Blob en mémoire.
    return null;
  }

  return { path, signedUrl: signed.signedUrl };
}
