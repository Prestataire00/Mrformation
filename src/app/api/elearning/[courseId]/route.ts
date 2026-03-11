import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!["admin", "learner"].includes(profile?.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    // shallow=true returns only course + chapter counts (fast, for admin page)
    const isShallow = request.nextUrl.searchParams.get("shallow") === "true";

    const shallowQueryFull = `id, title, description, objectives, status, generation_status,
         estimated_duration_minutes, source_file_name, source_file_url, source_file_type,
         course_type, num_chapters, generation_log, created_at, updated_at,
         gamma_deck_id, gamma_deck_url, gamma_embed_url, gamma_export_pdf, gamma_export_pptx,
         final_exam_passing_score, final_quiz_target_count,
         elearning_chapters(id, title, summary, order_index, estimated_duration_minutes,
           key_concepts, is_enriched,
           gamma_deck_id, gamma_deck_url, gamma_embed_url, gamma_export_pdf, gamma_export_pptx, gamma_slide_start,
           elearning_quizzes(id, passing_score, elearning_quiz_questions(id)))`;

    const shallowQueryFallback = `id, title, description, objectives, status, generation_status,
         estimated_duration_minutes, source_file_name, source_file_url, source_file_type,
         course_type, num_chapters, generation_log, created_at, updated_at,
         elearning_chapters(id, title, summary, order_index, estimated_duration_minutes,
           key_concepts, is_enriched,
           gamma_deck_id, gamma_deck_url, gamma_embed_url, gamma_export_pdf, gamma_export_pptx,
           elearning_quizzes(id, passing_score, elearning_quiz_questions(id)))`;

    const fullQuery = `*,
         elearning_chapters(
           *,
           elearning_quizzes(*, elearning_quiz_questions(*)),
           elearning_flashcards(*)
         )`;

    const selectQuery = isShallow ? shallowQueryFull : fullQuery;

    let { data, error } = await supabase
      .from("elearning_courses")
      .select(selectQuery)
      .eq("id", params.courseId)
      .single();

    // Fallback if course-level gamma columns don't exist yet (migration not run)
    if (error && isShallow) {
      const res = await supabase
        .from("elearning_courses")
        .select(shallowQueryFallback)
        .eq("id", params.courseId)
        .single();
      data = res.data as typeof data;
      error = res.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, objectives, status, difficulty_level, estimated_duration_minutes } = body;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (objectives !== undefined) updates.objectives = objectives;
    if (status !== undefined) updates.status = status;
    if (difficulty_level !== undefined) updates.difficulty_level = difficulty_level;
    if (estimated_duration_minutes !== undefined) updates.estimated_duration_minutes = estimated_duration_minutes;

    const { data, error } = await supabase
      .from("elearning_courses")
      .update(updates)
      .eq("id", params.courseId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { error } = await supabase
      .from("elearning_courses")
      .delete()
      .eq("id", params.courseId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
