import { NextRequest, NextResponse } from "next/server";
import { requireElearningCourse } from "@/lib/auth/elearning-access";
import { logAudit } from "@/lib/audit-log";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

/**
 * EL-6 audit BMAD — GET liste les inscriptions d'un cours pour la vue
 * Inscriptions admin (avec apprenant joint).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const access = await requireElearningCourse(params.courseId, [
      "admin",
      "super_admin",
    ]);
    if (!access.ok) return access.error;
    const { supabase } = access;

    const { data, error } = await supabase
      .from("elearning_enrollments")
      .select(
        "id, course_id, learner_id, status, completion_rate, started_at, completed_at, enrolled_at, learner:learners(id, first_name, last_name, email)",
      )
      .eq("course_id", params.courseId)
      .order("enrolled_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: sanitizeDbError(error, "listing enrollments") },
        { status: 500 },
      );
    }
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeError(error, "listing enrollments") },
      { status: 500 },
    );
  }
}

/**
 * EL-6 audit BMAD — DELETE désinscrit un apprenant.
 * Body : { enrollment_id: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const access = await requireElearningCourse(params.courseId, [
      "admin",
      "super_admin",
    ]);
    if (!access.ok) return access.error;
    const { supabase, profile, userId } = access;

    const body = await request.json().catch(() => ({}));
    const enrollmentId = (body as { enrollment_id?: string }).enrollment_id;
    if (!enrollmentId) {
      return NextResponse.json(
        { error: "enrollment_id requis" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("elearning_enrollments")
      .delete()
      .eq("id", enrollmentId)
      .eq("course_id", params.courseId);

    if (error) {
      return NextResponse.json(
        { error: sanitizeDbError(error, "removing enrollment") },
        { status: 500 },
      );
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId,
      action: "delete",
      resourceType: "elearning_enrollment",
      resourceId: enrollmentId,
      details: { courseId: params.courseId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeError(error, "removing enrollment") },
      { status: 500 },
    );
  }
}

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
