"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Clock,
  Loader2,
  Calendar,
  MapPin,
  Monitor,
  CheckCircle,
  GraduationCap,
  Play,
  AlertCircle,
  PenLine,
} from "lucide-react";

interface EnrolledSession {
  id: string;
  session_id: string;
  status: string;
  enrolled_at: string;
  session: {
    id: string;
    title: string;
    start_date: string;
    end_date: string;
    location: string | null;
    mode: string;
    status: string;
    training_id: string | null;
    training: { id: string; title: string; description: string | null; duration_hours: number | null; certification: string | null; category: string | null } | null;
  };
}

interface ElearningAssignment {
  id: string;
  course_id: string;
  session_id: string;
  is_completed: boolean;
  start_date: string | null;
  end_date: string | null;
  elearning_courses: {
    id: string;
    title: string;
    description: string | null;
    estimated_duration_minutes: number;
    elearning_chapters: { id: string }[];
  } | null;
  sessions: {
    title: string;
    training_id: string | null;
  } | null;
}

interface TrainingGroup {
  training_id: string;
  title: string;
  description: string | null;
  duration_hours: number | null;
  certification: string | null;
  category: string | null;
  sessions: {
    id: string;
    enrollment_id: string;
    title: string;
    start_date: string;
    end_date: string;
    location: string | null;
    mode: string;
    status: string;
    enrollment_status: string;
  }[];
  elearning_assignments: ElearningAssignment[];
}

interface ProgramEnrollmentData {
  id: string;
  program_id: string;
  status: string;
  completion_rate: number;
  enrolled_at: string;
  program: {
    id: string;
    title: string;
    description: string | null;
    content: { modules?: { id: number; title: string; duration_hours?: number }[] } | null;
  };
  module_progress: {
    id: string;
    module_id: number;
    is_completed: boolean;
  }[];
}

export default function LearnerMyTrainingsPage() {
  const supabase = createClient();
  const { entityId } = useEntity();

  const [trainingGroups, setTrainingGroups] = useState<TrainingGroup[]>([]);
  const [programEnrollments, setProgramEnrollments] = useState<ProgramEnrollmentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMyTrainings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  async function loadMyTrainings() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Get learner
    const { data: learner } = await supabase
      .from("learners")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (!learner) {
      setLoading(false);
      return;
    }

    // Get program enrollments
    const { data: progEnrollments } = await supabase
      .from("program_enrollments")
      .select(
        "id, program_id, status, completion_rate, enrolled_at, program:programs(id, title, description, content), module_progress:program_module_progress(id, module_id, is_completed)"
      )
      .eq("learner_id", learner.id);

    setProgramEnrollments((progEnrollments as unknown as ProgramEnrollmentData[]) ?? []);

    // Get all enrollments with session and training info
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select(
        "id, session_id, status, enrolled_at, session:sessions(id, title, start_date, end_date, location, mode, status, training_id, training:trainings(id, title, description, duration_hours, certification, category))"
      )
      .eq("learner_id", learner.id)
      .neq("status", "cancelled");

    // Get e-learning assignments
    const { data: assignments } = await supabase
      .from("formation_elearning_assignments")
      .select(
        "id, course_id, session_id, is_completed, start_date, end_date, elearning_courses(id, title, description, estimated_duration_minutes, elearning_chapters(id)), sessions(title, training_id)"
      )
      .eq("learner_id", learner.id);

    // Group by training
    const groupMap = new Map<string, TrainingGroup>();

    if (enrollments) {
      const now = new Date();
      for (const enrollment of enrollments) {
        const session = Array.isArray(enrollment.session)
          ? enrollment.session[0]
          : enrollment.session;
        if (!session) continue;

        const training = Array.isArray(session.training)
          ? session.training[0]
          : session.training;

        const trainingId = training?.id ?? session.training_id ?? `session-${session.id}`;
        const trainingTitle = training?.title ?? session.title;

        // Auto-compute session status
        const start = new Date(session.start_date);
        const end = new Date(session.end_date);
        let sessionStatus = session.status;
        if (sessionStatus !== "cancelled") {
          if (now >= end) sessionStatus = "completed";
          else if (now >= start) sessionStatus = "in_progress";
          else sessionStatus = "upcoming";
        }

        if (!groupMap.has(trainingId)) {
          groupMap.set(trainingId, {
            training_id: trainingId,
            title: trainingTitle,
            description: training?.description ?? null,
            duration_hours: training?.duration_hours ?? null,
            certification: training?.certification ?? null,
            category: training?.category ?? null,
            sessions: [],
            elearning_assignments: [],
          });
        }

        groupMap.get(trainingId)!.sessions.push({
          id: session.id,
          enrollment_id: enrollment.id,
          title: session.title,
          start_date: session.start_date,
          end_date: session.end_date,
          location: session.location,
          mode: session.mode,
          status: sessionStatus,
          enrollment_status: enrollment.status,
        });
      }
    }

    // Add e-learning assignments to groups
    if (assignments) {
      for (const assignment of assignments) {
        const sessionInfo = Array.isArray(assignment.sessions)
          ? assignment.sessions[0]
          : assignment.sessions;
        const trainingId = sessionInfo?.training_id;

        if (trainingId && groupMap.has(trainingId)) {
          groupMap.get(trainingId)!.elearning_assignments.push(assignment as unknown as ElearningAssignment);
        } else {
          // Assignment not linked to a known training group - add as standalone
          const key = `elearning-${assignment.course_id}`;
          if (!groupMap.has(key)) {
            const course = Array.isArray(assignment.elearning_courses)
              ? assignment.elearning_courses[0]
              : assignment.elearning_courses;
            groupMap.set(key, {
              training_id: key,
              title: course?.title ?? "E-Learning",
              description: course?.description ?? null,
              duration_hours: null,
              certification: null,
              category: null,
              sessions: [],
              elearning_assignments: [],
            });
          }
          groupMap.get(key)!.elearning_assignments.push(assignment as unknown as ElearningAssignment);
        }
      }
    }

    // Sort: in_progress first, then upcoming, then completed
    const groups = Array.from(groupMap.values()).sort((a, b) => {
      const statusOrder = (g: TrainingGroup) => {
        const hasInProgress = g.sessions.some((s) => s.status === "in_progress");
        const hasUpcoming = g.sessions.some((s) => s.status === "upcoming");
        if (hasInProgress) return 0;
        if (hasUpcoming) return 1;
        return 2;
      };
      return statusOrder(a) - statusOrder(b);
    });

    setTrainingGroups(groups);
    setLoading(false);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getSessionStatusBadge(status: string) {
    switch (status) {
      case "in_progress":
        return <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full font-medium">En cours</span>;
      case "completed":
        return <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full font-medium">Terminée</span>;
      case "upcoming":
        return <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full font-medium">À venir</span>;
      default:
        return null;
    }
  }

  function getModeLabel(mode: string) {
    switch (mode) {
      case "distanciel": return "Distanciel";
      case "hybride": return "Hybride";
      default: return "Présentiel";
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Formations</h1>
          <p className="text-gray-500 text-sm mt-1">
            Retrouvez vos formations, sessions et cours e-learning assignés
          </p>
        </div>
      </div>

      {/* Parcours de formation */}
      {!loading && programEnrollments.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <GraduationCap className="w-5 h-5 text-[#3DB5C5]" />
            Mes Parcours de formation
          </h2>
          <div className="space-y-4">
            {programEnrollments.map((pe) => {
              const program = Array.isArray(pe.program) ? pe.program[0] : pe.program;
              if (!program) return null;
              const content = program.content as { modules?: { id: number; title: string; duration_hours?: number }[] } | null;
              const modules = content?.modules ?? [];
              const moduleProgress = pe.module_progress ?? [];

              return (
                <div key={pe.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">{program.title}</h3>
                        {program.description && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{program.description}</p>
                        )}
                      </div>
                      {pe.status === "completed" ? (
                        <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-lg">
                          <CheckCircle className="w-4 h-4" />
                          Terminé
                        </span>
                      ) : pe.status === "in_progress" ? (
                        <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg">
                          En cours
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-gray-400">Inscrit</span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pe.completion_rate}%`, backgroundColor: "#3DB5C5" }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-600">{pe.completion_rate}%</span>
                    </div>

                    {/* Module checklist */}
                    {modules.length > 0 && (
                      <div className="space-y-1.5">
                        {modules.map((mod) => {
                          const progress = moduleProgress.find((mp) => mp.module_id === mod.id);
                          const completed = progress?.is_completed ?? false;
                          return (
                            <div
                              key={mod.id}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                                completed ? "bg-green-50 text-green-800" : "bg-gray-50 text-gray-600"
                              }`}
                            >
                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                                  completed
                                    ? "bg-green-500 text-white"
                                    : "border-2 border-gray-300"
                                }`}
                              >
                                {completed && <CheckCircle className="w-3 h-3" />}
                              </div>
                              <span className={completed ? "line-through opacity-70" : ""}>
                                {mod.title}
                              </span>
                              {mod.duration_hours && (
                                <span className="text-xs text-gray-400 ml-auto">{mod.duration_hours}h</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : trainingGroups.length === 0 && programEnrollments.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Aucune formation</p>
          <p className="text-sm mt-1">
            Vous n&apos;êtes inscrit à aucune formation pour le moment.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {trainingGroups.map((group) => {
            const completedSessions = group.sessions.filter((s) => s.status === "completed").length;
            const totalSessions = group.sessions.length;
            const completedElearnings = group.elearning_assignments.filter((a) => a.is_completed).length;
            const totalElearnings = group.elearning_assignments.length;
            const allDone =
              totalSessions > 0 &&
              completedSessions === totalSessions &&
              (totalElearnings === 0 || completedElearnings === totalElearnings);

            return (
              <div
                key={group.training_id}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden"
              >
                {/* Training Header */}
                <div className="p-5 border-b border-gray-100">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {group.category && (
                          <span className="text-xs text-gray-400">{group.category}</span>
                        )}
                        {group.certification && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full">
                            <CheckCircle className="w-3 h-3" />
                            {group.certification}
                          </span>
                        )}
                      </div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        {group.title}
                      </h2>
                      {group.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                          {group.description}
                        </p>
                      )}
                    </div>
                    {allDone ? (
                      <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-lg">
                        <CheckCircle className="w-4 h-4" />
                        Terminé
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-gray-400">
                        {completedSessions}/{totalSessions} session{totalSessions !== 1 ? "s" : ""}
                        {totalElearnings > 0 && ` · ${completedElearnings}/${totalElearnings} e-learning`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sessions */}
                {group.sessions.length > 0 && (
                  <div className="px-5 py-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Sessions
                    </h3>
                    <div className="space-y-2">
                      {group.sessions
                        .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
                        .map((session) => (
                          <div
                            key={session.id}
                            className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="shrink-0">
                                {getSessionStatusBadge(session.status)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {session.title}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {formatDate(session.start_date)} · {formatTime(session.start_date)}
                                  </span>
                                  {session.location && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {session.location}
                                    </span>
                                  )}
                                  <span className="text-gray-300">
                                    {getModeLabel(session.mode)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {(session.status === "in_progress" || session.status === "completed") && (
                              <Link
                                href={`/learner/sessions/${session.id}/sign`}
                                className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              >
                                <PenLine className="w-3 h-3" />
                                Émargement
                              </Link>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* E-Learning Assignments */}
                {group.elearning_assignments.length > 0 && (
                  <div className="px-5 py-3 border-t border-gray-50">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      E-Learning
                    </h3>
                    <div className="space-y-2">
                      {group.elearning_assignments.map((assignment) => {
                        const course = Array.isArray(assignment.elearning_courses)
                          ? assignment.elearning_courses[0]
                          : assignment.elearning_courses;
                        if (!course) return null;

                        return (
                          <Link
                            key={assignment.id}
                            href={`/learner/courses/${course.id}`}
                            className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Play className="w-4 h-4 text-blue-500 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600">
                                  {course.title}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                                  <span>{course.elearning_chapters?.length ?? 0} chapitres</span>
                                  {course.estimated_duration_minutes > 0 && (
                                    <span>· {course.estimated_duration_minutes} min</span>
                                  )}
                                  {assignment.end_date && (
                                    <span>· Échéance : {formatDate(assignment.end_date)}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {assignment.is_completed ? (
                              <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full">
                                <CheckCircle className="w-3 h-3" />
                                Terminé
                              </span>
                            ) : (
                              <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                                <Play className="w-3 h-3" />
                                En cours
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
