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
  // IDs des chapitres ayant échoué (à régénérer ultérieurement). Présent dès
  // qu'au moins un chapitre rate, conservé jusqu'à la progression finale.
  failed_chapters?: string[];
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
    // CAS A (route /generate/chapter idempotente par chapter_id) : on génère
    // les chapitres par LOTS PARALLÈLES bornés (concurrence 3) au lieu d'une
    // série stricte — chaque appel cible explicitement son chapter_id, deux
    // appels concurrents touchent donc des lignes distinctes. Le BG dispose de
    // ~15 min, pas de la contrainte 504 des routes.
    //
    // Politique de résilience (anti-504) :
    //   - Un chapitre raté n'interrompt PAS le cours : il est collecté dans
    //     failedChapters et on poursuit.
    //   - Si TOUS les chapitres échouent → on fait échouer le cours (catch).
    //   - Si seuls certains échouent → on continue vers quiz/exam/gamma et on
    //     expose failed_chapters dans la progression finale pour régénération.
    const CONCURRENCY = 3;
    let done = 0;
    const failedChapters: string[] = [];
    for (let start = 0; start < chapterIds.length; start += CONCURRENCY) {
      const batch = chapterIds.slice(start, start + CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map((id) => callRoute(`/api/elearning/${courseId}/generate/chapter`, { chapter_id: id })),
      );
      settled.forEach((res, k) => {
        const ok = res.status === "fulfilled" && res.value.ok;
        if (!ok) failedChapters.push(batch[k]);
      });
      done += batch.length;
      const pct = 15 + Math.round((done / chapterIds.length) * 50); // 15 → 65
      await writeProgress(courseId, {
        step: "chapters",
        current: done,
        total: chapterIds.length,
        percent: pct,
        message: `Chapitres ${done}/${chapterIds.length}${failedChapters.length ? ` (${failedChapters.length} à régénérer)` : ""}…`,
        error: null,
        ...(failedChapters.length ? { failed_chapters: [...failedChapters] } : {}),
      });
    }

    // Échec global UNIQUEMENT si aucun chapitre n'a abouti.
    if (failedChapters.length === chapterIds.length) {
      throw new Error(`Tous les chapitres ont échoué (${chapterIds.length})`);
    }

    // ============== Étape 3 : quiz + flashcards — PAR CHAPITRE (anti-504) ==============
    // Un appel par chapitre (petit, < 26s) au lieu d'un seul gros appel pour tous
    // (qui dépassait la limite des fonctions Netlify → 504). Tolérant : un quiz raté
    // n'interrompt pas le cours.
    if (courseType !== "presentation") {
      await writeProgress(courseId, {
        step: "quiz",
        percent: 70,
        message: "Génération des quiz et flashcards…",
        error: null,
      });
      const quizChapterIds = chapterIds.filter((id) => !failedChapters.includes(id));
      const QUIZ_CONCURRENCY = 3;
      let quizFailed = 0;
      for (let start = 0; start < quizChapterIds.length; start += QUIZ_CONCURRENCY) {
        const batch = quizChapterIds.slice(start, start + QUIZ_CONCURRENCY);
        const settled = await Promise.allSettled(
          batch.map((id) => callRoute(`/api/elearning/${courseId}/generate/quiz`, { chapter_id: id })),
        );
        settled.forEach((res) => {
          if (res.status === "rejected" || !res.value?.ok) quizFailed++;
        });
        const qdone = Math.min(start + batch.length, quizChapterIds.length);
        await writeProgress(courseId, {
          step: "quiz", percent: 70 + Math.round((qdone / Math.max(1, quizChapterIds.length)) * 8),
          message: `Quiz ${qdone}/${quizChapterIds.length}…`, error: null,
        });
      }
      if (quizFailed) {
        console.warn(`[elearning-bg] quiz: ${quizFailed}/${quizChapterIds.length} chapitre(s) en échec (non bloquant)`);
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
        // Non bloquant : un cours reste utilisable sans examen final.
        console.warn(`[elearning-bg] exam failed (${ex.status}) — non bloquant`);
      } else {
        const examCount = (ex.data.question_count as number) ?? 0;
        console.log(`[elearning-bg] exam done course=${courseId} questions=${examCount}`);
      }
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
    // En cas d'échec partiel chapitres, on conserve failed_chapters dans la
    // progression finale pour permettre une régénération ciblée côté admin.
    await writeProgress(courseId, {
      step: "done",
      percent: 100,
      message: failedChapters.length
        ? `Cours généré (${failedChapters.length} chapitre(s) à régénérer)`
        : "Cours généré avec succès",
      error: null,
      ...(failedChapters.length ? { failed_chapters: [...failedChapters] } : {}),
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
