import { requireRole } from "@/lib/auth/require-role";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

/**
 * GET /api/elearning/scores?course_id=xxx
 * Returns the user's best score for a course.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["admin", "super_admin", "learner"]);
    if (auth.error) return auth.error;

    const courseId = request.nextUrl.searchParams.get("course_id");
    if (!courseId) return NextResponse.json({ error: "course_id requis" }, { status: 400 });

    const { data } = await auth.supabase
      .from("elearning_course_scores")
      .select("*")
      .eq("course_id", courseId)
      .eq("user_id", auth.user.id)
      .single();

    return NextResponse.json({ data: data || null });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "fetching scores") }, { status: 500 });
  }
}

/**
 * POST /api/elearning/scores
 * Save or update scores. Updates best_score only if new score is higher.
 * Body: { course_id, total_score, chapter_pct, final_pct }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(["admin", "super_admin", "learner"]);
    if (auth.error) return auth.error;

    const { course_id, total_score, chapter_pct, final_pct } = await request.json() as {
      course_id?: string;
      total_score?: number;
      chapter_pct?: number;
      final_pct?: number;
    };
    if (!course_id) return NextResponse.json({ error: "course_id requis" }, { status: 400 });

    // Fetch existing score for best-score max logic
    const { data: existing } = await auth.supabase
      .from("elearning_course_scores")
      .select("*")
      .eq("course_id", course_id)
      .eq("user_id", auth.user.id)
      .single();

    const newBestScore = Math.max(existing?.best_score || 0, total_score || 0);
    const newBestChapterPct = Math.max(existing?.best_chapter_pct || 0, chapter_pct || 0);
    const newBestFinalPct = Math.max(existing?.best_final_pct || 0, final_pct || 0);

    // Upsert WITHOUT attempts (handled atomically by RPC below)
    const { data, error } = await auth.supabase
      .from("elearning_course_scores")
      .upsert(
        {
          course_id,
          user_id: auth.user.id,
          best_score: newBestScore,
          best_chapter_pct: newBestChapterPct,
          best_final_pct: newBestFinalPct,
          last_score: total_score || 0,
          last_chapter_pct: chapter_pct || 0,
          last_final_pct: final_pct || 0,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "course_id,user_id" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: sanitizeDbError(error, "saving scores") }, { status: 500 });

    // Atomic attempt counter increment
    const { data: newAttempts, error: bumpErr } = await auth.supabase.rpc(
      "elearning_bump_course_score_attempts",
      { p_course_id: course_id, p_user_id: auth.user.id }
    );

    if (bumpErr) return NextResponse.json({ error: "Erreur de comptage des tentatives" }, { status: 500 });

    return NextResponse.json({ data: { ...data, attempts: newAttempts } });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "saving scores") }, { status: 500 });
  }
}
