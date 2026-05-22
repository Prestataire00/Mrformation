import { NextRequest, NextResponse } from "next/server";
import { requireElearningCourse } from "@/lib/auth/elearning-access";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin", "learner"]);
    if (!access.ok) return access.error;
    const { supabase, profile } = access;

    const { searchParams } = new URL(request.url);
    const difficulty = searchParams.get("difficulty");
    const topic = searchParams.get("topic");
    const type = searchParams.get("type");
    const limit = searchParams.get("limit");

    let query = supabase
      .from("elearning_final_exam_questions")
      .select("*")
      .eq("course_id", params.courseId)
      .order("order_index", { ascending: true });

    if (difficulty) query = query.eq("difficulty", parseInt(difficulty));
    if (topic) query = query.eq("topic", topic);
    if (type) query = query.eq("question_type", type);
    if (limit) query = query.limit(parseInt(limit));

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "fetching final exam questions") }, { status: 500 });

    if (profile.role === "learner" && data) {
      const masked = data.map((q: Record<string, unknown>) => ({
        ...q,
        correct_answer: null,
        explanation: null,
        options: Array.isArray(q.options)
          ? (q.options as { text: string }[]).map((o) => ({ text: o.text }))
          : null,
      }));
      return NextResponse.json({ data: masked });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "fetching final exam questions") }, { status: 500 });
  }
}
