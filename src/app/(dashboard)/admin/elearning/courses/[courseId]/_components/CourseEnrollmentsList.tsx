"use client";

/**
 * EL-6 audit BMAD — Vue Inscriptions sur la fiche cours admin.
 *
 * Avant : l'API POST /api/elearning/[courseId]/enroll existait, mais
 * aucune section dans la fiche admin pour voir QUI est inscrit à ce
 * cours, sa progression, ou pour le désinscrire. L'admin n'avait pas
 * de visibilité.
 *
 * GET /api/elearning/[courseId]/enroll (ajouté EL-6) charge la liste.
 * DELETE /api/elearning/[courseId]/enroll désinscrit (audit log).
 *
 * Affichage : tableau apprenant / status / progression / inscrit le /
 * terminé le / action (désinscrire).
 */

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Trash2, Users, CheckCircle2, PlayCircle, Pause } from "lucide-react";

interface Enrollment {
  id: string;
  course_id: string;
  learner_id: string;
  status: "enrolled" | "in_progress" | "completed";
  completion_rate: number | null;
  started_at: string | null;
  completed_at: string | null;
  enrolled_at: string;
  learner: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

interface Props {
  courseId: string;
}

const STATUS_LABELS: Record<Enrollment["status"], string> = {
  enrolled: "Inscrit",
  in_progress: "En cours",
  completed: "Terminé",
};

const STATUS_COLORS: Record<Enrollment["status"], string> = {
  enrolled: "bg-gray-100 text-gray-700 border-gray-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const STATUS_ICONS: Record<Enrollment["status"], React.ReactNode> = {
  enrolled: <Pause className="h-3 w-3" />,
  in_progress: <PlayCircle className="h-3 w-3" />,
  completed: <CheckCircle2 className="h-3 w-3" />,
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR");
}

export function CourseEnrollmentsList({ courseId }: Props) {
  const { toast } = useToast();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<Enrollment | null>(null);
  const [removing, setRemoving] = useState(false);

  const fetchEnrollments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/elearning/${courseId}/enroll`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        throw new Error(body.error || `Erreur ${res.status}`);
      }
      setEnrollments(body.data ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau";
      toast({ title: "Erreur", description: message, variant: "destructive" });
      setEnrollments([]);
    } finally {
      setLoading(false);
    }
  }, [courseId, toast]);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/elearning/${courseId}/enroll`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollment_id: removeTarget.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        throw new Error(body.error || `Erreur ${res.status}`);
      }
      const name = `${removeTarget.learner?.first_name ?? ""} ${removeTarget.learner?.last_name ?? ""}`.trim() || "Apprenant";
      toast({ title: "Désinscrit", description: `${name} a été retiré du cours.` });
      await fetchEnrollments();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  };

  const completedCount = enrollments.filter((e) => e.status === "completed").length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600" />
          Inscriptions
          <Badge variant="secondary" className="ml-1 text-xs">
            {enrollments.length}
          </Badge>
          {completedCount > 0 && (
            <span className="text-xs text-emerald-600 font-normal">
              · {completedCount} terminé{completedCount > 1 ? "s" : ""}
            </span>
          )}
        </h3>
      </div>

      {loading ? (
        <div className="p-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : enrollments.length === 0 ? (
        <p className="p-6 text-sm text-center text-gray-400">
          Aucun apprenant inscrit à ce cours pour le moment.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Apprenant</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Statut</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Progression</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Inscrit le</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Terminé le</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {enrollments.map((e) => {
                const name = `${e.learner?.last_name?.toUpperCase() ?? ""} ${e.learner?.first_name ?? ""}`.trim() || "Apprenant supprimé";
                const pct = e.completion_rate ?? 0;
                return (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <p className="font-medium text-gray-900">{name}</p>
                      {e.learner?.email && (
                        <p className="text-xs text-gray-500">{e.learner.email}</p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={`text-[10px] gap-1 ${STATUS_COLORS[e.status]}`}>
                        {STATUS_ICONS[e.status]}
                        {STATUS_LABELS[e.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full bg-blue-500 transition-all"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 tabular-nums">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600">{fmtDate(e.enrolled_at)}</td>
                    <td className="px-4 py-2 text-xs text-gray-600">{fmtDate(e.completed_at)}</td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setRemoveTarget(e)}
                        title="Désinscrire cet apprenant"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog confirmation désinscription */}
      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && !removing && setRemoveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Désinscrire l&apos;apprenant</DialogTitle>
            <DialogDescription>
              {removeTarget
                ? `${removeTarget.learner?.first_name ?? ""} ${removeTarget.learner?.last_name ?? ""} sera désinscrit. Sa progression sur les chapitres et son score d'examen final seront perdus. Cette action est définitive.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleConfirmRemove} disabled={removing}>
              {removing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Désinscrire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
