import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { requireElearningCourse } from "@/lib/auth/elearning-access";

export const maxDuration = 30;

/**
 * POST : déclenche la génération Gamma de façon async via une Netlify
 * Background Function (timeout 15min vs 26s d'une route classique). La
 * génération en parallèle de N decks Gamma prend 30-120s par deck → trop
 * pour une route sync sur Netlify Pro.
 *
 * Le client poll ensuite GET /api/elearning/[id]?shallow=true et lit
 * generation_progress.step ∈ ("gamma_starting" | "gamma_running" |
 * "gamma_done" | "gamma_failed").
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { courseId: string } },
) {
  try {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
    if (!access.ok) return access.error;
    const { supabase } = access;

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET non configuré côté serveur" },
        { status: 500 },
      );
    }

    // Vérification présence de chapitres avant de trigger la BG fct
    // (économise un cycle inutile si rien à générer).
    const { count } = await supabase
      .from("elearning_chapters")
      .select("id", { count: "exact", head: true })
      .eq("course_id", params.courseId);
    if (!count || count === 0) {
      return NextResponse.json({ error: "Aucun chapitre dans ce cours" }, { status: 400 });
    }

    // Reset generation_progress en mode gamma_starting → polling visible immédiat
    const startedAt = new Date().toISOString();
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

    // Trigger BG function — Netlify renvoie 202 immédiat pour les fonctions
    // -background ; on n'attend pas la fin (qui prend 1-3 min).
    const baseUrl = process.env.URL || "http://localhost:8888";
    const bgUrl = `${baseUrl}/.netlify/functions/elearning-generate-gamma-background`;
    try {
      const bgRes = await fetch(bgUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ courseId: params.courseId }),
      });
      if (bgRes.status !== 202 && !bgRes.ok) {
        console.error(`[gamma start] BG trigger returned ${bgRes.status}`);
      }
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
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
      return NextResponse.json({ error: `Impossible de déclencher Gamma : ${msg}` }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      status: "gamma_starting",
      poll_url: `/api/elearning/${params.courseId}?shallow=true`,
    });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "starting Gamma generation") }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
    if (!access.ok) return access.error;
    const { supabase } = access;

    const { data: chapters } = await supabase
      .from("elearning_chapters")
      .select("id, title, gamma_deck_id, gamma_deck_url, gamma_embed_url, gamma_export_pdf, gamma_export_pptx")
      .eq("course_id", params.courseId)
      .order("order_index");

    return NextResponse.json({
      data: {
        chapters: (chapters || []).map((ch) => ({
          id: ch.id,
          title: ch.title,
          deck_id: ch.gamma_deck_id,
          deck_url: ch.gamma_deck_url,
          embed_url: ch.gamma_embed_url,
          export_pdf: ch.gamma_export_pdf,
          export_pptx: ch.gamma_export_pptx,
        })),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "fetching Gamma chapter decks") }, { status: 500 });
  }
}
