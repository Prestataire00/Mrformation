import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { requireElearningCourse } from "@/lib/auth/elearning-access";
import { logAudit } from "@/lib/audit-log";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
    if (!access.ok) return access.error;
    const { supabase, profile, userId } = access;

    const { data: newStatus, error } = await supabase.rpc("elearning_publish_course", {
      p_course_id: params.courseId,
    });

    if (error) {
      if (error.message.includes("generation_incomplete")) {
        return NextResponse.json(
          { error: "Le cours doit être généré (generation_status = completed) avant publication." },
          { status: 409 },
        );
      }
      if (error.message.includes("no_chapters")) {
        return NextResponse.json(
          { error: "Le cours doit comporter au moins un chapitre avant publication." },
          { status: 409 },
        );
      }
      // Tout autre échec est une erreur serveur (RPC absente, transport DB...).
      return NextResponse.json({ error: "Erreur de publication" }, { status: 500 });
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId,
      action: "update",
      resourceType: "elearning_course",
      resourceId: params.courseId,
      details: { status: newStatus },
    });

    return NextResponse.json({ data: { status: newStatus } });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "toggling course publish status") }, { status: 500 });
  }
}
