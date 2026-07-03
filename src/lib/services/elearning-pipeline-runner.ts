/**
 * Orchestrateur du pipeline e-learning complet (outline → chapitres → quiz →
 * exam → gamma), extrait de la Background Function Netlify
 * `netlify/functions/elearning-generate-pipeline-background.mts`.
 *
 * Pourquoi ce module (DUAL-MODE Netlify / Railway) :
 *   - Sur Netlify, le pipeline (60-180s) dépasse le timeout serverless d'une
 *     route → il tourne dans une Background Function (15 min). Le `.mts` importe
 *     désormais CE runner pour ne pas dupliquer la logique.
 *   - Sur Railway (conteneur long-lived, pas de timeout), la route /generate/start
 *     lance ce runner en fire-and-forget IN-PROCESS.
 *
 * Le runner n'a AUCUNE logique IA en dur : c'est un pur orchestrateur qui
 * appelle en série/lots les sous-routes déjà existantes
 * `/api/elearning/[courseId]/generate/{outline,chapter,quiz,exam,gamma}` via
 * `Bearer CRON_SECRET` (le middleware bypasse sur ce header), et écrit la
 * progression dans `elearning_courses.generation_progress`.
 *
 * NB : `baseUrl` est injecté par l'appelant (via `getInternalBaseUrl()`) pour
 * cibler la bonne origine selon la plateforme :
 *   - Netlify : `process.env.URL`.
 *   - Railway : loopback `http://127.0.0.1:${PORT}`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ElearningPipelineParams {
  courseId: string;
  includeExam?: boolean;
  includeGamma?: boolean;
  courseType?: "presentation" | "quiz" | "complete";
}

export interface ElearningPipelineDeps {
  /** Origine pour les self-calls aux sous-routes (getInternalBaseUrl()). */
  baseUrl: string;
  /** Secret partagé injecté dans `Authorization: Bearer ...` (bypass middleware). */
  cronSecret: string;
  /** Client service_role (bypass RLS) pour écrire generation_progress. */
  supabase: SupabaseClient;
}

export interface ElearningPipelineResult {
  ok: boolean;
  durationMs: number;
  /** IDs des chapitres en échec (à régénérer), présent si échec partiel. */
  failedChapters?: string[];
  error?: string;
}

/** Patch de progression écrit dans `elearning_courses.generation_progress`. */
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

/**
 * Exécute le pipeline e-learning de bout en bout.
 *
 * Reproduit fidèlement le séquençage du `.mts` : outline → chapitres (lots
 * parallèles bornés, concurrence 3, tolérant aux échecs partiels) → quiz (par
 * chapitre, tolérant) → exam (optionnel, non bloquant) → gamma (optionnel, non
 * bloquant) → done. Le passage `courseType / includeExam / includeGamma` est
 * conservé à l'identique.
 */
export async function runElearningPipeline(
  params: ElearningPipelineParams,
  deps: ElearningPipelineDeps,
): Promise<ElearningPipelineResult> {
  const { supabase, baseUrl, cronSecret } = deps;
  const { courseId } = params;
  const courseType = params.courseType ?? "complete";
  const includeExam = params.includeExam ?? courseType !== "presentation";
  const includeGamma = params.includeGamma ?? courseType !== "quiz";
  const startedAt = new Date().toISOString();

  // Écrit un patch de progression (+ optionnellement generation_status).
  async function writeProgress(
    patch: ProgressPatch,
    status?: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      generation_progress: { ...patch, updated_at: now },
      updated_at: now,
    };
    if (status) update.generation_status = status;
    await supabase.from("elearning_courses").update(update).eq("id", courseId);
  }

  // Self-call vers une sous-route generate/* avec Bearer CRON_SECRET.
  async function callRoute(
    path: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  }

  console.log(
    `[elearning-pipeline] start course=${courseId} type=${courseType} exam=${includeExam} gamma=${includeGamma}`,
  );

  try {
    // ============== Étape 1 : outline (3-8s) ==============
    await writeProgress(
      {
        step: "outline",
        percent: 5,
        message: "Génération du plan…",
        error: null,
      },
      "generating",
    );

    const outline = await callRoute(
      `/api/elearning/${courseId}/generate/outline`,
    );
    if (!outline.ok) {
      throw new Error(
        `outline failed (${outline.status}): ${JSON.stringify(outline.data)}`,
      );
    }
    const chapterIds = (outline.data.chapter_ids as string[] | undefined) ?? [];
    if (chapterIds.length === 0) {
      throw new Error("Aucun chapitre planifié");
    }

    await writeProgress({
      step: "outline",
      percent: 15,
      message: `${chapterIds.length} chapitres planifiés`,
      error: null,
    });

    // ============== Étape 2 : chapters (5-12s × N) ==============
    // Chaque appel /generate/chapter est idempotent par chapter_id → on peut
    // paralléliser par lots bornés (concurrence 3). Un chapitre raté n'interrompt
    // PAS le cours : il est collecté dans failedChapters et on poursuit. Si TOUS
    // échouent → échec global (catch).
    const CONCURRENCY = 3;
    let done = 0;
    const failedChapters: string[] = [];
    for (let start = 0; start < chapterIds.length; start += CONCURRENCY) {
      const batch = chapterIds.slice(start, start + CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map((id) =>
          callRoute(`/api/elearning/${courseId}/generate/chapter`, {
            chapter_id: id,
          }),
        ),
      );
      settled.forEach((res, k) => {
        const ok = res.status === "fulfilled" && res.value.ok;
        if (!ok) failedChapters.push(batch[k]);
      });
      done += batch.length;
      const pct = 15 + Math.round((done / chapterIds.length) * 50); // 15 → 65
      await writeProgress({
        step: "chapters",
        current: done,
        total: chapterIds.length,
        percent: pct,
        message: `Chapitres ${done}/${chapterIds.length}${failedChapters.length ? ` (${failedChapters.length} à régénérer)` : ""}…`,
        error: null,
        ...(failedChapters.length
          ? { failed_chapters: [...failedChapters] }
          : {}),
      });
    }

    // Échec global UNIQUEMENT si aucun chapitre n'a abouti.
    if (failedChapters.length === chapterIds.length) {
      throw new Error(`Tous les chapitres ont échoué (${chapterIds.length})`);
    }

    // ============== Étape 3 : quiz + flashcards — PAR CHAPITRE (anti-504) ==============
    // Un appel par chapitre (petit) au lieu d'un seul gros. Tolérant : un quiz
    // raté n'interrompt pas le cours.
    if (courseType !== "presentation") {
      await writeProgress({
        step: "quiz",
        percent: 70,
        message: "Génération des quiz et flashcards…",
        error: null,
      });
      const quizChapterIds = chapterIds.filter(
        (id) => !failedChapters.includes(id),
      );
      const QUIZ_CONCURRENCY = 3;
      let quizFailed = 0;
      for (
        let start = 0;
        start < quizChapterIds.length;
        start += QUIZ_CONCURRENCY
      ) {
        const batch = quizChapterIds.slice(start, start + QUIZ_CONCURRENCY);
        const settled = await Promise.allSettled(
          batch.map((id) =>
            callRoute(`/api/elearning/${courseId}/generate/quiz`, {
              chapter_id: id,
            }),
          ),
        );
        settled.forEach((res) => {
          if (res.status === "rejected" || !res.value?.ok) quizFailed++;
        });
        const qdone = Math.min(start + batch.length, quizChapterIds.length);
        await writeProgress({
          step: "quiz",
          percent:
            70 + Math.round((qdone / Math.max(1, quizChapterIds.length)) * 8),
          message: `Quiz ${qdone}/${quizChapterIds.length}…`,
          error: null,
        });
      }
      if (quizFailed) {
        console.warn(
          `[elearning-pipeline] quiz: ${quizFailed}/${quizChapterIds.length} chapitre(s) en échec (non bloquant)`,
        );
      }
    }

    // ============== Étape 4 : exam (optionnel) ==============
    if (includeExam) {
      await writeProgress({
        step: "exam",
        percent: 80,
        message: "Génération de l'examen final…",
        error: null,
      });
      const ex = await callRoute(`/api/elearning/${courseId}/generate/exam`);
      if (!ex.ok) {
        // Non bloquant : un cours reste utilisable sans examen final.
        console.warn(
          `[elearning-pipeline] exam failed (${ex.status}) — non bloquant`,
        );
      } else {
        const examCount = (ex.data.question_count as number) ?? 0;
        console.log(
          `[elearning-pipeline] exam done course=${courseId} questions=${examCount}`,
        );
      }
    }

    // ============== Étape 5 : gamma (optionnel) ==============
    if (includeGamma) {
      await writeProgress({
        step: "gamma",
        percent: 90,
        message: "Génération des présentations Gamma…",
        error: null,
      });
      const gm = await callRoute(`/api/elearning/${courseId}/generate/gamma`);
      // Tolérant aux erreurs Gamma tierces (clé API, quota) — la route répond
      // toujours 200 + { ok: true } ; le 404 reste un filet de sécurité legacy.
      if (!gm.ok && gm.status !== 404) {
        console.warn(
          `[elearning-pipeline] gamma failed (${gm.status}) — skipping`,
        );
      }
    }

    // ============== Done ==============
    // En cas d'échec partiel chapitres, on conserve failed_chapters dans la
    // progression finale pour permettre une régénération ciblée côté admin.
    await writeProgress(
      {
        step: "done",
        percent: 100,
        message: failedChapters.length
          ? `Cours généré (${failedChapters.length} chapitre(s) à régénérer)`
          : "Cours généré avec succès",
        error: null,
        ...(failedChapters.length
          ? { failed_chapters: [...failedChapters] }
          : {}),
      },
      "completed",
    );

    const durationMs = Date.now() - new Date(startedAt).getTime();
    console.log(
      `[elearning-pipeline] success course=${courseId} duration=${durationMs}ms`,
    );
    return {
      ok: true,
      durationMs,
      ...(failedChapters.length ? { failedChapters: [...failedChapters] } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[elearning-pipeline] failed course=${courseId}:`, message);
    await writeProgress(
      {
        step: "failed",
        percent: 0,
        message: "Erreur de génération",
        error: message,
      },
      "failed",
    );
    return {
      ok: false,
      durationMs: Date.now() - new Date(startedAt).getTime(),
      error: message,
    };
  }
}
