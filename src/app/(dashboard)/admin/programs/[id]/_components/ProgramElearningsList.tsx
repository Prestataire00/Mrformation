"use client";

/**
 * ELE-3 audit BMAD — Section "Cours e-learning générés" sur la fiche
 * programme.
 *
 * Symétrie data : on a déjà le bouton "Générer un E-Learning depuis ce
 * programme" qui crée elearning_courses.program_id = current_program_id.
 * Cette section affiche le BACKLINK : tous les cours e-learning qui
 * pointent vers ce programme.
 *
 * Affichage : 1 carte par cours avec titre, status (publié/brouillon),
 * nombre de chapitres, durée estimée. Clic → /admin/elearning/courses/[id].
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Monitor, Clock, Globe, EyeOff, ExternalLink, Loader2 } from "lucide-react";

interface CourseRow {
  id: string;
  title: string;
  status: string;
  generation_status: string | null;
  estimated_duration_minutes: number | null;
  updated_at: string;
  elearning_chapters: { id: string }[];
}

interface Props {
  programId: string;
}

export function ProgramElearningsList({ programId }: Props) {
  const supabase = createClient();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("elearning_courses")
      .select("id, title, status, generation_status, estimated_duration_minutes, updated_at, elearning_chapters(id)")
      .eq("program_id", programId)
      .order("updated_at", { ascending: false });
    setCourses((data as unknown as CourseRow[]) ?? []);
    setLoading(false);
  }, [supabase, programId]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement des cours e-learning…
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">
        Aucun cours e-learning généré depuis ce programme pour le moment.
        Utilisez le bouton « Générer un E-Learning » ci-dessus.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {courses.map((c) => {
        const chapters = c.elearning_chapters?.length ?? 0;
        const durationMin = c.estimated_duration_minutes ?? 0;
        const durationLabel =
          durationMin >= 60
            ? `${Math.round((durationMin / 60) * 10) / 10}h`
            : `${durationMin} min`;
        const isPublished = c.status === "published";
        const isProcessing =
          c.generation_status === "generating" || c.generation_status === "extracting";
        const isFailed = c.generation_status === "failed";
        return (
          <Card key={c.id} className="p-3 hover:shadow-md transition-shadow">
            <Link href={`/admin/elearning/courses/${c.id}`} className="block space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Monitor className="h-4 w-4 text-purple-600 shrink-0" />
                  <p className="text-sm font-medium text-gray-900 truncate">{c.title}</p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {isPublished ? (
                  <Badge className="bg-green-100 text-green-700 border-green-200 border text-[10px] gap-1">
                    <Globe className="h-3 w-3" /> Publié
                  </Badge>
                ) : isFailed ? (
                  <Badge className="bg-red-100 text-red-700 border-red-200 border text-[10px]">
                    Échec
                  </Badge>
                ) : isProcessing ? (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 border text-[10px]">
                    En cours…
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] gap-1 text-gray-500">
                    <EyeOff className="h-3 w-3" /> Brouillon
                  </Badge>
                )}
                {chapters > 0 && (
                  <span className="text-[10px] text-gray-500">
                    {chapters} chapitre{chapters > 1 ? "s" : ""}
                  </span>
                )}
                {durationMin > 0 && (
                  <span className="text-[10px] text-gray-500 inline-flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" /> {durationLabel}
                  </span>
                )}
              </div>
            </Link>
          </Card>
        );
      })}
    </div>
  );
}
