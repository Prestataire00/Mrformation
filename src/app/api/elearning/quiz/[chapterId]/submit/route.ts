import { requireElearningEnrollment } from "@/lib/auth/elearning-access";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

export async function POST(
  request: NextRequest,
  { params }: { params: { chapterId: string } }
) {
  try {
    const body = await request.json();
    const { enrollment_id, answers } = body as { enrollment_id?: string; answers?: Record<string, number> };
    // answers: { [question_id]: selected_option_index }

    if (!enrollment_id || !answers) {
      return NextResponse.json({ error: "enrollment_id et answers requis" }, { status: 400 });
    }

    const access = await requireElearningEnrollment(enrollment_id, ["admin", "super_admin", "learner"]);
    if (!access.ok) return access.error;
    const { supabase, enrollment } = access;

    // Chapter-course consistency check: prevent quiz-answer exfiltration across courses
    const { data: chapter, error: chapterErr } = await supabase
      .from("elearning_chapters")
      .select("course_id")
      .eq("id", params.chapterId)
      .maybeSingle();

    if (chapterErr) {
      return NextResponse.json({ error: sanitizeDbError(chapterErr, "fetching chapter") }, { status: 500 });
    }
    if (!chapter) {
      return NextResponse.json({ error: "Chapitre non trouvé" }, { status: 404 });
    }
    if (chapter.course_id !== enrollment.course_id) {
      return NextResponse.json({ error: "Chapitre hors du cours de l'inscription" }, { status: 403 });
    }

    // Get quiz and questions
    const { data: quiz, error: quizErr } = await supabase
      .from("elearning_quizzes")
      .select("id, passing_score, elearning_quiz_questions(*)")
      .eq("chapter_id", params.chapterId)
      .maybeSingle();

    if (quizErr) {
      return NextResponse.json({ error: sanitizeDbError(quizErr, "fetching quiz") }, { status: 500 });
    }
    if (!quiz) {
      return NextResponse.json({ error: "Quiz non trouvé" }, { status: 404 });
    }

    const questions = quiz.elearning_quiz_questions || [];
    let correct = 0;

    const results = questions.map((q: { id: string; options: { text: string; is_correct: boolean }[]; explanation: string | null }) => {
      const selectedIndex = answers[q.id];
      const isCorrect =
        selectedIndex !== undefined && q.options[selectedIndex]?.is_correct === true;
      if (isCorrect) correct++;
      return {
        question_id: q.id,
        selected_index: selectedIndex,
        is_correct: isCorrect,
        explanation: q.explanation,
      };
    });

    const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
    const passed = score >= (quiz.passing_score || 70);

    // Upsert chapter progress WITHOUT attempts (handled atomically by RPC below)
    const { error: upsertErr } = await supabase
      .from("elearning_chapter_progress")
      .upsert(
        {
          enrollment_id,
          chapter_id: params.chapterId,
          quiz_score: score,
          quiz_passed: passed,
          last_quiz_answers: answers,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "enrollment_id,chapter_id" }
      );

    if (upsertErr) {
      return NextResponse.json({ error: sanitizeDbError(upsertErr, "saving quiz progress") }, { status: 500 });
    }

    // Atomic attempt counter increment
    const { error: bumpErr } = await supabase.rpc("elearning_bump_chapter_quiz_attempts", {
      p_enrollment_id: enrollment_id,
      p_chapter_id: params.chapterId,
    });

    if (bumpErr) {
      return NextResponse.json({ error: "Erreur de comptage des tentatives" }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        score,
        passed,
        total_questions: questions.length,
        correct_count: correct,
        results,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "submitting quiz answers") }, { status: 500 });
  }
}
