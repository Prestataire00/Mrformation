import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import {
  generateCourseOutline,
  generateChapterContent,
  generateQuizAndFlashcards,
  generateFinalExamBatch,
  enrichChapterContent,
} from "@/lib/services/openai";
import { generateGammaChapterDeck } from "@/lib/services/gamma";
import type { GammaGenerateOptions } from "@/lib/services/gamma";
import { chunkText } from "@/lib/services/doc-extraction";

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(step: string, progress: number, message?: string, data?: unknown) {
        const event = { step, progress, message, data };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          send("error", 0, "Non autorisé");
          controller.close();
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (!["admin","super_admin"].includes(profile?.role ?? "")) {
          send("error", 0, "Accès non autorisé");
          controller.close();
          return;
        }

        // Get course with extracted text
        const { data: course, error: courseError } = await supabase
          .from("elearning_courses")
          .select("id, title, extracted_text, generation_status, final_quiz_target_count, flashcards_target_count, course_type, gamma_theme_id, gamma_template_id, num_chapters")
          .eq("id", params.courseId)
          .single();

        if (courseError || !course) {
          send("error", 0, "Cours non trouvé");
          controller.close();
          return;
        }

        if (!course.extracted_text) {
          send("error", 0, "Texte non extrait. Lancez d'abord l'extraction.");
          controller.close();
          return;
        }

        const courseType = course.course_type || "complete";

        // Update status
        await supabase
          .from("elearning_courses")
          .update({ generation_status: "generating", updated_at: new Date().toISOString() })
          .eq("id", params.courseId);

        // ══════════════════════════════════════════════════════════════
        // MODE PRÉSENTATION : Plan OpenAI + 1 deck Gamma par chapitre
        // ══════════════════════════════════════════════════════════════
        if (courseType === "presentation") {
          send("analyzing", 3, "Analyse du document en cours...");

          // Pass 1 : outline (titres + summaries seulement, pas de contenu complet)
          const maxChaptersP = course.num_chapters || 6;
          const outlineP = await generateCourseOutline(course.extracted_text, maxChaptersP);
          send("outline_done", 10, `Plan généré : ${outlineP.chapters.length} chapitres`, {
            title: outlineP.title,
            chapters: outlineP.chapters.map((c) => c.title),
          });

          await supabase
            .from("elearning_courses")
            .update({
              title: outlineP.title || course.title,
              description: outlineP.description,
              objectives: outlineP.objectives,
              estimated_duration_minutes: outlineP.estimated_duration_minutes,
            })
            .eq("id", params.courseId);

          // Pass 2 : insérer chapitres en DB (content_markdown vide — contenu uniquement dans Gamma)
          const chapInserts = outlineP.chapters.map((ch, idx) => ({
            course_id: params.courseId,
            title: ch.title,
            summary: ch.summary || "",
            content_html: "",
            content_markdown: "",
            key_concepts: ch.key_concepts || [],
            order_index: idx,
            estimated_duration_minutes: Math.max(
              5,
              Math.round((outlineP.estimated_duration_minutes || 30) / outlineP.chapters.length)
            ),
          }));

          const { data: insertedChaps, error: chapInsertError } = await supabase
            .from("elearning_chapters")
            .insert(chapInserts)
            .select("id, title, summary, order_index");

          if (chapInsertError || !insertedChaps) {
            throw new Error(`Erreur insertion chapitres : ${chapInsertError?.message}`);
          }

          send("chapters_created", 30, `${insertedChaps.length} chapitres créés`);

          // Pass 3 : 1 deck Gamma par chapitre en parallèle
          const gammaOptionsP: GammaGenerateOptions = {
            themeId: (course as Record<string, unknown>).gamma_theme_id as string || undefined,
            numCards: 8,
            language: "fr",
            tone: "professionnel et pédagogique",
            audience: "apprenants en formation professionnelle",
            textAmount: "medium",
            imageSource: "aiGenerated",
            imageStyle: "professionnel, moderne, éducatif",
            exportAs: "pptx",
          };

          send("gamma_generating", 40, `Génération de ${insertedChaps.length} présentations Gamma...`);

          const gammaResultsP = await Promise.allSettled(
            insertedChaps.map((ch) =>
              generateGammaChapterDeck(
                buildChapterMarkdown(ch.title, ch.summary || ""),
                gammaOptionsP
              )
            )
          );

          let gammaPSuccess = false;
          for (let i = 0; i < insertedChaps.length; i++) {
            const r = gammaResultsP[i];
            if (r.status === "fulfilled" && r.value.status === "completed" && r.value.embedUrl) {
              await supabase
                .from("elearning_chapters")
                .update({
                  gamma_embed_url: r.value.embedUrl,
                  gamma_deck_url: r.value.url,
                  gamma_deck_id: r.value.id, // generationId
                  gamma_slide_start: null,
                  ...(r.value.exportPptx && { gamma_export_pptx: r.value.exportPptx }),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", insertedChaps[i].id);
              gammaPSuccess = true;
            } else {
              const reason = r.status === "rejected" ? r.reason : `statut ${r.value.status}`;
              console.warn(`[Gamma] Chapitre présentation ${i + 1} échoué:`, reason);
            }
          }

          // Chapitre 1 au niveau cours
          const firstResultP = gammaResultsP[0];
          if (firstResultP?.status === "fulfilled" && firstResultP.value.status === "completed") {
            const first = firstResultP.value;
            await supabase
              .from("elearning_courses")
              .update({
                gamma_embed_url: first.embedUrl,
                gamma_deck_url: first.url,
                gamma_deck_id: first.id,
                ...(first.exportPptx && { gamma_export_pptx: first.exportPptx }),
                updated_at: new Date().toISOString(),
              })
              .eq("id", params.courseId);
          }

          send("gamma_done", 75, `${gammaResultsP.filter((r) => r.status === "fulfilled").length}/${insertedChaps.length} présentations Gamma générées`);

          await supabase
            .from("elearning_courses")
            .update({
              status: "draft",
              generation_status: "completed",
              generation_log: [
                { step: "outline", timestamp: new Date().toISOString(), message: `${outlineP.chapters.length} chapitres planifiés` },
                { step: "gamma", timestamp: new Date().toISOString(), message: gammaPSuccess ? `${gammaResultsP.filter((r) => r.status === "fulfilled").length} présentations Gamma générées` : "Échec génération Gamma" },
              ],
              updated_at: new Date().toISOString(),
            })
            .eq("id", params.courseId);

          send("complete", 100, "Cours généré avec succès !", { course_id: params.courseId });
          return;
        }

        // ══════════════════════════════════════════════════════════════
        // MODES QUIZ / COMPLET : Pipeline OpenAI complet
        // ══════════════════════════════════════════════════════════════

        send("analyzing", 3, "Analyse du document en cours...");

        // ── Pass 1: Generate outline ──────────────────────────────
        const maxChapters = course.num_chapters || 6;
        const outline = await generateCourseOutline(course.extracted_text, maxChapters);
        send("outline_done", 10, `Plan généré : ${outline.chapters.length} chapitres`, {
          title: outline.title,
          chapters: outline.chapters.map((c) => c.title),
        });

        // Update course metadata
        await supabase
          .from("elearning_courses")
          .update({
            title: outline.title || course.title,
            description: outline.description,
            objectives: outline.objectives,
            estimated_duration_minutes: outline.estimated_duration_minutes,
          })
          .eq("id", params.courseId);

        // ── Pass 2: Generate each chapter + enrich if thin ──────
        const chunks = chunkText(course.extracted_text, 12000);
        const chapterData: { title: string; summary: string; key_concepts: string[]; id: string; contentMarkdown: string }[] = [];

        for (let i = 0; i < outline.chapters.length; i++) {
          const ch = outline.chapters[i];
          const progress = 10 + Math.round(((i + 1) / outline.chapters.length) * 25);
          send(`chapter_${i + 1}`, progress - 5, `Génération du chapitre ${i + 1}/${outline.chapters.length} : ${ch.title}`);

          const chunkIndex = Math.min(i, chunks.length - 1);
          const relevantText = chunks[chunkIndex] || course.extracted_text.substring(0, 12000);

          const chapterContent = await generateChapterContent(
            ch.title,
            ch.summary,
            ch.key_concepts,
            relevantText,
            outline.title,
            outline.objectives
          );

          const contentHtml = chapterContent.sections
            .map(
              (s) =>
                `<h3>${s.title}</h3>\n${s.content_html}\n<div class="key-points"><strong>Points clés :</strong><ul>${s.key_points
                  .map((p) => `<li>${p}</li>`)
                  .join("")}</ul></div>`
            )
            .join("\n");

          const fullHtml = `<div class="chapter-intro"><p>${chapterContent.introduction}</p></div>\n${contentHtml}\n<div class="chapter-summary"><h3>Résumé</h3><p>${chapterContent.summary}</p></div>`;
          const contentMarkdown = chapterContent.sections.map((s) => `### ${s.title}\n\n${s.content_html}`).join("\n\n");

          // Check if content needs enrichment
          let finalMarkdown = contentMarkdown;
          let isEnriched = false;

          const enrichResult = await enrichChapterContent(
            ch.title,
            chapterContent.summary,
            ch.key_concepts,
            contentMarkdown,
            outline.title,
            outline.objectives
          );

          if (enrichResult.was_enriched) {
            finalMarkdown = enrichResult.enriched_markdown;
            isEnriched = true;
            send(`chapter_${i + 1}_enriched`, progress - 2, `Chapitre ${i + 1} enrichi (${enrichResult.word_count} mots)`);
          }

          const { data: chapterRow, error: chapterError } = await supabase
            .from("elearning_chapters")
            .insert({
              course_id: params.courseId,
              title: ch.title,
              summary: chapterContent.summary,
              content_html: fullHtml,
              content_markdown: finalMarkdown,
              key_concepts: ch.key_concepts,
              order_index: i,
              estimated_duration_minutes: chapterContent.duration_minutes || ch.estimated_duration_minutes,
              is_enriched: isEnriched,
            })
            .select("id")
            .single();

          if (chapterError) {
            send("error", progress, `Erreur insertion chapitre ${i + 1}: ${chapterError.message}`);
            continue;
          }

          chapterData.push({
            title: ch.title,
            summary: chapterContent.summary,
            key_concepts: ch.key_concepts,
            id: chapterRow.id,
            contentMarkdown: finalMarkdown,
          });

          send(`chapter_${i + 1}_done`, progress, `Chapitre ${i + 1} généré${isEnriched ? " et enrichi" : ""}`);
        }

        // ── Pass 3: Generate per-chapter quizzes & flashcards ─────
        let quizCount = 0;
        let flashcardCount = 0;

        send("quizzes", 38, "Génération des quiz et flashcards par chapitre...");

        const quizData = await generateQuizAndFlashcards(
          chapterData.map((c) => ({
            title: c.title,
            summary: c.summary,
            key_concepts: c.key_concepts,
          })),
          outline.title
        );

        for (let i = 0; i < chapterData.length; i++) {
          const chapterId = chapterData[i].id;

          const chapterQuestions = quizData.quiz_questions.filter((q) => q.chapter_index === i);
          const validQuestions = chapterQuestions.filter((q) => {
            if (q.type === "multiple_choice") {
              return q.options && q.options.length >= 2;
            }
            return true;
          });

          if (validQuestions.length > 0) {
            const { data: quiz } = await supabase
              .from("elearning_quizzes")
              .insert({ chapter_id: chapterId, title: `Quiz - ${chapterData[i].title}` })
              .select("id")
              .single();

            if (quiz) {
              const questions = validQuestions.map((q, qIdx) => ({
                quiz_id: quiz.id,
                question_text: q.question,
                question_type: q.type,
                options:
                  q.type === "multiple_choice"
                    ? (q.options || []).map((opt, optIdx) => ({
                        text: opt,
                        is_correct: optIdx === q.correct_answer,
                      }))
                    : [
                        { text: "Vrai", is_correct: q.correct_answer === true },
                        { text: "Faux", is_correct: q.correct_answer === false },
                      ],
                explanation: q.explanation,
                order_index: qIdx,
              }));

              await supabase.from("elearning_quiz_questions").insert(questions);
            }
          }

          const chapterFlashcards = quizData.flashcards.filter((f) => f.chapter_index === i);
          if (chapterFlashcards.length > 0) {
            const flashcards = chapterFlashcards.map((f, fIdx) => ({
              chapter_id: chapterId,
              front_text: f.front,
              back_text: f.back,
              order_index: fIdx,
            }));
            await supabase.from("elearning_flashcards").insert(flashcards);
          }
        }

        quizCount = quizData.quiz_questions.length;
        flashcardCount = quizData.flashcards.length;
        send("quizzes_done", 48, `${quizCount} questions et ${flashcardCount} flashcards par chapitre`);

        // ── Pass 4: Gamma (mode "complete" uniquement) ──────────
        // Un deck par chapitre, générés en parallèle
        function buildChapterMarkdown(title: string, contentMarkdown: string): string {
          // Convertit ### → ## pour la structure Gamma (H1 titre + H2 sections)
          const body = contentMarkdown.replace(/^### /gm, "## ");
          return `# ${title}\n\n${body}`;
        }

        let gammaSuccess = false;

        if (courseType === "complete") {
          send("gamma", 50, `Génération de ${chapterData.length} présentations Gamma en parallèle...`);

          const gammaOptions: GammaGenerateOptions = {
            themeId: course.gamma_theme_id || undefined,
            numCards: 8, // 1 titre + 6-7 slides de contenu par chapitre
            language: "fr",
            tone: "professionnel et pédagogique",
            audience: "apprenants en formation professionnelle",
            textAmount: "medium",
            imageSource: "aiGenerated",
            imageStyle: "professionnel, moderne, éducatif",
            exportAs: "pptx",
          };

          const gammaResults = await Promise.allSettled(
            chapterData.map((ch) =>
              generateGammaChapterDeck(buildChapterMarkdown(ch.title, ch.contentMarkdown), gammaOptions)
            )
          );

          for (let i = 0; i < chapterData.length; i++) {
            const r = gammaResults[i];
            if (r.status === "fulfilled" && r.value.status === "completed" && r.value.embedUrl) {
              await supabase
                .from("elearning_chapters")
                .update({
                  gamma_embed_url: r.value.embedUrl,
                  gamma_deck_url: r.value.url,
                  gamma_deck_id: r.value.id, // generationId — used for re-downloading PPTX
                  gamma_slide_start: null,
                  ...(r.value.exportPptx && { gamma_export_pptx: r.value.exportPptx }),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", chapterData[i].id);
              gammaSuccess = true;
            } else {
              const reason = r.status === "rejected" ? r.reason : `statut ${r.value.status}`;
              console.warn(`[Gamma] Chapitre ${i + 1} échoué:`, reason);
            }
          }

          // Stocker le deck du chapitre 1 au niveau du cours (bouton "Voir dans Gamma")
          const firstResult = gammaResults[0];
          if (firstResult?.status === "fulfilled" && firstResult.value.status === "completed") {
            const first = firstResult.value;
            await supabase
              .from("elearning_courses")
              .update({
                gamma_embed_url: first.embedUrl,
                gamma_deck_url: first.url,
                gamma_deck_id: first.id, // generationId — used for re-downloading PPTX
                ...(first.exportPptx && { gamma_export_pptx: first.exportPptx }),
                updated_at: new Date().toISOString(),
              })
              .eq("id", params.courseId);
          }

          if (gammaSuccess) {
            send("gamma_done", 75, `${gammaResults.filter((r) => r.status === "fulfilled").length}/${chapterData.length} présentations Gamma générées`);
          } else {
            send("gamma_error", 75, "Aucune présentation Gamma générée");
          }
        } else {
          send("gamma_skipped", 75, "Présentations Gamma ignorées (mode Quiz interactif)");
        }

        // ── Pass 5: Generate Final Exam ─────────────────────────
        const finalQuizTarget = course.final_quiz_target_count ?? 40;
        let finalExamCount = 0;

        if (finalQuizTarget > 0) {
          send("final_exam", 76, `Génération de l'examen final (${finalQuizTarget} questions)...`);

          const sourceChunks = chunks.map((text, index) => ({ index, text }));
          const EXAM_BATCH_SIZE = 25;
          const examTotalBatches = Math.ceil(finalQuizTarget / EXAM_BATCH_SIZE);
          type GeneratedFinalExamBatch = Awaited<ReturnType<typeof generateFinalExamBatch>>;
          const allFinalQuestions: GeneratedFinalExamBatch["questions"] = [];

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
              (_, i) => startChapter + i
            );
            if (focusChapters.length === 0) focusChapters.push(0);

            const diffMin = Math.max(1, Math.floor((batchIdx / examTotalBatches) * 3) + 1);
            const diffMax = Math.min(5, diffMin + 2);

            const batchProgress = 76 + Math.round(((batchIdx + 1) / examTotalBatches) * 15);
            send(`final_exam_batch_${batchIdx + 1}`, batchProgress,
              `Examen final: lot ${batchIdx + 1}/${examTotalBatches} (${batchCount} questions)...`);

            try {
              const batch = await generateFinalExamBatch(
                outline.title,
                outline.objectives,
                chapterData.map((c) => ({ title: c.title, summary: c.summary, key_concepts: c.key_concepts })),
                sourceChunks,
                {
                  batchIndex: batchIdx,
                  questionsToGenerate: bufferedCount,
                  typeDistribution: { multiple_choice: mcq, true_false: tf, short_answer: sa },
                  difficultyRange: { min: diffMin, max: diffMax },
                  focusChapterIndices: focusChapters,
                }
              );
              const validQuestions = batch.questions.filter((q) => {
                if (q.type === "multiple_choice") {
                  return q.options && q.options.length >= 2;
                }
                return true;
              });
              allFinalQuestions.push(...validQuestions);
            } catch (e) {
              send(`final_exam_batch_${batchIdx + 1}_error`, batchProgress,
                `Erreur lot ${batchIdx + 1}: ${e instanceof Error ? e.message : "erreur"}`);
            }
          }

          // Tronquer au nombre cible (le buffer peut en générer plus)
          const trimmedFinalQuestions = allFinalQuestions.slice(0, finalQuizTarget);

          if (trimmedFinalQuestions.length > 0) {
            const finalExamInserts = trimmedFinalQuestions.map((q, idx) => ({
              course_id: params.courseId,
              question_text: q.question,
              question_type: q.type,
              options:
                q.type === "multiple_choice"
                  ? (q.options || []).map((opt: string, optIdx: number) => ({ text: opt, is_correct: optIdx === q.correct_answer }))
                  : q.type === "true_false"
                  ? [{ text: "Vrai", is_correct: q.correct_answer === true }, { text: "Faux", is_correct: q.correct_answer === false }]
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
              await supabase.from("elearning_final_exam_questions").insert(finalExamInserts.slice(i, i + 50));
            }
          }

          finalExamCount = trimmedFinalQuestions.length;
          send("final_exam_done", 95, `${finalExamCount} questions d'examen final générées`);
        } else {
          send("final_exam_skipped", 95, "Examen final ignoré (cible = 0)");
        }

        // ── Finalize ─────────────────────────────────────────────
        await supabase
          .from("elearning_courses")
          .update({
            status: "draft",
            generation_status: "completed",
            generation_log: [
              { step: "outline", timestamp: new Date().toISOString(), message: `${outline.chapters.length} chapitres planifiés` },
              { step: "chapters", timestamp: new Date().toISOString(), message: `${chapterData.length} chapitres générés` },
              { step: "quizzes", timestamp: new Date().toISOString(), message: `${quizCount} questions, ${flashcardCount} flashcards par chapitre` },
              ...(courseType === "complete" ? [{ step: "gamma", timestamp: new Date().toISOString(), message: gammaSuccess ? "1 présentation Gamma unique générée" : "Échec génération Gamma" }] : []),
              ...(finalExamCount > 0 ? [{ step: "final_exam", timestamp: new Date().toISOString(), message: `${finalExamCount} questions d'examen final` }] : []),
            ],
            updated_at: new Date().toISOString(),
          })
          .eq("id", params.courseId);

        send("complete", 100, "Cours généré avec succès !", { course_id: params.courseId });
      } catch (error) {
        const message = sanitizeError(error, "generating course content");
        send("error", 0, message);

        try {
          const supabase = createClient();
          await supabase
            .from("elearning_courses")
            .update({ generation_status: "failed", generation_error: message })
            .eq("id", params.courseId);
        } catch (_) {
          // ignore
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
