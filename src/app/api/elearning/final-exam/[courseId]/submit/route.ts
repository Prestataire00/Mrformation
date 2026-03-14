import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";

export async function POST(
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

    if (!["admin", "learner"].includes(profile?.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { enrollment_id, answers } = await request.json();
    // answers: { [question_id]: number | boolean | string }

    if (!enrollment_id || !answers) {
      return NextResponse.json({ error: "enrollment_id et answers requis" }, { status: 400 });
    }

    // Fetch all final exam questions
    const { data: questions, error: qError } = await supabase
      .from("elearning_final_exam_questions")
      .select("*")
      .eq("course_id", params.courseId)
      .order("order_index");

    if (qError || !questions) {
      return NextResponse.json({ error: "Questions non trouvées" }, { status: 404 });
    }

    // Fetch passing score from course
    const { data: course } = await supabase
      .from("elearning_courses")
      .select("final_exam_passing_score")
      .eq("id", params.courseId)
      .single();

    const passingScore = course?.final_exam_passing_score ?? 70;

    let correct = 0;
    const results = questions.map((q) => {
      const userAnswer = answers[q.id];
      let isCorrect = false;

      if (q.question_type === "multiple_choice") {
        const correctIdx = q.options.findIndex((o: { is_correct: boolean }) => o.is_correct);
        isCorrect = Number(userAnswer) === correctIdx;
      } else if (q.question_type === "true_false") {
        const correctBool = q.options.find((o: { is_correct: boolean }) => o.is_correct)?.text === "Vrai";
        isCorrect = userAnswer === correctBool;
      } else if (q.question_type === "short_answer") {
        const normalize = (s: string) => s.toLowerCase().trim().replace(/[.,;!?]/g, "");
        const userNorm = normalize(String(userAnswer || ""));
        const correctNorm = normalize(q.correct_answer || "");
        isCorrect = userNorm.includes(correctNorm) || correctNorm.includes(userNorm);
      }

      if (isCorrect) correct++;
      return { question_id: q.id, is_correct: isCorrect, explanation: q.explanation };
    });

    const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
    const passed = score >= passingScore;

    // Fetch existing progress
    const { data: existing } = await supabase
      .from("elearning_final_exam_progress")
      .select("attempts")
      .eq("enrollment_id", enrollment_id)
      .single();

    await supabase.from("elearning_final_exam_progress").upsert(
      {
        enrollment_id,
        score,
        passed,
        attempts: (existing?.attempts || 0) + 1,
        last_answers: answers,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "enrollment_id" }
    );

    // If exam passed, mark enrollment as completed
    if (passed) {
      await supabase
        .from("elearning_enrollments")
        .update({
          status: "completed",
          completion_rate: 100,
          completed_at: new Date().toISOString(),
        })
        .eq("id", enrollment_id);
    }

    return NextResponse.json({
      data: { score, passed, total_questions: questions.length, correct_count: correct, passing_score: passingScore, results },
    });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "submitting final exam") }, { status: 500 });
  }
}
