"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Building2,
  User,
  Mail,
  Phone,
  ExternalLink,
  Loader2,
  ClipboardList,
  MessageSquare,
  Send,
  X,
  Download,
} from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatDate } from "@/lib/utils";
import type { CrmProspect, ProspectStatus } from "@/lib/types";

import ProspectTasksSection from "./_components/ProspectTasksSection";
import ProspectCommentsSection from "./_components/ProspectCommentsSection";
import ProspectEmailSection from "./_components/ProspectEmailSection";

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new:       { label: "Lead",        color: "#3DB5C5" },
  contacted: { label: "Contacté",    color: "#f97316" },
  qualified: { label: "Qualifié",    color: "#8b5cf6" },
  proposal:  { label: "Proposition", color: "#2563EB" },
  won:       { label: "Gagné",       color: "#22c55e" },
  lost:      { label: "Refus",       color: "#ef4444" },
  dormant:   { label: "Dormant",     color: "#9ca3af" },
};

const STATUS_OPTIONS: { value: ProspectStatus; label: string }[] = [
  { value: "new", label: "Lead" },
  { value: "contacted", label: "Contacté" },
  { value: "qualified", label: "Qualifié" },
  { value: "proposal", label: "Proposition" },
  { value: "won", label: "Gagné" },
  { value: "lost", label: "Refus" },
  { value: "dormant", label: "Dormant" },
];

const SOURCE_OPTIONS = [
  "Bouche à oreille",
  "Réseaux sociaux",
  "Site web",
  "Email",
  "Téléphone",
  "Événement",
  "Partenaire",
  "Autre",
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProspectListePage() {
  const router = useRouter();
  const supabase = createClient();
  const { entityId } = useEntity();

  // Data
  const [prospects, setProspects] = useState<CrmProspect[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  // Extra filters
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [profiles, setProfiles] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);

  useEffect(() => {
    if (!entityId) return;
    supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("entity_id", entityId)
      .in("role", ["admin", "commercial", "trainer"])
      .order("first_name")
      .then(({ data }) => setProfiles(data ?? []));
  }, [supabase, entityId]);

  // Selection
  const [selectedProspect, setSelectedProspect] = useState<CrmProspect | null>(null);

  // ── Fetch prospects ─────────────────────────────────────────────────────────

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("crm_prospects")
      .select("*", { count: "exact" })
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search.trim()) {
      query = query.or(
        `company_name.ilike.%${search.trim()}%,contact_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`
      );
    }

    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    if (sourceFilter && sourceFilter !== "all") {
      query = query.eq("source", sourceFilter);
    }

    const { data, count, error } = await query;

    if (!error) {
      setProspects((data as CrmProspect[]) ?? []);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [supabase, entityId, page, search, statusFilter, sourceFilter]);

  useEffect(() => {
    if (entityId) fetchProspects();
  }, [fetchProspects, entityId]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sourceFilter]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  function extractAmount(notes: string | null): number {
    if (!notes) return 0;
    const match = notes.match(/Montant HT[^:]*:\s*([\d\s.,]+)/);
    if (!match) return 0;
    return parseFloat(match[1].replace(/\s/g, "").replace(",", ".")) || 0;
  }

  const extraFiltered = prospects.filter((p) => {
    if (assignedFilter !== "all" && p.assigned_to !== assignedFilter) return false;
    if (dateFrom && p.created_at < dateFrom) return false;
    if (dateTo && p.created_at > dateTo + "T23:59:59") return false;
    if (amountMin && extractAmount(p.notes) < parseFloat(amountMin)) return false;
    return true;
  });

  const handleExportExcel = () => {
    const headers = ["Entreprise", "Contact", "Email", "Téléphone", "Statut", "Source", "Montant", "Date de création"];
    const rows = extraFiltered.map((p) => [
      p.company_name,
      p.contact_name ?? "",
      p.email ?? "",
      p.phone ?? "",
      STATUS_CONFIG[p.status]?.label ?? p.status,
      p.source ?? "",
      extractAmount(p.notes).toFixed(2),
      new Date(p.created_at).toLocaleDateString("fr-FR"),
    ]);
    downloadXlsx(headers, rows, `prospects_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  function handleSelectProspect(p: CrmProspect) {
    setSelectedProspect((prev) => (prev?.id === p.id ? null : p));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tous les Prospects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount} prospect{totalCount > 1 ? "s" : ""} au total
          </p>
        </div>
        <button
          onClick={handleExportExcel}
          className="border border-[#3DB5C5] text-[#3DB5C5] px-4 py-2 rounded-lg text-sm flex items-center gap-1"
        >
          <Download className="h-4 w-4" /> Télécharger en Excel
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Rechercher entreprise, contact, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les sources</SelectItem>
            {SOURCE_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assignedFilter} onValueChange={setAssignedFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Assigné à" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les commerciaux</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#3DB5C5]"
          />
          <span className="text-xs text-gray-400">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#3DB5C5]"
          />
        </div>
        <input
          type="number"
          placeholder="Montant min €"
          value={amountMin}
          onChange={(e) => setAmountMin(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#3DB5C5] w-[130px]"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : extraFiltered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-gray-700">Aucun prospect trouvé</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search || statusFilter !== "all" || sourceFilter !== "all"
                  ? "Essayez de modifier vos filtres."
                  : "Ajoutez vos premiers prospects depuis le tunnel de vente."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/80">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Entreprise</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Tél</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Source</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden xl:table-cell">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {extraFiltered.map((p) => {
                    const st = STATUS_CONFIG[p.status] ?? { label: p.status, color: "#6b7280" };
                    const isSelected = selectedProspect?.id === p.id;

                    return (
                      <tr
                        key={p.id}
                        onClick={() => handleSelectProspect(p)}
                        className={cn(
                          "cursor-pointer transition-colors",
                          isSelected ? "bg-blue-50/70" : "hover:bg-gray-50/50"
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-600">
                              {p.company_name.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium text-gray-900 truncate max-w-[200px]">
                              {p.company_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 truncate max-w-[150px]">
                          {p.contact_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 truncate max-w-[180px] hidden md:table-cell">
                          {p.email || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                          {p.phone || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className="text-white text-[10px] font-medium"
                            style={{ backgroundColor: st.color }}
                          >
                            {st.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                          {p.source || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs hidden xl:table-cell">
                          {formatDate(p.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/admin/crm/prospects/${p.id}`);
                            }}
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="Voir la fiche"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Page {page} sur {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Detail Panel ─────────────────────────────────────────────────────── */}
      {selectedProspect && (
        <Card className="border-blue-200">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-sm font-bold text-blue-700">
                  {selectedProspect.company_name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <CardTitle className="text-lg">{selectedProspect.company_name}</CardTitle>
                  <div className="flex items-center gap-2 mt-0.5">
                    {selectedProspect.contact_name && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        {selectedProspect.contact_name}
                      </span>
                    )}
                    {selectedProspect.email && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {selectedProspect.email}
                      </span>
                    )}
                    {selectedProspect.phone && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {selectedProspect.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  className="text-white text-xs"
                  style={{
                    backgroundColor: STATUS_CONFIG[selectedProspect.status]?.color ?? "#6b7280",
                  }}
                >
                  {STATUS_CONFIG[selectedProspect.status]?.label ?? selectedProspect.status}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => router.push(`/admin/crm/prospects/${selectedProspect.id}`)}
                >
                  <ExternalLink className="h-3 w-3 mr-1.5" />
                  Fiche complète
                </Button>
                <button
                  onClick={() => setSelectedProspect(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="tasks" className="w-full">
              <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 gap-6 mb-4">
                <TabsTrigger
                  value="tasks"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none bg-transparent px-1 pb-2.5 text-sm font-medium"
                >
                  <ClipboardList className="h-4 w-4 mr-1.5" />
                  Tâches
                </TabsTrigger>
                <TabsTrigger
                  value="comments"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none bg-transparent px-1 pb-2.5 text-sm font-medium"
                >
                  <MessageSquare className="h-4 w-4 mr-1.5" />
                  Commentaires
                </TabsTrigger>
                <TabsTrigger
                  value="emails"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none bg-transparent px-1 pb-2.5 text-sm font-medium"
                >
                  <Send className="h-4 w-4 mr-1.5" />
                  Emails
                </TabsTrigger>
              </TabsList>

              <TabsContent value="tasks">
                <ProspectTasksSection
                  prospectId={selectedProspect.id}
                  prospectName={selectedProspect.company_name}
                />
              </TabsContent>
              <TabsContent value="comments">
                <ProspectCommentsSection prospectId={selectedProspect.id} />
              </TabsContent>
              <TabsContent value="emails">
                <ProspectEmailSection
                  prospectId={selectedProspect.id}
                  prospect={selectedProspect}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
