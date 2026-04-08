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
  contact: string;
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

const ETAPE_LABELS: Record<string, string> = {
  new: "Lead",
  contacted: "Contacté",
  qualified: "Qualifié",
  proposal: "Proposition",
  won: "Gagné",
  lost: "Refus",
  dormant: "Dormant",
};

const ETAPE_COLORS: Record<string, string> = {
  Lead: "bg-cyan-100 text-cyan-700",
  Contacté: "bg-orange-100 text-orange-700",
  Qualifié: "bg-violet-100 text-violet-700",
  Proposition: "bg-blue-100 text-blue-700",
  Gagné: "bg-green-100 text-green-700",
  Refus: "bg-red-100 text-red-700",
  Dormant: "bg-gray-100 text-gray-500",
};

interface ProspectRow {
  id: string;
  company_name: string;
  contact_name: string | null;
  status: string;
  source: string | null;
  created_at: string;
  assigned_to: string | null;
  assignee: { first_name: string | null; last_name: string | null }[] | { first_name: string | null; last_name: string | null } | null;
}

export default function SuiviCommercialPage() {
  const supabase = createClient();
  const { entity, entityId } = useEntity();
  const year = new Date().getFullYear();

  const [dateFrom, setDateFrom] = useState(`${year}-01-01`);
  const [dateTo, setDateTo] = useState(`${year}-12-31`);
  const [searchCommercial, setSearchCommercial] = useState("");
  const [searchLead, setSearchLead] = useState("");
  const [searchContact, setSearchContact] = useState("");
  const [rows, setRows] = useState<CommercialRow[]>([]);
  const [loading, setLoading] = useState(true);

  const entityName = entity?.name ?? "MR FORMATION";

  const fetchData = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);

    // Fetch prospects with assigned commercial profile
    const { data: prospects } = await supabase
      .from("crm_prospects")
      .select("id, company_name, contact_name, status, source, created_at, assigned_to, assignee:profiles!crm_prospects_assigned_to_fkey(first_name, last_name)")
      .eq("entity_id", entityId)
      .gte("created_at", dateFrom)
      .lte("created_at", dateTo + "T23:59:59")
      .order("created_at", { ascending: false });

    // Fetch all quotes for this entity to compute amounts per prospect
    const { data: quotes } = await supabase
      .from("crm_quotes")
      .select("prospect_id, amount, status")
      .eq("entity_id", entityId)
      .not("prospect_id", "is", null);

    // Group quotes by prospect_id
    const quotesByProspect: Record<string, { nonConfirme: number; confirme: number; hasAccepted: boolean; allRejected: boolean }> = {};
    if (quotes) {
      for (const q of quotes) {
        if (!q.prospect_id) continue;
        if (!quotesByProspect[q.prospect_id]) {
          quotesByProspect[q.prospect_id] = { nonConfirme: 0, confirme: 0, hasAccepted: false, allRejected: true };
        }
        const entry = quotesByProspect[q.prospect_id];
        const amount = Number(q.amount ?? 0);
        if (q.status === "accepted") {
          entry.confirme += amount;
          entry.hasAccepted = true;
          entry.allRejected = false;
        } else if (q.status === "draft" || q.status === "sent") {
          entry.nonConfirme += amount;
          entry.allRejected = false;
        } else if (q.status === "expired") {
          entry.allRejected = false;
        }
        // rejected keeps allRejected = true
      }
    }

    if (prospects && prospects.length > 0) {
      const mapped: CommercialRow[] = (prospects as unknown as ProspectRow[]).map((p) => {
        const rawAssignee = p.assignee;
        const assignee = (Array.isArray(rawAssignee) ? rawAssignee[0] ?? null : rawAssignee) as { first_name: string | null; last_name: string | null } | null;
        const commercialName = assignee
          ? [assignee.first_name, assignee.last_name].filter(Boolean).join(" ")
          : entityName;

        const qData = quotesByProspect[p.id];
        let statutCrm = "indécis";
        if (qData?.hasAccepted) statutCrm = "Gagné";
        else if (qData && qData.allRejected && (qData.confirme > 0 || qData.nonConfirme > 0 || Object.keys(quotesByProspect).length > 0)) {
          // Only mark as "Perdu" if there were actually quotes, all rejected
          const prospectQuotes = quotes?.filter((q) => q.prospect_id === p.id) ?? [];
          if (prospectQuotes.length > 0 && prospectQuotes.every((q) => q.status === "rejected")) {
            statutCrm = "Perdu";
          }
        }

        return {
          id: p.id,
          date_creation: new Date(p.created_at).toLocaleString("sv-SE", {
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
          }),
          commercial: commercialName || entityName,
          nom_lead: p.company_name,
          contact: p.contact_name ?? "",
          montant_ht_non_confirme: qData?.nonConfirme ?? 0,
          montant_ht_confirme: qData?.confirme ?? 0,
          etape_tunnel: ETAPE_LABELS[p.status] ?? p.status,
          statut_crm: statutCrm,
          source_lead: p.source ?? "indécis",
        };
      });
      setRows(mapped);
    } else {
      setRows([]);
    }
    setLoading(false);
  }, [supabase, dateFrom, dateTo, entityId, entityName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filters
  const filtered = rows.filter((r) => {
    if (searchCommercial.trim() && !r.commercial.toLowerCase().includes(searchCommercial.toLowerCase())) return false;
    if (searchLead.trim() && !r.nom_lead.toLowerCase().includes(searchLead.toLowerCase())) return false;
    if (searchContact.trim() && !r.contact.toLowerCase().includes(searchContact.toLowerCase())) return false;
    return true;
  });

  // Totals
  const totalNonConfirme = filtered.reduce((sum, r) => sum + r.montant_ht_non_confirme, 0);
  const totalConfirme = filtered.reduce((sum, r) => sum + r.montant_ht_confirme, 0);

  const fmtEur = (val: number) => `${val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} EUR`;

  const handleDownload = () => {
    const headers = ["Date de création", "Commercial", "Nom du lead", "Contact", "Montant HT (non confirmés)", "Montant HT confirmé", "Étape dans le tunnel", "Statut CRM", "Source du lead"];
    const dataRows = filtered.map((r) => [
      r.date_creation, r.commercial, r.nom_lead, r.contact,
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
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:border-[#374151]"
          />
          <input
            type="text"
            value={searchLead}
            onChange={(e) => setSearchLead(e.target.value)}
            placeholder="Nom du lead"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:border-[#374151]"
          />
          <input
            type="text"
            value={searchContact}
            onChange={(e) => setSearchContact(e.target.value)}
            placeholder="Contact"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:border-[#374151]"
          />
          <span className="text-sm text-gray-600">De</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#374151]"
          />
          <span className="text-sm text-gray-600">À</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#374151]"
          />
          <button
            onClick={fetchData}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            style={{ background: "#374151" }}
          >
            <Filter className="h-4 w-4" />
            Filtrer
          </button>
        </div>
        <button
          onClick={handleDownload}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 shrink-0"
          style={{ background: "#374151" }}
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
                <th className="px-3 py-3 text-left font-semibold text-gray-600 min-w-[200px]">Contact</th>
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
                      <td className="px-3 py-2.5 text-[#374151]">{row.contact}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtEur(row.montant_ht_non_confirme)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtEur(row.montant_ht_confirme)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ETAPE_COLORS[row.etape_tunnel] || "bg-gray-100 text-gray-500"}`}>
                          {row.etape_tunnel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUT_COLORS[row.statut_crm] || "bg-gray-100 text-gray-500"}`}>
                          {row.statut_crm}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
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
