"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, GraduationCap, CheckCircle2, Circle, Hourglass } from "lucide-react";

/**
 * Pédagogie V2 Epic 5 mini — Visibilité multi-acteurs : avancement
 * e-learning de la cohorte d'une session.
 *
 * Pour une session donnée, affiche une matrice :
 *   Apprenant × Module e-learning attaché → état d'avancement.
 *
 * Utilisable côté formateur (sur sa liste de sessions) et admin (sur la
 * fiche formation, future intégration).
 *
 * Spec : bmad_output/planning-artifacts/spec-restructuration-pedagogique-2026-06-04.md
 * Pré-requis : flag NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_5 ON.
 */

interface CohortElearningProgressProps {
  sessionId: string;
}

interface SessionElearningRow {
  elearning_course_id: string;
  order_index: number;
  elearning_courses: { id: string; title: string } | null;
}

interface EnrollmentRow {
  id: string;
  learner_id: string;
  learners: { id: string; first_name: string; last_name: string } | null;
}

interface ElearningEnrollmentRow {
  learner_id: string;
  course_id: string;
  status: string;
  completion_rate: number | null;
}

export default function CohortElearningProgress({ sessionId }: CohortElearningProgressProps) {
  const supabase = createClient();
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [learners, setLearners] = useState<{ id: string; name: string }[]>([]);
  const [progressMap, setProgressMap] = useState<Map<string, ElearningEnrollmentRow>>(new Map());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // 1. E-learning attachés à la session.
      const { data: sec } = await supabase
        .from("session_elearning_courses")
        .select("elearning_course_id, order_index, elearning_courses(id, title)")
        .eq("session_id", sessionId)
        .order("order_index", { ascending: true });
      const secList = (sec ?? []) as unknown as SessionElearningRow[];
      const courseList = secList
        .map((r) => r.elearning_courses)
        .filter((c): c is { id: string; title: string } => c !== null);
      setCourses(courseList);

      // 2. Apprenants inscrits à la session.
      const { data: enrs } = await supabase
        .from("enrollments")
        .select("id, learner_id, learners(id, first_name, last_name)")
        .eq("session_id", sessionId);
      const enrList = (enrs ?? []) as unknown as EnrollmentRow[];
      const learnerList = enrList
        .map((e) => e.learners)
        .filter((l): l is { id: string; first_name: string; last_name: string } => l !== null)
        .map((l) => ({ id: l.id, name: `${l.first_name} ${l.last_name}` }));
      setLearners(learnerList);

      // 3. État elearning_enrollments pour ces apprenants × ces cours.
      if (courseList.length > 0 && learnerList.length > 0) {
        const courseIds = courseList.map((c) => c.id);
        const learnerIds = learnerList.map((l) => l.id);
        const { data: eeRows } = await supabase
          .from("elearning_enrollments")
          .select("learner_id, course_id, status, completion_rate")
          .in("learner_id", learnerIds)
          .in("course_id", courseIds);
        const map = new Map<string, ElearningEnrollmentRow>();
        for (const row of (eeRows ?? []) as ElearningEnrollmentRow[]) {
          map.set(`${row.learner_id}|${row.course_id}`, row);
        }
        setProgressMap(map);
      } else {
        setProgressMap(new Map());
      }
    } catch (err) {
      console.error("[CohortElearningProgress] fetch error", err);
    } finally {
      setLoading(false);
    }
  }, [sessionId, supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement de l'avancement…
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic py-3">
        Aucun module e-learning attaché à cette session.
      </div>
    );
  }

  if (learners.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic py-3">
        Aucun apprenant inscrit à cette session.
      </div>
    );
  }

  function renderCell(learnerId: string, courseId: string) {
    const row = progressMap.get(`${learnerId}|${courseId}`);
    if (!row) {
      return (
        <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
          <Circle className="h-3 w-3" />
          Non inscrit
        </span>
      );
    }
    if (row.status === "completed") {
      return (
        <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
          <CheckCircle2 className="h-3 w-3" />
          Terminé
        </span>
      );
    }
    if (row.status === "in_progress" || (row.status === "enrolled" && (row.completion_rate ?? 0) > 0)) {
      return (
        <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-medium">
          <Hourglass className="h-3 w-3" />
          {row.completion_rate ?? 0}%
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-gray-500 text-xs">
        <Circle className="h-3 w-3" />
        À faire
      </span>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <GraduationCap className="h-4 w-4 text-purple-600" />
        Avancement e-learning de la cohorte ({learners.length} apprenant{learners.length > 1 ? "s" : ""},{" "}
        {courses.length} module{courses.length > 1 ? "s" : ""})
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-700">Apprenant</th>
              {courses.map((c) => (
                <th key={c.id} className="text-left px-3 py-2 font-medium text-gray-700 whitespace-nowrap">
                  {c.title.length > 30 ? `${c.title.slice(0, 30)}…` : c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {learners.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-3 py-2 font-medium text-gray-900">{l.name}</td>
                {courses.map((c) => (
                  <td key={c.id} className="px-3 py-2">
                    {renderCell(l.id, c.id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
