"use client";

/**
 * EL-8 audit BMAD — Dialog d'aperçu (lecture seule) du contenu d'un
 * chapitre OU de l'examen final d'un cours.
 *
 * Avant : impossible côté admin de voir les questions générées sans
 * basculer en mode apprenant. Ce dialog charge directement quiz +
 * flashcards (mode chapter) ou examen final (mode exam) et affiche
 * questions, options, bonne réponse, explications, flashcards
 * front/back.
 *
 * Mode "chapter" → elearning_quiz_questions (via elearning_quizzes
 * relation) + elearning_flashcards (par chapter_id).
 * Mode "exam" → elearning_final_exam_questions (par course_id) +
 * elearning_global_flashcards.
 *
 * Lecture seule pour cette première version — l'édition viendrait dans
 * un sous-lot dédié (les API d'édition n'existent pas encore pour les
 * questions individuelles).
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, HelpCircle, Layers } from "lucide-react";

interface QuizQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options: unknown;
  explanation: string | null;
  order_index: number;
}

interface FinalExamQuestion extends QuizQuestion {
  correct_answer: string | null;
  difficulty: number | null;
  topic: string | null;
}

interface Flashcard {
  id: string;
  front_text: string;
  back_text: string;
  order_index: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  mode: "chapter" | "exam";
  // Pour mode chapter : passer chapterId + (chapterTitle pour l'en-tête)
  chapterId?: string;
  chapterTitle?: string;
  // Pour mode exam : passer courseId
  courseId?: string;
}

interface OptionObject {
  text: string;
  is_correct?: boolean;
}

function normalizeOptions(raw: unknown): OptionObject[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => {
    if (typeof o === "string") return { text: o };
    if (typeof o === "object" && o !== null) {
      const obj = o as Record<string, unknown>;
      return {
        text: typeof obj.text === "string" ? obj.text : String(obj.value ?? ""),
        is_correct: obj.is_correct === true || obj.correct === true,
      };
    }
    return { text: String(o) };
  });
}

export function ContentPreviewDialog({
  open,
  onClose,
  mode,
  chapterId,
  chapterTitle,
  courseId,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [chapterQuestions, setChapterQuestions] = useState<QuizQuestion[]>([]);
  const [chapterFlashcards, setChapterFlashcards] = useState<Flashcard[]>([]);
  const [examQuestions, setExamQuestions] = useState<FinalExamQuestion[]>([]);
  const [globalFlashcards, setGlobalFlashcards] = useState<Flashcard[]>([]);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    setLoading(true);
    (async () => {
      try {
        if (mode === "chapter" && chapterId) {
          const [qRes, fRes] = await Promise.all([
            supabase
              .from("elearning_quiz_questions")
              .select(
                "id, quiz_id, question_text, question_type, options, explanation, order_index, elearning_quizzes!inner(chapter_id)",
              )
              .eq("elearning_quizzes.chapter_id", chapterId)
              .order("order_index"),
            supabase
              .from("elearning_flashcards")
              .select("id, front_text, back_text, order_index")
              .eq("chapter_id", chapterId)
              .order("order_index"),
          ]);
          setChapterQuestions((qRes.data as unknown as QuizQuestion[]) ?? []);
          setChapterFlashcards((fRes.data as Flashcard[]) ?? []);
        } else if (mode === "exam" && courseId) {
          const [eRes, gRes] = await Promise.all([
            supabase
              .from("elearning_final_exam_questions")
              .select("id, question_text, question_type, options, explanation, order_index, correct_answer, difficulty, topic")
              .eq("course_id", courseId)
              .order("order_index"),
            supabase
              .from("elearning_global_flashcards")
              .select("id, front_text, back_text, order_index")
              .eq("course_id", courseId)
              .order("order_index"),
          ]);
          setExamQuestions((eRes.data as FinalExamQuestion[]) ?? []);
          setGlobalFlashcards((gRes.data as Flashcard[]) ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [open, mode, chapterId, courseId]);

  const title =
    mode === "chapter"
      ? `Aperçu — ${chapterTitle || "Chapitre"}`
      : "Aperçu — Examen final";

  const questions = mode === "chapter" ? chapterQuestions : examQuestions;
  const flashcards = mode === "chapter" ? chapterFlashcards : globalFlashcards;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Aperçu en lecture seule. Pour modifier, régénérer le cours côté wizard.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Questions */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <HelpCircle className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Questions ({questions.length})
                </h3>
              </div>
              {questions.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Aucune question.</p>
              ) : (
                <ol className="space-y-3 list-decimal list-inside">
                  {questions.map((q) => {
                    const opts = normalizeOptions(q.options);
                    return (
                      <li key={q.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                        <p className="text-sm font-medium text-gray-900">{q.question_text}</p>
                        <div className="flex items-center gap-2 flex-wrap text-[10px]">
                          <Badge variant="outline" className="bg-gray-50">{q.question_type}</Badge>
                          {mode === "exam" && (q as FinalExamQuestion).difficulty != null && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                              Difficulté {(q as FinalExamQuestion).difficulty}/5
                            </Badge>
                          )}
                          {mode === "exam" && (q as FinalExamQuestion).topic && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                              {(q as FinalExamQuestion).topic}
                            </Badge>
                          )}
                        </div>
                        {opts.length > 0 && (
                          <ul className="space-y-1 ml-3">
                            {opts.map((o, i) => {
                              const examCorrect =
                                mode === "exam" &&
                                (q as FinalExamQuestion).correct_answer === o.text;
                              const isCorrect = o.is_correct === true || examCorrect;
                              return (
                                <li
                                  key={i}
                                  className={`flex items-start gap-1.5 text-xs ${isCorrect ? "text-emerald-700 font-medium" : "text-gray-700"}`}
                                >
                                  {isCorrect ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                  ) : (
                                    <span className="inline-block w-3.5 h-3.5 mt-0.5 shrink-0 rounded-full border border-gray-300" />
                                  )}
                                  <span>{o.text}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {q.explanation && (
                          <p className="text-[11px] text-gray-500 italic border-l-2 border-blue-200 pl-2 ml-3">
                            💡 {q.explanation}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {/* Flashcards */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Layers className="h-4 w-4 text-purple-600" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Flashcards ({flashcards.length})
                </h3>
              </div>
              {flashcards.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Aucune flashcard.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {flashcards.map((f) => (
                    <div key={f.id} className="border border-gray-200 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-semibold text-purple-700">{f.front_text}</p>
                      <p className="text-xs text-gray-600">{f.back_text}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
