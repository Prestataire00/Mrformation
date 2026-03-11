"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Trainer, TrainerCompetency } from "@/lib/types";
import { useEntity } from "@/contexts/EntityContext";
import { cn, getInitials, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  User,
  Star,
  Filter,
  Euro,
  Mail,
  Phone,
  ChevronRight,
  BookOpen,
  Users,
  FileText,
} from "lucide-react";
import Link from "next/link";

type TrainerWithCompetencies = Trainer & { competencies: TrainerCompetency[] };

const LEVEL_LABELS: Record<string, string> = {
  beginner: "Débutant",
  intermediate: "Intermédiaire",
  expert: "Expert",
};

const LEVEL_BADGE_CLASSES: Record<string, string> = {
  beginner: "bg-gray-100 text-gray-600 hover:bg-gray-100",
  intermediate: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  expert: "bg-green-100 text-green-700 hover:bg-green-100",
};

const LEVEL_DOT_CLASSES: Record<string, string> = {
  beginner: "bg-gray-400",
  intermediate: "bg-blue-500",
  expert: "bg-green-500",
};

function TrainerCard({ trainer }: { trainer: TrainerWithCompetencies }) {
  const initials = getInitials(trainer.first_name, trainer.last_name);
  const hasCv = !!(trainer as unknown as Record<string, unknown>).cv_url;

  // Group competencies by level for display
  const expertComps = trainer.competencies.filter((c) => c.level === "expert");
  const intermediateComps = trainer.competencies.filter((c) => c.level === "intermediate");
  const beginnerComps = trainer.competencies.filter((c) => c.level === "beginner");

  const sortedComps = [...expertComps, ...intermediateComps, ...beginnerComps];
  const displayComps = sortedComps.slice(0, 6);
  const extraCount = sortedComps.length - displayComps.length;

  const bioExcerpt = trainer.bio
    ? trainer.bio.length > 120
      ? trainer.bio.slice(0, 120).trimEnd() + "…"
      : trainer.bio
    : null;

  return (
    <Link href={`/admin/trainers/${trainer.id}`} className="group block">
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-200 h-full flex flex-col">
        {/* Header: Avatar + Name + Type Badge */}
        <div className="flex items-start gap-4 mb-4">
          {/* Photo placeholder / Avatar */}
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-lg shadow-sm">
              {initials}
            </div>
            {/* Availability indicator */}
            {trainer.availability_notes && (
              <div
                className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-400 border-2 border-white"
                title={trainer.availability_notes}
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 text-base leading-tight group-hover:text-blue-700 transition-colors truncate">
                  {trainer.first_name} {trainer.last_name}
                </h3>
                {/* Competency count */}
                {trainer.competencies.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {trainer.competencies.length} compétence
                    {trainer.competencies.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
              <Badge
                className={cn(
                  "shrink-0 text-xs font-medium",
                  trainer.type === "internal"
                    ? "bg-blue-100 text-blue-700 hover:bg-blue-100"
                    : "bg-orange-100 text-orange-700 hover:bg-orange-100"
                )}
              >
                {trainer.type === "internal" ? "Interne" : "Externe"}
              </Badge>
            </div>

            {/* Contact info */}
            <div className="flex flex-col gap-0.5 mt-1.5">
              {trainer.email && (
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="text-xs truncate">{trainer.email}</span>
                </div>
              )}
              {trainer.phone && (
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Phone className="h-3 w-3 shrink-0" />
                  <span className="text-xs">{trainer.phone}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bio excerpt */}
        {bioExcerpt ? (
          <p className="text-sm text-gray-500 leading-relaxed mb-4 flex-1">{bioExcerpt}</p>
        ) : (
          <p className="text-sm text-gray-300 italic mb-4 flex-1">Aucune biographie renseignée.</p>
        )}

        {/* Competency tags */}
        {sortedComps.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {displayComps.map((c) => (
              <Badge
                key={c.id}
                className={cn(
                  "text-xs font-normal flex items-center gap-1",
                  LEVEL_BADGE_CLASSES[c.level]
                )}
              >
                <span
                  className={cn("w-1.5 h-1.5 rounded-full shrink-0", LEVEL_DOT_CLASSES[c.level])}
                />
                {c.competency}
              </Badge>
            ))}
            {extraCount > 0 && (
              <Badge className="text-xs font-normal bg-gray-100 text-gray-500 hover:bg-gray-100">
                +{extraCount} autre{extraCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        ) : (
          <div className="mb-4">
            <span className="text-xs text-gray-300 italic">Aucune compétence renseignée.</span>
          </div>
        )}

        {/* Footer: hourly rate + CV badge + CTA */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-auto">
          <div className="flex items-center gap-2 text-gray-700">
            {trainer.hourly_rate ? (
              <>
                <Euro className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-sm font-semibold">{formatCurrency(trainer.hourly_rate)}/h</span>
              </>
            ) : (
              <span className="text-xs text-gray-300">Taux non renseigné</span>
            )}
            {hasCv && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                <FileText className="h-3 w-3" />
                CV
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-blue-600 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            Voir le profil
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm animate-pulse">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-14 h-14 rounded-full bg-gray-200 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
          <div className="h-3 bg-gray-100 rounded w-2/3" />
        </div>
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-5/6" />
        <div className="h-3 bg-gray-100 rounded w-4/6" />
      </div>
      <div className="flex gap-2 mb-4">
        <div className="h-5 bg-gray-100 rounded-full w-20" />
        <div className="h-5 bg-gray-100 rounded-full w-24" />
        <div className="h-5 bg-gray-100 rounded-full w-16" />
      </div>
      <div className="h-px bg-gray-100 mb-3" />
      <div className="h-4 bg-gray-100 rounded w-24" />
    </div>
  );
}

export default function CVThequePage() {
  const supabase = createClient();
  const { entityId } = useEntity();

  const [trainers, setTrainers] = useState<TrainerWithCompetencies[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  const [competencyFilter, setCompetencyFilter] = useState<string>("all");

  const fetchTrainers = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("trainers")
      .select("*, competencies:trainer_competencies(*)")
      .order("last_name", { ascending: true });

    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    let { data, error } = await query;

    // Fallback: if join fails, fetch trainers alone
    if (error) {
      console.warn("trainer_competencies join failed:", error.message);
      let fallbackQuery = supabase.from("trainers").select("*").order("last_name", { ascending: true });
      if (entityId) fallbackQuery = fallbackQuery.eq("entity_id", entityId);
      const fallback = await fallbackQuery;
      data = fallback.data?.map((t: Record<string, unknown>) => ({ ...t, competencies: [] })) ?? null;
      error = fallback.error;
    }

    if (!error && data) {
      setTrainers(data as TrainerWithCompetencies[]);
    }
    setLoading(false);
  }, [entityId]);

  useEffect(() => {
    fetchTrainers();
  }, [fetchTrainers]);

  // Collect all unique competency names for the filter dropdown
  const allCompetencies = useMemo(
    () =>
      [...new Set(trainers.flatMap((t) => t.competencies.map((c) => c.competency)))].sort(),
    [trainers]
  );

  // Client-side filtering (instant)
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    return trainers.filter((t) => {
      // Full-text search: name, bio, competency names, CV text
      const cvText = ((t as unknown as Record<string, unknown>).cv_text as string) || "";
      const matchSearch =
        q === "" ||
        `${t.first_name} ${t.last_name}`.toLowerCase().includes(q) ||
        (t.bio?.toLowerCase().includes(q) ?? false) ||
        t.competencies.some((c) => c.competency.toLowerCase().includes(q)) ||
        cvText.toLowerCase().includes(q);

      // Type filter
      const matchType = typeFilter === "all" || t.type === typeFilter;

      // Level filter: trainer must have at least one competency with this level
      const matchLevel =
        levelFilter === "all" ||
        t.competencies.some((c) => c.level === levelFilter);

      // Competency filter
      const matchCompetency =
        competencyFilter === "all" ||
        t.competencies.some(
          (c) => c.competency.toLowerCase() === competencyFilter.toLowerCase()
        );

      // Availability filter
      const matchAvailability =
        availabilityFilter === "all" ||
        (availabilityFilter === "available" && !!t.availability_notes) ||
        (availabilityFilter === "unavailable" && !t.availability_notes);

      return matchSearch && matchType && matchLevel && matchCompetency && matchAvailability;
    });
  }, [trainers, search, typeFilter, levelFilter, competencyFilter, availabilityFilter]);

  const hasFilters =
    search !== "" ||
    levelFilter !== "all" ||
    typeFilter !== "all" ||
    availabilityFilter !== "all" ||
    competencyFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setLevelFilter("all");
    setTypeFilter("all");
    setAvailabilityFilter("all");
    setCompetencyFilter("all");
  };

  // Stats
  const totalExperts = trainers.filter((t) =>
    t.competencies.some((c) => c.level === "expert")
  ).length;
  const totalInternal = trainers.filter((t) => t.type === "internal").length;
  const totalExternal = trainers.filter((t) => t.type === "external").length;

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CVthèque</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bibliothèque de CVs et compétences des formateurs — recherche instantanée
          </p>
        </div>

        {/* Quick stats */}
        <div className="hidden sm:flex items-center gap-4 text-center">
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
            <p className="text-xl font-bold text-gray-900">{trainers.length}</p>
            <p className="text-xs text-gray-500">Formateurs</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
            <p className="text-xl font-bold text-green-600">{totalExperts}</p>
            <p className="text-xs text-gray-500">Experts</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
            <p className="text-xl font-bold text-blue-600">{totalInternal}</p>
            <p className="text-xs text-gray-500">Internes</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
            <p className="text-xl font-bold text-orange-500">{totalExternal}</p>
            <p className="text-xs text-gray-500">Externes</p>
          </div>
        </div>
      </div>

      {/* Search + Filters bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher par nom, biographie, compétence, contenu du CV…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11 text-sm bg-gray-50 border-gray-200 focus:bg-white"
          />
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
            <Filter className="h-3.5 w-3.5" />
            <span>Filtres :</span>
          </div>

          {/* Level filter */}
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="h-8 text-xs w-44 bg-gray-50">
              <Star className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
              <SelectValue placeholder="Niveau" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les niveaux</SelectItem>
              <SelectItem value="beginner">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                  Débutant
                </span>
              </SelectItem>
              <SelectItem value="intermediate">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                  Intermédiaire
                </span>
              </SelectItem>
              <SelectItem value="expert">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  Expert
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Type filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 text-xs w-36 bg-gray-50">
              <User className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous types</SelectItem>
              <SelectItem value="internal">Interne</SelectItem>
              <SelectItem value="external">Externe</SelectItem>
            </SelectContent>
          </Select>

          {/* Availability filter */}
          <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
            <SelectTrigger className="h-8 text-xs w-44 bg-gray-50">
              <BookOpen className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
              <SelectValue placeholder="Disponibilité" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes disponibilités</SelectItem>
              <SelectItem value="available">Disponible (notes renseignées)</SelectItem>
              <SelectItem value="unavailable">Non renseigné</SelectItem>
            </SelectContent>
          </Select>

          {/* Competency filter */}
          {allCompetencies.length > 0 && (
            <Select value={competencyFilter} onValueChange={setCompetencyFilter}>
              <SelectTrigger className="h-8 text-xs w-52 bg-gray-50">
                <Users className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                <SelectValue placeholder="Compétence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes compétences</SelectItem>
                {allCompetencies.map((comp) => (
                  <SelectItem key={comp} value={comp}>
                    {comp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="h-8 px-3 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
            >
              Effacer les filtres
            </button>
          )}
        </div>
      </div>

      {/* Results summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {loading ? (
            "Chargement…"
          ) : (
            <>
              <span className="font-medium text-gray-800">{filtered.length}</span> formateur
              {filtered.length !== 1 ? "s" : ""} trouvé
              {filtered.length !== 1 ? "s" : ""}
              {hasFilters && trainers.length !== filtered.length && (
                <span className="text-gray-400"> sur {trainers.length}</span>
              )}
            </>
          )}
        </p>

        {/* Level legend */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-gray-400">
          {(["beginner", "intermediate", "expert"] as const).map((level) => (
            <span key={level} className="flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full", LEVEL_DOT_CLASSES[level])} />
              {LEVEL_LABELS[level]}
            </span>
          ))}
        </div>
      </div>

      {/* Results grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <User className="h-8 w-8 text-gray-300" />
          </div>
          <p className="text-gray-600 font-medium text-base mb-1">Aucun formateur trouvé</p>
          <p className="text-gray-400 text-sm max-w-sm">
            {hasFilters
              ? "Aucun formateur ne correspond à vos critères de recherche. Essayez de modifier ou d'effacer vos filtres."
              : "Aucun formateur n'est encore enregistré dans le système."}
          </p>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Effacer tous les filtres
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((trainer) => (
            <TrainerCard key={trainer.id} trainer={trainer} />
          ))}
        </div>
      )}
    </div>
  );
}
