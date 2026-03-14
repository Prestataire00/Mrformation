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
