"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  GraduationCap,
  Loader2,
  Plus,
  Search,
  Trash2,
  Eye,
  Check,
  X,
  UserPlus,
} from "lucide-react";
import { getInitials } from "@/lib/utils";

const BRAND = "#DC2626";

interface Module {
  id: number;
  title: string;
  duration_hours?: number;
}

interface EnrolledLearner {
  id: string;
  program_id: string;
  learner_id: string;
  client_id: string | null;
  status: string;
  completion_rate: number;
  enrolled_at: string;
  learner: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    client_id: string | null;
    clients: { company_name: string } | null;
  };
  module_progress: {
    id: string;
    module_id: number;
    is_completed: boolean;
    completed_at: string | null;
    notes: string | null;
  }[];
}

interface AvailableLearner {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  client_id: string | null;
  clients: { company_name: string } | null;
}

interface Props {
  programId: string;
  modules: Module[];
}

export default function ProgramEnrollments({ programId, modules }: Props) {
  const supabase = createClient();
  const { toast } = useToast();

  const [enrollments, setEnrollments] = useState<EnrolledLearner[]>([]);
  const [loading, setLoading] = useState(true);

  // Enroll dialog
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [availableLearners, setAvailableLearners] = useState<AvailableLearner[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling] = useState(false);
  const [loadingLearners, setLoadingLearners] = useState(false);

  // Progress dialog
  const [progressOpen, setProgressOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<EnrolledLearner | null>(null);
  const [savingProgress, setSavingProgress] = useState(false);

  // ── Fetch enrolled learners ──────────────────────────────────────────
  const fetchEnrollments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("program_enrollments")
      .select(
        "id, program_id, learner_id, client_id, status, completion_rate, enrolled_at, learner:learners(id, first_name, last_name, email, client_id, clients(company_name)), module_progress:program_module_progress(id, module_id, is_completed, completed_at, notes)"
      )
      .eq("program_id", programId)
      .order("enrolled_at", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setEnrollments((data as unknown as EnrolledLearner[]) ?? []);
    }
    setLoading(false);
  }, [programId, supabase, toast]);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  // ── Open enroll dialog ───────────────────────────────────────────────
  const openEnrollDialog = async () => {
    setEnrollOpen(true);
    setSearchTerm("");
    setSelectedIds(new Set());
    setLoadingLearners(true);

    const enrolledIds = enrollments.map((e) => e.learner_id);

    const { data } = await supabase
      .from("learners")
      .select("id, first_name, last_name, email, client_id, clients(company_name)")
      .order("last_name");

    const all = (data as unknown as AvailableLearner[]) ?? [];
    setAvailableLearners(all.filter((l) => !enrolledIds.includes(l.id)));
    setLoadingLearners(false);
  };

  // ── Enroll selected learners ─────────────────────────────────────────
  const handleEnroll = async () => {
    if (selectedIds.size === 0) return;
    setEnrolling(true);

    const rows = Array.from(selectedIds).map((learner_id) => {
      const learner = availableLearners.find((l) => l.id === learner_id);
      return {
        program_id: programId,
        learner_id,
        client_id: learner?.client_id ?? null,
        status: "enrolled",
        completion_rate: 0,
      };
    });

    const { error } = await supabase.from("program_enrollments").insert(rows);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Inscrit(s)", description: `${selectedIds.size} apprenant(s) inscrit(s) au parcours.` });
      setEnrollOpen(false);
      fetchEnrollments();
    }
    setEnrolling(false);
  };

  // ── Remove enrollment ────────────────────────────────────────────────
  const handleRemove = async (enrollment: EnrolledLearner) => {
    const name = `${enrollment.learner.first_name} ${enrollment.learner.last_name}`;
    if (!confirm(`Retirer ${name} de ce parcours ?`)) return;

    const { error } = await supabase.from("program_enrollments").delete().eq("id", enrollment.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Retiré", description: `${name} a été retiré du parcours.` });
      fetchEnrollments();
    }
  };

  // ── Toggle module completion ─────────────────────────────────────────
  const toggleModule = async (moduleId: number, currentlyCompleted: boolean) => {
    if (!selectedEnrollment) return;
    setSavingProgress(true);

    const now = new Date().toISOString();

    // Upsert module progress
    const { error } = await supabase
      .from("program_module_progress")
      .upsert(
        {
          enrollment_id: selectedEnrollment.id,
          module_id: moduleId,
          is_completed: !currentlyCompleted,
          completed_at: !currentlyCompleted ? now : null,
          started_at: now,
          updated_at: now,
        },
        { onConflict: "enrollment_id,module_id" }
      );

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      setSavingProgress(false);
      return;
    }

    // Recalculate completion_rate
    const totalModules = modules.length;
    const { data: progressRows } = await supabase
      .from("program_module_progress")
      .select("is_completed")
      .eq("enrollment_id", selectedEnrollment.id);

    const completedCount = (progressRows ?? []).filter((r) => r.is_completed).length;
    const rate = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;

    // Update enrollment
    const newStatus = rate === 100 ? "completed" : completedCount > 0 ? "in_progress" : "enrolled";
    await supabase
      .from("program_enrollments")
      .update({
        completion_rate: rate,
        status: newStatus,
        started_at: completedCount > 0 ? selectedEnrollment.enrolled_at : null,
        completed_at: rate === 100 ? now : null,
      })
      .eq("id", selectedEnrollment.id);

    // Refresh local state
    const updatedProgress = (progressRows ?? []).map((r) => r) as unknown as EnrolledLearner["module_progress"];
    // Re-fetch to get clean data
    await fetchEnrollments();

    // Re-select the enrollment to refresh the dialog
    const { data: refreshed } = await supabase
      .from("program_enrollments")
      .select(
        "id, program_id, learner_id, client_id, status, completion_rate, enrolled_at, learner:learners(id, first_name, last_name, email, client_id, clients(company_name)), module_progress:program_module_progress(id, module_id, is_completed, completed_at, notes)"
      )
      .eq("id", selectedEnrollment.id)
      .single();

    if (refreshed) {
      setSelectedEnrollment(refreshed as unknown as EnrolledLearner);
    }
    setSavingProgress(false);
  };

  // ── Filter available learners by search ──────────────────────────────
  const filteredAvailable = availableLearners.filter((l) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      l.first_name.toLowerCase().includes(q) ||
      l.last_name.toLowerCase().includes(q) ||
      (l.email?.toLowerCase().includes(q) ?? false) ||
      (l.clients?.company_name?.toLowerCase().includes(q) ?? false)
    );
  });

  // ── Status badge helper ──────────────────────────────────────────────
  const statusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-700 text-xs">Terminé</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-100 text-blue-700 text-xs">En cours</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-600 text-xs">Inscrit</Badge>;
    }
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <GraduationCap className="h-5 w-5" style={{ color: BRAND }} />
          Apprenants inscrits
          <Badge variant="secondary" className="ml-1 text-xs">{enrollments.length}</Badge>
        </h2>
        <Button
          size="sm"
          onClick={openEnrollDialog}
          className="gap-1.5 text-white"
          style={{ backgroundColor: BRAND }}
        >
          <UserPlus className="h-4 w-4" />
          Inscrire des apprenants
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND }} />
        </div>
      ) : enrollments.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          Aucun apprenant inscrit à ce parcours.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Apprenant</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Entreprise</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Statut</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Progression</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {enrollments.map((e) => {
                const learner = Array.isArray(e.learner) ? e.learner[0] : e.learner;
                if (!learner) return null;
                const name = `${learner.first_name} ${learner.last_name}`;
                const initials = getInitials(learner.first_name, learner.last_name);
                return (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: BRAND }}
                        >
                          {initials}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">{name}</p>
                          <p className="text-xs text-gray-400">{learner.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {learner.clients?.company_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">{statusBadge(e.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <Progress value={e.completion_rate} className="h-2 flex-1" />
                        <span className="text-xs text-gray-500 w-10 text-right">{e.completion_rate}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="Voir la progression"
                          onClick={() => {
                            setSelectedEnrollment(e);
                            setProgressOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="Retirer du parcours"
                          onClick={() => handleRemove(e)}
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Enroll Dialog ─────────────────────────────────────────────── */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Inscrire des apprenants</DialogTitle>
          </DialogHeader>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Rechercher par nom, email, entreprise..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 min-h-[200px] max-h-[400px]">
            {loadingLearners ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : filteredAvailable.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                Aucun apprenant disponible
              </div>
            ) : (
              filteredAvailable.map((l) => {
                const selected = selectedIds.has(l.id);
                return (
                  <label
                    key={l.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${selected ? "bg-blue-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(l.id)) next.delete(l.id);
                          else next.add(l.id);
                          return next;
                        });
                      }}
                      className="rounded border-gray-300"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {l.first_name} {l.last_name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {l.email}
                        {l.clients?.company_name ? ` · ${l.clients.company_name}` : ""}
                      </p>
                    </div>
                  </label>
                );
              })
            )}
          </div>

          {selectedIds.size > 0 && (
            <p className="text-sm text-gray-500">
              {selectedIds.size} apprenant{selectedIds.size > 1 ? "s" : ""} sélectionné{selectedIds.size > 1 ? "s" : ""}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollOpen(false)}>Annuler</Button>
            <Button
              onClick={handleEnroll}
              disabled={selectedIds.size === 0 || enrolling}
              className="text-white gap-1.5"
              style={{ backgroundColor: BRAND }}
            >
              {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Inscrire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Progress Dialog ───────────────────────────────────────────── */}
      <Dialog open={progressOpen} onOpenChange={setProgressOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Progression
              {selectedEnrollment && (
                <span className="font-normal text-gray-500">
                  — {(Array.isArray(selectedEnrollment.learner) ? selectedEnrollment.learner[0] : selectedEnrollment.learner)?.first_name}{" "}
                  {(Array.isArray(selectedEnrollment.learner) ? selectedEnrollment.learner[0] : selectedEnrollment.learner)?.last_name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedEnrollment && (
            <div className="space-y-2">
              {/* Overall progress */}
              <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                <Progress value={selectedEnrollment.completion_rate} className="h-2.5 flex-1" />
                <span className="text-sm font-medium" style={{ color: BRAND }}>
                  {selectedEnrollment.completion_rate}%
                </span>
                {statusBadge(selectedEnrollment.status)}
              </div>

              {/* Module list */}
              {modules.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  Aucun module défini dans ce programme.
                </p>
              ) : (
                <div className="space-y-1">
                  {modules.map((mod) => {
                    const progress = selectedEnrollment.module_progress?.find(
                      (mp) => mp.module_id === mod.id
                    );
                    const completed = progress?.is_completed ?? false;

                    return (
                      <button
                        key={mod.id}
                        onClick={() => toggleModule(mod.id, completed)}
                        disabled={savingProgress}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left ${
                          completed
                            ? "bg-green-50 border-green-200"
                            : "bg-white border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${
                            completed
                              ? "bg-green-500 border-green-500 text-white"
                              : "border-gray-300 text-transparent"
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${completed ? "text-green-800" : "text-gray-700"}`}>
                            {mod.title}
                          </p>
                          {mod.duration_hours && (
                            <p className="text-xs text-gray-400">{mod.duration_hours}h</p>
                          )}
                        </div>
                        {savingProgress && (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setProgressOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
