import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

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

    if (!["admin","super_admin"].includes(profile?.role ?? "")) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { data: course } = await supabase
      .from("elearning_courses")
      .select("status")
      .eq("id", params.courseId)
      .single();

    if (!course) {
      return NextResponse.json({ error: "Cours non trouvé" }, { status: 404 });
    }

    const newStatus = course.status === "published" ? "draft" : "published";

    const { data, error } = await supabase
      .from("elearning_courses")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", params.courseId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "toggling course publish status") }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "toggling course publish status") }, { status: 500 });
  }
}
