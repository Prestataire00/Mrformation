import { NextRequest, NextResponse } from "next/server";
import { requireElearningCourse } from "@/lib/auth/elearning-access";
import { logAudit } from "@/lib/audit-log";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
    if (!access.ok) return access.error;
    const { supabase, profile, userId } = access;

    const body = await request.json();
    const { learner_ids } = body;

    if (!Array.isArray(learner_ids) || learner_ids.length === 0) {
      return NextResponse.json({ error: "learner_ids requis" }, { status: 400 });
    }

    const enrollments = learner_ids.map((learnerId: string) => ({
      course_id: params.courseId,
      learner_id: learnerId,
      status: "enrolled",
    }));

    const { data, error } = await supabase
      .from("elearning_enrollments")
      .upsert(enrollments, { onConflict: "course_id,learner_id", ignoreDuplicates: true })
      .select();

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "enrolling learners") }, { status: 500 });
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId,
      action: "create",
      resourceType: "elearning_enrollment",
      resourceId: params.courseId,
      details: { count: data?.length ?? 0 },
    });

    return NextResponse.json({ data, enrolled: data?.length ?? 0 });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "enrolling learners") }, { status: 500 });
  }
}
