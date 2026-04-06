"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import Link from "next/link";
import { Loader2, Search, Download, Building2, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { downloadXlsx } from "@/lib/export-xlsx";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { OpcoStatus } from "@/lib/types";

interface OpcoRow {
  id: string;
  session_id: string;
  session_title: string;
  session_start_date: string;
  financeur_name: string;
  financeur_type: string;
  status: OpcoStatus;
  amount_requested: number | null;
  amount_granted: number | null;
  amount: number | null;
  accord_number: string | null;
  deposit_date: string | null;
  response_date: string | null;
  company_name: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  a_deposer: { label: "À déposer", color: "bg-gray-100 text-gray-700" },
  deposee: { label: "Déposée", color: "bg-blue-100 text-blue-700" },
  en_cours: { label: "En cours", color: "bg-amber-100 text-amber-700" },
  acceptee: { label: "Acceptée", color: "bg-green-100 text-green-700" },
  refusee: { label: "Refusée", color: "bg-red-100 text-red-700" },
  partielle: { label: "Partielle", color: "bg-orange-100 text-orange-700" },
};

export default function OpcoPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();

  const [rows, setRows] = useState<OpcoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchData = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);

    // Fetch formation_financiers with joined session data
    const { data, error } = await supabase
      .from("formation_financiers")
      .select("id, session_id, name, type, status, amount, amount_requested, amount_granted, accord_number, deposit_date, response_date, session:sessions!inner(id, title, start_date, entity_id)")
      .eq("session.entity_id", entityId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Build rows
    const result: OpcoRow[] = [];
    for (const item of data || []) {
      const session = Array.isArray(item.session) ? item.session[0] : item.session;
      if (!session) continue;

      result.push({
        id: item.id,
        session_id: item.session_id,
        session_title: (session as Record<string, string>).title || "—",
        session_start_date: (session as Record<string, string>).start_date || "",
        financeur_name: item.name,
        financeur_type: item.type || "autre",
        status: (item.status as OpcoStatus) || "a_deposer",
        amount_requested: item.amount_requested as number | null,
        amount_granted: item.amount_granted as number | null,
        amount: item.amount as number | null,
        accord_number: item.accord_number as string | null,
        deposit_date: item.deposit_date as string | null,
        response_date: item.response_date as string | null,
        company_name: null,
      });
    }

    setRows(result);
    setLoading(false);
  }, [entityId, supabase, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filters
  const filtered = rows.filter((r) => {
    const matchSearch = search === "" || `${r.session_title} ${r.financeur_name} ${r.accord_number || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // KPIs
  const kpis = {
    enCours: rows.filter((r) => ["deposee", "en_cours"].includes(r.status)),
    acceptees: rows.filter((r) => ["acceptee", "partielle"].includes(r.status)),
    refusees: rows.filter((r) => r.status === "refusee"),
    aDeposer: rows.filter((r) => r.status === "a_deposer"),
  };
  const totalEnCoursMontant = kpis.enCours.reduce((s, r) => s + (r.amount_requested || r.amount || 0), 0);
  const totalAccordeMontant = kpis.acceptees.reduce((s, r) => s + (r.amount_granted || r.amount || 0), 0);
  const totalRefuseMontant = kpis.refusees.reduce((s, r) => s + (r.amount_requested || r.amount || 0), 0);
  const tauxAcceptation = rows.length > 0
    ? Math.round((kpis.acceptees.length / rows.filter((r) => ["acceptee", "partielle", "refusee"].includes(r.status)).length) * 100) || 0
    : 0;

  const handleExport = () => {
    const headers = ["Formation", "OPCO", "Type", "Statut", "Demandé", "Accordé", "N° accord", "Date dépôt", "Date réponse"];
    const data = filtered.map((r) => [
      r.session_title,
      r.financeur_name,
      r.financeur_type,
      STATUS_CONFIG[r.status]?.label || r.status,
      r.amount_requested || r.amount || 0,
      r.amount_granted || "",
      r.accord_number || "",
      r.deposit_date || "",
      r.response_date || "",
    ]);
    downloadXlsx(headers, data, `suivi-opco-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suivi OPCO</h1>
          <p className="text-sm text-gray-500 mt-1">{rows.length} demande{rows.length !== 1 ? "s" : ""} de prise en charge</p>
        </div>
        <Button variant="outline" onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" /> Excel
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-2xl font-bold text-blue-700">{kpis.enCours.length}</p>
          <p className="text-xs text-blue-600">En cours ({formatCurrency(totalEnCoursMontant)})</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-2xl font-bold text-green-700">{kpis.acceptees.length}</p>
          <p className="text-xs text-green-600">Accordées ({formatCurrency(totalAccordeMontant)})</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-2xl font-bold text-red-700">{kpis.refusees.length}</p>
          <p className="text-xs text-red-600">Refusées ({formatCurrency(totalRefuseMontant)})</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-2xl font-bold text-gray-700">{kpis.aDeposer.length}</p>
          <p className="text-xs text-gray-600">À déposer</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <p className="text-2xl font-bold text-indigo-700">{tauxAcceptation}%</p>
          <p className="text-xs text-indigo-600">Taux d&apos;acceptation</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucune demande OPCO trouvée</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Formation</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">OPCO</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Statut</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Demandé</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Accordé</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">N° accord</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Dépôt</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Réponse</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const sc = STATUS_CONFIG[r.status] || STATUS_CONFIG.a_deposer;
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/formations/${r.session_id}`} className="font-medium text-blue-600 hover:underline truncate max-w-[200px] block">
                        {r.session_title}
                      </Link>
                      <span className="text-xs text-muted-foreground">{formatDate(r.session_start_date)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{r.financeur_name}</span>
                      <Badge variant="outline" className="ml-1.5 text-[10px]">{r.financeur_type}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge className={`text-xs ${sc.color}`}>{sc.label}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {r.amount_requested ? formatCurrency(r.amount_requested) : r.amount ? formatCurrency(r.amount) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {r.amount_granted ? (
                        <span className={r.status === "partielle" ? "text-orange-600" : "text-green-600"}>
                          {formatCurrency(r.amount_granted)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.accord_number || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.deposit_date ? formatDate(r.deposit_date) : "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.response_date ? formatDate(r.response_date) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
