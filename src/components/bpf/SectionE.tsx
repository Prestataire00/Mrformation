"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, ChevronDown } from "lucide-react";
import Link from "next/link";
import { exportToCSV } from "@/lib/utils/export-csv";
import { BPFData } from "./types";

interface SectionEProps {
  bpf: BPFData;
  year?: number;
  entityId?: string;
}

interface SubSession {
  id: string;
  title: string;
  start_date: string;
  planned_hours: number | null;
  trainerNames: string[];
}

export function SectionE({ bpf, year, entityId }: SectionEProps) {
  const supabase = createClient();
  const [autoData, setAutoData] = useState<{ hours: number; trainers: number; sessions: SubSession[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const fetchSubcontracted = useCallback(async () => {
    if (!entityId || !year) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("sessions")
        .select("id, title, start_date, planned_hours, formation_trainers(trainer_id, trainer:trainers(first_name, last_name))")
        .eq("entity_id", entityId)
        .eq("is_subcontracted", true)
        .gte("start_date", `${year}-01-01`)
        .lte("start_date", `${year}-12-31`);

      if (data) {
        const trainerIds = new Set<string>();
        const sessions: SubSession[] = data.map((s: Record<string, unknown>) => {
          const trainers = (s.formation_trainers as Array<{ trainer_id: string; trainer: { first_name: string; last_name: string } | null }>) || [];
          trainers.forEach(t => trainerIds.add(t.trainer_id));
          return {
            id: s.id as string,
            title: s.title as string,
            start_date: s.start_date as string,
            planned_hours: s.planned_hours as number | null,
            trainerNames: trainers.filter(t => t.trainer).map(t => `${t.trainer!.first_name} ${t.trainer!.last_name}`),
          };
        });
        const totalHours = sessions.reduce((sum, s) => sum + (s.planned_hours || 0), 0);
        setAutoData({ hours: totalHours, trainers: trainerIds.size, sessions });
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [entityId, year, supabase]);

  useEffect(() => { fetchSubcontracted(); }, [fetchSubcontracted]);

  const displayExtNombre = autoData ? autoData.trainers : bpf.personnesExternes.nombre;
  const displayExtHeures = autoData ? autoData.hours : bpf.personnesExternes.heures;

  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-gray-900 text-base">
          E. Personnes dispensant des heures de formation
        </h2>
        {entityId && year && (
          <Button size="sm" variant="ghost" className="text-xs gap-1 h-7" onClick={fetchSubcontracted} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Recalculer
          </Button>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left py-2 w-1/2"></th>
            <th className="text-left py-2">Nombre</th>
            <th className="text-left py-2">Nombre d&apos;heures de formation dispensées</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-gray-300">
            <td className="py-3 text-gray-700">Personnes de votre organisme dispensant des heures de formation</td>
            <td className="py-3 text-gray-800 font-medium">{bpf.personnesInternes.nombre}</td>
            <td className="py-3 text-gray-800 font-medium">{bpf.personnesInternes.heures}</td>
          </tr>
          <tr className="border-t border-gray-200">
            <td className="py-3 text-gray-700">
              Personnes extérieures (sous-traitance)
              {autoData && <Badge variant="outline" className="ml-2 text-[10px] text-blue-600 border-blue-200">auto-calculé</Badge>}
            </td>
            <td className="py-3 text-gray-800 font-medium">{displayExtNombre}</td>
            <td className="py-3 text-gray-800 font-medium">{displayExtHeures}</td>
          </tr>
        </tbody>
      </table>

      {/* Détail dépliable */}
      {autoData && autoData.sessions.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowDetail(!showDetail)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            <ChevronDown className={`h-3 w-3 transition-transform ${showDetail ? "rotate-180" : ""}`} />
            {showDetail ? "Masquer" : "Voir"} le détail ({autoData.sessions.length} session{autoData.sessions.length > 1 ? "s" : ""})
          </button>
          {showDetail && (
            <div className="mt-2 bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-3 py-1.5 font-medium text-gray-500">Formation</th>
                    <th className="text-left px-3 py-1.5 font-medium text-gray-500">Date</th>
                    <th className="text-left px-3 py-1.5 font-medium text-gray-500">Heures</th>
                    <th className="text-left px-3 py-1.5 font-medium text-gray-500">Formateur(s)</th>
                  </tr>
                </thead>
                <tbody>
                  {autoData.sessions.map(s => (
                    <tr key={s.id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="px-3 py-1.5">
                        <Link href={`/admin/formations/${s.id}`} className="text-blue-600 hover:underline">{s.title}</Link>
                      </td>
                      <td className="px-3 py-1.5 text-gray-600">{new Date(s.start_date).toLocaleDateString("fr-FR")}</td>
                      <td className="px-3 py-1.5 text-gray-600">{s.planned_hours || "—"}</td>
                      <td className="px-3 py-1.5 text-gray-600">{s.trainerNames.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 border-t bg-gray-50">
                <Button size="sm" variant="ghost" className="text-xs h-6 gap-1" onClick={() => {
                  exportToCSV(autoData.sessions.map(s => ({
                    formation: s.title,
                    date: s.start_date,
                    heures: String(s.planned_hours || 0),
                    formateurs: s.trainerNames.join(", "),
                  })), `bpf-sous-traitance-${year}`);
                }}>
                  <Download className="h-3 w-3" /> Exporter CSV
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
