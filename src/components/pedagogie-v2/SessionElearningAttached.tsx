"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Loader2, GraduationCap, Play, CheckCircle, Lock } from "lucide-react";

/**
 * Pédagogie V2 Epic 4 mini — Liste des e-learning attachés à une session
 * (côté espace apprenant).
 *
 * Affiche les e-learning que l'admin a attaché à cette session via :
 * - Le snapshot programme→session (Epic 2)
 * - L'ajout manuel sur la fiche session (à venir Epic 3.5 v2)
 *
 * Pour chaque e-learning, montre l'état d'avancement du LEARNER courant
 * (via elearning_enrollments) :
 * - Pas inscrit : grisé "Non disponible"
 * - Inscrit, pas démarré : "Commencer"
 * - En cours : pourcentage + "Continuer"
 * - Terminé : "Terminé ✓"
 *
 * Le composant masque automatiquement la section si aucun e-learning n'est
 * attaché à la session (rendu vide → return null).
 *
 * Spec : bmad_output/planning-artifacts/spec-restructuration-pedagogique-2026-06-04.md
 * Pré-requis : flag NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_4 ON.
 */

interface SessionElearningAttachedProps {
  sessionId: string;
  learnerId: string;
}

interface AttachedRow {
  id: string;
  elearning_course_id: string;
  order_index: number;
  is_mandatory_before_session: boolean;
  elearning_courses: { id: string; title: string; estimated_duration_minutes: number | null } | null;
}

interface EnrollmentRow {
  course_id: string;
  status: string;
  completion_rate: number | null;
}

export default function SessionElearningAttached({ sessionId, learnerId }: SessionElearningAttachedProps) {
  const supabase = createClient();
  const [attached, setAttached] = useState<AttachedRow[]>([]);
  const [enrollments, setEnrollments] = useState<Map<string, EnrollmentRow>>(new Map());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rows } = await supabase
        .from("session_elearning_courses")
        .select(
          "id, elearning_course_id, order_index, is_mandatory_before_session, elearning_courses(id, title, estimated_duration_minutes)",
        )
        .eq("session_id", sessionId)
        .order("order_index", { ascending: true });

      const list = ((rows ?? []) as unknown as AttachedRow[]);
      setAttached(list);

      if (list.length > 0) {
        const courseIds = list.map((r) => r.elearning_course_id);
        const { data: enrs } = await supabase
          .from("elearning_enrollments")
          .select("course_id, status, completion_rate")
          .eq("learner_id", learnerId)
          .in("course_id", courseIds);
        const map = new Map<string, EnrollmentRow>();
        for (const e of (enrs ?? []) as EnrollmentRow[]) {
          map.set(e.course_id, e);
        }
        setEnrollments(map);
      } else {
        setEnrollments(new Map());
      }
    } catch (err) {
      console.error("[SessionElearningAttached] fetch error", err);
    } finally {
      setLoading(false);
    }
  }, [sessionId, learnerId, supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Chargement des modules e-learning…
      </div>
    );
  }

  if (attached.length === 0) {
    return null; // Pas d'e-learning attaché → on n'affiche rien
  }

  return (
    <div className="mt-4 border-t pt-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <GraduationCap className="h-4 w-4 text-purple-600" />
        Modules e-learning de cette formation ({attached.length})
      </div>
      <ul className="space-y-2">
        {attached.map((row) => {
          const enrollment = enrollments.get(row.elearning_course_id);
          const title = row.elearning_courses?.title ?? "Module e-learning";
          const duration = row.elearning_courses?.estimated_duration_minutes;
          const status = enrollment?.status;
          const completion = enrollment?.completion_rate ?? 0;
          const isEnrolled = Boolean(enrollment);
          const isCompleted = status === "completed";
          const isInProgress = status === "in_progress" || (status === "enrolled" && completion > 0);

          const stateLabel = !isEnrolled
            ? { icon: Lock, text: "Non disponible", color: "text-gray-400" }
            : isCompleted
              ? { icon: CheckCircle, text: "Terminé", color: "text-green-600" }
              : isInProgress
                ? { icon: Play, text: `Continuer (${completion}%)`, color: "text-blue-600" }
                : { icon: Play, text: "Commencer", color: "text-purple-600" };

          const Icon = stateLabel.icon;
          const targetHref = isEnrolled ? `/learner/courses/${row.elearning_course_id}` : undefined;

          const content = (
            <div
              className={`flex items-center justify-between gap-2 rounded-md border p-3 transition ${
                isEnrolled ? "hover:border-purple-300 hover:bg-purple-50/50 cursor-pointer" : "opacity-60"
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {row.is_mandatory_before_session && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      À voir avant le présentiel
                    </span>
                  )}
                  {title}
                </div>
                {duration && (
                  <div className="text-xs text-gray-500 mt-1">Durée estimée : {duration} min</div>
                )}
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${stateLabel.color}`}>
                <Icon className="h-4 w-4" />
                {stateLabel.text}
              </div>
            </div>
          );

          return (
            <li key={row.id}>
              {targetHref ? <Link href={targetHref}>{content}</Link> : content}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
