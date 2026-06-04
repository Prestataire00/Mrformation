"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Phase B.2 fix 504 : orchestre les 3 routes split au lieu du SSE
 * monolithique qui timeoutait Netlify Functions.
 *
 *   1. POST /generate/outline → chapter_ids[]
 *   2. POST /generate/chapter { chapter_id } × N (en série)
 *   3. POST /generate/quiz
 *
 * Chaque appel reste sous timeout (60s par route via maxDuration, mais
 * réellement 3-15s). Examen final + Gamma sont temporairement skippés
 * (Phase A.2 + B.3 à venir).
 */

interface GenerationProgressProps {
  courseId: string;
  courseType?: "presentation" | "quiz" | "complete";
  onComplete: () => void;
  onError: (message: string) => void;
}

interface StepInfo {
  label: string;
  status: "pending" | "active" | "done" | "error";
  message?: string;
}

export default function GenerationProgress({
  courseId,
  courseType = "complete",
  onComplete,
  onError,
}: GenerationProgressProps) {
  const [progress, setProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState("Initialisation...");

  // Phase B.2 : steps reflètent le pipeline split (3 appels courts au lieu
  // du SSE monolithique). Gamma + examen final sont marqués "à venir".
  const buildInitialSteps = (): StepInfo[] => {
    const base: StepInfo[] = [
      { label: "Extraction du texte", status: "done" },
      { label: "Plan du cours", status: "active" },
      { label: "Génération des chapitres", status: "pending" },
    ];
    if (courseType !== "presentation") {
      base.push({ label: "Quiz interactifs & flashcards", status: "pending" });
    }
    if (courseType !== "quiz") {
      base.push({ label: "Présentations Gamma (non disponible — fix 504)", status: "pending" });
    }
    if (courseType !== "presentation") {
      base.push({ label: "Examen final (non disponible — fix 504)", status: "pending" });
    }
    return base;
  };

  const [steps, setSteps] = useState<StepInfo[]>(buildInitialSteps());
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isRunning) return;
    setIsRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    function patchStep(label: string, patch: Partial<StepInfo>) {
      setSteps((prev) =>
        prev.map((s) => (s.label.toLowerCase().includes(label.toLowerCase()) ? { ...s, ...patch } : s)),
      );
    }

    async function startGeneration() {
      try {
        // 1. Outline (3-8s)
        setCurrentMessage("Génération du plan…");
        setProgress(5);
        patchStep("plan", { status: "active", message: "Analyse du document…" });

        const outRes = await fetch(`/api/elearning/${courseId}/generate/outline`, {
          method: "POST",
          signal: controller.signal,
        });
        const outBody = await outRes.json().catch(() => ({}));
        if (!outRes.ok || !outBody.ok) {
          throw new Error(outBody.error || `Plan échoué (${outRes.status})`);
        }
        const chapterIds: string[] = outBody.chapter_ids ?? [];
        if (chapterIds.length === 0) {
          throw new Error("Aucun chapitre planifié par l'IA");
        }
        patchStep("plan", { status: "done", message: `${chapterIds.length} chapitres planifiés` });
        patchStep("chapitres", { status: "active" });
        setProgress(15);

        // 2. Chapitres en série (5-12s × N)
        for (let i = 0; i < chapterIds.length; i++) {
          const pct = 15 + Math.round(((i + 1) / chapterIds.length) * 60);
          setCurrentMessage(`Chapitre ${i + 1}/${chapterIds.length}…`);
          patchStep("chapitres", { status: "active", message: `Chapitre ${i + 1}/${chapterIds.length}…` });

          const chRes = await fetch(`/api/elearning/${courseId}/generate/chapter`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chapter_id: chapterIds[i] }),
            signal: controller.signal,
          });
          const chBody = await chRes.json().catch(() => ({}));
          if (!chRes.ok || !chBody.ok) {
            throw new Error(chBody.error || `Chapitre ${i + 1} échoué (${chRes.status})`);
          }
          setProgress(pct);
        }
        patchStep("chapitres", { status: "done", message: `${chapterIds.length} chapitres générés` });

        // 3. Quiz + flashcards (8-15s) — si applicable
        if (courseType !== "presentation") {
          setCurrentMessage("Génération des quiz et flashcards…");
          patchStep("quiz interactifs", { status: "active" });
          setProgress(80);

          const qRes = await fetch(`/api/elearning/${courseId}/generate/quiz`, {
            method: "POST",
            signal: controller.signal,
          });
          const qBody = await qRes.json().catch(() => ({}));
          if (!qRes.ok || !qBody.ok) {
            throw new Error(qBody.error || `Quiz échoué (${qRes.status})`);
          }
          patchStep("quiz interactifs", {
            status: "done",
            message: `${qBody.quiz_count ?? 0} questions, ${qBody.flashcards_count ?? 0} flashcards`,
          });
        }

        setProgress(100);
        setCurrentMessage("Cours généré ! (Examen final + Gamma à compléter manuellement pour l'instant)");
        setTimeout(() => onComplete(), 1500);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          onError((err as Error).message || "Erreur de connexion");
        }
      }
    }

    startGeneration();

    return () => {
      controller.abort();
    };
  }, [courseId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-700">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">Génération IA en cours</span>
        </div>
        <p className="text-sm text-gray-500">{currentMessage}</p>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Progression</span>
          <span>{progress}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg transition-all duration-300",
              step.status === "active" && "bg-purple-50 border border-purple-200",
              step.status === "done" && "bg-green-50/50",
              step.status === "error" && "bg-red-50 border border-red-200",
              step.status === "pending" && "opacity-50"
            )}
          >
            <div className="mt-0.5">
              {step.status === "done" ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : step.status === "active" ? (
                <Loader2 className="h-5 w-5 text-purple-500 animate-spin" />
              ) : step.status === "error" ? (
                <AlertCircle className="h-5 w-5 text-red-500" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
              )}
            </div>
            <div>
              <p
                className={cn(
                  "text-sm font-medium",
                  step.status === "done" && "text-green-700",
                  step.status === "active" && "text-purple-700",
                  step.status === "error" && "text-red-700",
                  step.status === "pending" && "text-gray-500"
                )}
              >
                {step.label}
              </p>
              {step.message && (
                <p className="text-xs text-gray-500 mt-0.5">{step.message}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
