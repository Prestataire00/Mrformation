/**
 * POST /api/elearning/[courseId]/generate/start
 *
 * Kickoff de la génération asynchrone du cours via Netlify Background Function.
 *
 * - Auth admin/super_admin (utilisateur réel, pas cron)
 * - Reset generation_progress + status = "queued"
 * - Déclenche /.netlify/functions/elearning-generate-pipeline-background
 *   en passant Bearer CRON_SECRET pour que la BG function s'authentifie
 *   ensuite auprès des routes /generate/outline|chapter|quiz
 * - La BG fct retourne 202 immédiatement, donc cette route répond en <2s
 *
 * Le client poll ensuite GET /api/elearning/[id]?shallow=true pour lire
 * elearning_courses.generation_progress et generation_status.
 *
 * Body : { course_type?: "presentation" | "quiz" | "complete", include_exam?: boolean, include_gamma?: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { requireElearningCourse } from "@/lib/auth/elearning-access";
import { isRailway, getInternalBaseUrl } from "@/lib/platform";
import { runElearningPipeline } from "@/lib/services/elearning-pipeline-runner";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const maxDuration = 30;

type Body = {
  course_type?: "presentation" | "quiz" | "complete";
  include_exam?: boolean;
  include_gamma?: boolean;
};

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } },
) {
  try {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
    if (!access.ok) return access.error;
    const { supabase } = access;

    const body = (await request.json().catch(() => ({}))) as Body;
    const courseType = body.course_type ?? "complete";
    const includeExam = body.include_exam ?? courseType !== "presentation";
    const includeGamma = body.include_gamma ?? courseType !== "quiz";

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET non configuré côté serveur" },
        { status: 500 },
      );
    }

    // 1. Reset generation_progress et passe le cours en status="generating".
    //    Le CHECK constraint sur elearning_courses.generation_status autorise
    //    ('pending','extracting','generating','completed','failed') — pas
    //    de 'queued' (on garde le terme côté step JSONB qui n'est pas contraint).
    const startedAt = new Date().toISOString();
    const { error: resetErr } = await supabase
      .from("elearning_courses")
      .update({
        generation_status: "generating",
        generation_progress: {
          step: "queued",
          percent: 0,
          message: "Démarrage…",
          started_at: startedAt,
          updated_at: startedAt,
          error: null,
        },
        updated_at: startedAt,
      })
      .eq("id", params.courseId);

    if (resetErr) {
      return NextResponse.json(
        { error: `Impossible d'initialiser la génération : ${resetErr.message}` },
        { status: 500 },
      );
    }

    // 2. Déclenche le pipeline (DUAL-MODE Netlify / Railway).
    if (isRailway()) {
      // ── Railway : conteneur long-lived → fire-and-forget IN-PROCESS. ──
      // Pas de timeout serverless : on lance l'orchestrateur sans l'`await`.
      // Il rappelle les sous-routes en loopback (getInternalBaseUrl) et écrit
      // lui-même sa progression/statut final en DB (l'UI poll ces champs).
      const railwaySupabase = createServiceRoleClient();
      void runElearningPipeline(
        { courseId: params.courseId, courseType, includeExam, includeGamma },
        {
          baseUrl: getInternalBaseUrl(),
          cronSecret,
          supabase: railwaySupabase,
        },
      ).catch(async (err) => {
        // Filet de sécurité : le runner marque déjà `failed` en interne ; on
        // couvre ici une exception qui surviendrait hors de son try/catch.
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[generate/start] runElearningPipeline (railway) failed:", msg);
        await railwaySupabase
          .from("elearning_courses")
          .update({
            generation_status: "failed",
            generation_progress: {
              step: "failed",
              percent: 0,
              message: "Erreur de génération",
              error: msg,
              started_at: startedAt,
              updated_at: new Date().toISOString(),
            },
          })
          .eq("id", params.courseId);
      });
    } else {
      // ── Netlify (inchangé) : dispatch vers la Background Function. ──
      // Elle renvoie 202 immédiatement et continue jusqu'à 15min. En dev local
      // sans Netlify CLI, le fetch échoue → erreur remontée pour que l'admin
      // sache qu'il faut `netlify dev`.
      const baseUrl = process.env.URL || "http://localhost:8888"; // 8888 = netlify dev port
      const bgUrl = `${baseUrl}/.netlify/functions/elearning-generate-pipeline-background`;

      try {
        const bgRes = await fetch(bgUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cronSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            courseId: params.courseId,
            courseType,
            includeExam,
            includeGamma,
          }),
        });
        // Netlify renvoie 202 pour les Background Functions. Si !ok, on log
        // mais on revient quand même OK côté UI : le polling montrera l'état
        // failed si quelque chose s'est mal passé.
        if (bgRes.status !== 202 && !bgRes.ok) {
          console.error(`[generate/start] Background trigger returned ${bgRes.status}`);
        }
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        await supabase
          .from("elearning_courses")
          .update({
            generation_status: "failed",
            generation_progress: {
              step: "failed",
              percent: 0,
              message: "Impossible de déclencher le pipeline background",
              error: msg,
              started_at: startedAt,
              updated_at: new Date().toISOString(),
            },
          })
          .eq("id", params.courseId);
        return NextResponse.json(
          { error: `Impossible de déclencher le pipeline : ${msg}` },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      status: "queued",
      poll_url: `/api/elearning/${params.courseId}?shallow=true`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "starting elearning generation") },
      { status: 500 },
    );
  }
}
