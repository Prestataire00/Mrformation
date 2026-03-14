"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Users,
  Loader2,
  Calendar,
  Euro,
  Award,
  MapPin,
  Monitor,
  CheckCircle,
  Target,
  FileText,
  AlertCircle,
  Tag,
  Play,
} from "lucide-react";

interface SessionDetail {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  location: string | null;
  mode: string;
  status: string;
  is_public: boolean;
  max_participants: number | null;
  trainer: { first_name: string; last_name: string } | null;
  enrollment_count: number;
  is_enrolled: boolean;
}

interface ElearningCourse {
  id: string;
  title: string;
  description: string | null;
  estimated_duration_minutes: number;
  status: string;
  elearning_chapters: { id: string }[];
}

interface TrainingDetail {
  id: string;
  title: string;
  description: string | null;
  objectives: string | null;
  duration_hours: number | null;
  price_per_person: number | null;
  category: string | null;
  certification: string | null;
  classification: string | null;
  prerequisites: string | null;
  program_id: string | null;
}

export default function TrainingDetailPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const params = useParams();
  const router = useRouter();
  const trainingId = params.trainingId as string;

  const [training, setTraining] = useState<TrainingDetail | null>(null);
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [elearningCourses, setElearningCourses] = useState<ElearningCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [learnerId, setLearnerId] = useState<string | null>(null);

  useEffect(() => {
    loadTraining();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingId, entityId]);

  const isProgram = trainingId.startsWith("program-");
  const realId = isProgram ? trainingId.replace("program-", "") : trainingId;

  async function loadTraining() {
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
    if (learner) setLearnerId(learner.id);

    if (isProgram) {
      // Load program details
      const { data: programData } = await supabase
        .from("programs")
        .select("id, title, description, objectives, is_active, content")
        .eq("id", realId)
        .eq("entity_id", entityId)
        .eq("is_active", true)
        .single();

      if (!programData) {
        setLoading(false);
        return;
      }

      const content = programData.content as { modules?: { duration_minutes?: number }[] } | null;
      const modules = content?.modules ?? [];
      const totalMinutes = modules.reduce((acc: number, m: { duration_minutes?: number }) => acc + (m.duration_minutes || 0), 0);

      setTraining({
        id: programData.id,
        title: programData.title,
        description: programData.description,
        objectives: programData.objectives,
        duration_hours: totalMinutes > 0 ? Math.round(totalMinutes / 60 * 10) / 10 : null,
        price_per_person: null,
        category: null,
        certification: null,
        classification: null,
        prerequisites: null,
        program_id: programData.id,
      });

      // Load published e-learning courses for this program
      const { data: courses } = await supabase
        .from("elearning_courses")
        .select("id, title, description, estimated_duration_minutes, status, elearning_chapters(id)")
        .eq("program_id", realId)
        .eq("status", "published");
      if (courses) setElearningCourses(courses);

      // Also show all entity published courses if none linked
      if (!courses || courses.length === 0) {
        const { data: allCourses } = await supabase
          .from("elearning_courses")
          .select("id, title, description, estimated_duration_minutes, status, elearning_chapters(id)")
          .eq("entity_id", entityId)
          .eq("status", "published");
        if (allCourses) setElearningCourses(allCourses);
      }

      setLoading(false);
      return;
    }

    // Get training details
    const { data: trainingData } = await supabase
      .from("trainings")
      .select(
        "id, title, description, objectives, duration_hours, price_per_person, category, certification, classification, prerequisites, program_id"
      )
      .eq("id", trainingId)
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .single();

    if (!trainingData) {
      setLoading(false);
      return;
    }
    setTraining(trainingData);

    // Get sessions for this training
    const { data: sessionsData } = await supabase
      .from("sessions")
      .select(
        "id, title, start_date, end_date, location, mode, status, is_public, max_participants, trainer:trainers(first_name, last_name)"
      )
      .eq("training_id", trainingId)
      .eq("entity_id", entityId)
      .neq("status", "cancelled")
      .order("start_date", { ascending: true });

    if (sessionsData) {
      const now = new Date();
      const sessionsWithInfo = await Promise.all(
        sessionsData.map(async (s) => {
          // Get enrollment count
          const { count } = await supabase
            .from("enrollments")
            .select("id", { count: "exact", head: true })
            .eq("session_id", s.id)
            .neq("status", "cancelled");

          // Check if learner is enrolled
          let isEnrolled = false;
          if (learner) {
            const { data: enrollment } = await supabase
              .from("enrollments")
              .select("id")
              .eq("session_id", s.id)
              .eq("learner_id", learner.id)
              .neq("status", "cancelled")
              .maybeSingle();
            isEnrolled = !!enrollment;
          }

          // Auto-compute status
          const start = new Date(s.start_date);
          const end = new Date(s.end_date);
          let status = s.status;
          if (status !== "cancelled") {
            if (now >= end) status = "completed";
            else if (now >= start) status = "in_progress";
            else status = "upcoming";
          }

          const trainer = Array.isArray(s.trainer) ? s.trainer[0] ?? null : s.trainer;

          return {
            ...s,
            status,
            trainer,
            enrollment_count: count ?? 0,
            is_enrolled: isEnrolled,
          } as SessionDetail;
        })
      );
      setSessions(sessionsWithInfo);
    }

    // Get e-learning courses linked to this training (via program_id)
    if (trainingData.program_id) {
      const { data: courses } = await supabase
        .from("elearning_courses")
        .select("id, title, description, estimated_duration_minutes, status, elearning_chapters(id)")
        .eq("program_id", trainingData.program_id)
        .eq("status", "published");
      if (courses) setElearningCourses(courses);
    }

    // Also check for e-learning courses directly linked via training_id (if column exists)
    const { data: directCourses } = await supabase
      .from("elearning_courses")
      .select("id, title, description, estimated_duration_minutes, status, elearning_chapters(id)")
      .eq("entity_id", entityId)
      .eq("status", "published");

    // Merge any courses not already found (avoid duplicates)
    if (directCourses) {
      const existingIds = new Set(elearningCourses.map((c) => c.id));
      const newCourses = directCourses.filter((c) => !existingIds.has(c.id));
      if (newCourses.length > 0 && elearningCourses.length === 0) {
        // If no program-linked courses, show entity's published courses
        setElearningCourses(newCourses);
      }
    }

    setLoading(false);
  }

  async function handleEnroll(sessionId: string) {
    setEnrollingId(sessionId);
    setMessage(null);

    try {
      const res = await fetch("/api/enrollments/self-enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
      } else {
        setMessage({ type: "success", text: "Inscription réussie !" });
        await loadTraining();
      }
    } catch {
      setMessage({ type: "error", text: "Erreur lors de l'inscription" });
    }

    setEnrollingId(null);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getModeLabel(mode: string) {
    switch (mode) {
      case "distanciel":
        return "Distanciel";
      case "hybride":
        return "Hybride";
      default:
        return "Présentiel";
    }
  }

  function getModeColor(mode: string) {
    switch (mode) {
      case "distanciel":
        return "bg-purple-50 text-purple-700";
      case "hybride":
        return "bg-teal-50 text-teal-700";
      default:
        return "bg-blue-50 text-blue-700";
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="text-center py-20 text-gray-400">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Formation introuvable</p>
        <Link
          href="/learner/catalog"
          className="text-blue-600 hover:underline text-sm mt-2 inline-block"
        >
          Retour au catalogue
        </Link>
      </div>
    );
  }

  const publicSessions = sessions.filter((s) => s.is_public && s.status !== "completed");
  const pastSessions = sessions.filter((s) => s.status === "completed");
  const isEnrolledInAny = sessions.some((s) => s.is_enrolled);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/learner/catalog" className="hover:text-blue-600 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          Catalogue
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium truncate">{training.title}</span>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Training Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {training.category && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                  <Tag className="w-3 h-3" />
                  {training.category}
                </span>
              )}
              {training.certification && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full">
                  <Award className="w-3 h-3" />
                  {training.certification}
                </span>
              )}
              {training.classification && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full capitalize">
                  {training.classification}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {training.title}
            </h1>
            {training.description && (
              <p className="text-gray-600 mb-4">{training.description}</p>
            )}

            {/* Key info */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
              {training.duration_hours && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {training.duration_hours}h de formation
                </span>
              )}
              {training.price_per_person && (
                <span className="flex items-center gap-1.5">
                  <Euro className="w-4 h-4" />
                  {Number(training.price_per_person).toLocaleString("fr-FR")} € / personne
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {publicSessions.length} session{publicSessions.length !== 1 ? "s" : ""} disponible{publicSessions.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {isEnrolledInAny && (
            <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 text-sm font-medium rounded-lg">
              <CheckCircle className="w-4 h-4" />
              Inscrit
            </span>
          )}
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid gap-6 lg:grid-cols-3 mb-6">
        {/* Objectives */}
        {training.objectives && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 lg:col-span-2">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-600" />
              Objectifs pédagogiques
            </h2>
            <div className="text-sm text-gray-600 whitespace-pre-line">
              {training.objectives}
            </div>
          </div>
        )}

        {/* Prerequisites */}
        {training.prerequisites && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              Prérequis
            </h2>
            <p className="text-sm text-gray-600 whitespace-pre-line">
              {training.prerequisites}
            </p>
          </div>
        )}
      </div>

      {/* Sessions */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600" />
          Sessions disponibles
        </h2>

        {publicSessions.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Aucune session publique disponible pour le moment.</p>
            <p className="text-xs mt-1">Contactez l&apos;organisme de formation pour plus d&apos;informations.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {publicSessions.map((session) => {
              const spotsLeft = session.max_participants
                ? session.max_participants - session.enrollment_count
                : null;
              const isFull = spotsLeft !== null && spotsLeft <= 0;

              return (
                <div
                  key={session.id}
                  className="border border-gray-100 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 text-sm">
                        {session.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(session.start_date)} à {formatTime(session.start_date)}
                        </span>
                        {session.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {session.location}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${getModeColor(
                            session.mode
                          )}`}
                        >
                          {session.mode === "distanciel" ? (
                            <Monitor className="w-3 h-3" />
                          ) : (
                            <MapPin className="w-3 h-3" />
                          )}
                          {getModeLabel(session.mode)}
                        </span>
                        {session.max_participants && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {session.enrollment_count}/{session.max_participants}
                          </span>
                        )}
                        {session.trainer && (
                          <span className="text-gray-400">
                            Formateur : {session.trainer.first_name} {session.trainer.last_name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {session.is_enrolled ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-lg">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Inscrit
                        </span>
                      ) : !session.is_public ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-lg">
                          Sur invitation
                        </span>
                      ) : isFull ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-lg">
                          Complet
                        </span>
                      ) : (
                        <button
                          onClick={() => handleEnroll(session.id)}
                          disabled={enrollingId === session.id}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                        >
                          {enrollingId === session.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Inscription...
                            </>
                          ) : (
                            "S'inscrire"
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* E-Learning Courses */}
      {elearningCourses.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Play className="w-4 h-4 text-blue-600" />
            Cours E-Learning associés
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {elearningCourses.map((course) => (
              <Link
                key={course.id}
                href={`/learner/courses/${course.id}`}
                className="border border-gray-100 rounded-lg p-4 hover:bg-gray-50 transition-colors group"
              >
                <h3 className="font-medium text-gray-900 text-sm group-hover:text-blue-600">
                  {course.title}
                </h3>
                {course.description && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {course.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {course.elearning_chapters?.length ?? 0} chapitre{(course.elearning_chapters?.length ?? 0) !== 1 ? "s" : ""}
                  </span>
                  {course.estimated_duration_minutes > 0 && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {course.estimated_duration_minutes} min
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
