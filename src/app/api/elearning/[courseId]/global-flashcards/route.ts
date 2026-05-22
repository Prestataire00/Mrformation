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

    const { searchParams } = new URL(request.url);
    const tag = searchParams.get("tag");

    let query = supabase
      .from("elearning_global_flashcards")
      .select("*")
      .eq("course_id", params.courseId)
      .order("order_index", { ascending: true });

    if (tag) query = query.contains("tags", [tag]);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "fetching global flashcards") }, { status: 500 });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "fetching global flashcards") }, { status: 500 });
  }
}
