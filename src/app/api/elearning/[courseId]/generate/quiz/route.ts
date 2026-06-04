/**
 * POST /api/elearning/[courseId]/generate/quiz
 *
 * Étape 3 du pipeline split. Génère quiz + flashcards pour TOUS les
 * chapitres en 1 appel OpenAI (le helper generateQuizAndFlashcards
 * gère N chapitres ensemble).
 *
 * Body : rien. Lit les chapitres déjà créés par /outline.
 * Réponse : { ok: true, quiz_count: number, flashcards_count: number }
 *
 * Durée typique : 8-15s (1 appel OpenAI plus volumineux).
 */

import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { verifyCronAuth } from "@/lib/cron-auth";
import { requireElearningCourse } from "@/lib/auth/elearning-access";
import { generateQuizAndFlashcards } from "@/lib/services/openai";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  const isCron = verifyCronAuth(request);
  if (!isCron) {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
    if (!access.ok) return access.error;
  }

  try {
    // service_role en mode cron (BG function n'a pas de cookies Supabase),
    // client server classique sinon.
    const { createClient, createServiceRoleClient } = await import("@/lib/supabase/server");
    const supabase = isCron ? createServiceRoleClient() : createClient();

    // Charge cours + chapitres.
    const [{ data: course }, { data: chapters }] = await Promise.all([
      supabase.from("elearning_courses").select("title").eq("id", params.courseId).single(),
      supabase
        .from("elearning_chapters")
        .select("id, title, summary, key_concepts, order_index")
        .eq("course_id", params.courseId)
        .order("order_index"),
    ]);

    if (!course) {
      return NextResponse.json({ error: "Cours non trouvé" }, { status: 404 });
    }
    if (!chapters || chapters.length === 0) {
      return NextResponse.json({ error: "Aucun chapitre. Lancez /outline d'abord." }, { status: 400 });
    }

    type ChapterRow = { id: string; title: string; summary: string | null; key_concepts: string[] | null };
    const chaptersTyped = chapters as ChapterRow[];

    const quizData = await generateQuizAndFlashcards(
      chaptersTyped.map((c) => ({
        title: c.title,
        summary: c.summary ?? "",
        key_concepts: c.key_concepts ?? [],
      })),
      course.title as string,
    );

    // Supprime quiz + flashcards existants (re-génération).
    const chapterIds = chaptersTyped.map((c) => c.id);
    await supabase.from("elearning_quizzes").delete().in("chapter_id", chapterIds);
    await supabase.from("elearning_flashcards").delete().in("chapter_id", chapterIds);

    // Insère 1 quiz par chapitre + ses questions.
    let quizCount = 0;
    for (const ch of chaptersTyped) {
      const idx = chaptersTyped.indexOf(ch);
      const questionsForCh = quizData.quiz_questions.filter((q) => q.chapter_index === idx);
      if (questionsForCh.length === 0) continue;

      const { data: quizRow, error: qErr } = await supabase
        .from("elearning_quizzes")
        .insert({ chapter_id: ch.id, passing_score: 70 })
        .select("id")
        .single();
      if (qErr || !quizRow) continue;

      const rows = questionsForCh.map((q, qi) => ({
        quiz_id: quizRow.id as string,
        question_text: q.question,
        question_type: q.type,
        options: q.options ?? [],
        explanation: q.explanation,
        order_index: qi,
      }));
      const { error: insErr } = await supabase.from("elearning_quiz_questions").insert(rows);
      if (!insErr) quizCount += rows.length;
    }

    // Insère flashcards par chapitre.
    let flashcardsCount = 0;
    const flashRows = quizData.flashcards.map((f, i) => {
      const ch = chaptersTyped[f.chapter_index];
      if (!ch) return null;
      return {
        chapter_id: ch.id,
        front_text: f.front,
        back_text: f.back,
        order_index: i,
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);

    if (flashRows.length > 0) {
      const { error: fErr } = await supabase.from("elearning_flashcards").insert(flashRows);
      if (!fErr) flashcardsCount = flashRows.length;
      else {
        return NextResponse.json(
          { error: sanitizeDbError(fErr, "inserting flashcards") },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true, quiz_count: quizCount, flashcards_count: flashcardsCount });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating quiz/flashcards") },
      { status: 500 },
    );
  }
}
