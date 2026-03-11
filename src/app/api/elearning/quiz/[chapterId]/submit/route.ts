import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { chapterId: string } }
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

    if (!["admin", "learner"].includes(profile?.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();
    const { enrollment_id, answers } = body;
    // answers: { [question_id]: selected_option_index }

    if (!enrollment_id || !answers) {
      return NextResponse.json({ error: "enrollment_id et answers requis" }, { status: 400 });
    }

    // Get quiz and questions
    const { data: quiz } = await supabase
      .from("elearning_quizzes")
      .select("id, passing_score, elearning_quiz_questions(*)")
      .eq("chapter_id", params.chapterId)
      .single();

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

    // Update chapter progress
    const { data: existing } = await supabase
      .from("elearning_chapter_progress")
      .select("quiz_attempts")
      .eq("enrollment_id", enrollment_id)
      .eq("chapter_id", params.chapterId)
      .single();

    await supabase
      .from("elearning_chapter_progress")
      .upsert(
        {
          enrollment_id,
          chapter_id: params.chapterId,
          quiz_score: score,
          quiz_passed: passed,
          quiz_attempts: (existing?.quiz_attempts || 0) + 1,
          last_quiz_answers: answers,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "enrollment_id,chapter_id" }
      );

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
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
