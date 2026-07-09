/**
 * Signature commerciale automatique des emails.
 *
 * La signature (texte simple) du commercial expéditeur — `profiles.email_signature`
 * — est ajoutée en bas du corps de l'email, sur tous les chemins où l'expéditeur
 * est identifiable (`sent_by` / `auth.profile.id`). Les envois système/cron sans
 * expéditeur humain ne reçoivent aucune signature.
 *
 * Cf. docs/superpowers/specs/2026-07-09-email-commercial-signature-design.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Séparateur standard « -- » précédant une signature email (convention RFC 3676). */
const SIGNATURE_SEPARATOR = "\n\n--\n";

/**
 * Ajoute la signature texte en bas du corps, si elle est non vide.
 *
 * Idempotent : si le corps se termine déjà par cette signature (retry du worker,
 * double passage), il est renvoyé inchangé — pas de signature en double.
 */
export function appendCommercialSignature(
  body: string,
  signature: string | null | undefined,
): string {
  const sig = (signature ?? "").trim();
  if (!sig) return body;
  if (body.trimEnd().endsWith(sig)) return body;
  return `${body}${SIGNATURE_SEPARATOR}${sig}`;
}

/**
 * Charge `profiles.email_signature` pour un profil donné.
 * Retourne `null` si `profileId` est absent, le profil introuvable, ou la
 * signature vide/nulle (lecture best-effort : ne throw jamais).
 */
export async function loadCommercialSignature(
  supabase: SupabaseClient,
  profileId: string | null | undefined,
): Promise<string | null> {
  if (!profileId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("email_signature")
    .eq("id", profileId)
    .maybeSingle();
  const sig = (data?.email_signature as string | null | undefined) ?? null;
  return sig && sig.trim() ? sig : null;
}
