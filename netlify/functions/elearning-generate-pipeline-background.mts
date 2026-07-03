/**
 * Netlify Background Function — pipeline e-learning complet en async.
 *
 * Pourquoi : la pipeline OpenAI (outline + N chapitres + quiz + exam + gamma)
 * dure 60-180s au total, ce qui dépasse le timeout 26s d'une route Next.js
 * sur Netlify Functions (plan Pro). Les Background Functions Netlify ont un
 * timeout de 15min — largement suffisant.
 *
 * ⚠️ DUAL-MODE : l'orchestration (séquençage outline→chapitres→quiz→exam→gamma,
 * gestion de lots, updates generation_progress) vit désormais dans
 * `runElearningPipeline` (src/lib/services/elearning-pipeline-runner.ts). Cette
 * Background Function n'est plus qu'un WRAPPER HTTP mince autour de ce helper,
 * afin d'éviter deux implémentations divergentes : sur Railway la route
 * /generate/start appelle DIRECTEMENT `runElearningPipeline` en fire-and-forget.
 *
 * Invoquée par : POST /api/elearning/[id]/generate/start (route Next.js
 * auth-normal) qui fire-and-forget vers /.netlify/functions/elearning-
 * generate-pipeline-background.
 *
 * Le client front poll GET /api/elearning/[id]?shallow=true toutes les 3s
 * pour lire elearning_courses.generation_progress.
 */

import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { runElearningPipeline } from "../../src/lib/services/elearning-pipeline-runner";

type Payload = {
  courseId: string;
  includeExam?: boolean;
  includeGamma?: boolean;
  courseType?: "presentation" | "quiz" | "complete";
};

const BASE_URL = process.env.URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    throw new Error("Supabase service_role non configuré (SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant)");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async (req: Request) => {
  // Vérification auth — la route /generate/start nous appelle avec Bearer CRON_SECRET.
  if (!CRON_SECRET) {
    console.error("[elearning-bg] CRON_SECRET non configuré");
    return new Response("CRON_SECRET not configured", { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!payload.courseId) {
    return new Response("courseId required", { status: 400 });
  }

  // Toute l'orchestration est déléguée au helper partagé — même implémentation
  // que le chemin Railway in-process. Sur Netlify, BASE_URL = process.env.URL.
  const outcome = await runElearningPipeline(
    {
      courseId: payload.courseId,
      courseType: payload.courseType,
      includeExam: payload.includeExam,
      includeGamma: payload.includeGamma,
    },
    {
      baseUrl: BASE_URL,
      cronSecret: CRON_SECRET,
      supabase: supabaseAdmin(),
    },
  );

  if (!outcome.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: outcome.error ?? "unknown" }),
      { status: 500 },
    );
  }
  return new Response(
    JSON.stringify({ ok: true, duration_ms: outcome.durationMs }),
    { status: 200 },
  );
};

export const config: Config = {
  // Pas de schedule — déclenchée à la demande par /api/elearning/[id]/generate/start
};
