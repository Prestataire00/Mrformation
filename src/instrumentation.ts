/**
 * Hook d'instrumentation Next.js — exécuté UNE fois au démarrage du serveur.
 *
 * Usage : démarrer le scheduler cron IN-PROCESS UNIQUEMENT sur Railway (dual-mode
 * — sur Netlify les crons restent des Scheduled Functions). Garde runtime Node
 * (jamais edge) + `isRailway()` : sur Netlify/dev ce register est un no-op.
 *
 * L'import du scheduler est DYNAMIQUE pour ne le charger que dans le runtime
 * Node (il tire `@/lib/supabase/server` → `next/headers`, indisponible en edge).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { isRailway } = await import("@/lib/platform");
  if (!isRailway()) return;
  const { startRailwayCron } = await import("@/lib/cron/railway-scheduler");
  startRailwayCron();
}
