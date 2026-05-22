import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { requireElearningCourse } from "@/lib/auth/elearning-access";
import { logAudit } from "@/lib/audit-log";

export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin", "learner"]);
    if (!access.ok) return access.error;
    const { supabase, profile } = access;

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
      return NextResponse.json({ error: sanitizeDbError(error, "fetching course details") }, { status: 404 });
    }

    // Strip is_correct from quiz options before returning to learners
    if (profile.role === "learner" && data) {
      type QuizQuestion = { options?: unknown[] };
      type Quiz = { elearning_quiz_questions?: QuizQuestion[] };
      type Chapter = { elearning_quizzes?: Quiz[] };
      const courseData = data as { elearning_chapters?: Chapter[] };
      for (const ch of courseData.elearning_chapters ?? []) {
        for (const q of ch.elearning_quizzes?.[0]?.elearning_quiz_questions ?? []) {
          q.options = (q.options ?? []).map((o: unknown) => {
            if (typeof o === "object" && o !== null) {
              const { is_correct: _removed, ...rest } = o as Record<string, unknown>;
              return rest;
            }
            return o;
          });
        }
      }
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "fetching course details") }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
    if (!access.ok) return access.error;
    const { supabase, profile, userId } = access;

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
      return NextResponse.json({ error: sanitizeDbError(error, "updating course") }, { status: 500 });
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId,
      action: "update",
      resourceType: "elearning_course",
      resourceId: params.courseId,
      details: { fields: Object.keys(updates) },
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "updating course") }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
    if (!access.ok) return access.error;
    const { supabase, profile, userId } = access;

    const { error } = await supabase
      .from("elearning_courses")
      .delete()
      .eq("id", params.courseId);

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "deleting course") }, { status: 500 });
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId,
      action: "delete",
      resourceType: "elearning_course",
      resourceId: params.courseId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "deleting course") }, { status: 500 });
  }
}
