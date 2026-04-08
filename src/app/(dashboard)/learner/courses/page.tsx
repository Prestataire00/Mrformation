"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Clock, Play, CheckCircle2, Loader2, Plus, FileText, Video, HelpCircle, ExternalLink, GraduationCap, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEntity } from "@/contexts/EntityContext";

interface PublishedCourse {
  id: string;
  title: string;
  description: string | null;
  estimated_duration_minutes: number;
  elearning_chapters: { id: string }[];
}

interface ManualCourseModule {
  id: string;
  title: string;
  content_type: "video" | "document" | "quiz";
  content_url: string;
  duration_minutes: number;
}

interface ManualCourse {
  id: string;
  title: string;
  description: string | null;
  objectives: string | null;
  content: { type: string; status: string; modules: ManualCourseModule[] };
}

interface AssignedCourse {
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
    training: { title: string } | null;
  } | null;
}

interface CourseWithEnrollment {
  id: string;
  course_id: string;
  status: string;
  completion_rate: number;
  enrolled_at: string;
  elearning_courses: {
    id: string;
    title: string;
    description: string | null;
    estimated_duration_minutes: number;
    status: string;
    elearning_chapters: { id: string }[];
  };
}

export default function LearnerCoursesPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();

  const [enrollments, setEnrollments] = useState<CourseWithEnrollment[]>([]);
  const [assignedCourses, setAssignedCourses] = useState<AssignedCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "in_progress" | "completed">("all");
  const [catalogue, setCatalogue] = useState<PublishedCourse[]>([]);
  const [manualCourses, setManualCourses] = useState<ManualCourse[]>([]);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [learnerId, setLearnerId] = useState<string | null>(null);
  const [expandedManual, setExpandedManual] = useState<string | null>(null);

  const fetchEnrollments = useCallback(async () => {
    setLoading(true);

    // Get current user's learner record
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Find learner by user profile email
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    if (!profile?.email) {
      setLoading(false);
      return;
    }

    const { data: learner } = await supabase
      .from("learners")
      .select("id")
      .eq("email", profile.email)
      .maybeSingle();

    const currentLearnerId = learner?.id ?? null;
    setLearnerId(currentLearnerId);

    // Fetch enrollments only if learner record exists
    const enrolledData: CourseWithEnrollment[] = [];
    if (currentLearnerId) {
      const { data, error } = await supabase
        .from("elearning_enrollments")
        .select(
          `*, elearning_courses(id, title, description, estimated_duration_minutes, status, elearning_chapters(id))`
        )
        .eq("learner_id", currentLearnerId)
        .order("enrolled_at", { ascending: false });

      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      } else {
        enrolledData.push(...((data as CourseWithEnrollment[]) || []));
      }
    }
    setEnrollments(enrolledData);

    // Catalogue — published AI courses not yet enrolled (always shown)
    const enrolledIds = enrolledData.map((e) => e.course_id);
    const { data: publishedCourses } = await supabase
      .from("elearning_courses")
      .select("id, title, description, estimated_duration_minutes, elearning_chapters(id)")
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (publishedCourses) {
      const notEnrolled = (publishedCourses as PublishedCourse[]).filter(
        (c) => !enrolledIds.includes(c.id)
      );
      setCatalogue(notEnrolled);
    }

    // Manual courses from programs table (always shown)
    const { data: programs } = await supabase
      .from("programs")
      .select("id, title, description, objectives, content")
      .order("updated_at", { ascending: false });

    if (programs) {
      const publishedPrograms = (programs as ManualCourse[]).filter(
        (p) =>
          p.content?.type === "elearning" &&
          p.content?.status === "published" &&
          (p.content?.modules?.length ?? 0) > 0
      );
      setManualCourses(publishedPrograms);
    }

    // Fetch e-learning assigned via formations (formation_elearning_assignments)
    if (currentLearnerId) {
      const { data: assignments } = await supabase
        .from("formation_elearning_assignments")
        .select(
          "id, course_id, session_id, is_completed, start_date, end_date, elearning_courses(id, title, description, estimated_duration_minutes, elearning_chapters(id)), sessions(title, training:trainings(title))"
        )
        .eq("learner_id", currentLearnerId);

      if (assignments) {
        setAssignedCourses(assignments as unknown as AssignedCourse[]);
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  async function handleEnroll(courseId: string) {
    if (!learnerId) return;
    setEnrolling(courseId);
    const { error } = await supabase.from("elearning_enrollments").insert({
      course_id: courseId,
      learner_id: learnerId,
      status: "enrolled",
      completion_rate: 0,
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Inscription réussie !", description: "Le cours est maintenant disponible dans vos cours." });
      fetchEnrollments();
    }
    setEnrolling(null);
  }

  const filtered = enrollments.filter((e) => {
    if (filter === "all") return true;
    if (filter === "in_progress") return e.status === "in_progress" || e.status === "enrolled";
    return e.status === filter;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/learner" className="text-[#374151] hover:underline">
          Accueil
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">Mes Cours</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mes Cours E-Learning</h1>
        <p className="text-sm text-gray-500 mt-1">
          Accédez à vos cours et suivez votre progression.
        </p>
      </div>

      {/* Assigned via formations */}
      {!loading && assignedCourses.length > 0 && (
        <div className="space-y-3 pb-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-blue-600" />
              Cours assignés via mes formations
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Cours e-learning rattachés à vos sessions de formation.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {assignedCourses.map((assignment) => {
              const course = Array.isArray(assignment.elearning_courses)
                ? assignment.elearning_courses[0]
                : assignment.elearning_courses;
              if (!course) return null;
              const sessionInfo = Array.isArray(assignment.sessions)
                ? assignment.sessions[0]
                : assignment.sessions;
              const trainingTitle = sessionInfo?.training
                ? (Array.isArray(sessionInfo.training) ? sessionInfo.training[0]?.title : sessionInfo.training.title)
                : null;

              return (
                <Link
                  key={assignment.id}
                  href={`/learner/courses/${course.id}`}
                  className="block"
                >
                  <div className="bg-white border border-blue-100 rounded-xl p-5 hover:shadow-md transition-all duration-200 group h-full">
                    <div className="flex items-start justify-between mb-2">
                      {assignment.is_completed ? (
                        <Badge className="text-xs border bg-green-100 text-green-700 border-green-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Terminé
                        </Badge>
                      ) : (
                        <Badge className="text-xs border bg-blue-100 text-blue-700 border-blue-200">
                          <Play className="h-3 w-3 mr-1" /> En cours
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-[#374151] transition-colors line-clamp-2">
                      {course.title}
                    </h3>
                    {trainingTitle && (
                      <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {trainingTitle}
                      </p>
                    )}
                    {course.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{course.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-3">
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3.5 w-3.5" />
                        {course.elearning_chapters?.length ?? 0} chapitres
                      </span>
                      {course.estimated_duration_minutes > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {course.estimated_duration_minutes} min
                        </span>
                      )}
                      {assignment.end_date && (
                        <span className="text-amber-600">
                          Échéance : {new Date(assignment.end_date).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-1 border rounded-lg p-1 bg-gray-50 w-fit">
        {(["all", "in_progress", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors",
              filter === f
                ? "bg-white shadow-sm text-gray-900 font-medium"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {f === "all" ? "Tous" : f === "in_progress" ? "En cours" : "Terminés"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 text-[#374151] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aucun cours</p>
          <p className="text-sm text-gray-400 mt-1">
            Vous n&apos;êtes inscrit à aucun cours e-learning pour le moment.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((enrollment) => {
            const course = enrollment.elearning_courses;
            if (!course) return null;
            const chapterCount = course.elearning_chapters?.length || 0;
            const isCompleted = enrollment.status === "completed";

            return (
              <Link
                key={enrollment.id}
                href={`/learner/courses/${course.id}`}
                className="block"
              >
                <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all duration-200 group h-full">
                  <div className="flex items-start justify-between mb-3">
                    <Badge
                      className={cn(
                        "text-xs border",
                        isCompleted
                          ? "bg-green-100 text-green-700 border-green-200"
                          : enrollment.status === "in_progress"
                          ? "bg-blue-100 text-blue-700 border-blue-200"
                          : "bg-gray-100 text-gray-600 border-gray-200"
                      )}
                    >
                      {isCompleted ? (
                        <><CheckCircle2 className="h-3 w-3 mr-1" /> Terminé</>
                      ) : enrollment.status === "in_progress" ? (
                        <><Play className="h-3 w-3 mr-1" /> En cours</>
                      ) : (
                        "Inscrit"
                      )}
                    </Badge>
                  </div>

                  <h3 className="font-semibold text-gray-900 group-hover:text-[#374151] transition-colors line-clamp-2">
                    {course.title}
                  </h3>
                  {course.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                      {course.description}
                    </p>
                  )}

                  <div className="mt-4 space-y-2">
                    {/* Progress bar */}
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{chapterCount} chapitres</span>
                      <span>{enrollment.completion_rate}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isCompleted ? "bg-green-500" : "bg-[#374151]"
                        )}
                        style={{ width: `${enrollment.completion_rate}%` }}
                      />
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock className="h-3.5 w-3.5" />
                      {course.estimated_duration_minutes} min
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Manual courses — programs table */}
      {manualCourses.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Cours & Supports</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Accédez directement aux supports de cours mis à votre disposition.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {manualCourses.map((course) => {
              const modules = course.content?.modules ?? [];
              const isExpanded = expandedManual === course.id;
              const totalMin = modules.reduce((acc, m) => acc + (m.duration_minutes || 0), 0);
              return (
                <div
                  key={course.id}
                  className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 line-clamp-2">{course.title}</h3>
                      {course.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{course.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      {modules.length} module{modules.length > 1 ? "s" : ""}
                    </span>
                    {totalMin > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {totalMin} min
                      </span>
                    )}
                  </div>

                  {/* Module list (collapsible) */}
                  {modules.length > 0 && (
                    <div className="space-y-1.5">
                      {(isExpanded ? modules : modules.slice(0, 2)).map((mod) => (
                        <a
                          key={mod.id}
                          href={mod.content_url || "#"}
                          target={mod.content_url ? "_blank" : undefined}
                          rel="noopener noreferrer"
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                            mod.content_url
                              ? "bg-gray-50 hover:bg-[#374151]/10 text-gray-700 hover:text-[#374151] cursor-pointer"
                              : "bg-gray-50 text-gray-400 cursor-default"
                          )}
                        >
                          {mod.content_type === "video" ? (
                            <Video className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                          ) : mod.content_type === "quiz" ? (
                            <HelpCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          )}
                          <span className="flex-1 truncate">{mod.title || "Module sans titre"}</span>
                          {mod.content_url && (
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                          )}
                        </a>
                      ))}
                      {modules.length > 2 && (
                        <button
                          onClick={() => setExpandedManual(isExpanded ? null : course.id)}
                          className="text-xs text-[#374151] hover:underline ml-1"
                        >
                          {isExpanded ? "Voir moins" : `+ ${modules.length - 2} module${modules.length - 2 > 1 ? "s" : ""}`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Catalogue — published AI courses not yet enrolled */}
      {catalogue.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Catalogue des formations disponibles</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Ces formations sont disponibles. Inscrivez-vous pour y accéder.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {catalogue.map((course) => (
              <div
                key={course.id}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all duration-200 flex flex-col"
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2">
                    {course.title}
                  </h3>
                  {course.description && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                      {course.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      {course.elearning_chapters?.length || 0} chapitres
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {course.estimated_duration_minutes} min
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleEnroll(course.id)}
                  disabled={enrolling === course.id}
                  className="mt-4 w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-sm font-medium text-white transition disabled:opacity-60"
                  style={{ background: "#374151" }}
                >
                  {enrolling === course.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {enrolling === course.id ? "Inscription..." : "S'inscrire"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
