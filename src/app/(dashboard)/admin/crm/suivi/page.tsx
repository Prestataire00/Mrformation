"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import Link from "next/link";
import {
  Activity,
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  TrendingUp,
  Send,
  CheckCircle,
  XCircle,
  ClipboardList,
  FileText,
  RefreshCw,
  Plus,
  Filter,
  X,
  Loader2,
  Trash2,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDateTime, formatDate } from "@/lib/utils";
import type { CommercialActionType, CrmCommercialAction } from "@/lib/types";

// ─── Constants ──────────────────────────────────────────────────────────────

const ACTION_TYPE_CONFIG: Record<
  CommercialActionType,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  call: { label: "Appel", icon: Phone, color: "text-green-600", bg: "bg-green-100" },
  email: { label: "Email", icon: Mail, color: "text-violet-600", bg: "bg-violet-100" },
  meeting: { label: "Rendez-vous", icon: Calendar, color: "text-amber-600", bg: "bg-amber-100" },
  comment: { label: "Commentaire", icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-100" },
  status_change: { label: "Changement de statut", icon: TrendingUp, color: "text-cyan-600", bg: "bg-cyan-100" },
  quote_sent: { label: "Devis envoyé", icon: Send, color: "text-indigo-600", bg: "bg-indigo-100" },
  quote_accepted: { label: "Devis accepté", icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-100" },
  quote_rejected: { label: "Devis refusé", icon: XCircle, color: "text-red-600", bg: "bg-red-100" },
  task_created: { label: "Tâche créée", icon: ClipboardList, color: "text-orange-600", bg: "bg-orange-100" },
  document_sent: { label: "Document envoyé", icon: FileText, color: "text-gray-600", bg: "bg-gray-100" },
  relance: { label: "Relance", icon: RefreshCw, color: "text-pink-600", bg: "bg-pink-100" },
};

const ACTION_TYPE_OPTIONS: CommercialActionType[] = [
  "call", "email", "meeting", "comment", "relance",
  "status_change", "quote_sent", "quote_accepted", "quote_rejected",
  "task_created", "document_sent",
];

const PAGE_SIZE = 30;

// ─── Component ──────────────────────────────────────────────────────────────

export default function SuiviCommercialPage() {
  const supabase = createClient();
  const { entityId } = useEntity();

  // Data
  const [actions, setActions] = useState<CrmCommercialAction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // KPIs
  const [kpis, setKpis] = useState({ total: 0, calls: 0, emails: 0, relances: 0 });

  // Filters
  const [filterType, setFilterType] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  // New action dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newAction, setNewAction] = useState({
    action_type: "call" as CommercialActionType,
    prospect_id: "",
    subject: "",
    content: "",
  });

  // Prospects list for the dialog
  const [prospects, setProspects] = useState<{ id: string; company_name: string }[]>([]);

  // My active prospects
  const [myProspects, setMyProspects] = useState<{ id: string; company_name: string; status: string; amount: number | null; updated_at: string }[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Team stats
  const [teamStats, setTeamStats] = useState<{ name: string; actions: number; pipeline: number }[]>([]);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch KPIs ──────────────────────────────────────────────────────────

  const fetchKpis = useCallback(async () => {
    if (!entityId) return;
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data } = await supabase
      .from("crm_commercial_actions")
      .select("action_type")
      .eq("entity_id", entityId)
      .gte("created_at", firstDay);

    if (data) {
      setKpis({
        total: data.length,
        calls: data.filter((a) => a.action_type === "call").length,
        emails: data.filter((a) => a.action_type === "email").length,
        relances: data.filter((a) => a.action_type === "relance").length,
      });
    }
  }, [supabase, entityId]);

  // ── Fetch current user + my prospects ──────────────────────────────────

  const fetchMyData = useCallback(async () => {
    if (!entityId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    // My active prospects (non-won, non-lost, non-dormant)
    const { data: myP } = await supabase
      .from("crm_prospects")
      .select("id, company_name, status, amount, updated_at")
      .eq("entity_id", entityId)
      .not("status", "in", '("won","lost","dormant")')
      .order("updated_at", { ascending: false })
      .limit(20);
    setMyProspects(myP ?? []);

    // Team stats: actions per author this month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data: teamActions } = await supabase
      .from("crm_commercial_actions")
      .select("author_id, author:profiles(first_name, last_name)")
      .eq("entity_id", entityId)
      .gte("created_at", firstDay);

    if (teamActions) {
      const byAuthor = new Map<string, { name: string; actions: number }>();
      for (const a of teamActions) {
        const authorName = (a.author as any)?.first_name
          ? `${(a.author as any).first_name} ${(a.author as any).last_name}`
          : "Inconnu";
        const existing = byAuthor.get(a.author_id) ?? { name: authorName, actions: 0 };
        existing.actions++;
        byAuthor.set(a.author_id, existing);
      }

      // Get pipeline per author (sum of prospect amounts for active prospects)
      const { data: allProspects } = await supabase
        .from("crm_prospects")
        .select("amount")
        .eq("entity_id", entityId)
        .not("status", "in", '("won","lost","dormant")');

      const totalPipeline = (allProspects ?? []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      const stats = Array.from(byAuthor.values())
        .map((s) => ({ ...s, pipeline: Math.round(totalPipeline / (byAuthor.size || 1)) }))
        .sort((a, b) => b.actions - a.actions);
      setTeamStats(stats);
    }
  }, [supabase, entityId]);

  // ── Fetch actions ───────────────────────────────────────────────────────

  const fetchActions = useCallback(
    async (offset = 0, append = false) => {
      if (!entityId) return;
      setLoading(true);

      const params = new URLSearchParams();
      params.set("page", String(Math.floor(offset / PAGE_SIZE) + 1));
      params.set("per_page", String(PAGE_SIZE));
      if (filterType) params.set("action_type", filterType);
      if (filterDateFrom) params.set("date_from", filterDateFrom);
      if (filterDateTo) params.set("date_to", filterDateTo);
      if (filterSearch) params.set("search", filterSearch);

      try {
        const res = await fetch(`/api/crm/suivi?${params.toString()}`);
        const json = await res.json();

        if (json.data) {
          setActions((prev) =>
            append ? [...prev, ...json.data] : json.data
          );
          setTotalCount(json.meta?.total ?? 0);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    },
    [entityId, filterType, filterDateFrom, filterDateTo, filterSearch]
  );

  useEffect(() => {
    if (entityId === undefined) return;
    fetchActions(0, false);
    fetchKpis();
    fetchMyData();
  }, [entityId, fetchActions, fetchKpis, fetchMyData]);

  // ── Fetch prospects for dialog ──────────────────────────────────────────

  useEffect(() => {
    if (!entityId || prospects.length > 0) return;
    supabase
      .from("crm_prospects")
      .select("id, company_name")
      .eq("entity_id", entityId)
      .order("company_name")
      .then(({ data }) => {
        if (data) setProspects(data);
      });
  }, [entityId, supabase, prospects.length]);

  // ── Create action ──────────────────────────────────────────────────────

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await fetch("/api/crm/suivi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: newAction.action_type,
          prospect_id: newAction.prospect_id || null,
          subject: newAction.subject || null,
          content: newAction.content || null,
        }),
      });

      if (res.ok) {
        setDialogOpen(false);
        setNewAction({ action_type: "call", prospect_id: "", subject: "", content: "" });
        fetchActions(0, false);
        fetchKpis();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  // ── Delete action ──────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/crm/suivi?id=${deleteId}`, { method: "DELETE" });
      setActions((prev) => prev.filter((a) => a.id !== deleteId));
      setTotalCount((c) => c - 1);
      setDeleteId(null);
      fetchKpis();
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  }

  // ── Reset filters ─────────────────────────────────────────────────────

  function resetFilters() {
    setFilterType("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterSearch("");
  }

  const hasFilters = filterType || filterDateFrom || filterDateTo || filterSearch;
  const hasMore = actions.length < totalCount;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <span className="font-medium text-gray-700">CRM</span>
        <span className="mx-2">/</span>
        <span>Suivi Commercial</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Actions ce mois", value: kpis.total, icon: Activity, color: "#DC2626" },
          { label: "Appels", value: kpis.calls, icon: Phone, color: "#22c55e" },
          { label: "Emails", value: kpis.emails, icon: Mail, color: "#8b5cf6" },
          { label: "Relances", value: kpis.relances, icon: RefreshCw, color: "#f97316" },
        ].map((kpi) => (
          <Card key={kpi.label} className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: kpi.color + "1A" }}
              >
                <kpi.icon className="h-5 w-5" style={{ color: kpi.color }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{kpi.value}</p>
                <p className="text-xs text-gray-500">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs: Mon activité / Équipe */}
      <Tabs defaultValue="my-activity">
        <TabsList className="mb-4">
          <TabsTrigger value="my-activity" className="gap-1.5">
            <Activity className="h-4 w-4" />
            Mon activité
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5">
            <Users className="h-4 w-4" />
            Équipe
          </TabsTrigger>
        </TabsList>

        {/* ── Mon activité ── */}
        <TabsContent value="my-activity" className="space-y-4">
          {/* My active prospects */}
          {myProspects.length > 0 && (
            <Card className="bg-white border border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700">Mes prospects actifs ({myProspects.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100">
                  {myProspects.slice(0, 8).map((p) => (
                    <Link
                      key={p.id}
                      href={`/admin/crm/prospects/${p.id}`}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                          {p.company_name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-gray-700 truncate">{p.company_name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.amount && <span className="text-xs font-medium text-gray-600">{Number(p.amount).toLocaleString("fr-FR")} €</span>}
                        <Badge variant="outline" className="text-[10px]">
                          {p.status === "new" ? "Lead" : p.status === "contacted" ? "Contacté" : p.status === "qualified" ? "Qualifié" : p.status === "proposal" ? "Proposition" : p.status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Journal */}
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-gray-700 flex items-center gap-2">
                  <Activity className="h-4 w-4" style={{ color: "#DC2626" }} />
                  Journal des actions
                  {totalCount > 0 && (
                    <Badge variant="outline" className="text-[10px] ml-1">
                      {totalCount}
                    </Badge>
                  )}
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => setDialogOpen(true)}
                  className="gap-1.5 text-white"
                  style={{ background: "#DC2626" }}
                >
                  <Plus className="h-4 w-4" />
                  Nouvelle action
                </Button>
              </div>
            </CardHeader>

            <CardContent>
          {/* Filter Bar */}
          <div className="flex flex-wrap gap-3 items-end mb-5 pb-4 border-b border-gray-100">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium flex items-center gap-1">
                <Filter className="h-3 w-3" />
                Type d&apos;action
              </label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#DC2626]/30 focus:border-[#DC2626]"
              >
                <option value="">Tous les types</option>
                {ACTION_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {ACTION_TYPE_CONFIG[t].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Du</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#DC2626]/30 focus:border-[#DC2626]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Au</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#DC2626]/30 focus:border-[#DC2626]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Recherche</label>
              <Input
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Sujet ou contenu..."
                className="h-9 w-full sm:w-48 text-sm"
              />
            </div>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="text-xs text-gray-500 gap-1 self-end"
              >
                <X className="h-3 w-3" />
                Réinitialiser
              </Button>
            )}
          </div>

          {/* Actions Timeline */}
          {loading && actions.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : actions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Activity className="h-10 w-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">
                {hasFilters
                  ? "Aucune action trouvée avec ces filtres."
                  : "Aucune action commerciale enregistrée."}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {actions.map((action) => {
                const config = ACTION_TYPE_CONFIG[action.action_type] ?? {
                  label: action.action_type,
                  icon: Activity,
                  color: "text-gray-500",
                  bg: "bg-gray-100",
                };
                const Icon = config.icon;
                const authorName = action.author
                  ? `${action.author.first_name ?? ""} ${action.author.last_name ?? ""}`.trim()
                  : "—";
                const prospectName = action.prospect?.company_name;

                return (
                  <div
                    key={action.id}
                    className="flex items-start gap-3 py-3 px-3 rounded-md hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 group"
                  >
                    {/* Icon */}
                    <div
                      className={`mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${config.bg}`}
                    >
                      <Icon className={`h-4 w-4 ${config.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          className={`text-[10px] border-0 ${config.bg} ${config.color}`}
                        >
                          {config.label}
                        </Badge>
                        {prospectName && (
                          <Link
                            href={`/admin/crm/prospects/${action.prospect_id}`}
                            className="text-xs font-medium text-[#DC2626] hover:underline"
                          >
                            {prospectName}
                          </Link>
                        )}
                        <span className="text-xs text-gray-400">
                          par {authorName}
                        </span>
                      </div>

                      {action.subject && (
                        <p className="text-sm font-medium text-gray-700 mt-0.5">
                          {action.subject}
                        </p>
                      )}

                      {action.content && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {action.content}
                        </p>
                      )}

                      {/* Metadata for status changes */}
                      {action.action_type === "status_change" && action.metadata && "from" in action.metadata && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {String(action.metadata.from)} &rarr; {String(action.metadata.to)}
                        </p>
                      )}
                    </div>

                    {/* Date + Delete */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] text-gray-400 whitespace-nowrap">
                        {formatDateTime(action.created_at)}
                      </span>
                      <button
                        onClick={() => setDeleteId(action.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Load more */}
              {hasMore && (
                <div className="text-center pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchActions(actions.length, true)}
                    disabled={loading}
                  >
                    {loading ? "Chargement..." : "Charger plus"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        {/* ── Équipe ── */}
        <TabsContent value="team" className="space-y-4">
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-700">Classement ce mois</CardTitle>
            </CardHeader>
            <CardContent>
              {teamStats.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Aucune activité ce mois-ci</p>
              ) : (
                <div className="space-y-3">
                  {teamStats.map((member, i) => (
                    <div key={member.name} className="flex items-center gap-3">
                      <span className="text-lg font-bold text-gray-300 w-6 text-right">{i + 1}</span>
                      <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
                        {member.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700">{member.name}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{member.actions} action{member.actions > 1 ? "s" : ""}</span>
                          <span>{member.pipeline.toLocaleString("fr-FR")} € pipeline</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── New Action Dialog ───────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle action commerciale</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Action type */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Type d&apos;action *
              </label>
              <select
                value={newAction.action_type}
                onChange={(e) =>
                  setNewAction({ ...newAction, action_type: e.target.value as CommercialActionType })
                }
                className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#DC2626]/30 focus:border-[#DC2626]"
              >
                {ACTION_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {ACTION_TYPE_CONFIG[t].label}
                  </option>
                ))}
              </select>
            </div>

            {/* Prospect */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Prospect (optionnel)
              </label>
              <select
                value={newAction.prospect_id}
                onChange={(e) =>
                  setNewAction({ ...newAction, prospect_id: e.target.value })
                }
                className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#DC2626]/30 focus:border-[#DC2626]"
              >
                <option value="">— Aucun prospect —</option>
                {prospects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.company_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Sujet</label>
              <Input
                value={newAction.subject}
                onChange={(e) =>
                  setNewAction({ ...newAction, subject: e.target.value })
                }
                placeholder="Ex: Appel de présentation, Relance devis..."
              />
            </div>

            {/* Content */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Détails / Commentaire
              </label>
              <Textarea
                value={newAction.content}
                onChange={(e) =>
                  setNewAction({ ...newAction, content: e.target.value })
                }
                placeholder="Notes sur l'action..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
            </DialogClose>
            <Button
              onClick={handleCreate}
              disabled={saving}
              className="text-white"
              style={{ background: "#DC2626" }}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Enregistrement...
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ──────────────────────────────────── */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer cette action ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 py-2">
            Cette action sera définitivement supprimée.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
