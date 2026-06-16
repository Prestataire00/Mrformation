/**
 * Netlify Background Function — pipeline e-learning complet en async.
 *
 * Pourquoi : la pipeline OpenAI (outline + N chapitres + quiz + exam + gamma)
 * dure 60-180s au total, ce qui dépasse le timeout 26s d'une route Next.js
 * sur Netlify Functions (plan Pro). Les Background Functions Netlify ont un
 * timeout de 15min — largement suffisant.
 *
 * Pattern : la fonction orchestre les routes Next.js déjà testées (outline,
 * chapter, quiz) via Bearer CRON_SECRET. Chaque sous-appel reste sous 26s.
 * La fonction est juste un orchestrateur + writer de progression.
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

type Payload = {
  courseId: string;
  includeExam?: boolean;
  includeGamma?: boolean;
  courseType?: "presentation" | "quiz" | "complete";
};

type ProgressPatch = {
  step: "outline" | "chapters" | "quiz" | "exam" | "gamma" | "done" | "failed";
  current?: number;
  total?: number;
  percent: number;
  message: string;
  error?: string | null;
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

async function writeProgress(courseId: string, patch: ProgressPatch, status?: string) {
  const supabase = supabaseAdmin();
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    generation_progress: { ...patch, updated_at: now },
    updated_at: now,
  };
  if (status) update.generation_status = status;
  await supabase.from("elearning_courses").update(update).eq("id", courseId);
}

async function callRoute(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
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

  const { courseId } = payload;
  const courseType = payload.courseType ?? "complete";
  const includeExam = payload.includeExam ?? courseType !== "presentation";
  const includeGamma = payload.includeGamma ?? courseType !== "quiz";
  const startedAt = new Date().toISOString();

  console.log(`[elearning-bg] start course=${courseId} type=${courseType} exam=${includeExam} gamma=${includeGamma}`);

  try {
    // ============== Étape 1 : outline (3-8s) ==============
    await writeProgress(courseId, {
      step: "outline",
      percent: 5,
      message: "Génération du plan…",
      error: null,
    }, "generating");

    const outline = await callRoute(`/api/elearning/${courseId}/generate/outline`);
    if (!outline.ok) {
      throw new Error(`outline failed (${outline.status}): ${JSON.stringify(outline.data)}`);
    }
    const chapterIds = (outline.data.chapter_ids as string[] | undefined) ?? [];
    if (chapterIds.length === 0) {
      throw new Error("Aucun chapitre planifié");
    }

    await writeProgress(courseId, {
      step: "outline",
      percent: 15,
      message: `${chapterIds.length} chapitres planifiés`,
      error: null,
    });

    // ============== Étape 2 : chapters (5-12s × N) ==============
    for (let i = 0; i < chapterIds.length; i++) {
      const pct = 15 + Math.round(((i + 1) / chapterIds.length) * 50); // 15 → 65
      await writeProgress(courseId, {
        step: "chapters",
        current: i + 1,
        total: chapterIds.length,
        percent: pct,
        message: `Chapitre ${i + 1}/${chapterIds.length}…`,
        error: null,
      });
      const ch = await callRoute(`/api/elearning/${courseId}/generate/chapter`, { chapter_id: chapterIds[i] });
      if (!ch.ok) {
        throw new Error(`chapter ${i + 1} failed (${ch.status}): ${JSON.stringify(ch.data)}`);
      }
    }

    // ============== Étape 3 : quiz + flashcards (8-15s) ==============
    if (courseType !== "presentation") {
      await writeProgress(courseId, {
        step: "quiz",
        percent: 70,
        message: "Génération des quiz et flashcards…",
        error: null,
      });
      const qz = await callRoute(`/api/elearning/${courseId}/generate/quiz`);
      if (!qz.ok) {
        throw new Error(`quiz failed (${qz.status}): ${JSON.stringify(qz.data)}`);
      }
    }

    // ============== Étape 4 : exam (optionnel) ==============
    if (includeExam) {
      await writeProgress(courseId, {
        step: "exam",
        percent: 80,
        message: "Génération de l'examen final…",
        error: null,
      });
      const ex = await callRoute(`/api/elearning/${courseId}/generate/exam`);
      if (!ex.ok) {
        throw new Error(`exam failed (${ex.status}): ${JSON.stringify(ex.data)}`);
      }
      const examCount = (ex.data.question_count as number) ?? 0;
      console.log(`[elearning-bg] exam done course=${courseId} questions=${examCount}`);
    }

    // ============== Étape 5 : gamma (optionnel) ==============
    if (includeGamma) {
      await writeProgress(courseId, {
        step: "gamma",
        percent: 90,
        message: "Génération des présentations Gamma…",
        error: null,
      });
      const gm = await callRoute(`/api/elearning/${courseId}/generate/gamma`);
      // Tolérant aux erreurs Gamma tierces (clé API, quota) — la route répond
      // toujours 200 + { ok: true } ; le 404 reste un filet de sécurité legacy.
      if (!gm.ok && gm.status !== 404) {
        console.warn(`[elearning-bg] gamma failed (${gm.status}) — skipping`);
      }
    }

    // ============== Done ==============
    await writeProgress(courseId, {
      step: "done",
      percent: 100,
      message: "Cours généré avec succès",
      error: null,
    }, "completed");

    const duration = Date.now() - new Date(startedAt).getTime();
    console.log(`[elearning-bg] success course=${courseId} duration=${duration}ms`);
    return new Response(JSON.stringify({ ok: true, duration_ms: duration }), { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[elearning-bg] failed course=${courseId}:`, message);
    await writeProgress(courseId, {
      step: "failed",
      percent: 0,
      message: "Erreur de génération",
      error: message,
    }, "failed");
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500 });
  }
};

export const config: Config = {
  // Pas de schedule — déclenchée à la demande par /api/elearning/[id]/generate/start
};
