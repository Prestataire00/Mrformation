/**
 * POST /api/elearning/[courseId]/generate/gamma
 *
 * Étape 5 (optionnelle) du pipeline split — génère les decks Gamma pour
 * tous les chapitres du cours.
 *
 * Auth duale :
 *   - Appel CRON (depuis elearning-generate-pipeline-background) : header
 *     Authorization: Bearer <CRON_SECRET> vérifié par verifyCronAuth.
 *   - Appel utilisateur direct : admin / super_admin via requireElearningCourse.
 *
 * Tolérance pannes :
 *   - Aucun chapitre → { ok: true, skipped: true, reason: "no_chapters" } (200)
 *   - Déclenchement Gamma échoue → { ok: true, gamma_status: "failed_nonblocking", error } (200)
 *   La règle : JAMAIS renvoyer 4xx/5xx au pipeline pour un simple échec Gamma.
 */

import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { verifyCronAuth } from "@/lib/cron-auth";
import { requireElearningCourse } from "@/lib/auth/elearning-access";
import { isRailway } from "@/lib/platform";
import { runElearningGamma } from "@/lib/services/elearning-gamma-runner";

export const maxDuration = 30;

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } },
) {
  const isCron = verifyCronAuth(request);
  if (!isCron) {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
    if (!access.ok) return access.error;
  }

  try {
    // service_role en mode cron (BG function n'a pas de cookies Supabase),
    // client server classique sinon.
    const { createClient, createServiceRoleClient } = await import("@/lib/supabase/server");
    const supabase = isCron ? createServiceRoleClient() : createClient();

    // Vérifie qu'il y a des chapitres avant de tenter quoi que ce soit.
    const { count } = await supabase
      .from("elearning_chapters")
      .select("id", { count: "exact", head: true })
      .eq("course_id", params.courseId);

    if (!count || count === 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "no_chapters",
      });
    }

    // ── Déclencher la génération Gamma via la même logique que /gamma ──
    // On réplique le mécanisme fire-and-forget de /gamma/route.ts :
    // on appelle la Netlify Background Function elearning-generate-gamma-background
    // qui renvoie 202 immédiatement ; on n'attend pas la fin.
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      // Aucun secret → impossible de déclencher ; tolérant.
      console.warn("[generate/gamma] CRON_SECRET non configuré — Gamma ignoré");
      return NextResponse.json({
        ok: true,
        gamma_status: "failed_nonblocking",
        error: "CRON_SECRET non configuré",
      });
    }

    const startedAt = new Date().toISOString();

    // Marque gamma_starting dans generation_progress (best-effort, pas bloquant).
    await supabase
      .from("elearning_courses")
      .update({
        generation_progress: {
          step: "gamma_starting",
          percent: 0,
          message: "Démarrage Gamma…",
          started_at: startedAt,
          updated_at: startedAt,
          error: null,
        },
        updated_at: startedAt,
      })
      .eq("id", params.courseId);

    if (isRailway()) {
      // ── Railway : conteneur long-lived → fire-and-forget IN-PROCESS. ──
      // On réutilise le client déjà créé (service_role en mode cron). Le runner
      // écrit lui-même sa progression Gamma ; on ne l'`await` pas. Contrat
      // conservé : on ne renvoie JAMAIS 4xx/5xx au pipeline pour un échec Gamma.
      void runElearningGamma(
        { courseId: params.courseId },
        { supabase },
      ).catch(async (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[generate/gamma] runElearningGamma (railway) failed :", msg);
        await supabase
          .from("elearning_courses")
          .update({
            generation_progress: {
              step: "gamma_failed",
              percent: 0,
              message: "Erreur Gamma",
              error: msg,
              updated_at: new Date().toISOString(),
            },
          })
          .eq("id", params.courseId);
      });
    } else {
      // ── Netlify (inchangé) : dispatch vers la Background Function. ──
      try {
        const baseUrl = process.env.URL || "http://localhost:8888";
        const bgUrl = `${baseUrl}/.netlify/functions/elearning-generate-gamma-background`;

        const bgRes = await fetch(bgUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cronSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ courseId: params.courseId }),
        });

        if (bgRes.status !== 202 && !bgRes.ok) {
          console.warn(`[generate/gamma] BG trigger returned ${bgRes.status} — non-bloquant`);
          return NextResponse.json({
            ok: true,
            gamma_status: "failed_nonblocking",
            error: `BG trigger status ${bgRes.status}`,
          });
        }
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.error("[generate/gamma] Impossible de déclencher la BG function :", msg);

        // Met à jour le progress en gamma_failed (best-effort).
        await supabase
          .from("elearning_courses")
          .update({
            generation_progress: {
              step: "gamma_failed",
              percent: 0,
              message: "Impossible de déclencher Gamma",
              error: msg,
              updated_at: new Date().toISOString(),
            },
          })
          .eq("id", params.courseId);

        return NextResponse.json({
          ok: true,
          gamma_status: "failed_nonblocking",
          error: msg,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      gamma_status: "gamma_starting",
      poll_url: `/api/elearning/${params.courseId}?shallow=true`,
    });
  } catch (error) {
    // Même les erreurs inattendues sont absorbées — le pipeline doit continuer.
    const msg = sanitizeError(error, "generate/gamma");
    console.error("[generate/gamma] Erreur inattendue :", msg);
    return NextResponse.json({
      ok: true,
      gamma_status: "failed_nonblocking",
      error: msg,
    });
  }
}
