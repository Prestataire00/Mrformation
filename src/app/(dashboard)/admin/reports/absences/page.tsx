"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { ChevronLeft, ChevronRight, Download, Loader2, RefreshCw } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";
import { useToast } from "@/components/ui/use-toast";

interface AbsenceRow {
  id: string;
  date: string;
  reason: string | null;
  status: string;
  notes: string | null;
  session_title: string;
  learner_name: string;
  slot_start: string | null;
  slot_end: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  justified: "Absence Justifiée",
  unjustified: "Absence Injustifiée",
  excused: "Absence Excusée",
};

export default function AbsencesPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSlots, setTotalSlots] = useState(0);
  // Force refetch counter — incremented on manual refresh or visibility change
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchAbsences = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    try {
      // Fetch absences with entity_id filter via session join
      const { data, error } = await supabase
        .from("formation_absences")
        .select(`
          id, date, reason, status, notes,
          time_slot:formation_time_slots(start_time, end_time),
          session:sessions!inner(id, title, entity_id),
          learner:learners(first_name, last_name)
        `)
        .eq("session.entity_id", entityId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });

      if (error) {
        console.error("[Absences] fetch error:", error);
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        setAbsences([]);
      } else if (data) {
        const rows: AbsenceRow[] = data.map((a: Record<string, unknown>) => {
          const session = a.session as { title?: string } | null;
          const learner = a.learner as { first_name?: string; last_name?: string } | null;
          const timeSlot = a.time_slot as { start_time?: string; end_time?: string } | null;
          return {
            id: a.id as string,
            date: a.date as string,
            reason: a.reason as string | null,
            status: (a.status as string) || "unjustified",
            notes: a.notes as string | null,
            session_title: session?.title || "—",
            learner_name: learner ? `${learner.last_name?.toUpperCase() ?? ""} ${learner.first_name ?? ""}`.trim() : "—",
            slot_start: timeSlot?.start_time || null,
            slot_end: timeSlot?.end_time || null,
          };
        });
        setAbsences(rows);
      }

      // Count total enrollments for entity sessions in the year (for stats denominator)
      const { data: sessionIds, error: sessError } = await supabase
        .from("sessions")
        .select("id")
        .eq("entity_id", entityId)
        .gte("start_date", startDate)
        .lte("start_date", endDate);

      if (sessError) {
        console.error("[Absences] sessions fetch error:", sessError);
        setTotalSlots(0);
      } else {
        const ids = (sessionIds || []).map((s: { id: string }) => s.id);
        if (ids.length > 0) {
          const { count } = await supabase
            .from("enrollments")
            .select("id", { count: "exact", head: true })
            .in("session_id", ids);
          setTotalSlots(count || 0);
        } else {
          setTotalSlots(0);
        }
      }
    } catch (err) {
      console.error("[Absences] fetchAbsences failed:", err);
      toast({ title: "Erreur", description: "Impossible de charger les absences", variant: "destructive" });
      setAbsences([]);
    } finally {
      setLoading(false);
    }
  }, [entityId, year, supabase, refreshKey, toast]);

  useEffect(() => {
    fetchAbsences();
  }, [fetchAbsences]);

  // Refresh on page visibility change (user comes back from another tab/page)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setRefreshKey((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const absenceCount = absences.length;
  const returnCount = absences.filter((a) => a.notes?.toLowerCase().includes("retour")).length;
  const noReturnCount = absenceCount - returnCount;
  const absencePct = totalSlots > 0 ? ((absenceCount / totalSlots) * 100).toFixed(2) : "0.00";
  const returnPct = totalSlots > 0 ? ((returnCount / totalSlots) * 100).toFixed(2) : "0.00";
  const noReturnPct = totalSlots > 0 ? ((noReturnCount / totalSlots) * 100).toFixed(2) : "0.00";

  const handleDownload = () => {
    const headers = ["Date", "Créneau", "Formation", "Apprenant", "Motif", "Type"];
    const rows = absences.map((a) => [
      a.date,
      a.slot_start && a.slot_end ? `${a.slot_start} - ${a.slot_end}` : "—",
      a.session_title,
      a.learner_name,
      a.reason || "",
      STATUS_LABELS[a.status] || a.status,
    ]);
    downloadXlsx(headers, rows, `suivi_absences_${year}.xlsx`);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Suivi des Absences</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setYear((y) => y - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[56px] text-center text-sm font-semibold text-gray-800">
              {year}
            </span>
            <button
              onClick={() => setYear((y) => y + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            title="Actualiser les données"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleDownload}
            disabled={absences.length === 0}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "#374151" }}
          >
            <Download className="h-4 w-4" />
            Télécharger en Excel
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 space-y-1 text-sm text-gray-700">
        <p>Pourcentage d&apos;absence: <strong>{absencePct}%</strong></p>
        <p>Pourcentage de retour en formation: <strong>{returnPct}%</strong></p>
        <p>Pourcentage d&apos;absence sans date de retours: <strong>{noReturnPct}%</strong></p>
        <p>Total absences: <strong>{absenceCount}</strong> sur <strong>{totalSlots}</strong> inscriptions</p>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#374151]" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Créneau</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Formation</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Apprenant</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Motif</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
              </tr>
            </thead>
            <tbody>
              {absences.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-gray-400">
                    Aucune absence enregistrée sur cette période
                  </td>
                </tr>
              ) : (
                absences.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700 text-xs">{row.date}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {row.slot_start && row.slot_end ? `${row.slot_start} - ${row.slot_end}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-[#374151] text-xs">{row.session_title}</td>
                    <td className="px-4 py-3 text-gray-700">{row.learner_name}</td>
                    <td className="px-4 py-3 text-gray-600">{row.reason || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{STATUS_LABELS[row.status] || row.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
