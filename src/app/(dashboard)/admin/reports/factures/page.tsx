"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Download, Loader2, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { downloadXlsx } from "@/lib/export-xlsx";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

interface InvoiceRow {
  id: string;
  session_id: string;
  session_title: string;
  session_start_date: string | null;
  recipient_type: string;
  recipient_name: string;
  amount: number;
  reference: string;
  status: string;
  due_date: string | null;
  is_avoir: boolean;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  sent: "Envoyée",
  paid: "Payée",
  late: "En retard",
  cancelled: "Annulée",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  late: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500 line-through",
};

const TYPE_LABELS: Record<string, string> = {
  learner: "Apprenant",
  company: "Entreprise",
  financier: "Financeur",
};

export default function SuiviFacturesPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const fetchInvoices = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("formation_invoices")
        .select("id, session_id, recipient_type, recipient_name, amount, reference, status, due_date, is_avoir, created_at, prefix, number")
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });

      if (!data || data.length === 0) {
        setInvoices([]);
        setLoading(false);
        return;
      }

      // Fetch session info
      const sessionIds = [...new Set(data.map((d) => d.session_id))];
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, title, start_date")
        .in("id", sessionIds);

      const sessionMap = new Map(
        (sessions ?? []).map((s) => [s.id, s])
      );

      const rows: InvoiceRow[] = data.map((inv) => {
        const session = sessionMap.get(inv.session_id);
        return {
          ...inv,
          session_title: session?.title || "—",
          session_start_date: session?.start_date || null,
        };
      });

      setInvoices(rows);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les factures", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [supabase, entityId, toast]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Filtered data
  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (typeFilter !== "all" && inv.recipient_type !== typeFilter) return false;
      if (dateFrom && inv.created_at < dateFrom) return false;
      if (dateTo && inv.created_at > dateTo + "T23:59:59") return false;
      return true;
    });
  }, [invoices, statusFilter, typeFilter, dateFrom, dateTo]);

  // Stats (exclude avoirs)
  const realInvoices = filtered.filter((i) => !i.is_avoir);
  const totalInvoiced = realInvoices.reduce((sum, i) => sum + Number(i.amount), 0);
  const totalPaid = realInvoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + Number(i.amount), 0);
  const totalPending = realInvoices.filter((i) => i.status === "pending" || i.status === "sent").reduce((sum, i) => sum + Number(i.amount), 0);
  const totalLate = realInvoices.filter((i) => i.status === "late").reduce((sum, i) => sum + Number(i.amount), 0);

  const handleMarkPaid = async (inv: InvoiceRow) => {
    try {
      const res = await fetch(`/api/formations/${inv.session_id}/invoices`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: inv.id, status: "paid" }),
      });
      if (res.ok) {
        toast({ title: "Facture marquée payée" });
        fetchInvoices();
      } else {
        toast({ title: "Erreur", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    }
  };

  const handleDownload = () => {
    const headers = ["Référence", "Formation", "Destinataire", "Type", "Montant", "Statut", "Échéance", "Date création"];
    const rows = filtered.map((inv) => [
      inv.reference,
      inv.session_title,
      inv.recipient_name,
      TYPE_LABELS[inv.recipient_type] || inv.recipient_type,
      Number(inv.amount).toFixed(2),
      STATUS_LABELS[inv.status] || inv.status,
      inv.due_date ? new Date(inv.due_date).toLocaleDateString("fr-FR") : "—",
      new Date(inv.created_at).toLocaleDateString("fr-FR"),
    ]);
    downloadXlsx(headers, rows, "suivi_factures.xlsx");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Suivi des Factures</h1>
        <button
          onClick={handleDownload}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
          style={{ background: "#374151" }}
        >
          <Download className="h-4 w-4" />
          Télécharger en Excel
        </button>
      </div>

      {/* Stats */}
      <div className="mb-6 space-y-1 text-sm text-gray-700">
        <p>Total facturé : <strong>{formatCurrency(totalInvoiced)}</strong></p>
        <p>Total payé : <strong className="text-green-600">{formatCurrency(totalPaid)}</strong></p>
        <p>En attente : <strong className="text-amber-600">{formatCurrency(totalPending)}</strong></p>
        <p>En retard : <strong className="text-red-600">{formatCurrency(totalLate)}</strong></p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date début</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#374151]"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date fin</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#374151]"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Statut</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#374151]"
          >
            <option value="all">Tous</option>
            <option value="pending">En attente</option>
            <option value="sent">Envoyée</option>
            <option value="paid">Payée</option>
            <option value="late">En retard</option>
            <option value="cancelled">Annulée</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#374151]"
          >
            <option value="all">Tous</option>
            <option value="learner">Apprenant</option>
            <option value="company">Entreprise</option>
            <option value="financier">Financeur</option>
          </select>
        </div>
        {(dateFrom || dateTo || statusFilter !== "all" || typeFilter !== "all") && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); setStatusFilter("all"); setTypeFilter("all"); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline pb-1"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Référence</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Formation</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Destinataire</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Montant</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Statut</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Échéance</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-gray-400">
                  Aucune facture trouvée
                </td>
              </tr>
            ) : (
              filtered.map((inv) => {
                const badge = STATUS_COLORS[inv.status] ?? STATUS_COLORS.pending;
                return (
                  <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">
                      {inv.reference}
                      {inv.is_avoir && (
                        <Badge variant="outline" className="ml-2 text-xs border-purple-300 text-purple-600">Avoir</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <Link href={`/admin/formations/${inv.session_id}`} className="text-[#374151] hover:underline font-medium">
                        {inv.session_title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{inv.recipient_name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{TYPE_LABELS[inv.recipient_type] || inv.recipient_type}</td>
                    <td className={`px-4 py-3 text-right font-medium ${inv.is_avoir ? "text-purple-600" : "text-gray-900"}`}>
                      {formatCurrency(inv.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${badge} hover:${badge} text-xs`}>
                        {STATUS_LABELS[inv.status] || inv.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {inv.status !== "paid" && inv.status !== "cancelled" && !inv.is_avoir && (
                        <button
                          onClick={() => handleMarkPaid(inv)}
                          className="text-green-600 hover:text-green-800 text-xs font-medium flex items-center gap-1"
                        >
                          <CheckCircle className="h-3 w-3" /> Payée
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
