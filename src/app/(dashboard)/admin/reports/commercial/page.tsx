"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Filter, Download, Loader2 } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";

interface CommercialRow {
  id: string;
  date_creation: string;
  commercial: string;
  nom_lead: string;
  nom_opportunite: string;
  montant_ht_non_confirme: number;
  montant_ht_confirme: number;
  etape_tunnel: string;
  statut_crm: string;
  source_lead: string;
}

const STATUT_COLORS: Record<string, string> = {
  "Gagné": "bg-green-100 text-green-700",
  "Perdu": "bg-red-100 text-red-700",
  "indécis": "bg-gray-100 text-gray-500",
};

export default function SuiviCommercialPage() {
  const supabase = createClient();
  const { entity } = useEntity();
  const year = new Date().getFullYear();

  const [dateFrom, setDateFrom] = useState(`${year}-01-01`);
  const [dateTo, setDateTo] = useState(`${year}-12-31`);
  const [searchCommercial, setSearchCommercial] = useState("");
  const [searchLead, setSearchLead] = useState("");
  const [searchOpportunite, setSearchOpportunite] = useState("");
  const [rows, setRows] = useState<CommercialRow[]>([]);
  const [loading, setLoading] = useState(true);

  const entityName = entity?.name ?? "MR FORMATION";

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Try loading from prospects table (CRM data)
    const { data: prospects, error } = await supabase
      .from("prospects")
      .select("*")
      .gte("created_at", dateFrom)
      .lte("created_at", dateTo + "T23:59:59")
      .order("created_at", { ascending: false });

    if (!error && prospects && prospects.length > 0) {
      const mapped: CommercialRow[] = prospects.map((p: Record<string, unknown>) => ({
        id: p.id as string,
        date_creation: new Date(p.created_at as string).toLocaleString("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        commercial: entityName,
        nom_lead: (p.company as string) || (p.name as string) || "",
        nom_opportunite: (p.opportunity_name as string) || "",
        montant_ht_non_confirme: (p.amount as number) || 0,
        montant_ht_confirme: 0,
        etape_tunnel: (p.stage as string) || "Lead",
        statut_crm: (p.status as string) || "indécis",
        source_lead: (p.source as string) || "indécis",
      }));
      setRows(mapped);
    } else {
      setRows([]);
    }
    setLoading(false);
  }, [supabase, dateFrom, dateTo, entityName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filters
  const filtered = rows.filter((r) => {
    if (searchCommercial.trim() && !r.commercial.toLowerCase().includes(searchCommercial.toLowerCase())) return false;
    if (searchLead.trim() && !r.nom_lead.toLowerCase().includes(searchLead.toLowerCase())) return false;
    if (searchOpportunite.trim() && !r.nom_opportunite.toLowerCase().includes(searchOpportunite.toLowerCase())) return false;
    return true;
  });

  // Totals
  const totalNonConfirme = filtered.reduce((sum, r) => sum + r.montant_ht_non_confirme, 0);
  const totalConfirme = filtered.reduce((sum, r) => sum + r.montant_ht_confirme, 0);

  const fmtEur = (val: number) => `${val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} EUR`;

  const handleDownload = () => {
    const headers = ["Date de création", "Commercial", "Nom du lead", "Nom de l'opportunité", "Montant HT (non confirmés)", "Montant HT confirmé", "Étape dans le tunnel", "Statut CRM", "Source du lead"];
    const dataRows = filtered.map((r) => [
      r.date_creation, r.commercial, r.nom_lead, r.nom_opportunite,
      fmtEur(r.montant_ht_non_confirme), fmtEur(r.montant_ht_confirme),
      r.etape_tunnel, r.statut_crm, r.source_lead,
    ]);
    dataRows.push(["Totals", "", "", "", fmtEur(totalNonConfirme), fmtEur(totalConfirme), "", "", ""]);
    downloadXlsx(headers, dataRows, "suivi_commercial.xlsx");
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Suivi Commercial</h1>

      {/* Filters */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={searchCommercial}
            onChange={(e) => setSearchCommercial(e.target.value)}
            placeholder="Nom du commercial"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:border-[#3DB5C5]"
          />
          <input
            type="text"
            value={searchLead}
            onChange={(e) => setSearchLead(e.target.value)}
            placeholder="Nom du lead"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:border-[#3DB5C5]"
          />
          <input
            type="text"
            value={searchOpportunite}
            onChange={(e) => setSearchOpportunite(e.target.value)}
            placeholder="Nom de l'opportunité"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:border-[#3DB5C5]"
          />
          <span className="text-sm text-gray-600">De</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
          />
          <span className="text-sm text-gray-600">À</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
          />
          <button
            onClick={fetchData}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            style={{ background: "#3DB5C5" }}
          >
            <Filter className="h-4 w-4" />
            Filtrer
          </button>
        </div>
        <button
          onClick={handleDownload}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 shrink-0"
          style={{ background: "#3DB5C5" }}
        >
          <Download className="h-4 w-4" />
          Télécharger en Excel
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-3 text-left font-semibold text-gray-600">Date de création</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600">Commercial</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600">Nom du lead</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 min-w-[200px]">Nom de l&apos;opportunité</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">Montant HT des devis (non confirmés)</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">Montant HT confirmé</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600">Étape dans le tunnel</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600">Statut CRM</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600">Source du lead</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-gray-400">
                    Aucune donnée commerciale sur cette période
                  </td>
                </tr>
              ) : (
                <>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5 text-gray-700">{row.date_creation}</td>
                      <td className="px-3 py-2.5 text-gray-700">{row.commercial}</td>
                      <td className="px-3 py-2.5 text-gray-800 font-medium">{row.nom_lead}</td>
                      <td className="px-3 py-2.5 text-[#3DB5C5]">{row.nom_opportunite || ""}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtEur(row.montant_ht_non_confirme)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtEur(row.montant_ht_confirme)}</td>
                      <td className="px-3 py-2.5 text-gray-600">{row.etape_tunnel}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUT_COLORS[row.statut_crm] || "bg-gray-100 text-gray-500"}`}>
                          {row.statut_crm}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUT_COLORS[row.source_lead] || "bg-gray-100 text-gray-500"}`}>
                          {row.source_lead}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                    <td className="px-3 py-3 text-gray-800" colSpan={4}>Totals</td>
                    <td className="px-3 py-3 text-right text-gray-800">{fmtEur(totalNonConfirme)}</td>
                    <td className="px-3 py-3 text-right text-gray-800">{fmtEur(totalConfirme)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
