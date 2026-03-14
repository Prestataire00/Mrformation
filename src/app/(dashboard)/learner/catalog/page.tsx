"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  BookOpen,
  Clock,
  Users,
  Loader2,
  Search,
  Calendar,
  Euro,
  Award,
  MapPin,
  Monitor,
  ArrowRight,
  CheckCircle,
  Tag,
  Layers,
} from "lucide-react";

interface TrainingSession {
  id: string;
  start_date: string;
  end_date: string;
  mode: string;
  status: string;
  is_public: boolean;
  max_participants: number | null;
  location: string | null;
}

interface ProgramModule {
  id: string;
  title: string;
  content_type: "video" | "document" | "quiz";
  content_url: string;
  duration_minutes: number;
}

interface TrainingCatalogItem {
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
  sessions: TrainingSession[];
  public_session_count: number;
  next_session_date: string | null;
  modes: string[];
  is_enrolled: boolean;
  source: "training" | "program";
  module_count?: number;
}

export default function LearnerCatalogPage() {
  const supabase = createClient();
  const { entityId } = useEntity();

  const [trainings, setTrainings] = useState<TrainingCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  async function loadCatalog() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Get learner ID
    const { data: learner } = await supabase
      .from("learners")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    // Get all active trainings for this entity with their sessions
    const { data: trainingsData, error: trainingsError } = await supabase
      .from("trainings")
      .select(
        "id, title, description, objectives, duration_hours, price_per_person, category, certification, classification, prerequisites, sessions(id, start_date, end_date, mode, status, is_public, max_participants, location)"
      )
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .order("title", { ascending: true });

    if (trainingsError) {
      console.error("Error loading trainings:", trainingsError);
    }

    // For each training, check enrollment and compute aggregates
    const trainingIds = new Set<string>();
    const catalog: TrainingCatalogItem[] = await Promise.all(
      (trainingsData || []).map(async (t) => {
        trainingIds.add(t.id);

        const sessions = (Array.isArray(t.sessions) ? t.sessions : []) as TrainingSession[];
        const now = new Date();

        // Filter public upcoming/in_progress sessions
        const publicSessions = sessions.filter((s) => {
          if (!s.is_public) return false;
          const end = new Date(s.end_date);
          return s.status !== "cancelled" && end > now;
        });

        // Next session date
        const upcomingSessions = publicSessions
          .filter((s) => new Date(s.start_date) > now)
          .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

        // Unique modes
        const modes = [...new Set(sessions.map((s) => s.mode))];

        // Check if learner is enrolled in any session of this training
        let isEnrolled = false;
        if (learner) {
          const sessionIds = sessions.map((s) => s.id);
          if (sessionIds.length > 0) {
            const { count } = await supabase
              .from("enrollments")
              .select("id", { count: "exact", head: true })
              .eq("learner_id", learner.id)
              .in("session_id", sessionIds)
              .neq("status", "cancelled");
            isEnrolled = (count ?? 0) > 0;
          }
        }

        return {
          id: t.id,
          title: t.title,
          description: t.description,
          objectives: t.objectives,
          duration_hours: t.duration_hours,
          price_per_person: t.price_per_person,
          category: t.category,
          certification: t.certification,
          classification: t.classification,
          prerequisites: t.prerequisites,
          sessions,
          public_session_count: publicSessions.length,
          next_session_date: upcomingSessions[0]?.start_date ?? null,
          modes,
          is_enrolled: isEnrolled,
          source: "training" as const,
        };
      })
    );

    // Fetch active programs that don't already have a training associated
    const { data: programsData } = await supabase
      .from("programs")
      .select("id, title, description, objectives, is_active, content")
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .order("title", { ascending: true });

    if (programsData) {
      // Get training titles to avoid duplicates (programs with same title as a training)
      const trainingTitles = new Set((trainingsData || []).map((t) => t.title.toLowerCase()));

      for (const p of programsData) {
        // Skip programs that already exist as a training (by title match)
        if (trainingTitles.has(p.title.toLowerCase())) continue;

        const content = p.content as { type?: string; status?: string; modules?: ProgramModule[] } | null;
        const modules = content?.modules ?? [];
        const totalMinutes = modules.reduce((acc: number, m: ProgramModule) => acc + (m.duration_minutes || 0), 0);

        catalog.push({
          id: `program-${p.id}`,
          title: p.title,
          description: p.description,
          objectives: p.objectives,
          duration_hours: totalMinutes > 0 ? Math.round(totalMinutes / 60 * 10) / 10 : null,
          price_per_person: null,
          category: content?.type === "elearning" ? "E-Learning" : null,
          certification: null,
          classification: null,
          prerequisites: null,
          sessions: [],
          public_session_count: 0,
          next_session_date: null,
          modes: content?.type === "elearning" ? ["distanciel"] : [],
          is_enrolled: false,
          source: "program",
          module_count: modules.length,
        });
      }
    }

    // Sort: trainings with sessions first, then by title
    catalog.sort((a, b) => {
      if (a.public_session_count > 0 && b.public_session_count === 0) return -1;
      if (b.public_session_count > 0 && a.public_session_count === 0) return 1;
      return a.title.localeCompare(b.title);
    });

    setTrainings(catalog);
    setLoading(false);
  }

  // Get unique categories for filter
  const categories = [...new Set(trainings.map((t) => t.category).filter(Boolean))] as string[];

  const filtered = trainings.filter((t) => {
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q) ||
      t.certification?.toLowerCase().includes(q)
    );
  });

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Catalogue de Formations
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Découvrez toutes les formations disponibles et inscrivez-vous
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par titre, description, catégorie..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">Toutes les catégories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-6 text-sm text-gray-500">
        <span>{filtered.length} formation{filtered.length !== 1 ? "s" : ""}</span>
        <span>•</span>
        <span>{filtered.filter((t) => t.public_session_count > 0).length} avec sessions disponibles</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Aucune formation trouvée</p>
          <p className="text-sm mt-1">
            Modifiez vos critères de recherche ou revenez plus tard.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((training) => (
            <Link
              key={training.id}
              href={training.source === "program" ? `/learner/catalog/${training.id}` : `/learner/catalog/${training.id}`}
              className="group bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-gray-300 transition-all flex flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-semibold text-gray-900 text-base group-hover:text-blue-600 transition-colors line-clamp-2">
                  {training.title}
                </h3>
                {training.is_enrolled && (
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full">
                    <CheckCircle className="w-3 h-3" />
                    Inscrit
                  </span>
                )}
              </div>

              {/* Description */}
              {training.description && (
                <p className="text-gray-500 text-sm line-clamp-2 mb-3">
                  {training.description}
                </p>
              )}

              {/* Category & Certification badges */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {training.source === "program" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full">
                    <Layers className="w-3 h-3" />
                    Programme
                  </span>
                )}
                {training.category && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                    <Tag className="w-3 h-3" />
                    {training.category}
                  </span>
                )}
                {training.certification && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full">
                    <Award className="w-3 h-3" />
                    {training.certification}
                  </span>
                )}
                {training.modes.map((mode) => (
                  <span
                    key={mode}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${getModeColor(mode)}`}
                  >
                    {mode === "distanciel" ? (
                      <Monitor className="w-3 h-3" />
                    ) : (
                      <MapPin className="w-3 h-3" />
                    )}
                    {getModeLabel(mode)}
                  </span>
                ))}
              </div>

              {/* Info row */}
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mt-auto pt-3 border-t border-gray-100">
                {training.duration_hours && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {training.duration_hours}h
                  </span>
                )}
                {training.price_per_person && (
                  <span className="flex items-center gap-1">
                    <Euro className="w-3.5 h-3.5" />
                    {Number(training.price_per_person).toLocaleString("fr-FR")} €/pers.
                  </span>
                )}
                {training.module_count != null && training.module_count > 0 && (
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5" />
                    {training.module_count} module{training.module_count > 1 ? "s" : ""}
                  </span>
                )}
                {training.source === "training" && training.public_session_count > 0 ? (
                  <span className="flex items-center gap-1 text-blue-600">
                    <Calendar className="w-3.5 h-3.5" />
                    {training.public_session_count} session{training.public_session_count > 1 ? "s" : ""}
                  </span>
                ) : training.source === "training" ? (
                  <span className="flex items-center gap-1 text-gray-400">
                    <Calendar className="w-3.5 h-3.5" />
                    Sur demande
                  </span>
                ) : null}
              </div>

              {/* Next session */}
              {training.next_session_date && (
                <div className="mt-2 text-xs text-blue-600">
                  Prochaine session : {formatDate(training.next_session_date)}
                </div>
              )}

              {/* CTA */}
              <div className="flex items-center justify-end mt-3 text-sm text-blue-600 group-hover:text-blue-700">
                <span className="flex items-center gap-1 font-medium">
                  Voir les détails
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
