import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

export async function POST(request: NextRequest) {
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

    if (!["admin", "super_admin", "learner"].includes(profile?.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();
    const { enrollment_id, chapter_id, is_completed, time_spent_seconds } = body;

    if (!enrollment_id || !chapter_id) {
      return NextResponse.json({ error: "enrollment_id et chapter_id requis" }, { status: 400 });
    }

    // Upsert chapter progress
    const { data, error } = await supabase
      .from("elearning_chapter_progress")
      .upsert(
        {
          enrollment_id,
          chapter_id,
          is_completed: is_completed ?? false,
          completed_at: is_completed ? new Date().toISOString() : null,
          time_spent_seconds: time_spent_seconds ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "enrollment_id,chapter_id" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "updating chapter progress") }, { status: 500 });
    }

    // Update enrollment status and completion rate
    const { data: allProgress } = await supabase
      .from("elearning_chapter_progress")
      .select("is_completed")
      .eq("enrollment_id", enrollment_id);

    const { data: enrollment } = await supabase
      .from("elearning_enrollments")
      .select("course_id")
      .eq("id", enrollment_id)
      .single();

    if (enrollment) {
      const { count: totalChapters } = await supabase
        .from("elearning_chapters")
        .select("id", { count: "exact", head: true })
        .eq("course_id", enrollment.course_id);

      const completedCount = (allProgress || []).filter((p) => p.is_completed).length;
      const total = totalChapters || 1;
      const rate = Math.round((completedCount / total) * 100);

      const enrollmentStatus =
        rate >= 100 ? "completed" : completedCount > 0 ? "in_progress" : "enrolled";

      await supabase
        .from("elearning_enrollments")
        .update({
          completion_rate: rate,
          status: enrollmentStatus,
          started_at:
            enrollmentStatus !== "enrolled"
              ? new Date().toISOString()
              : undefined,
          completed_at:
            enrollmentStatus === "completed"
              ? new Date().toISOString()
              : null,
        })
        .eq("id", enrollment_id);
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "updating chapter progress") }, { status: 500 });
  }
}
