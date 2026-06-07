/**
 * POST /api/elearning/[courseId]/generate/exam
 *
 * Étape 4 du pipeline split. Génère les questions d'examen final via
 * OpenAI en batches de 25, puis les insère dans elearning_final_exam_questions.
 *
 * Body : rien. Lit le cours + chapitres + extracted_text déjà créés.
 * Réponse : { ok: true, question_count: number }
 *
 * Durée typique : 15-45s (1-3 appels OpenAI selon le nombre cible).
 *
 * Appelée par la BG function elearning-generate-pipeline-background.mts
 * avec Bearer CRON_SECRET. Peut aussi être appelée manuellement par un
 * admin authentifié.
 */

import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { verifyCronAuth } from "@/lib/cron-auth";
import { requireElearningCourse } from "@/lib/auth/elearning-access";
import { generateFinalExamBatch } from "@/lib/services/openai";
import { chunkText } from "@/lib/services/doc-extraction";

export const maxDuration = 120;

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
    const { createClient, createServiceRoleClient } = await import("@/lib/supabase/server");
    const supabase = isCron ? createServiceRoleClient() : createClient();

    // Charge cours + chapitres + texte source.
    const [{ data: course, error: courseErr }, { data: chapters, error: chapErr }] = await Promise.all([
      supabase
        .from("elearning_courses")
        .select("id, title, objectives, extracted_text, final_quiz_target_count, course_type")
        .eq("id", params.courseId)
        .single(),
      supabase
        .from("elearning_chapters")
        .select("id, title, summary, key_concepts, order_index")
        .eq("course_id", params.courseId)
        .order("order_index"),
    ]);

    if (courseErr || !course) {
      return NextResponse.json(
        { error: sanitizeDbError(courseErr, "fetching course") ?? "Cours non trouvé" },
        { status: 404 },
      );
    }
    if (!chapters || chapters.length === 0) {
      return NextResponse.json(
        { error: "Aucun chapitre. Lancez /outline + /chapter d'abord." },
        { status: 400 },
      );
    }
    if (chapErr) {
      return NextResponse.json(
        { error: sanitizeDbError(chapErr, "fetching chapters") },
        { status: 500 },
      );
    }

    type CourseRow = {
      title: string;
      objectives: string | null;
      extracted_text: string | null;
      final_quiz_target_count: number | null;
      course_type: string | null;
    };
    const typedCourse = course as CourseRow;

    const finalQuizTarget = typedCourse.final_quiz_target_count ?? 40;

    // Si la cible est 0 ou type presentation, pas d'exam à générer.
    if (finalQuizTarget <= 0 || typedCourse.course_type === "presentation") {
      return NextResponse.json({ ok: true, question_count: 0, skipped: true });
    }

    type ChapterRow = {
      id: string;
      title: string;
      summary: string | null;
      key_concepts: string[] | null;
      order_index: number;
    };
    const chaptersTyped = chapters as ChapterRow[];

    // Préparer les chunks de texte source pour le contexte OpenAI.
    const rawText = typedCourse.extracted_text ?? "";
    const chunks = rawText ? chunkText(rawText, 12000) : [];
    const sourceChunks = chunks.map((text, index) => ({ index, text }));

    // Générer les questions par batches.
    const EXAM_BATCH_SIZE = 25;
    const examTotalBatches = Math.ceil(finalQuizTarget / EXAM_BATCH_SIZE);

    type FinalExamQuestion = Awaited<ReturnType<typeof generateFinalExamBatch>>["questions"][number];
    const allFinalQuestions: FinalExamQuestion[] = [];

    const chapterData = chaptersTyped.map((c) => ({
      title: c.title,
      summary: c.summary ?? "",
      key_concepts: c.key_concepts ?? [],
    }));

    for (let batchIdx = 0; batchIdx < examTotalBatches; batchIdx++) {
      const remaining = finalQuizTarget - allFinalQuestions.length;
      const batchCount = Math.min(EXAM_BATCH_SIZE, remaining);

      // Buffer +40% pour absorber les questions invalides filtrées par OpenAI
      const bufferedCount = Math.min(Math.ceil(batchCount * 1.4), EXAM_BATCH_SIZE);
      const mcq = Math.round(bufferedCount * 0.6);
      const tf = Math.round(bufferedCount * 0.2);
      const sa = bufferedCount - mcq - tf;

      const chaptersPerBatch = Math.ceil(chapterData.length / examTotalBatches);
      const startChapter = batchIdx * chaptersPerBatch;
      const focusChapters = Array.from(
        { length: Math.min(chaptersPerBatch, chapterData.length - startChapter) },
        (_, i) => startChapter + i,
      );
      if (focusChapters.length === 0) focusChapters.push(0);

      const diffMin = Math.max(1, Math.floor((batchIdx / examTotalBatches) * 3) + 1);
      const diffMax = Math.min(5, diffMin + 2);

      console.log(
        `[generate/exam] batch ${batchIdx + 1}/${examTotalBatches} target=${batchCount} buffered=${bufferedCount}`,
      );

      try {
        const batch = await generateFinalExamBatch(
          typedCourse.title,
          typedCourse.objectives ?? "",
          chapterData,
          sourceChunks,
          {
            batchIndex: batchIdx,
            questionsToGenerate: bufferedCount,
            typeDistribution: { multiple_choice: mcq, true_false: tf, short_answer: sa },
            difficultyRange: { min: diffMin, max: diffMax },
            focusChapterIndices: focusChapters,
          },
        );
        const validQuestions = batch.questions.filter((q) => {
          if (q.type === "multiple_choice") {
            return q.options && q.options.length >= 2;
          }
          return true;
        });
        allFinalQuestions.push(...validQuestions);
      } catch (e) {
        console.error(
          `[generate/exam] batch ${batchIdx + 1} error:`,
          e instanceof Error ? e.message : e,
        );
        // Continue avec les batches suivantes — on aura peut-être assez de questions.
      }
    }

    // Tronquer au nombre cible.
    const trimmedFinalQuestions = allFinalQuestions.slice(0, finalQuizTarget);

    if (trimmedFinalQuestions.length === 0) {
      return NextResponse.json(
        { error: "Aucune question d'examen final n'a pu être générée." },
        { status: 500 },
      );
    }

    // Supprimer les questions existantes (re-génération).
    await supabase
      .from("elearning_final_exam_questions")
      .delete()
      .eq("course_id", params.courseId);

    // Convertir et insérer par lots de 50.
    const finalExamInserts = trimmedFinalQuestions.map((q, idx) => ({
      course_id: params.courseId,
      question_text: q.question,
      question_type: q.type,
      options:
        q.type === "multiple_choice"
          ? (q.options ?? []).map((opt: string, optIdx: number) => ({
              text: opt,
              is_correct: optIdx === q.correct_answer,
            }))
          : q.type === "true_false"
            ? [
                { text: "Vrai", is_correct: q.correct_answer === true },
                { text: "Faux", is_correct: q.correct_answer === false },
              ]
            : [],
      correct_answer: q.type === "short_answer" ? String(q.correct_answer) : null,
      explanation: q.explanation,
      difficulty: q.difficulty || 3,
      topic: q.topic || null,
      objective_ref: q.objective_ref || null,
      estimated_time_sec: q.estimated_time_sec || 60,
      citations: q.citations || [],
      tags: [q.topic, q.type].filter(Boolean),
      order_index: idx,
    }));

    for (let i = 0; i < finalExamInserts.length; i += 50) {
      const batch = finalExamInserts.slice(i, i + 50);
      const { error: insErr } = await supabase
        .from("elearning_final_exam_questions")
        .insert(batch);
      if (insErr) {
        return NextResponse.json(
          { error: sanitizeDbError(insErr, "inserting final exam questions") },
          { status: 500 },
        );
      }
    }

    console.log(
      `[generate/exam] done course=${params.courseId} questions=${trimmedFinalQuestions.length}`,
    );

    return NextResponse.json({
      ok: true,
      question_count: trimmedFinalQuestions.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating final exam") },
      { status: 500 },
    );
  }
}
