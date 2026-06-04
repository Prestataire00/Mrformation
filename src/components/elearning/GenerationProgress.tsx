"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pipeline e-learning en mode Netlify Background Function (fix 504 définitif).
 *
 *   1. POST /api/elearning/[id]/generate/start (route Next.js, <2s)
 *      → trigger /.netlify/functions/elearning-generate-pipeline-background
 *      → status="queued", 202 immédiat
 *
 *   2. Poll GET /api/elearning/[id]?shallow=true toutes les 3s
 *      → lit generation_progress (step + percent + message)
 *      → lit generation_status (completed | failed)
 *
 *   3. status === "completed" → onComplete()
 *      status === "failed"    → onError(progress.error)
 *
 * Avantages vs orchestration côté client :
 * - L'admin peut quitter la page, la génération continue
 * - Pas de timeout client (chaque poll est instantané)
 * - Pipeline complet : outline + chapters + quiz + exam + gamma (15min max)
 */

interface GenerationProgressProps {
  courseId: string;
  courseType?: "presentation" | "quiz" | "complete";
  onComplete: () => void;
  onError: (message: string) => void;
}

type StepKey = "outline" | "chapters" | "quiz" | "exam" | "gamma" | "done" | "failed" | "queued";

interface ProgressState {
  step: StepKey;
  current?: number;
  total?: number;
  percent: number;
  message: string;
  error?: string | null;
}

interface StepInfo {
  key: StepKey;
  label: string;
  status: "pending" | "active" | "done" | "error";
  message?: string;
}

const POLL_INTERVAL_MS = 3000;

function buildSteps(courseType: "presentation" | "quiz" | "complete"): StepInfo[] {
  const list: StepInfo[] = [
    { key: "outline", label: "Plan du cours", status: "pending" },
    { key: "chapters", label: "Génération des chapitres", status: "pending" },
  ];
  if (courseType !== "presentation") {
    list.push({ key: "quiz", label: "Quiz interactifs & flashcards", status: "pending" });
    list.push({ key: "exam", label: "Examen final", status: "pending" });
  }
  if (courseType !== "quiz") {
    list.push({ key: "gamma", label: "Présentations Gamma", status: "pending" });
  }
  return list;
}

const STEP_ORDER: StepKey[] = ["outline", "chapters", "quiz", "exam", "gamma"];

export default function GenerationProgress({
  courseId,
  courseType = "complete",
  onComplete,
  onError,
}: GenerationProgressProps) {
  const [progress, setProgress] = useState<ProgressState>({
    step: "queued",
    percent: 0,
    message: "Initialisation…",
  });
  const [steps, setSteps] = useState<StepInfo[]>(() => buildSteps(courseType));
  const startedRef = useRef(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    function stepStatusFor(target: StepKey, current: StepKey): "pending" | "active" | "done" | "error" {
      if (current === "failed") {
        return target === target ? "error" : "pending";
      }
      const targetIdx = STEP_ORDER.indexOf(target);
      const currentIdx = STEP_ORDER.indexOf(current);
      if (targetIdx === -1 || currentIdx === -1) return "pending";
      if (currentIdx > targetIdx) return "done";
      if (currentIdx === targetIdx) return "active";
      return "pending";
    }

    function applyProgress(p: ProgressState) {
      setProgress(p);
      setSteps((prev) =>
        prev.map((s) => {
          if (p.step === "done") return { ...s, status: "done" };
          if (p.step === "failed") {
            // L'étape qui a échoué = celle avec error
            // Marque les précédentes done, l'actuelle error, les suivantes pending
            return { ...s, status: "error", message: p.error ?? s.message };
          }
          const newStatus = stepStatusFor(s.key, p.step);
          const message = newStatus === "active" ? p.message : s.message;
          return { ...s, status: newStatus, message };
        }),
      );
    }

    async function pollOnce(): Promise<boolean> {
      try {
        const res = await fetch(`/api/elearning/${courseId}?shallow=true`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Polling échoué (${res.status})`);
        const body = (await res.json()) as { data?: { generation_status?: string; generation_progress?: ProgressState } };
        const status = body.data?.generation_status;
        const p = body.data?.generation_progress;
        if (p && typeof p === "object" && "step" in p) {
          applyProgress(p);
        }
        if (status === "completed") {
          if (!finishedRef.current) {
            finishedRef.current = true;
            setTimeout(() => !cancelled && onComplete(), 800);
          }
          return true;
        }
        if (status === "failed") {
          if (!finishedRef.current) {
            finishedRef.current = true;
            const msg = p?.error || p?.message || "Erreur de génération";
            onError(msg);
          }
          return true;
        }
        return false;
      } catch (err) {
        // Échec transitoire : on continue à poller. Si vraiment cassé, le
        // timeout sera infini — l'admin peut fermer la modale.
        console.warn("[GenerationProgress] poll error", err);
        return false;
      }
    }

    function scheduleNextPoll() {
      if (cancelled || finishedRef.current) return;
      pollTimer = setTimeout(async () => {
        const done = await pollOnce();
        if (!done) scheduleNextPoll();
      }, POLL_INTERVAL_MS);
    }

    async function kickoff() {
      try {
        const res = await fetch(`/api/elearning/${courseId}/generate/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ course_type: courseType }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `Démarrage échoué (${res.status})`);
        }
        // Premier poll immédiat pour avoir un état frais, puis cadence 3s.
        const done = await pollOnce();
        if (!done) scheduleNextPoll();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur de démarrage";
        if (!finishedRef.current) {
          finishedRef.current = true;
          onError(msg);
        }
      }
    }

    kickoff();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [courseId, courseType, onComplete, onError]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-700">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">Génération IA en cours</span>
        </div>
        <p className="text-sm text-gray-500">{progress.message}</p>
        <p className="text-xs text-gray-400">Le pipeline tourne en arrière-plan. Tu peux fermer cette page, la génération continue.</p>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Progression</span>
          <span>{progress.percent}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
            style={{ width: `${progress.percent}%` }}
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
              step.status === "pending" && "opacity-50",
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
                  step.status === "pending" && "text-gray-500",
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
