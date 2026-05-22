import { requireElearningEnrollment } from "@/lib/auth/elearning-access";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const body = await request.json();
    const { enrollment_id, answers } = body as { enrollment_id?: string; answers?: Record<string, number | boolean | string> };
    // answers: { [question_id]: number | boolean | string }

    if (!enrollment_id || !answers) {
      return NextResponse.json({ error: "enrollment_id et answers requis" }, { status: 400 });
    }

    const access = await requireElearningEnrollment(enrollment_id, ["admin", "super_admin", "learner"]);
    if (!access.ok) return access.error;
    const { supabase, enrollment } = access;

    // Course consistency check: prevent submitting a different course's exam against this enrollment
    if (enrollment.course_id !== params.courseId) {
      return NextResponse.json({ error: "Inscription hors du cours de l'examen" }, { status: 403 });
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
    const { data: course, error: courseErr } = await supabase
      .from("elearning_courses")
      .select("final_exam_passing_score")
      .eq("id", params.courseId)
      .maybeSingle();

    if (courseErr) {
      return NextResponse.json({ error: sanitizeDbError(courseErr, "fetching course passing score") }, { status: 500 });
    }

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

    // Upsert final exam progress WITHOUT attempts (handled atomically by RPC below)
    const { error: upsertErr } = await supabase.from("elearning_final_exam_progress").upsert(
      {
        enrollment_id,
        score,
        passed,
        last_answers: answers,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "enrollment_id" }
    );

    if (upsertErr) {
      return NextResponse.json({ error: sanitizeDbError(upsertErr, "saving final exam progress") }, { status: 500 });
    }

    // Atomic attempt counter increment
    const { error: bumpErr } = await supabase.rpc("elearning_bump_final_exam_attempts", {
      p_enrollment_id: enrollment_id,
    });

    if (bumpErr) {
      return NextResponse.json({ error: "Erreur de comptage des tentatives" }, { status: 500 });
    }

    // If exam passed, mark enrollment as completed
    if (passed) {
      const { error: enrollErr } = await supabase
        .from("elearning_enrollments")
        .update({
          status: "completed",
          completion_rate: 100,
          completed_at: new Date().toISOString(),
        })
        .eq("id", enrollment_id);

      if (enrollErr) {
        return NextResponse.json({ error: sanitizeDbError(enrollErr, "updating enrollment status") }, { status: 500 });
      }
    }

    return NextResponse.json({
      data: { score, passed, total_questions: questions.length, correct_count: correct, passing_score: passingScore, results },
    });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "submitting final exam") }, { status: 500 });
  }
}
