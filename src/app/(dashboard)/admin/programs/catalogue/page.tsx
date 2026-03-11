"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Program } from "@/lib/types";
import { cn, formatDate, truncate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Monitor,
  Search,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function CataloguePage() {
  const supabase = createClient();
  const router = useRouter();
  const { toast } = useToast();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("programs")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les programmes.", variant: "destructive" });
    } else {
      setPrograms((data as Program[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const handleToggleCatalogue = async (program: Program) => {
    const newActive = !program.is_active;
    const { error } = await supabase
      .from("programs")
      .update({ is_active: newActive, updated_at: new Date().toISOString() })
      .eq("id", program.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: newActive ? "Publié dans le catalogue" : "Retiré du catalogue",
        description: program.title,
      });
      await fetchPrograms();
    }
  };

  const filtered = programs.filter((p) => {
    const matchSearch =
      search === "" ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all" ||
      (filter === "published" && p.is_active) ||
      (filter === "draft" && !p.is_active);
    return matchSearch && matchFilter;
  });

  const publishedCount = programs.filter((p) => p.is_active).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Monitor className="h-6 w-6 text-[#3DB5C5]" />
            Catalogue en Ligne
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {publishedCount} programme{publishedCount !== 1 ? "s" : ""} publié{publishedCount !== 1 ? "s" : ""} sur {programs.length} au total
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher un programme..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 border rounded-lg p-1 bg-gray-50 w-fit">
          {([
            { key: "all", label: "Tous" },
            { key: "published", label: "Publiés" },
            { key: "draft", label: "Non publiés" },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                filter === f.key
                  ? "bg-white shadow-sm text-gray-900 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Programs list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Globe className="h-12 w-12 text-gray-300 mb-3" />
          <p className="font-medium text-gray-600">Aucun programme trouvé</p>
          <p className="text-sm text-gray-400 mt-1">
            {search || filter !== "all"
              ? "Modifiez vos filtres"
              : "Publiez vos programmes pour les rendre visibles dans le catalogue"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((program) => {
            const moduleCount =
              program.content &&
              typeof program.content === "object" &&
              "modules" in program.content &&
              Array.isArray((program.content as Record<string, unknown>).modules)
                ? ((program.content as Record<string, unknown>).modules as unknown[]).length
                : 0;

            return (
              <div
                key={program.id}
                className={cn(
                  "bg-white border rounded-xl p-5 flex items-center gap-5 group hover:shadow-md transition-shadow",
                  !program.is_active && "opacity-60"
                )}
              >
                {/* Status indicator */}
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                  program.is_active ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"
                )}>
                  {program.is_active ? <Globe className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className="text-sm font-semibold text-gray-900 cursor-pointer hover:text-[#3DB5C5] transition-colors"
                      onClick={() => router.push(`/admin/programs/${program.id}`)}
                    >
                      {program.title}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        program.is_active
                          ? "border-green-200 text-green-700 bg-green-50"
                          : "border-gray-200 text-gray-500"
                      )}
                    >
                      {program.is_active ? "Publié" : "Non publié"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] font-mono border-blue-200 text-blue-700 bg-blue-50">
                      v{program.version}
                    </Badge>
                  </div>
                  {program.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{truncate(program.description, 120)}</p>
                  )}
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400">
                    {moduleCount > 0 && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" /> {moduleCount} module{moduleCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Modifié le {formatDate(program.updated_at)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs h-8"
                    onClick={() => router.push(`/admin/programs/${program.id}`)}
                  >
                    <Eye className="h-3.5 w-3.5" /> Voir
                  </Button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {program.is_active ? "En ligne" : "Hors ligne"}
                    </span>
                    <Switch
                      checked={program.is_active}
                      onCheckedChange={() => handleToggleCatalogue(program)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
