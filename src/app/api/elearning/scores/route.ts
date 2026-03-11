import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/elearning/scores?course_id=xxx
 * Returns the user's best score for a course.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const courseId = request.nextUrl.searchParams.get("course_id");
    if (!courseId) return NextResponse.json({ error: "course_id requis" }, { status: 400 });

    const { data } = await supabase
      .from("elearning_course_scores")
      .select("*")
      .eq("course_id", courseId)
      .eq("user_id", user.id)
      .single();

    return NextResponse.json({ data: data || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur" }, { status: 500 });
  }
}

/**
 * POST /api/elearning/scores
 * Save or update scores. Updates best_score only if new score is higher.
 * Body: { course_id, total_score, chapter_pct, final_pct }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { course_id, total_score, chapter_pct, final_pct } = await request.json();
    if (!course_id) return NextResponse.json({ error: "course_id requis" }, { status: 400 });

    // Fetch existing score
    const { data: existing } = await supabase
      .from("elearning_course_scores")
      .select("*")
      .eq("course_id", course_id)
      .eq("user_id", user.id)
      .single();

    const newBestScore = Math.max(existing?.best_score || 0, total_score || 0);
    const newBestChapterPct = Math.max(existing?.best_chapter_pct || 0, chapter_pct || 0);
    const newBestFinalPct = Math.max(existing?.best_final_pct || 0, final_pct || 0);

    const { data, error } = await supabase
      .from("elearning_course_scores")
      .upsert(
        {
          course_id,
          user_id: user.id,
          best_score: newBestScore,
          best_chapter_pct: newBestChapterPct,
          best_final_pct: newBestFinalPct,
          last_score: total_score || 0,
          last_chapter_pct: chapter_pct || 0,
          last_final_pct: final_pct || 0,
          attempts: (existing?.attempts || 0) + 1,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "course_id,user_id" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur" }, { status: 500 });
  }
}
