/**
 * Sanitize error messages before returning them to clients.
 * Prevents leaking database schema details, internal paths, or sensitive info.
 */

const GENERIC_ERROR = "Une erreur interne est survenue";

/**
 * Returns a safe error message for API responses.
 * Logs the real error server-side for debugging.
 */
export function sanitizeError(error: unknown, context?: string): string {
  const message = error instanceof Error ? error.message : String(error);

  if (context) {
    console.error(`[API Error] ${context}:`, message);
  } else {
    console.error("[API Error]:", message);
  }

  return GENERIC_ERROR;
}

/**
 * Messages client pour les erreurs typées de la couche génération IA
 * (cf `parseJsonResponse` dans `src/lib/services/openai.ts`).
 */
const AI_ERROR_MESSAGES: Record<string, string> = {
  AI_JSON_PARSE: "La génération IA a renvoyé une réponse illisible. Veuillez réessayer.",
  AI_SCHEMA: "La génération IA a renvoyé un format inattendu. Veuillez réessayer.",
};

/**
 * Traduit une erreur de génération IA (`AI_SCHEMA` / `AI_JSON_PARSE`) en réponse
 * client claire + statut 422 : la requête était valide, c'est la sortie du
 * modèle qui est inexploitable, et un nouvel essai aide souvent. Le message
 * technique reste loggué côté serveur, jamais renvoyé au client.
 *
 * Renvoie `null` si l'erreur n'est pas une erreur IA typée (laisser le 500
 * générique habituel via `sanitizeError`).
 */
export function aiGenerationError(
  error: unknown,
  context?: string
): { error: string; status: number } | null {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && code in AI_ERROR_MESSAGES) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AI Error]${context ? ` ${context}` : ""}:`, message);
    return { error: AI_ERROR_MESSAGES[code], status: 422 };
  }
  return null;
}

/**
 * Sanitize a Supabase error object.
 * Use this for `if (error) { ... }` blocks after Supabase queries.
 */
export function sanitizeDbError(
  error: { message: string; code?: string; details?: string } | null,
  context?: string
): string {
  if (!error) return GENERIC_ERROR;

  console.error(`[DB Error]${context ? ` ${context}` : ""}:`, {
    message: error.message,
    code: error.code,
    details: error.details,
  });

  return GENERIC_ERROR;
}
