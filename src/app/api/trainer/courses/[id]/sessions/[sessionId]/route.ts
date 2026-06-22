import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { getOwnedCourse } from "@/lib/services/trainer-course-sharing";

/** DELETE — délie le support de la session. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; sessionId: string } },
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const course = await getOwnedCourse(supabase, user.id, params.id);
    if (!course) {
      return NextResponse.json({ error: "Support introuvable ou non autorisé" }, { status: 404 });
    }

    const { error } = await supabase
      .from("trainer_course_sessions")
      .delete()
      .eq("trainer_course_id", params.id)
      .eq("session_id", params.sessionId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: sanitizeError(e, "trainer/courses/[id]/sessions/[sessionId] DELETE") },
      { status: 500 },
    );
  }
}
