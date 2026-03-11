"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenerationProgressEvent } from "@/lib/types/elearning";

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

  // Build initial steps based on course type
  const buildInitialSteps = (): StepInfo[] => {
    const base: StepInfo[] = [
      { label: "Extraction du texte", status: "done" },
      { label: "Analyse du document", status: "active" },
      { label: "Structuration des chapitres + enrichissement", status: "pending" },
    ];
    if (courseType !== "presentation") {
      base.push({ label: "Quiz interactifs & flashcards par chapitre", status: "pending" });
    }
    if (courseType !== "quiz") {
      base.push({ label: "Présentations Gamma par chapitre", status: "pending" });
    }
    if (courseType !== "presentation") {
      base.push({ label: "Examen final (banque de questions)", status: "pending" });
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

    async function startGeneration() {
      try {
        const response = await fetch(`/api/elearning/${courseId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
        });

        if (!response.body) {
          onError("Pas de flux de réponse");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split("\n\n").filter(Boolean);

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event: GenerationProgressEvent = JSON.parse(line.slice(6));

              setProgress(event.progress);
              if (event.message) setCurrentMessage(event.message);

              if (event.step === "error") {
                onError(event.message || "Erreur de génération");
                return;
              }

              if (event.step === "complete") {
                setSteps((prev) =>
                  prev.map((s) => ({ ...s, status: "done" as const }))
                );
                setProgress(100);
                setCurrentMessage("Cours généré avec succès !");
                setTimeout(() => onComplete(), 1500);
                return;
              }

              // Update steps based on event (find step by label prefix, not hard-coded index)
              setSteps((prev) => {
                const updated = [...prev];
                const findStep = (keyword: string) => updated.findIndex((s) => s.label.toLowerCase().includes(keyword));
                const analyzeIdx = findStep("analyse");
                const chaptersIdx = findStep("structuration");
                const quizIdx = findStep("quiz interactifs");
                const gammaIdx = findStep("gamma");
                const finalIdx = findStep("examen final");

                if (event.step === "analyzing" || event.step === "outline_done") {
                  if (analyzeIdx >= 0) {
                    updated[analyzeIdx] = { ...updated[analyzeIdx], status: event.step === "outline_done" ? "done" : "active", message: event.message };
                  }
                  if (event.step === "outline_done" && chaptersIdx >= 0) {
                    updated[chaptersIdx] = { ...updated[chaptersIdx], status: "active" };
                  }
                }
                else if (event.step.startsWith("chapter_")) {
                  if (chaptersIdx >= 0) updated[chaptersIdx] = { ...updated[chaptersIdx], status: "active", message: event.message };
                }
                else if (event.step === "quizzes" || event.step === "quizzes_done" || event.step === "quizzes_skipped") {
                  if (chaptersIdx >= 0) updated[chaptersIdx] = { ...updated[chaptersIdx], status: "done" };
                  if (quizIdx >= 0) {
                    updated[quizIdx] = {
                      ...updated[quizIdx],
                      status: event.step === "quizzes" ? "active" : "done",
                      message: event.message,
                    };
                  }
                }
                else if (event.step.startsWith("gamma")) {
                  // Mark previous step done
                  if (quizIdx >= 0) updated[quizIdx] = { ...updated[quizIdx], status: "done" };
                  else if (chaptersIdx >= 0) updated[chaptersIdx] = { ...updated[chaptersIdx], status: "done" };
                  if (gammaIdx >= 0) {
                    updated[gammaIdx] = {
                      ...updated[gammaIdx],
                      status: event.step === "gamma_done" || event.step === "gamma_skipped" ? "done" : "active",
                      message: event.message,
                    };
                  }
                }
                else if (event.step.startsWith("final_exam")) {
                  // Mark previous step done
                  if (gammaIdx >= 0) updated[gammaIdx] = { ...updated[gammaIdx], status: "done" };
                  else if (quizIdx >= 0) updated[quizIdx] = { ...updated[quizIdx], status: "done" };
                  else if (chaptersIdx >= 0) updated[chaptersIdx] = { ...updated[chaptersIdx], status: "done" };
                  if (finalIdx >= 0) {
                    updated[finalIdx] = {
                      ...updated[finalIdx],
                      status: event.step === "final_exam_done" || event.step === "final_exam_skipped" ? "done" : "active",
                      message: event.message,
                    };
                  }
                }
                return updated;
              });
            } catch {
              // ignore parse errors
            }
          }
        }
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
