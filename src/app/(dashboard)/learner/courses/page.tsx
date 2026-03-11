"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Clock, Play, CheckCircle2, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface PublishedCourse {
  id: string;
  title: string;
  description: string | null;
  estimated_duration_minutes: number;
  elearning_chapters: { id: string }[];
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

  const [enrollments, setEnrollments] = useState<CourseWithEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "in_progress" | "completed">("all");
  const [catalogue, setCatalogue] = useState<PublishedCourse[]>([]);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [learnerId, setLearnerId] = useState<string | null>(null);

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
      .single();

    if (!learner) {
      setLoading(false);
      return;
    }

    setLearnerId(learner.id);

    const { data, error } = await supabase
      .from("elearning_enrollments")
      .select(
        `*, elearning_courses(id, title, description, estimated_duration_minutes, status, elearning_chapters(id))`
      )
      .eq("learner_id", learner.id)
      .order("enrolled_at", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      const enrolledData = (data as CourseWithEnrollment[]) || [];
      setEnrollments(enrolledData);

      // Fetch all published courses to show catalogue (courses not yet enrolled)
      const enrolledIds = enrolledData.map((e) => e.course_id);
      const { data: published } = await supabase
        .from("elearning_courses")
        .select("id, title, description, estimated_duration_minutes, elearning_chapters(id)")
        .eq("status", "published")
        .order("created_at", { ascending: false });

      if (published) {
        const notEnrolled = (published as PublishedCourse[]).filter(
          (c) => !enrolledIds.includes(c.id)
        );
        setCatalogue(notEnrolled);
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
      status: "not_started",
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
    return e.status === filter;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/learner" className="text-[#3DB5C5] hover:underline">
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
          <Loader2 className="h-8 w-8 text-[#3DB5C5] animate-spin" />
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

                  <h3 className="font-semibold text-gray-900 group-hover:text-[#3DB5C5] transition-colors line-clamp-2">
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
                          isCompleted ? "bg-green-500" : "bg-[#3DB5C5]"
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

      {/* Catalogue — published courses not yet enrolled */}
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
                  style={{ background: "#3DB5C5" }}
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
