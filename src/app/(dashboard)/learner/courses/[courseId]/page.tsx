"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  Clock,
  FileText,
  Loader2,
  RotateCcw,
  Sparkles,
  Star,
  Trophy,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
interface QuizQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options: { text: string; is_correct: boolean }[];
  explanation: string | null;
  order_index: number;
}

interface Flashcard {
  id: string;
  front_text: string;
  back_text: string;
  order_index: number;
}

interface Chapter {
  id: string;
  title: string;
  summary: string | null;
  content_html: string | null;
  key_concepts: string[] | null;
  order_index: number;
  estimated_duration_minutes: number;
  gamma_deck_id: string | null;
  gamma_deck_url: string | null;
  gamma_embed_url: string | null;
  gamma_export_pdf: string | null;
  gamma_export_pptx: string | null;
  gamma_slide_start: number | null;
  elearning_quizzes: {
    id: string;
    title: string;
    passing_score: number;
    elearning_quiz_questions: QuizQuestion[];
  }[];
  elearning_flashcards: Flashcard[];
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  objectives: string | null;
  estimated_duration_minutes: number;
  final_exam_passing_score: number;
  final_quiz_target_count: number | null;
  course_type: string | null;
  gamma_embed_url: string | null;
  gamma_deck_url: string | null;
  elearning_chapters: Chapter[];
}

interface FinalQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options: { text: string; is_correct: boolean }[];
  explanation: string | null;
  difficulty: number;
}

/* ------------------------------------------------------------------ */
/*  Screen types — Gamma → Flashcards → Quiz per chapter               */
/* ------------------------------------------------------------------ */
type Screen =
  | { type: "cover" }
  | { type: "gamma_chapter"; chapterIdx: number }
  | { type: "flashcards"; chapterIdx: number }
  | { type: "quiz"; chapterIdx: number }
  | { type: "chapter_score"; chapterIdx: number }
  | { type: "final_intro" }
  | { type: "final_question"; questionIdx: number }
  | { type: "final_score" }
  | { type: "course_complete" };

function buildScreens(chapters: Chapter[], courseType?: string | null): Screen[] {
  const screens: Screen[] = [{ type: "cover" }];
  const isQuizOnly = courseType === "quiz";
  const hasAnyQuiz = chapters.some((ch) =>
    ch.elearning_quizzes.some((q) => q.elearning_quiz_questions.length > 0)
  );

  chapters.forEach((ch, ci) => {
    // 1. Gamma slides — skip in quiz-only mode
    if (!isQuizOnly) {
      screens.push({ type: "gamma_chapter", chapterIdx: ci });
    }
    // 2. Flashcards (if any)
    if (ch.elearning_flashcards && ch.elearning_flashcards.length > 0) {
      screens.push({ type: "flashcards", chapterIdx: ci });
    }
    // 3. Quiz (if any)
    const hasQuiz = ch.elearning_quizzes.some((q) => q.elearning_quiz_questions.length > 0);
    if (hasQuiz) {
      screens.push({ type: "quiz", chapterIdx: ci });
      screens.push({ type: "chapter_score", chapterIdx: ci });
    }
  });

  // Only add final exam intro if there are quizzes (not presentation-only mode)
  if (hasAnyQuiz) {
    screens.push({ type: "final_intro" });
  } else {
    // Presentation-only mode: add a course completion screen
    screens.push({ type: "course_complete" });
  }
  return screens;
}

/* ------------------------------------------------------------------ */
/*  Confetti animation                                                  */
/* ------------------------------------------------------------------ */
function ConfettiEffect({ show }: { show: boolean }) {
  if (!show) return null;
  const particles = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    color: ["#22c55e", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"][i % 6],
    size: 6 + Math.random() * 8,
    rotation: Math.random() * 360,
  }));

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            top: "-20px",
            animationDelay: `${p.delay}s`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti-fall {
          animation: confetti-fall 2.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Score popup                                                         */
/* ------------------------------------------------------------------ */
function ScorePopup({ points, show }: { points: number; show: boolean }) {
  return (
    <div
      className={cn(
        "fixed top-24 right-8 z-50 pointer-events-none transition-all duration-700",
        show ? "opacity-100 -translate-y-4 scale-110" : "opacity-0 translate-y-0 scale-100"
      )}
    >
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-lg px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2">
        <Zap className="h-5 w-5" />+{points} pts
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Flashcard component with flip animation                             */
/* ------------------------------------------------------------------ */
function FlashcardCard({
  front,
  back,
  index,
  isFlipped,
  onFlip,
}: {
  front: string;
  back: string;
  index: number;
  isFlipped: boolean;
  onFlip: () => void;
}) {
  return (
    <div
      className="perspective-1000 cursor-pointer"
      onClick={onFlip}
      style={{ perspective: "1000px" }}
    >
      <div
        className="relative w-full h-48 transition-transform duration-700"
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 p-6 flex flex-col items-center justify-center text-center shadow-lg"
          style={{ backfaceVisibility: "hidden" }}
        >
          <span className="text-xs text-white/60 uppercase tracking-wider mb-2">Carte {index + 1}</span>
          <p className="text-white font-semibold text-base leading-relaxed">{front}</p>
          <span className="text-xs text-white/50 mt-4">Cliquez pour retourner</span>
        </div>
        {/* Back */}
        <div
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 p-6 flex flex-col items-center justify-center text-center shadow-lg"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <span className="text-xs text-white/60 uppercase tracking-wider mb-2">Réponse</span>
          <p className="text-white font-semibold text-base leading-relaxed">{back}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */
export default function CoursePlayerPage() {
  const params = useParams();
  const supabase = createClient();
  const { toast } = useToast();
  const courseId = params.courseId as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);

  // Navigation state
  const [screens, setScreens] = useState<Screen[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  // Quiz state per chapter: Map<chapterIdx, Map<questionIdx, selectedOptionIdx>>
  const [quizAnswers, setQuizAnswers] = useState<Map<number, Map<number, number>>>(new Map());
  const [quizRevealed, setQuizRevealed] = useState<Map<number, Set<number>>>(new Map());
  const [chapterScores, setChapterScores] = useState<Map<number, { correct: number; total: number }>>(new Map());

  // Flashcard state
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());

  // Quiz navigation per chapter
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState<Map<number, number>>(new Map());

  // Chapter navigation drawer
  const [showChapterNav, setShowChapterNav] = useState(false);

  // Final exam
  const [finalQuestions, setFinalQuestions] = useState<FinalQuestion[]>([]);
  const [finalLoading, setFinalLoading] = useState(false);
  const [finalAnswers, setFinalAnswers] = useState<Map<number, number>>(new Map());
  const [finalRevealed, setFinalRevealed] = useState<Set<number>>(new Set());
  const [finalScore, setFinalScore] = useState<{ correct: number; total: number } | null>(null);
  const [finalSubmitting, setFinalSubmitting] = useState(false);
  const [finalSlidesAdded, setFinalSlidesAdded] = useState(false);

  // Best score
  const [bestScore, setBestScore] = useState<{ best_score: number; best_final_pct: number; attempts: number } | null>(null);

  // Animations
  const [showConfetti, setShowConfetti] = useState(false);
  const [showScorePopup, setShowScorePopup] = useState(false);
  const [popupPoints, setPopupPoints] = useState(10);
  const scorePopupTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confettiTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track which chapters have been marked as completed (to avoid duplicate API calls)
  const completedChaptersRef = useRef<Set<number>>(new Set());

  // Total score
  const totalScore = Array.from(chapterScores.values()).reduce((acc, s) => acc + s.correct * 10, 0)
    + (finalScore ? finalScore.correct * 10 : 0);

  /* ---------------------------------------------------------------- */
  /*  Progress tracking — mark chapter completed via API                */
  /* ---------------------------------------------------------------- */
  async function markChapterCompleted(chapterIdx: number) {
    if (!enrollmentId || !course) return;
    if (completedChaptersRef.current.has(chapterIdx)) return;
    completedChaptersRef.current.add(chapterIdx);

    const chapter = course.elearning_chapters[chapterIdx];
    if (!chapter) return;

    try {
      await fetch("/api/elearning/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollment_id: enrollmentId,
          chapter_id: chapter.id,
          is_completed: true,
          time_spent_seconds: 0,
        }),
      });
    } catch {
      // non-blocking — don't break the course flow
    }
  }

  async function markAllChaptersCompleted() {
    if (!enrollmentId || !course) return;
    for (let i = 0; i < course.elearning_chapters.length; i++) {
      await markChapterCompleted(i);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Data loading                                                      */
  /* ---------------------------------------------------------------- */
  const fetchCourse = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/elearning/${courseId}`);
    const { data, error } = await res.json();
    if (error) {
      toast({ title: "Erreur", description: error, variant: "destructive" });
      setLoading(false);
      return;
    }
    if (data.elearning_chapters) {
      data.elearning_chapters.sort((a: Chapter, b: Chapter) => a.order_index - b.order_index);
      data.elearning_chapters.forEach((ch: Chapter) => {
        ch.elearning_quizzes.forEach((q) => {
          // Filter out questions with empty options
          q.elearning_quiz_questions = q.elearning_quiz_questions
            .filter((qq) => qq.options && qq.options.length >= 2)
            .sort((a, b) => a.order_index - b.order_index);
        });
        if (ch.elearning_flashcards) {
          ch.elearning_flashcards.sort((a, b) => a.order_index - b.order_index);
        }
      });
    }
    setCourse(data);
    setScreens(buildScreens(data.elearning_chapters || [], data.course_type));

    // Fetch best score
    try {
      const scoreRes = await fetch(`/api/elearning/scores?course_id=${courseId}`);
      const scoreJson = await scoreRes.json();
      if (scoreJson.data) setBestScore(scoreJson.data);
    } catch { /* ignore */ }

    // Enrollment
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).single();
      if (profile?.email) {
        const { data: learner } = await supabase.from("learners").select("id").eq("email", profile.email).single();
        if (learner) {
          const { data: enrollment } = await supabase
            .from("elearning_enrollments")
            .select("id")
            .eq("course_id", courseId)
            .eq("learner_id", learner.id)
            .single();
          if (enrollment) setEnrollmentId(enrollment.id);
        }
      }
    }
    setLoading(false);
  }, [courseId, supabase, toast]);

  const fetchFinalQuestions = useCallback(async () => {
    if (finalLoading || finalQuestions.length > 0) return;
    setFinalLoading(true);
    const count = course?.final_quiz_target_count || 40;
    const res = await fetch(`/api/elearning/final-exam/${courseId}?limit=${count}`);
    const { data } = await res.json();
    // Filter out questions with no valid options
    const questions = ((data || []) as FinalQuestion[])
      .filter((q) => q.options && q.options.length >= 2)
      .slice(0, count);
    setFinalQuestions(questions);
    setFinalLoading(false);

    if (!finalSlidesAdded && questions.length > 0) {
      setFinalSlidesAdded(true);
      setScreens((prev) => {
        const base = prev.filter((s) => s.type !== "final_question" && s.type !== "final_score");
        const finalQScreens: Screen[] = questions.map((_, qi) => ({ type: "final_question" as const, questionIdx: qi }));
        return [...base, ...finalQScreens, { type: "final_score" as const }];
      });
    }
  }, [courseId, course, finalLoading, finalQuestions.length, finalSlidesAdded]);

  useEffect(() => { fetchCourse(); }, [fetchCourse]);

  const currentScreen = screens[currentIdx] as Screen | undefined;

  // Fetch final questions when reaching final_intro
  useEffect(() => {
    if (currentScreen?.type === "final_intro") {
      fetchFinalQuestions();
    }
  }, [currentScreen, fetchFinalQuestions]);

  // Mark chapter as completed when reaching chapter_score screen
  useEffect(() => {
    if (currentScreen?.type === "chapter_score" && "chapterIdx" in currentScreen) {
      markChapterCompleted(currentScreen.chapterIdx);
    }
    // Presentation-only: mark all chapters completed when reaching course_complete
    if (currentScreen?.type === "course_complete") {
      markAllChaptersCompleted();
    }
  }, [currentIdx]);

  /* ---------------------------------------------------------------- */
  /*  Quiz helpers                                                      */
  /* ---------------------------------------------------------------- */
  function getChapterQuestions(chapterIdx: number): QuizQuestion[] {
    if (!course) return [];
    return course.elearning_chapters[chapterIdx]?.elearning_quizzes
      .flatMap((q) => q.elearning_quiz_questions)
      .filter((q) => q.options && q.options.length >= 2) || [];
  }

  function getChapterFlashcards(chapterIdx: number): Flashcard[] {
    if (!course) return [];
    return course.elearning_chapters[chapterIdx]?.elearning_flashcards || [];
  }

  function selectAnswer(chapterIdx: number, questionIdx: number, optionIdx: number) {
    const revealed = quizRevealed.get(chapterIdx);
    if (revealed?.has(questionIdx)) return;
    setQuizAnswers((prev) => {
      const next = new Map(prev);
      const chMap = new Map(next.get(chapterIdx) || []);
      chMap.set(questionIdx, optionIdx);
      next.set(chapterIdx, chMap);
      return next;
    });
  }

  function validateAnswer(chapterIdx: number, questionIdx: number) {
    const selected = quizAnswers.get(chapterIdx)?.get(questionIdx);
    if (selected === undefined) return;

    const questions = getChapterQuestions(chapterIdx);
    const question = questions[questionIdx];
    const isCorrect = question.options[selected]?.is_correct === true;

    setQuizRevealed((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(chapterIdx) || []);
      set.add(questionIdx);
      next.set(chapterIdx, set);
      return next;
    });

    if (isCorrect) {
      triggerCorrectAnimation(10);
      setChapterScores((prev) => {
        const next = new Map(prev);
        const curr = next.get(chapterIdx) || { correct: 0, total: questions.length };
        next.set(chapterIdx, { correct: curr.correct + 1, total: questions.length });
        return next;
      });
    } else {
      setChapterScores((prev) => {
        const next = new Map(prev);
        if (!next.has(chapterIdx)) {
          next.set(chapterIdx, { correct: 0, total: questions.length });
        }
        return next;
      });
    }
  }

  function triggerCorrectAnimation(points: number) {
    setPopupPoints(points);
    setShowScorePopup(true);
    setShowConfetti(true);
    if (scorePopupTimeout.current) clearTimeout(scorePopupTimeout.current);
    if (confettiTimeout.current) clearTimeout(confettiTimeout.current);
    scorePopupTimeout.current = setTimeout(() => setShowScorePopup(false), 1200);
    confettiTimeout.current = setTimeout(() => setShowConfetti(false), 3000);
  }

  /* ---------------------------------------------------------------- */
  /*  Final exam helpers                                                */
  /* ---------------------------------------------------------------- */
  function selectFinalAnswer(questionIdx: number, optionIdx: number) {
    if (finalRevealed.has(questionIdx)) return;
    setFinalAnswers((prev) => {
      const next = new Map(prev);
      next.set(questionIdx, optionIdx);
      return next;
    });
  }

  function validateFinalAnswer(questionIdx: number) {
    const selected = finalAnswers.get(questionIdx);
    if (selected === undefined) return;

    const question = finalQuestions[questionIdx];
    const isCorrect = question.options[selected]?.is_correct === true;

    setFinalRevealed((prev) => {
      const next = new Set(prev);
      next.add(questionIdx);
      return next;
    });

    if (isCorrect) {
      triggerCorrectAnimation(10);
      setFinalScore((prev) => ({
        correct: (prev?.correct || 0) + 1,
        total: finalQuestions.length,
      }));
    } else if (!finalScore) {
      setFinalScore({ correct: 0, total: finalQuestions.length });
    }
  }

  async function submitFinalExam() {
    setFinalSubmitting(true);
    const answers = finalQuestions.map((q, qi) => ({
      question_id: q.id,
      selected_index: finalAnswers.get(qi) ?? -1,
      is_correct: q.options[finalAnswers.get(qi) ?? -1]?.is_correct === true,
    }));
    try {
      if (enrollmentId) {
        await fetch(`/api/elearning/final-exam/${courseId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enrollment_id: enrollmentId, answers }),
        });
      }
    } catch {
      // non-blocking
    }

    // Save score (best score tracking)
    const chapterPcts = Array.from(chapterScores.values());
    const avgChapterPct = chapterPcts.length > 0
      ? Math.round(chapterPcts.reduce((acc, s) => acc + (s.total > 0 ? (s.correct / s.total) * 100 : 0), 0) / chapterPcts.length)
      : 0;
    const fScore = finalScore || { correct: 0, total: finalQuestions.length };
    const finalPct = fScore.total > 0 ? Math.round((fScore.correct / fScore.total) * 100) : 0;
    const currentTotalScore = totalScore;

    try {
      const scoreRes = await fetch("/api/elearning/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: courseId,
          total_score: currentTotalScore,
          chapter_pct: avgChapterPct,
          final_pct: finalPct,
        }),
      });
      const scoreJson = await scoreRes.json();
      if (scoreJson.data) setBestScore(scoreJson.data);
    } catch {
      // non-blocking
    }

    // Mark all chapters as completed after final exam
    await markAllChaptersCompleted();

    setFinalSubmitting(false);
    goNext();
  }

  /* ---------------------------------------------------------------- */
  /*  Navigation                                                        */
  /* ---------------------------------------------------------------- */
  function goNext() {
    setCurrentIdx((i) => Math.min(screens.length - 1, i + 1));
  }

  function goPrev() {
    setCurrentIdx((i) => Math.max(0, i - 1));
  }

  /* ---------------------------------------------------------------- */
  /*  Loading                                                           */
  /* ---------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-10 w-10 text-[#374151] animate-spin" />
      </div>
    );
  }

  if (!course || screens.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
        <BookOpen className="h-12 w-12 text-gray-300" />
        <p className="text-gray-500">Cours non trouvé</p>
        <Link href="/learner"><Button variant="outline">Retour</Button></Link>
      </div>
    );
  }

  const chapters = course.elearning_chapters || [];
  const progress = screens.length > 1 ? ((currentIdx) / (screens.length - 1)) * 100 : 0;

  /* ---------------------------------------------------------------- */
  /*  Screen rendering                                                  */
  /* ---------------------------------------------------------------- */
  function renderScreen(screen: Screen) {
    if (!course) return null;
    switch (screen.type) {
      /* ---- COVER ---- */
      case "cover":
        return (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12">
            <img
              src="/logo-mr-formation.png"
              alt="MR Formation"
              className="h-24 mb-8 object-contain"
            />
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight">
              {course.title}
            </h1>
            {course.description && (
              <p className="text-lg text-gray-600 max-w-xl mb-6">{course.description}</p>
            )}
            {course.objectives && (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 max-w-xl text-left mb-6">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">Objectifs</p>
                <p className="text-sm text-gray-700 whitespace-pre-line">{course.objectives}</p>
              </div>
            )}
            <div className="flex items-center gap-6 text-sm text-gray-500 mb-8">
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-[#374151]" />
                {chapters.length} chapitre{chapters.length > 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-[#374151]" />
                {course.estimated_duration_minutes} min
              </span>
              {course.course_type !== "quiz" && (
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  Présentations Gamma
                </span>
              )}
            </div>
            {bestScore && (
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl px-6 py-3 mb-6 flex items-center gap-3">
                <Star className="h-5 w-5 text-purple-500" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">Meilleur score : {bestScore.best_score} pts ({bestScore.best_final_pct}%)</p>
                  <p className="text-xs text-gray-500">{bestScore.attempts} tentative{bestScore.attempts > 1 ? "s" : ""} effectuée{bestScore.attempts > 1 ? "s" : ""}</p>
                </div>
              </div>
            )}
            <Button
              onClick={goNext}
              className="bg-gradient-to-r from-[#374151] to-blue-600 text-white px-10 py-4 text-lg gap-3 rounded-2xl shadow-lg hover:shadow-xl transition-all"
            >
              {bestScore ? "Recommencer" : "Commencer"} <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        );

      /* ---- GAMMA CHAPTER (Gamma embed) ---- */
      case "gamma_chapter": {
        const ch = chapters[screen.chapterIdx];
        const embedUrl = ch.gamma_embed_url || (ch.gamma_deck_url ? ch.gamma_deck_url.replace("/docs/", "/embed/") : null);
        const hasGamma = !!embedUrl;
        const hasFlashcards = ch.elearning_flashcards && ch.elearning_flashcards.length > 0;
        const hasQuiz = ch.elearning_quizzes.some((q) => q.elearning_quiz_questions.length > 0);

        const isLastChapter = screen.chapterIdx === chapters.length - 1;
        let nextLabel = isLastChapter && !hasFlashcards && !hasQuiz ? "Terminer le cours" : "Chapitre suivant";
        if (hasFlashcards) nextLabel = "Flashcards";
        else if (hasQuiz) nextLabel = "Passer au quiz";

        return (
          <div className="flex flex-col h-full">
            {/* Chapter header */}
            <div className="flex items-center justify-between px-6 py-3 bg-gradient-to-r from-[#374151]/10 to-blue-50 border-b border-[#374151]/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#374151] flex items-center justify-center text-white font-bold text-sm">
                  {screen.chapterIdx + 1}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{ch.title}</p>
                  <p className="text-xs text-gray-500">{ch.estimated_duration_minutes} min</p>
                </div>
              </div>
            </div>

            {/* Gamma embed or fallback content */}
            {hasGamma ? (
              <div className="flex-1 bg-gray-900">
                <iframe
                  src={embedUrl!}
                  className="w-full h-full border-0"
                  allow="fullscreen"
                  title={`Présentation - ${ch.title}`}
                  style={{ minHeight: "500px" }}
                />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-8 py-8">
                <div className="max-w-3xl mx-auto">
                  <div className="text-xs font-semibold text-[#374151] uppercase tracking-widest mb-2">
                    Chapitre {screen.chapterIdx + 1} / {chapters.length}
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">{ch.title}</h2>
                  {ch.key_concepts && ch.key_concepts.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6">
                      {ch.key_concepts.map((c, i) => (
                        <span key={i} className="text-xs px-3 py-1 rounded-full bg-[#374151]/10 text-[#374151] font-medium">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  {ch.content_html ? (
                    <div
                      className="prose prose-sm max-w-none text-gray-700"
                      dangerouslySetInnerHTML={{ __html: ch.content_html }}
                    />
                  ) : ch.summary ? (
                    <p className="text-gray-700 leading-relaxed">{ch.summary}</p>
                  ) : null}
                </div>
              </div>
            )}

            {/* Next button */}
            <div className="px-6 py-4 bg-white border-t border-gray-200 flex justify-end">
              <Button
                onClick={goNext}
                className="bg-gradient-to-r from-[#374151] to-blue-600 text-white px-8 py-3 text-base gap-2 rounded-xl shadow-md"
              >
                {nextLabel} <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
        );
      }

      /* ---- FLASHCARDS (separate screen before quiz) ---- */
      case "flashcards": {
        const ch = chapters[screen.chapterIdx];
        const flashcards = getChapterFlashcards(screen.chapterIdx);

        return (
          <div className="flex flex-col h-full bg-gradient-to-br from-violet-50/30 to-white">
            {/* Header */}
            <div className="px-6 py-4 bg-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-violet-600 font-semibold uppercase tracking-wider">
                    Chapitre {screen.chapterIdx + 1} — Flashcards
                  </p>
                  <h2 className="text-lg font-bold text-gray-900 mt-1">{ch.title}</h2>
                </div>
                <div className="flex items-center gap-1 bg-violet-50 border border-violet-200 rounded-full px-3 py-1">
                  <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                  <span className="text-xs font-bold text-violet-700">{flashcards.length} cartes</span>
                </div>
              </div>
            </div>

            {/* Flashcards grid */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="max-w-2xl mx-auto">
                <p className="text-sm text-gray-500 text-center mb-6">
                  Cliquez sur chaque carte pour révéler la réponse. Révisez avant le quiz !
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {flashcards.map((fc, i) => (
                    <FlashcardCard
                      key={fc.id}
                      front={fc.front_text}
                      back={fc.back_text}
                      index={i}
                      isFlipped={flippedCards.has(fc.id)}
                      onFlip={() => {
                        setFlippedCards((prev) => {
                          const next = new Set(prev);
                          if (next.has(fc.id)) {
                            next.delete(fc.id);
                          } else {
                            next.add(fc.id);
                          }
                          return next;
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Next button */}
            <div className="px-6 py-4 bg-white border-t border-gray-200 flex justify-end">
              <Button
                onClick={goNext}
                className="bg-gradient-to-r from-violet-500 to-purple-600 text-white px-8 py-3 text-base gap-2 rounded-xl shadow-md"
              >
                Passer au quiz <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
        );
      }

      /* ---- QUIZ (separate screen after flashcards) ---- */
      case "quiz": {
        const ch = chapters[screen.chapterIdx];
        const questions = getChapterQuestions(screen.chapterIdx);
        const qIdx = currentQuestionIdx.get(screen.chapterIdx) || 0;

        return (
          <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 to-white">
            {/* Header */}
            <div className="px-6 py-4 bg-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider">
                    Chapitre {screen.chapterIdx + 1} — Quiz
                  </p>
                  <h2 className="text-lg font-bold text-gray-900 mt-1">{ch.title}</h2>
                </div>
                <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                  <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                  <span className="text-xs font-bold text-amber-700">{totalScore} pts</span>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {questions.length > 0 ? (
                <div className="max-w-2xl mx-auto">
                  {(() => {
                    const question = questions[qIdx];
                    if (!question) return null;
                    const selected = quizAnswers.get(screen.chapterIdx)?.get(qIdx);
                    const isRevealed = quizRevealed.get(screen.chapterIdx)?.has(qIdx) ?? false;
                    const correctIdx = question.options.findIndex((o) => o.is_correct);
                    const isCorrect = selected !== undefined && question.options[selected]?.is_correct;

                    return (
                      <div className="space-y-5">
                        {/* Progress dots */}
                        <div className="flex items-center gap-2 justify-center flex-wrap">
                          {questions.map((_, i) => {
                            const isAnswered = quizRevealed.get(screen.chapterIdx)?.has(i);
                            const wasCorrect = isAnswered && quizAnswers.get(screen.chapterIdx)?.get(i) !== undefined &&
                              questions[i].options[quizAnswers.get(screen.chapterIdx)!.get(i)!]?.is_correct;
                            return (
                              <button
                                key={i}
                                onClick={() => setCurrentQuestionIdx((prev) => new Map(prev).set(screen.chapterIdx, i))}
                                className={cn(
                                  "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all",
                                  i === qIdx && "ring-2 ring-offset-2 ring-amber-400",
                                  isAnswered && wasCorrect && "bg-green-100 text-green-700",
                                  isAnswered && !wasCorrect && "bg-red-100 text-red-700",
                                  !isAnswered && i === qIdx && "bg-amber-500 text-white",
                                  !isAnswered && i !== qIdx && "bg-gray-100 text-gray-400"
                                )}
                              >
                                {i + 1}
                              </button>
                            );
                          })}
                        </div>

                        {/* Question card */}
                        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 shadow-sm">
                          <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider mb-2">
                            Question {qIdx + 1} / {questions.length}
                          </p>
                          <p className="text-lg font-semibold text-gray-900 leading-relaxed">
                            {question.question_text}
                          </p>
                        </div>

                        {/* Options */}
                        <div className="space-y-3">
                          {question.options.map((opt, oi) => {
                            let optClass = "bg-white border-2 border-gray-200 text-gray-800 hover:border-amber-400 hover:bg-amber-50 hover:shadow-sm";
                            if (selected === oi && !isRevealed) {
                              optClass = "bg-amber-50 border-2 border-amber-400 text-amber-700 font-semibold shadow-sm";
                            }
                            if (isRevealed) {
                              if (oi === correctIdx) {
                                optClass = "bg-green-50 border-2 border-green-400 text-green-800 font-semibold shadow-md scale-[1.02]";
                              } else if (selected === oi && !opt.is_correct) {
                                optClass = "bg-red-50 border-2 border-red-400 text-red-800 line-through opacity-70";
                              } else {
                                optClass = "bg-gray-50 border-2 border-gray-200 text-gray-400";
                              }
                            }

                            return (
                              <button
                                key={oi}
                                onClick={() => !isRevealed && selectAnswer(screen.chapterIdx, qIdx, oi)}
                                disabled={isRevealed}
                                className={cn(
                                  "w-full flex items-center gap-4 px-5 py-4 rounded-xl text-left transition-all duration-300",
                                  optClass,
                                  !isRevealed && "cursor-pointer active:scale-[0.98]"
                                )}
                              >
                                <span className="w-10 h-10 shrink-0 rounded-xl bg-gray-100 flex items-center justify-center font-bold text-sm">
                                  {String.fromCharCode(65 + oi)}
                                </span>
                                <span className="text-base flex-1">{opt.text}</span>
                                {isRevealed && oi === correctIdx && (
                                  <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
                                )}
                                {isRevealed && selected === oi && !opt.is_correct && (
                                  <XCircle className="h-6 w-6 text-red-500 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Explanation */}
                        {isRevealed && question.explanation && (
                          <div className={cn(
                            "rounded-xl p-4 border transition-all duration-500",
                            isCorrect
                              ? "bg-green-50 border-green-200"
                              : "bg-blue-50 border-blue-200"
                          )}>
                            <p className="text-sm font-semibold mb-1">
                              {isCorrect ? "Bravo !" : "Explication"}
                            </p>
                            <p className="text-sm text-gray-700">{question.explanation}</p>
                          </div>
                        )}

                        {/* Action button */}
                        {!isRevealed ? (
                          <Button
                            onClick={() => validateAnswer(screen.chapterIdx, qIdx)}
                            disabled={selected === undefined}
                            className="w-full bg-amber-500 hover:bg-amber-600 text-white py-4 text-base rounded-xl shadow-md"
                          >
                            Valider ma réponse
                          </Button>
                        ) : qIdx < questions.length - 1 ? (
                          <Button
                            onClick={() => setCurrentQuestionIdx((prev) => new Map(prev).set(screen.chapterIdx, qIdx + 1))}
                            className="w-full bg-[#374151] hover:opacity-90 text-white py-4 text-base rounded-xl gap-2 shadow-md"
                          >
                            Question suivante <ArrowRight className="h-5 w-5" />
                          </Button>
                        ) : (
                          <Button
                            onClick={goNext}
                            className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 text-base rounded-xl gap-2 shadow-md"
                          >
                            <CheckCircle2 className="h-5 w-5" /> Voir mes résultats
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-gray-500">Aucune question pour ce chapitre.</p>
                  <Button onClick={goNext} className="mt-4 gap-2 bg-[#374151] text-white">
                    Continuer <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      }

      /* ---- CHAPTER SCORE ---- */
      case "chapter_score": {
        const ch = chapters[screen.chapterIdx];
        const score = chapterScores.get(screen.chapterIdx) || { correct: 0, total: getChapterQuestions(screen.chapterIdx).length };
        const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
        const isPerfect = pct === 100;
        const passed = pct >= 70;

        return (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center bg-gradient-to-br from-gray-50 to-white">
            <div className={cn(
              "w-24 h-24 rounded-3xl flex items-center justify-center mb-6 shadow-xl",
              isPerfect ? "bg-gradient-to-br from-yellow-400 to-amber-500" :
              passed ? "bg-gradient-to-br from-green-400 to-emerald-500" :
              "bg-gradient-to-br from-blue-400 to-[#374151]"
            )}>
              {isPerfect ? <Trophy className="h-12 w-12 text-white" /> :
               passed ? <CheckCircle2 className="h-12 w-12 text-white" /> :
               <Sparkles className="h-12 w-12 text-white" />}
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {isPerfect ? "Parfait !" : passed ? "Bien joué !" : "Continue !"}
            </h2>
            <p className="text-gray-500 mb-8">Chapitre {screen.chapterIdx + 1} — {ch.title}</p>

            <div className="relative w-40 h-40 mb-8">
              <svg className="w-40 h-40 -rotate-90" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="66" fill="none" stroke="#e5e7eb" strokeWidth="16" />
                <circle
                  cx="80" cy="80" r="66"
                  fill="none"
                  stroke={isPerfect ? "#eab308" : passed ? "#22c55e" : "#374151"}
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeDasharray={`${(pct / 100) * 414.69} 414.69`}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-gray-900">{pct}%</span>
                <span className="text-sm text-gray-400">{score.correct}/{score.total}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-8 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl px-6 py-3">
              <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
              <span className="font-semibold text-gray-700">+{score.correct * 10} points gagnés</span>
            </div>

            <Button
              onClick={goNext}
              className="bg-gradient-to-r from-[#374151] to-blue-600 text-white px-10 py-4 text-base gap-3 rounded-2xl shadow-lg"
            >
              {screen.chapterIdx < chapters.length - 1 ? "Chapitre suivant" : "Continuer"}
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        );
      }

      /* ---- FINAL INTRO ---- */
      case "final_intro":
        return (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center bg-gradient-to-br from-amber-50/50 to-orange-50/50">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-8 shadow-2xl">
              <Trophy className="h-12 w-12 text-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Quiz Final
            </h2>
            <p className="text-gray-500 mb-6 max-w-sm">
              Testez vos connaissances sur l&apos;ensemble du cours avec {finalQuestions.length} questions.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-sm mb-8">
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span>Score actuel : <strong>{totalScore} points</strong></span>
              </div>
            </div>
            {finalLoading ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin" /> Chargement des questions...
              </div>
            ) : finalQuestions.length === 0 ? (
              <div className="text-gray-500 text-sm">Aucune question disponible pour ce cours.</div>
            ) : (
              <Button
                onClick={goNext}
                className="bg-gradient-to-r from-amber-400 to-orange-500 text-white px-10 py-4 text-lg gap-2 rounded-2xl shadow-lg"
              >
                Démarrer <ArrowRight className="h-5 w-5" />
              </Button>
            )}
          </div>
        );

      /* ---- FINAL QUESTION ---- */
      case "final_question": {
        const question = finalQuestions[screen.questionIdx];
        if (!question) return null;

        const selected = finalAnswers.get(screen.questionIdx);
        const isRevealed = finalRevealed.has(screen.questionIdx);
        const totalQ = finalQuestions.length;
        const correctIdx = question.options.findIndex((o) => o.is_correct);
        const isCorrect = selected !== undefined && question.options[selected]?.is_correct;
        const isLastQ = screen.questionIdx === totalQ - 1;

        return (
          <div className="flex flex-col h-full px-6 py-8 max-w-2xl mx-auto w-full">
            <div className="flex items-center justify-between mb-5">
              <div className="text-xs font-semibold text-orange-500 uppercase tracking-widest">
                Quiz Final
              </div>
              <div className="text-xs text-gray-400">
                Question {screen.questionIdx + 1} / {totalQ}
              </div>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-6 mb-6 shadow-sm">
              <p className="text-lg font-semibold text-gray-900 leading-relaxed">
                {question.question_text}
              </p>
            </div>

            <div className="space-y-3 flex-1">
              {question.options.map((opt, oi) => {
                let optClass = "bg-white border-2 border-gray-200 text-gray-800 hover:border-orange-400 hover:bg-orange-50";
                if (selected === oi && !isRevealed) {
                  optClass = "bg-orange-50 border-2 border-orange-400 text-orange-700 font-semibold";
                }
                if (isRevealed) {
                  if (oi === correctIdx) {
                    optClass = "bg-green-50 border-2 border-green-400 text-green-800 font-semibold shadow-md scale-[1.02]";
                  } else if (selected === oi && !opt.is_correct) {
                    optClass = "bg-red-50 border-2 border-red-400 text-red-800 line-through opacity-70";
                  } else {
                    optClass = "bg-gray-50 border-2 border-gray-200 text-gray-400";
                  }
                }

                return (
                  <button
                    key={oi}
                    onClick={() => !isRevealed && selectFinalAnswer(screen.questionIdx, oi)}
                    disabled={isRevealed}
                    className={cn(
                      "w-full flex items-center gap-4 px-5 py-4 rounded-xl text-left transition-all duration-300",
                      optClass,
                      !isRevealed && "cursor-pointer active:scale-[0.98]"
                    )}
                  >
                    <span className="w-10 h-10 shrink-0 rounded-xl bg-gray-100 flex items-center justify-center font-bold text-sm">
                      {String.fromCharCode(65 + oi)}
                    </span>
                    <span className="text-base flex-1">{opt.text}</span>
                    {isRevealed && oi === correctIdx && <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />}
                    {isRevealed && selected === oi && !opt.is_correct && <XCircle className="h-6 w-6 text-red-500 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {isRevealed && question.explanation && (
              <div className={cn(
                "mt-4 rounded-xl p-4 border",
                isCorrect ? "bg-green-50 border-green-200" : "bg-blue-50 border-blue-200"
              )}>
                <p className="text-sm text-gray-700">{question.explanation}</p>
              </div>
            )}

            {!isRevealed ? (
              <Button
                onClick={() => validateFinalAnswer(screen.questionIdx)}
                disabled={selected === undefined}
                className="mt-4 w-full bg-orange-500 hover:bg-orange-600 text-white py-4 text-base rounded-xl shadow-md"
              >
                Valider
              </Button>
            ) : isLastQ ? (
              <Button
                onClick={submitFinalExam}
                disabled={finalSubmitting}
                className="mt-4 w-full bg-gradient-to-r from-amber-400 to-orange-500 text-white py-4 text-base rounded-xl gap-2 shadow-md"
              >
                {finalSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trophy className="h-5 w-5" />}
                {finalSubmitting ? "Envoi..." : "Voir les résultats"}
              </Button>
            ) : (
              <Button
                onClick={goNext}
                className="mt-4 w-full bg-orange-500 hover:bg-orange-600 text-white py-4 text-base rounded-xl gap-2 shadow-md"
              >
                {isCorrect ? "Bravo ! Suivant" : "Suivant"} <ArrowRight className="h-5 w-5" />
              </Button>
            )}
          </div>
        );
      }

      /* ---- FINAL SCORE ---- */
      case "final_score": {
        const score = finalScore || { correct: 0, total: finalQuestions.length };
        const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
        const passingScore = course.final_exam_passing_score || 70;
        const passed = pct >= passingScore;
        const totalPoints = totalScore;

        return (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center bg-gradient-to-br from-gray-50 to-white">
            <div className={cn(
              "w-28 h-28 rounded-3xl flex items-center justify-center mb-6 shadow-2xl",
              passed ? "bg-gradient-to-br from-yellow-400 to-amber-500" : "bg-gradient-to-br from-blue-400 to-[#374151]"
            )}>
              <Trophy className="h-14 w-14 text-white" />
            </div>

            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {passed ? "Félicitations !" : "Continuez vos efforts !"}
            </h2>
            <p className="text-gray-500 mb-8">
              {passed ? "Vous avez réussi le cours !" : `Score minimum requis : ${passingScore}%`}
            </p>

            <div className="relative w-44 h-44 mb-8">
              <svg className="w-44 h-44 -rotate-90" viewBox="0 0 176 176">
                <circle cx="88" cy="88" r="72" fill="none" stroke="#e5e7eb" strokeWidth="16" />
                <circle
                  cx="88" cy="88" r="72"
                  fill="none"
                  stroke={passed ? "#22c55e" : "#f59e0b"}
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeDasharray={`${(pct / 100) * 452.39} 452.39`}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-gray-900">{pct}%</span>
                <span className="text-sm text-gray-400">{score.correct}/{score.total}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 w-full max-w-md">
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl px-6 py-5 shadow-sm text-center">
                <div className="flex items-center gap-2 justify-center">
                  <Zap className="h-6 w-6 text-amber-500" />
                  <span className="text-2xl font-bold text-gray-900">{totalPoints} pts</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Score cette session</p>
              </div>

              {bestScore && (
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl px-6 py-5 shadow-sm text-center">
                  <div className="flex items-center gap-2 justify-center">
                    <Star className="h-6 w-6 text-purple-500" />
                    <span className="text-2xl font-bold text-gray-900">{bestScore.best_score} pts</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Meilleur score • {bestScore.attempts} tentative{bestScore.attempts > 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </div>

            {bestScore && totalPoints >= bestScore.best_score && totalPoints > 0 && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-300 rounded-xl px-6 py-3 mb-6 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-green-600" />
                <span className="text-sm font-semibold text-green-700">Nouveau record personnel !</span>
              </div>
            )}

            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  setCurrentIdx(0);
                  setQuizAnswers(new Map());
                  setQuizRevealed(new Map());
                  setChapterScores(new Map());
                  setFinalAnswers(new Map());
                  setFinalRevealed(new Set());
                  setFinalScore(null);
                  setFlippedCards(new Set());
                  setCurrentQuestionIdx(new Map());
                }}
                className="gap-2 px-6 py-3 rounded-xl"
              >
                <RotateCcw className="h-4 w-4" /> Recommencer
              </Button>
              <Link href="/learner">
                <Button className="bg-gradient-to-r from-[#374151] to-blue-600 text-white hover:opacity-90 gap-2 px-6 py-3 rounded-xl">
                  <ArrowLeft className="h-4 w-4" /> Mes cours
                </Button>
              </Link>
            </div>
          </div>
        );
      }

      /* ---- COURSE COMPLETE (presentation-only) ---- */
      case "course_complete":
        return (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center bg-gradient-to-br from-gray-50 to-white">
            <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-6 shadow-2xl">
              <CheckCircle2 className="h-14 w-14 text-white" />
            </div>

            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Cours terminé !
            </h2>
            <p className="text-gray-500 mb-8 max-w-md">
              Vous avez parcouru l&apos;ensemble des {chapters.length} chapitre{chapters.length > 1 ? "s" : ""} de ce cours. Bravo !
            </p>

            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  setCurrentIdx(0);
                  setFlippedCards(new Set());
                }}
                className="gap-2 px-6 py-3 rounded-xl"
              >
                <RotateCcw className="h-4 w-4" /> Recommencer
              </Button>
              <Link href="/learner">
                <Button className="bg-gradient-to-r from-[#374151] to-blue-600 text-white hover:opacity-90 gap-2 px-6 py-3 rounded-xl">
                  <ArrowLeft className="h-4 w-4" /> Mes cours
                </Button>
              </Link>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Chapter navigation helper                                         */
  /* ---------------------------------------------------------------- */
  function goToChapter(chapterIdx: number) {
    // Find the gamma_chapter screen for this chapter
    const targetIdx = screens.findIndex(
      (s) => s.type === "gamma_chapter" && "chapterIdx" in s && s.chapterIdx === chapterIdx
    );
    if (targetIdx >= 0) {
      setCurrentIdx(targetIdx);
      setShowChapterNav(false);
    }
  }

  // Determine which chapter we're currently on
  function getCurrentChapterIdx(): number {
    if (!currentScreen) return -1;
    if ("chapterIdx" in currentScreen) return currentScreen.chapterIdx;
    return -1;
  }

  /* ---------------------------------------------------------------- */
  /*  Layout                                                            */
  /* ---------------------------------------------------------------- */
  const isGammaScreen = currentScreen?.type === "gamma_chapter";
  const isQuizScreen = currentScreen?.type === "quiz" || currentScreen?.type === "final_question";
  const isFlashcardsScreen = currentScreen?.type === "flashcards";
  const hideBottomNav = isGammaScreen || isQuizScreen || isFlashcardsScreen ||
    currentScreen?.type === "cover" || currentScreen?.type === "final_score" || currentScreen?.type === "course_complete";

  const currentChapterIdx = getCurrentChapterIdx();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Animations */}
      <ConfettiEffect show={showConfetti} />
      <ScorePopup points={popupPoints} show={showScorePopup} />

      {/* Chapter navigation drawer */}
      {showChapterNav && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowChapterNav(false)} />
          <div className="fixed left-0 top-0 bottom-0 w-72 bg-white shadow-2xl z-50 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Chapitres</p>
              <button onClick={() => setShowChapterNav(false)} className="text-gray-400 hover:text-gray-600">
                <ArrowLeft className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {chapters.map((ch, ci) => {
                const isActive = currentChapterIdx === ci;
                const chScore = chapterScores.get(ci);
                const isDone = chScore && chScore.total > 0;
                return (
                  <button
                    key={ch.id}
                    onClick={() => goToChapter(ci)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                      isActive ? "bg-[#374151]/10 border-l-2 border-[#374151]" : "hover:bg-gray-50 border-l-2 border-transparent"
                    )}
                  >
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                      isDone ? "bg-green-100 text-green-700" :
                      isActive ? "bg-[#374151] text-white" :
                      "bg-gray-100 text-gray-500"
                    )}>
                      {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : ci + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-sm truncate",
                        isActive ? "font-semibold text-gray-900" : "text-gray-600"
                      )}>
                        {ch.title}
                      </p>
                      <p className="text-[10px] text-gray-400">{ch.estimated_duration_minutes} min</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 shrink-0 z-10">
        <Link href="/learner" className="text-gray-400 hover:text-gray-600 transition">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <button
          onClick={() => setShowChapterNav(true)}
          className="flex items-center gap-1 text-gray-400 hover:text-[#374151] transition"
          title="Navigation des chapitres"
        >
          <BookOpen className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{course.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex-1 bg-gray-200 rounded-full h-1.5 max-w-xs">
              <div
                className="bg-gradient-to-r from-[#374151] to-blue-600 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 shrink-0">
              {currentIdx + 1} / {screens.length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 shrink-0">
          <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
          <span className="text-xs font-bold text-amber-700">{totalScore}</span>
        </div>
      </div>

      {/* Screen area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className={cn(
            "min-h-full flex flex-col",
            isGammaScreen ? "w-full" : "max-w-4xl mx-auto w-full px-4 py-4"
          )}>
            <div className={cn(
              "flex-1 bg-white overflow-hidden flex flex-col",
              isGammaScreen ? "min-h-[600px]" : "rounded-2xl shadow-sm border border-gray-200 min-h-[500px]"
            )}>
              {currentScreen && renderScreen(currentScreen)}
            </div>
          </div>
        </div>

        {/* Bottom navigation */}
        {!hideBottomNav && (
          <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
            <Button
              variant="outline"
              onClick={goPrev}
              disabled={currentIdx <= 0}
              className="gap-2 rounded-xl"
            >
              <ArrowLeft className="h-4 w-4" /> Précédent
            </Button>
            {currentIdx < screens.length - 1 && (
              <Button
                onClick={goNext}
                className="gap-2 bg-[#374151] text-white hover:opacity-90 rounded-xl"
              >
                Suivant <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
