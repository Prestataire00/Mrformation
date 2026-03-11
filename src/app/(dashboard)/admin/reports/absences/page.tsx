"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Filter, Download, Loader2 } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";

interface AbsenceRow {
  id: string;
  creneau: string;
  formation: string;
  apprenant: string;
  motif: string;
  dateRetour: string;
  type: string;
}

export default function AbsencesPage() {
  const supabase = createClient();
  const year = new Date().getFullYear();
  const [dateFrom, setDateFrom] = useState(`${year}-01-01`);
  const [dateTo, setDateTo] = useState(`${year}-12-31`);
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Stats
  const totalSlots = absences.length > 0 ? 100 : 0; // placeholder base
  const absenceCount = absences.length;
  const returnCount = absences.filter((a) => a.dateRetour).length;
  const noReturnCount = absences.filter((a) => !a.dateRetour).length;
  const absencePct = totalSlots > 0 ? ((absenceCount / totalSlots) * 100).toFixed(2) : "0.00";
  const returnPct = absenceCount > 0 ? ((returnCount / absenceCount) * 100).toFixed(2) : "0.00";
  const noReturnPct = absenceCount > 0 ? ((noReturnCount / absenceCount) * 100).toFixed(2) : "0.00";
  const abandonPct = "0.00";

  const fetchAbsences = useCallback(async () => {
    setLoading(true);
    // Try to fetch from a real absences/attendance table if it exists
    const { data, error } = await supabase
      .from("absences")
      .select("*")
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: false });

    if (!error && data) {
      setAbsences(
        data.map((a: Record<string, unknown>) => ({
          id: a.id as string,
          creneau: `${a.start_time || ""} - ${a.end_time || ""}`,
          formation: (a.formation_name as string) || "",
          apprenant: (a.learner_name as string) || "",
          motif: (a.motif as string) || "",
          dateRetour: (a.return_date as string) || "",
          type: (a.type as string) || "Absence Injustifiée",
        }))
      );
    } else {
      // Table may not exist yet — show empty
      setAbsences([]);
    }
    setLoading(false);
  }, [supabase, dateFrom, dateTo]);

  useEffect(() => {
    fetchAbsences();
  }, [fetchAbsences]);

  const handleFilter = () => {
    fetchAbsences();
  };

  const handleDownload = () => {
    const headers = ["Créneau de l'absence", "Formation", "Apprenant", "Motif", "Date de retour", "Type"];
    const rows = absences.map((a) => [a.creneau, a.formation, a.apprenant, a.motif, a.dateRetour, a.type]);
    downloadXlsx(headers, rows, "suivi_absences.xlsx");
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Suivi des Absences</h1>

      {/* Filters row */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-600">Date de début:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
          />
          <span className="text-sm text-gray-600">Date de fin:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
          />
          <button
            onClick={handleFilter}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            style={{ background: "#3DB5C5" }}
          >
            <Filter className="h-4 w-4" />
            Filtrer
          </button>
        </div>
        <button
          onClick={handleDownload}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
          style={{ background: "#3DB5C5" }}
        >
          <Download className="h-4 w-4" />
          Télécharger en Excel
        </button>
      </div>

      {/* Stats */}
      <div className="mb-6 space-y-1 text-sm text-gray-700">
        <p>Pourcentage d&apos;absence: <strong>{absencePct}%</strong></p>
        <p>Pourcentage de retour en formation: <strong>{returnPct}%</strong></p>
        <p>Pourcentage d&apos;absence sans date de retours: <strong>{noReturnPct}%</strong></p>
        <p>Pourcentage d&apos;abandon: <strong>{abandonPct}%</strong></p>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Créneau de l&apos;absence</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Formation</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Apprenant</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Motif</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Date de retour</th>
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
                    <td className="px-4 py-3 text-gray-700 text-xs">{row.creneau}</td>
                    <td className="px-4 py-3 text-[#3DB5C5] text-xs">{row.formation}</td>
                    <td className="px-4 py-3 text-gray-700">{row.apprenant}</td>
                    <td className="px-4 py-3 text-gray-600">{row.motif}</td>
                    <td className="px-4 py-3 text-gray-600">{row.dateRetour || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{row.type}</td>
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
