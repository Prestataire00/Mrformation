import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { requireElearningCourse } from "@/lib/auth/elearning-access";

export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
    if (!access.ok) return access.error;
    const { supabase } = access;

    const { data, error } = await supabase
      .from("elearning_slide_specs")
      .select("*")
      .eq("course_id", params.courseId)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (error) return NextResponse.json({ error: sanitizeDbError(error, "fetching slide specs") }, { status: 500 });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "fetching slide specs") }, { status: 500 });
  }
}
