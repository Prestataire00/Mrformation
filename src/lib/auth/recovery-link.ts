/**
 * Analyse d'un lien de réinitialisation de mot de passe Supabase.
 *
 * Selon le flux configuré, Supabase renvoie l'utilisateur sur /reset-password
 * avec, dans l'URL :
 *  - PKCE      : `?code=<code>` à échanger via `exchangeCodeForSession`.
 *  - implicite : `#access_token=...&type=recovery` (auto-détecté par le client).
 *  - erreur    : `?error=...&error_description=...` (ou dans le hash) quand le
 *                lien est expiré / déjà utilisé / invalide.
 *
 * Ce helper pur classe le lien pour piloter la page de reset (établir la
 * session avant d'autoriser la modification du mot de passe).
 */
export interface RecoveryLinkInfo {
  kind: "error" | "code" | "hash-token" | "none";
  code?: string;
  errorDescription?: string;
}

export function parseRecoveryLink(search: string, hash: string): RecoveryLinkInfo {
  const q = new URLSearchParams(search.replace(/^\?/, ""));
  const h = new URLSearchParams(hash.replace(/^#/, ""));

  const errorDescription =
    q.get("error_description") ||
    h.get("error_description") ||
    q.get("error") ||
    h.get("error") ||
    undefined;
  if (errorDescription) return { kind: "error", errorDescription };

  const code = q.get("code");
  if (code) return { kind: "code", code };

  if (h.get("access_token")) return { kind: "hash-token" };

  return { kind: "none" };
}
