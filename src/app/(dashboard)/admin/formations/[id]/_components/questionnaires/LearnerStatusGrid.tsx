"use client";

import { useState, useMemo } from "react";
import { CheckCircle2, Mail, Pause, Clock, ChevronDown, ChevronUp, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import type { LearnerStatusCell, LearnerStatus } from "@/lib/utils/questionnaire-stats";

interface LearnerStatusGridProps {
  sessionId: string;
  cells: LearnerStatusCell[];
  onSelectAnswered: (cell: LearnerStatusCell) => void;
  onRefresh: () => Promise<void>;
}

const STATUS_LABELS: Record<LearnerStatus, string> = {
  answered: "Répondu",
  sent: "Envoyé",
  not_sent: "Pas envoyé",
  not_assigned: "Non attribué",
  expired: "Expiré",
};

const STATUS_ICONS: Record<LearnerStatus, React.ReactNode> = {
  answered: <CheckCircle2 className="h-3.5 w-3.5 inline" />,
  sent: <Mail className="h-3.5 w-3.5 inline" />,
  not_sent: <Pause className="h-3.5 w-3.5 inline" />,
  not_assigned: <span>—</span>,
  expired: <Clock className="h-3.5 w-3.5 inline text-red-500" />,
};

const STATUS_COLORS: Record<LearnerStatus, string> = {
  answered: "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer",
  sent: "bg-blue-50 text-blue-700 border border-blue-200",
  not_sent: "bg-gray-50 text-gray-500 border border-gray-200",
  not_assigned: "text-gray-300 text-center",
  expired: "bg-red-50 text-red-700 border border-red-200",
};

export function LearnerStatusGrid({ sessionId, cells, onSelectAnswered, onRefresh }: LearnerStatusGridProps) {
  const { toast } = useToast();
  // Grille ouverte par défaut sauf pour les très grosses sessions (> 50
  // cellules = ex 10 apprenants × 5 questionnaires). Avant : ouverte seulement
  // si >= 25, ce qui cachait les réponses pour la majorité des cas usuels.
  const [expanded, setExpanded] = useState(cells.length <= 50);
  const [filter, setFilter] = useState<LearnerStatus | "all" | "pending">("all");
  const [relaunching, setRelaunching] = useState(false);

  const learners = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cells) map.set(c.learnerId, c.learnerName);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [cells]);

  const questionnaires = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cells) map.set(c.questionnaireId, c.questionnaireTitle);
    return Array.from(map, ([id, title]) => ({ id, title }));
  }, [cells]);

  const filteredCells = useMemo(() => {
    if (filter === "all") return cells;
    if (filter === "pending") return cells.filter((c) => c.status === "sent" || c.status === "expired");
    return cells.filter((c) => c.status === filter);
  }, [cells, filter]);

  const learnerIdsToRelaunch = useMemo(() => {
    const ids = new Set<string>();
    for (const c of filteredCells) {
      if (c.status === "sent" || c.status === "expired") ids.add(c.learnerId);
    }
    return Array.from(ids);
  }, [filteredCells]);

  const cellMap = useMemo(() => {
    const map = new Map<string, LearnerStatusCell>();
    for (const c of cells) map.set(`${c.learnerId}::${c.questionnaireId}`, c);
    return map;
  }, [cells]);

  const handleRelaunch = async () => {
    if (learnerIdsToRelaunch.length === 0) {
      toast({ title: "Aucun apprenant à relancer", variant: "default" });
      return;
    }
    setRelaunching(true);
    try {
      const res = await fetch("/api/questionnaires/relaunch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, learner_ids: learnerIdsToRelaunch }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      toast({ title: `${learnerIdsToRelaunch.length} relance(s) envoyée(s)` });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur de relance";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setRelaunching(false);
    }
  };

  if (cells.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 border border-gray-200 rounded-xl bg-white">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-700">État des réponses par apprenant</span>
        <Badge variant="secondary">{learners.length} apprenant{learners.length > 1 ? "s" : ""} × {questionnaires.length} questionnaire{questionnaires.length > 1 ? "s" : ""}</Badge>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
            <Eye className="h-3 w-3" />
            Cliquez sur une cellule <span className="text-emerald-700 font-medium">verte (« Répondu »)</span> pour consulter les réponses de l&apos;apprenant.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2 px-2 sticky left-0 bg-white">Apprenant</th>
                  {questionnaires.map((q) => (
                    <th key={q.id} className="text-center py-2 px-2 font-medium text-xs text-gray-600">{q.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {learners.map((l) => (
                  <tr key={l.id} className="border-t border-gray-100">
                    <td className="py-2 px-2 font-medium sticky left-0 bg-white">{l.name}</td>
                    {questionnaires.map((q) => {
                      const cell = cellMap.get(`${l.id}::${q.id}`);
                      const status: LearnerStatus = cell?.status ?? "not_assigned";
                      const clickable = status === "answered" && cell;
                      return (
                        <td key={q.id} className="text-center py-2 px-1">
                          <span
                            onClick={() => { if (clickable) onSelectAnswered(cell); }}
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-1 rounded text-xs",
                              STATUS_COLORS[status],
                              clickable && "hover:underline",
                            )}
                            title={
                              clickable
                                ? "Cliquer pour voir les réponses de l'apprenant"
                                : status === "sent" && cell?.tokenExpiresAt
                                  ? `Token expire le ${new Date(cell.tokenExpiresAt).toLocaleDateString("fr-FR")}`
                                  : STATUS_LABELS[status]
                            }
                          >
                            {STATUS_ICONS[status]}
                            <span className="hidden sm:inline">{STATUS_LABELS[status]}</span>
                            {clickable && <Eye className="h-3 w-3 inline ml-0.5 opacity-70" />}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <Select value={filter} onValueChange={(v) => setFilter(v as LearnerStatus | "all" | "pending")}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="pending">Non-répondants (envoyé + expiré)</SelectItem>
                <SelectItem value="answered">Répondu</SelectItem>
                <SelectItem value="sent">Envoyé</SelectItem>
                <SelectItem value="not_sent">Pas envoyé</SelectItem>
                <SelectItem value="expired">Expiré</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="default"
              onClick={handleRelaunch}
              disabled={relaunching || learnerIdsToRelaunch.length === 0}
            >
              {relaunching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              Relancer non-répondants ({learnerIdsToRelaunch.length})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
