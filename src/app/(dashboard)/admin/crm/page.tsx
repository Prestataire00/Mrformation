"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Users,
  TrendingUp,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Bell,
  Target,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { cn, formatCurrency } from "@/lib/utils";

interface DashboardData {
  // Prospect funnel
  prospectsByStatus: { status: string; label: string; count: number; color: string }[];
  totalProspects: number;
  wonCount: number;
  conversionRate: number;

  // Revenue from won prospects
  wonRevenue: number;

  // Quote pipeline
  quotesByStatus: { status: string; label: string; amount: number; count: number; color: string }[];
  pipelineValue: number;

  // Tasks
  overdueTasks: number;
  activeReminders: number;
  todayTasks: number;
  completedThisWeek: number;

  // Monthly revenue (quotes from won prospects)
  monthlyRevenue: { month: string; amount: number }[];

  // Advanced metrics
  avgDealSize: number;
  avgSalesCycle: number;
  lossRate: number;

  // Pipeline analytics
  conversionRates: { from: string; to: string; rate: number; color: string }[];
  avgTimePerStage: { stage: string; days: number; color: string }[];
  winLossBySource: { source: string; won: number; lost: number; rate: number }[];
  weightedPipeline: { stage: string; count: number; totalAmount: number; weighted: number; probability: number; color: string }[];
  weightedPipelineTotal: number;
}

const DEFAULT_PROSPECT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: "Lead", color: "#3DB5C5" },
  contacted: { label: "Contacté", color: "#f97316" },
  qualified: { label: "Qualifié", color: "#8b5cf6" },
  proposal: { label: "Proposition", color: "#2563EB" },
  won: { label: "Gagné", color: "#22c55e" },
  lost: { label: "Perdu", color: "#ef4444" },
  dormant: { label: "Dormant", color: "#9ca3af" },
};

interface KanbanColumn {
  id: string;
  label: string;
  color: string;
}

function getProspectColumns(entityId: string | null): KanbanColumn[] {
  if (!entityId) return Object.entries(DEFAULT_PROSPECT_STATUS_MAP).map(([id, meta]) => ({ id, ...meta }));
  try {
    const stored = localStorage.getItem(`crm-columns-${entityId}`);
    if (stored) {
      const parsed = JSON.parse(stored) as KanbanColumn[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return Object.entries(DEFAULT_PROSPECT_STATUS_MAP).map(([id, meta]) => ({ id, ...meta }));
}

const QUOTE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "Brouillon", color: "#9ca3af" },
  sent: { label: "Envoyé", color: "#3b82f6" },
  accepted: { label: "Accepté", color: "#22c55e" },
  rejected: { label: "Refusé", color: "#ef4444" },
  expired: { label: "Expiré", color: "#f97316" },
};

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

export default function CrmDashboardPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData>({
    prospectsByStatus: [],
    totalProspects: 0,
    wonCount: 0,
    conversionRate: 0,
    wonRevenue: 0,
    quotesByStatus: [],
    pipelineValue: 0,
    overdueTasks: 0,
    activeReminders: 0,
    todayTasks: 0,
    completedThisWeek: 0,
    monthlyRevenue: [],
    avgDealSize: 0,
    avgSalesCycle: 0,
    lossRate: 0,
    conversionRates: [],
    avgTimePerStage: [],
    winLossBySource: [],
    weightedPipeline: [],
    weightedPipelineTotal: 0,
  });

  const fetchDashboard = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);

    try {
      // Fetch all data in parallel
      const [prospectsRes, quotesRes, tasksRes] = await Promise.all([
        supabase.from("crm_prospects").select("id, status, notes, amount, source, created_at, updated_at").eq("entity_id", entityId),
        supabase.from("crm_quotes").select("status, amount, created_at, prospect_id").eq("entity_id", entityId),
        supabase.from("crm_tasks").select("status, due_date, reminder_at").eq("entity_id", entityId),
      ]);

      const prospects = prospectsRes.data ?? [];
      const quotes = quotesRes.data ?? [];
      const tasks = tasksRes.data ?? [];

      // Build set of won prospect IDs
      const wonProspectIds = new Set(
        prospects.filter((p) => p.status === "won").map((p) => p.id)
      );

      // Prospect funnel — read columns from localStorage (synced with kanban config)
      const columns = getProspectColumns(entityId);
      const statusCounts: Record<string, number> = {};
      for (const p of prospects) {
        statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
      }
      const prospectsByStatus = columns.map((col) => ({
        status: col.id,
        label: col.label,
        count: statusCounts[col.id] ?? 0,
        color: col.color,
      }));

      const totalProspects = prospects.length;
      const wonCount = statusCounts["won"] ?? 0;
      const conversionRate = totalProspects > 0 ? Math.round((wonCount / totalProspects) * 100) : 0;

      // Quote pipeline
      const quoteStatusMap: Record<string, { amount: number; count: number }> = {};
      for (const q of quotes) {
        if (!quoteStatusMap[q.status]) quoteStatusMap[q.status] = { amount: 0, count: 0 };
        quoteStatusMap[q.status].amount += Number(q.amount ?? 0);
        quoteStatusMap[q.status].count += 1;
      }
      const quotesByStatus = Object.entries(QUOTE_STATUS_MAP).map(([status, meta]) => ({
        status,
        label: meta.label,
        amount: quoteStatusMap[status]?.amount ?? 0,
        count: quoteStatusMap[status]?.count ?? 0,
        color: meta.color,
      }));

      const pipelineValue =
        (quoteStatusMap["sent"]?.amount ?? 0) + (quoteStatusMap["draft"]?.amount ?? 0);

      // Tasks
      const today = new Date().toISOString().split("T")[0];
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);
      const weekStart = startOfWeek.toISOString().split("T")[0];

      let overdueTasks = 0;
      let activeReminders = 0;
      let todayTasks = 0;
      let completedThisWeek = 0;
      const nowIso = new Date().toISOString();
      for (const t of tasks) {
        if (t.due_date && t.due_date < today && t.status !== "completed" && t.status !== "cancelled") {
          overdueTasks++;
        }
        if (t.reminder_at && t.reminder_at <= nowIso && t.status !== "completed" && t.status !== "cancelled") {
          activeReminders++;
        }
        if (t.due_date === today && t.status !== "completed" && t.status !== "cancelled") {
          todayTasks++;
        }
        if (t.status === "completed" && t.due_date && t.due_date >= weekStart) {
          completedThisWeek++;
        }
      }

      // Won revenue from prospect amount field
      function getProspectAmount(p: { amount?: number | null }): number {
        return Number(p.amount) || 0;
      }

      const currentYear = new Date().getFullYear();
      const wonProspects = prospects.filter(
        (p) => p.status === "won" && p.created_at?.startsWith(String(currentYear))
      );
      const wonRevenue = wonProspects.reduce(
        (sum, p) => sum + getProspectAmount(p), 0
      );

      // Monthly revenue from won prospects (last 6 months)
      const now = new Date();
      const allWonProspects = prospects.filter((p) => p.status === "won");
      const monthlyRevenue: { month: string; amount: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
        const monthAmount = allWonProspects
          .filter((p) => p.created_at?.startsWith(yearMonth))
          .reduce((sum, p) => sum + getProspectAmount(p), 0);
        monthlyRevenue.push({ month: label, amount: monthAmount });
      }

      // Advanced metrics
      const wonProspectsList = prospects.filter((p) => p.status === "won");
      const lostCount = prospects.filter((p) => p.status === "lost").length;

      const avgDealSize = wonProspectsList.length > 0
        ? wonProspectsList.reduce((sum, p) => sum + getProspectAmount(p), 0) / wonProspectsList.length
        : 0;

      const avgSalesCycle = wonProspectsList.length > 0
        ? Math.round(wonProspectsList.reduce((sum, p) => {
            const days = Math.floor(
              (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24)
            );
            return sum + days;
          }, 0) / wonProspectsList.length)
        : 0;

      const totalProcessed = wonProspectsList.length + lostCount;
      const lossRate = totalProcessed > 0
        ? Math.round((lostCount / totalProcessed) * 100)
        : 0;

      // --- Pipeline Analytics ---

      // 1. Conversion rates between stages
      // Using cumulative approach: a prospect that reached "won" also passed through all prior stages
      const stageOrder = ["new", "contacted", "qualified", "proposal", "won"];
      const stageLabels: Record<string, string> = { new: "Lead", contacted: "Contacté", qualified: "Qualifié", proposal: "Proposition", won: "Gagné" };
      const stageColors = ["#3DB5C5", "#f97316", "#8b5cf6", "#2563EB"];
      // Count prospects that reached at least each stage (current status or later)
      const reachedStage: Record<string, number> = {};
      for (const s of stageOrder) reachedStage[s] = 0;
      for (const p of prospects) {
        const idx = stageOrder.indexOf(p.status);
        if (idx === -1) continue; // lost/dormant excluded
        for (let i = 0; i <= idx; i++) {
          reachedStage[stageOrder[i]]++;
        }
      }
      const conversionRates: { from: string; to: string; rate: number; color: string }[] = [];
      for (let i = 0; i < stageOrder.length - 1; i++) {
        const from = stageOrder[i];
        const to = stageOrder[i + 1];
        const rate = reachedStage[from] > 0 ? (reachedStage[to] / reachedStage[from]) * 100 : 0;
        conversionRates.push({ from: stageLabels[from], to: stageLabels[to], rate, color: stageColors[i] });
      }

      // 2. Average time per stage (approximate from created_at to updated_at per status group)
      const stageDays: Record<string, number[]> = {};
      for (const p of prospects) {
        if (!p.created_at || !p.updated_at) continue;
        const days = Math.max(0, Math.floor(
          (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24)
        ));
        if (!stageDays[p.status]) stageDays[p.status] = [];
        stageDays[p.status].push(days);
      }
      const avgTimePerStage = stageOrder.map((s, i) => ({
        stage: stageLabels[s] ?? s,
        days: stageDays[s] && stageDays[s].length > 0
          ? Math.round(stageDays[s].reduce((a, b) => a + b, 0) / stageDays[s].length)
          : 0,
        color: columns.find(c => c.id === s)?.color ?? "#9ca3af",
      }));

      // 3. Win/Loss by source
      const sourceStats: Record<string, { won: number; lost: number }> = {};
      for (const p of prospects) {
        if (p.status !== "won" && p.status !== "lost") continue;
        const src = p.source || "Non défini";
        if (!sourceStats[src]) sourceStats[src] = { won: 0, lost: 0 };
        if (p.status === "won") sourceStats[src].won++;
        else sourceStats[src].lost++;
      }
      const winLossBySource = Object.entries(sourceStats)
        .map(([source, s]) => ({
          source,
          won: s.won,
          lost: s.lost,
          rate: (s.won + s.lost) > 0 ? Math.round((s.won / (s.won + s.lost)) * 100) : 0,
        }))
        .sort((a, b) => (b.won + b.lost) - (a.won + a.lost));

      // 4. Weighted pipeline
      const stageProbabilities: Record<string, number> = { new: 0.1, contacted: 0.2, qualified: 0.4, proposal: 0.6 };
      const activeStages = ["new", "contacted", "qualified", "proposal"];
      const weightedPipeline = activeStages.map((s) => {
        const stageProspects = prospects.filter((p) => p.status === s);
        const totalAmount = stageProspects.reduce((sum, p) => sum + getProspectAmount(p), 0);
        const probability = stageProbabilities[s];
        return {
          stage: stageLabels[s],
          count: stageProspects.length,
          totalAmount,
          weighted: totalAmount * probability,
          probability,
          color: columns.find(c => c.id === s)?.color ?? "#9ca3af",
        };
      });
      const weightedPipelineTotal = weightedPipeline.reduce((sum, s) => sum + s.weighted, 0);

      setData({
        prospectsByStatus,
        totalProspects,
        wonCount,
        conversionRate,
        wonRevenue,
        quotesByStatus,
        pipelineValue,
        overdueTasks,
        activeReminders,
        todayTasks,
        completedThisWeek,
        monthlyRevenue,
        avgDealSize,
        avgSalesCycle,
        lossRate,
        conversionRates,
        avgTimePerStage,
        winLossBySource,
        weightedPipeline,
        weightedPipelineTotal,
      });
    } catch (err) {
      console.error("CRM Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [entityId, supabase]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3DB5C5] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard CRM</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vue d&apos;ensemble de l&apos;activité commerciale
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total prospects</p>
              <p className="text-2xl font-bold text-gray-900">{data.totalProspects}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Leads gagnés</p>
              <p className="text-2xl font-bold text-green-600">{data.wonCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <Target className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taux de conversion</p>
              <p className="text-2xl font-bold text-green-600">{data.conversionRate}%</p>
              <p className="text-[10px] text-muted-foreground">{data.wonCount}/{data.totalProspects} gagnés</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CA Gagné {new Date().getFullYear()}</p>
              <p className="text-lg font-bold text-emerald-600">{formatCurrency(data.wonRevenue)}</p>
              <p className="text-[10px] text-muted-foreground">{data.wonCount} lead{data.wonCount > 1 ? "s" : ""} gagné{data.wonCount > 1 ? "s" : ""}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100">
              <FileText className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pipeline devis</p>
              <p className="text-lg font-bold text-violet-600">{formatCurrency(data.pipelineValue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task quick stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">Tâches dues aujourd&apos;hui</p>
              <p className="text-xl font-bold">{data.todayTasks}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-xs text-muted-foreground">Tâches en retard</p>
              <p className="text-xl font-bold text-red-600">{data.overdueTasks}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Bell className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">Rappels actifs</p>
              <p className="text-xl font-bold text-amber-600">{data.activeReminders}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Complétées cette semaine</p>
              <p className="text-xl font-bold text-green-600">{data.completedThisWeek}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced CRM metrics */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taille moyenne deal</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.avgDealSize)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100">
              <Clock className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cycle de vente moyen</p>
              <p className="text-2xl font-bold text-gray-900">{data.avgSalesCycle}j</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taux de perte</p>
              <p className="text-2xl font-bold text-red-600">{data.lossRate}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#3DB5C5]" />
              Funnel de conversion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.prospectsByStatus} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number | string | undefined) => [value ?? 0, "Prospects"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {data.prospectsByStatus.map((entry) => (
                      <Cell key={entry.status} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Quote Pipeline Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-violet-600" />
              Pipeline devis par statut
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.quotesByStatus.filter((q) => q.count > 0)}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry: PieLabelRenderProps) => `${entry.name ?? ""} (${(entry as PieLabelRenderProps & { count?: number }).count ?? 0})`}
                    labelLine={false}
                  >
                    {data.quotesByStatus
                      .filter((q) => q.count > 0)
                      .map((entry) => (
                        <Cell key={entry.status} fill={entry.color} />
                      ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number | string | undefined) => [formatCurrency(Number(value ?? 0)), "Montant"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Revenue Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            Chiffre d&apos;affaires mensuel (leads gagnés)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number | string | undefined) => [formatCurrency(Number(value ?? 0)), "CA"]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="amount" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Analytics */}
      <div className="grid grid-cols-2 gap-6">
        {/* Conversion par étape */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">Taux de conversion par étape</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.conversionRates.map((stage) => (
                <div key={stage.from} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-32 shrink-0">{stage.from} &rarr; {stage.to}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${stage.rate}%`, backgroundColor: stage.color }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 w-12 text-right">{stage.rate.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Temps moyen par étape */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">Temps moyen par étape</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.avgTimePerStage.map((stage) => (
                <div key={stage.stage} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24 shrink-0">{stage.stage}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (stage.days / Math.max(1, ...data.avgTimePerStage.map((s) => s.days))) * 100)}%`,
                        backgroundColor: stage.color,
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 w-14 text-right">{stage.days}j</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Win/Loss par source */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">Win/Loss par source</CardTitle>
          </CardHeader>
          <CardContent>
            {data.winLossBySource.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucune donnée disponible</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Source</th>
                      <th className="pb-2 font-medium text-center">Gagné</th>
                      <th className="pb-2 font-medium text-center">Perdu</th>
                      <th className="pb-2 font-medium text-right">Taux</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.winLossBySource.map((row) => (
                      <tr key={row.source} className="border-b last:border-0">
                        <td className="py-2 font-medium text-gray-700">{row.source}</td>
                        <td className="py-2 text-center text-green-600 font-semibold">{row.won}</td>
                        <td className="py-2 text-center text-red-600 font-semibold">{row.lost}</td>
                        <td className="py-2 text-right">
                          <span className={cn(
                            "inline-block rounded px-1.5 py-0.5 text-[10px] font-bold",
                            row.rate >= 50 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          )}>
                            {row.rate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pipeline Pondéré */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">
              Pipeline pondéré
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                Total: {formatCurrency(data.weightedPipelineTotal)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.weightedPipeline.map((stage) => (
                <div key={stage.stage} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24 shrink-0">
                    {stage.stage}
                    <span className="text-[10px] text-muted-foreground ml-1">({(stage.probability * 100).toFixed(0)}%)</span>
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full rounded-full flex items-center justify-end pr-1"
                      style={{
                        width: data.weightedPipelineTotal > 0
                          ? `${Math.max(2, (stage.weighted / data.weightedPipelineTotal) * 100)}%`
                          : "0%",
                        backgroundColor: stage.color,
                      }}
                    >
                      {stage.weighted > 0 && (
                        <span className="text-[9px] text-white font-bold drop-shadow">{stage.count}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-gray-700 w-20 text-right">{formatCurrency(stage.weighted)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
