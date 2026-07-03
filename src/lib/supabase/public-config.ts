/**
 * Configuration Supabase PUBLIQUE (URL + clé anon).
 *
 * ⚠️ Ces deux valeurs ne sont PAS des secrets : elles sont incluses en clair
 * dans le bundle JS envoyé à chaque navigateur (c'est leur rôle). On les fixe
 * donc ici comme valeur de repli robuste.
 *
 * Motif (incident déploiement Railway 03/07/2026) : `NEXT_PUBLIC_*` est GRAVÉE
 * dans le bundle au moment du `next build`. Si la variable d'env est absente OU
 * laissée sur le placeholder de `.env.example` (`your-project.supabase.co`) au
 * moment du build, cette fausse URL est figée dans le bundle → login impossible
 * (`net::ERR_NAME_NOT_RESOLVED` / `Failed to fetch`). Ce garde-fou force la
 * vraie valeur dès que l'env est vide ou reste sur le placeholder, tout en
 * laissant un override par une vraie variable d'env valide.
 */

const FALLBACK_URL = "https://zttstemfpybkjurmcxhs.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0dHN0ZW1mcHlia2p1cm1jeGhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjI4NzIsImV4cCI6MjA4NzE5ODg3Mn0.vASpz01nmOh51kftxju2xAN9hXBHg3IBKmUMsJpc5Ew";

/** Une valeur d'env absente ou laissée sur un placeholder `.env.example`. */
function isPlaceholder(value: string | undefined): boolean {
  return !value || value.includes("your-project") || value.includes("your-anon-key");
}

export const SUPABASE_URL = isPlaceholder(process.env.NEXT_PUBLIC_SUPABASE_URL)
  ? FALLBACK_URL
  : (process.env.NEXT_PUBLIC_SUPABASE_URL as string);

export const SUPABASE_ANON_KEY = isPlaceholder(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ? FALLBACK_ANON_KEY
  : (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
