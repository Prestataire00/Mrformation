import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!["admin", "super_admin", "learner"].includes(profile?.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

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

    // Strip correct answers for learner mode (don't reveal before submission)
    const stripAnswers = searchParams.get("strip_answers") === "true";
    if (stripAnswers && data) {
      const stripped = data.map((q: Record<string, unknown>) => ({
        ...q,
        correct_answer: null,
        explanation: null,
        options: Array.isArray(q.options)
          ? (q.options as { text: string }[]).map((o) => ({ text: o.text }))
          : q.options,
      }));
      return NextResponse.json({ data: stripped });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "fetching final exam questions") }, { status: 500 });
  }
}
