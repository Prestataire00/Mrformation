/**
 * Netlify Background Function — génération Gamma async (fix 504).
 *
 * Pourquoi : générer un deck Gamma par chapitre prend 30-120s (POST + polling
 * Gamma API). Pour N chapitres en parallèle, on est largement au-dessus du
 * timeout 26s d'une route Next.js sur Netlify Pro.
 *
 * ⚠️ DUAL-MODE : toute la logique Gamma (appel API Gamma, polling, writes
 * `elearning_chapters.gamma_*` / `elearning_courses.gamma_*`, progression) vit
 * désormais dans `runElearningGamma` (src/lib/services/elearning-gamma-runner.ts).
 * Cette Background Function n'est plus qu'un WRAPPER HTTP mince autour de ce
 * helper, afin d'éviter deux implémentations divergentes : sur Railway les
 * routes /gamma et /generate/gamma appellent DIRECTEMENT `runElearningGamma` en
 * fire-and-forget in-process.
 *
 * Invoquée par : POST /api/elearning/[id]/gamma (auth admin user → fire-and-
 * forget vers cette BG function avec Bearer CRON_SECRET).
 *
 * Polling côté client : GET /api/elearning/[id]?shallow=true lit
 * generation_progress.step.
 */

import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { runElearningGamma } from "../../src/lib/services/elearning-gamma-runner";

type Payload = { courseId: string };

const CRON_SECRET = process.env.CRON_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    throw new Error("Supabase service_role manquant (SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async (req: Request) => {
  if (req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const { courseId } = payload;
  if (!courseId) return new Response("courseId required", { status: 400 });

  // Toute la logique Gamma est déléguée au helper partagé — même implémentation
  // que le chemin Railway in-process. Le .mts fournit son propre client
  // service_role (la BG function n'a pas de cookies Supabase).
  const outcome = await runElearningGamma(
    { courseId },
    { supabase: supabaseAdmin() },
  );

  if (!outcome.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: outcome.error ?? "unknown" }),
      { status: 500 },
    );
  }
  return new Response(
    JSON.stringify({
      ok: true,
      succeeded: outcome.succeeded ?? 0,
      total: outcome.total ?? 0,
      duration_ms: outcome.durationMs,
    }),
    { status: 200 },
  );
};

export const config: Config = {};
