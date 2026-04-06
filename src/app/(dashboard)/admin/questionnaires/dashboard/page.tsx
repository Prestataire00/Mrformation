"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  BarChart2,
  CheckCircle,
  XCircle,
  MessageSquare,
  Star,
  Users,
  ChevronRight,
  Download,
  FileSpreadsheet,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────────────

interface QuestionnaireStats {
  id: string;
  title: string;
  type: string;
  quality_indicator_type: string | null;
  is_active: boolean;
  responses_count: number;
  avg_rating: number | null;
  last_response_at: string | null;
}

// ─── Qualiopi indicators ──────────────────────────────────────────────────────

const QUALIOPI_INDICATORS = [
  { key: "eval_preformation",    label: "Éval. Préformation",      short: "Pré" },
  { key: "eval_pendant",         label: "Éval. Pendant",           short: "Pend." },
  { key: "eval_postformation",   label: "Éval. Postformation",     short: "Post" },
  { key: "auto_eval_pre",        label: "Auto-Éval. Pré",          short: "AutoPré" },
  { key: "auto_eval_post",       label: "Auto-Éval. Post",         short: "AutoPost" },
  { key: "satisfaction_chaud",   label: "Satisfaction Chaud",      short: "Chaud" },
  { key: "satisfaction_froid",   label: "Satisfaction Froid",      short: "Froid" },
  { key: "quest_financeurs",     label: "Financeurs",              short: "Fin." },
  { key: "quest_formateurs",     label: "Formateurs",              short: "Form." },
  { key: "quest_managers",       label: "Managers",                short: "Mgr" },
  { key: "quest_entreprises",    label: "Entreprises",             short: "Entr." },
  { key: "autres_quest",         label: "Autres",                  short: "Autres" },
];

const TYPE_LABELS: Record<string, string> = {
  satisfaction: "Satisfaction",
  evaluation: "Évaluation",
  survey: "Enquête",
};

const TYPE_COLORS: Record<string, string> = {
  satisfaction: "bg-green-100 text-green-700",
  evaluation: "bg-blue-100 text-blue-700",
  survey: "bg-purple-100 text-purple-700",
};

const CHART_COLORS = ["#DC2626", "#22c55e", "#f97316", "#8b5cf6", "#f59e0b", "#ec4899"];

// ─── Composant principal ─────────────────────────────────────────────────────

export default function QuestionnairesDashboardPage() {
  const supabase = createClient();
  const { entityId } = useEntity();

  const [stats, setStats] = useState<QuestionnaireStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodFilter, setPeriodFilter] = useState<"30" | "90" | "365" | "all">("30");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Global KPIs
  const [totalQuestionnaires, setTotalQuestionnaires] = useState(0);
  const [totalResponses, setTotalResponses] = useState(0);
  const [avgScore, setAvgScore] = useState<number | null>(null);
  const [activeQuestionnaires, setActiveQuestionnaires] = useState(0);

  const fetchStats = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);

    // Compute date range
    let sinceDate: string | null = null;
    if (periodFilter !== "all") {
      const d = new Date();
      d.setDate(d.getDate() - parseInt(periodFilter));
      sinceDate = d.toISOString();
    }

    // Fetch all questionnaires for this entity
    let qQuery = supabase
      .from("questionnaires")
      .select("id, title, type, quality_indicator_type, is_active")
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (typeFilter !== "all") qQuery = qQuery.eq("type", typeFilter);
    const { data: questionnaires } = await qQuery;
    if (!questionnaires) { setLoading(false); return; }

    // For each questionnaire, fetch response count and avg rating
    const enriched: QuestionnaireStats[] = await Promise.all(
      questionnaires.map(async (q) => {
        let respQuery = supabase
          .from("questionnaire_responses")
          .select("id, responses, submitted_at")
          .eq("questionnaire_id", q.id);
        if (sinceDate) respQuery = respQuery.gte("submitted_at", sinceDate);
        const { data: responses } = await respQuery;

        const count = responses?.length ?? 0;
        let lastAt: string | null = null;
        let totalRating = 0;
        let ratingCount = 0;

        if (responses && responses.length > 0) {
          lastAt = responses.sort((a, b) =>
            new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
          )[0].submitted_at;

          // Compute avg rating from responses
          for (const r of responses) {
            const resp = r.responses as Record<string, unknown>;
            for (const v of Object.values(resp)) {
              const n = Number(v);
              if (!isNaN(n) && n >= 1 && n <= 5) {
                totalRating += n;
                ratingCount++;
              }
            }
          }
        }

        return {
          ...q,
          responses_count: count,
          avg_rating: ratingCount > 0 ? Math.round((totalRating / ratingCount) * 10) / 10 : null,
          last_response_at: lastAt,
        };
      })
    );

    setStats(enriched);
    setTotalQuestionnaires(enriched.length);
    setActiveQuestionnaires(enriched.filter((q) => q.is_active).length);
    setTotalResponses(enriched.reduce((sum, q) => sum + q.responses_count, 0));

    const ratingsOnly = enriched.filter((q) => q.avg_rating !== null);
    if (ratingsOnly.length > 0) {
      const total = ratingsOnly.reduce((sum, q) => sum + (q.avg_rating ?? 0), 0);
      setAvgScore(Math.round((total / ratingsOnly.length) * 10) / 10);
    } else {
      setAvgScore(null);
    }

    setLoading(false);
  }, [entityId, periodFilter, typeFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Qualiopi coverage: which indicators have an active questionnaire?
  const coveredIndicators = new Set(
    stats.filter((q) => q.is_active && q.quality_indicator_type).map((q) => q.quality_indicator_type!)
  );

  // Chart data
  const chartData = stats
    .filter((q) => q.responses_count > 0)
    .sort((a, b) => b.responses_count - a.responses_count)
    .slice(0, 10)
    .map((q) => ({ name: q.title.length > 25 ? q.title.slice(0, 25) + "…" : q.title, responses: q.responses_count, score: q.avg_rating ?? 0 }));

  // Export all stats as XLSX
  const exportAllXLSX = () => {
    const rows = stats.map((q) => ({
      "Titre": q.title,
      "Type": TYPE_LABELS[q.type] ?? q.type,
      "Indicateur Qualiopi": q.quality_indicator_type ?? "—",
      "Actif": q.is_active ? "Oui" : "Non",
      "Nb. Réponses": q.responses_count,
      "Score Moyen": q.avg_rating ?? "—",
      "Dernière Réponse": q.last_response_at ? formatDate(q.last_response_at) : "—",
    }));

    const header = Object.keys(rows[0] ?? {}).join("\t");
    const body = rows.map((r) => Object.values(r).join("\t")).join("\n");
    const tsv = `${header}\n${body}`;
    const blob = new Blob(["\uFEFF" + tsv], { type: "text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dashboard_questionnaires.tsv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const qualiopi_covered = QUALIOPI_INDICATORS.filter((i) => coveredIndicators.has(i.key)).length;
  const qualiopi_total = QUALIOPI_INDICATORS.length;

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin/questionnaires" className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Questionnaires
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
            <span className="text-sm font-medium text-gray-700">Tableau de bord résultats</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord — Questionnaires</h1>
          <p className="text-sm text-gray-500 mt-1">Analyse agrégée des réponses et couverture Qualiopi</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as typeof periodFilter)}>
            <SelectTrigger className="w-36 text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 derniers jours</SelectItem>
              <SelectItem value="90">90 derniers jours</SelectItem>
              <SelectItem value="365">Cette année</SelectItem>
              <SelectItem value="all">Tout</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36 text-xs h-8">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="satisfaction">Satisfaction</SelectItem>
              <SelectItem value="evaluation">Évaluation</SelectItem>
              <SelectItem value="survey">Enquête</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportAllXLSX} className="gap-2 text-xs h-8">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Exporter tout
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-indigo-100 p-2.5">
              <MessageSquare className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{loading ? "…" : totalQuestionnaires}</p>
              <p className="text-xs text-gray-500">Questionnaires</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-green-100 p-2.5">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{loading ? "…" : totalResponses}</p>
              <p className="text-xs text-gray-500">Réponses ({periodFilter === "all" ? "total" : `${periodFilter}j`})</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-amber-100 p-2.5">
              <Star className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">
                {loading ? "…" : avgScore !== null ? `${avgScore}/5` : "—"}
              </p>
              <p className="text-xs text-gray-500">Score moyen</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full p-2.5" style={{ backgroundColor: "#e0f5f8" }}>
              <BarChart2 className="h-5 w-5" style={{ color: "#DC2626" }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{loading ? "…" : activeQuestionnaires}</p>
              <p className="text-xs text-gray-500">Actifs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Bar chart */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700">
                Réponses par questionnaire (top 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-56 bg-gray-100 rounded animate-pulse" />
              ) : chartData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-gray-400 text-sm">
                  Aucune réponse sur cette période.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "#6b7280" }}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: "6px", border: "1px solid #e5e7eb", fontSize: "12px" }}
                      formatter={(val: number | undefined, name: string | undefined) => [val ?? 0, name === "responses" ? "Réponses" : "Score moy."] as [number, string]}
                    />
                    <Bar dataKey="responses" radius={[4, 4, 0, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Qualiopi coverage */}
        <div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center justify-between">
                <span>Couverture Qualiopi</span>
                <Badge className={cn("text-xs", qualiopi_covered === qualiopi_total ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                  {qualiopi_covered}/{qualiopi_total}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {QUALIOPI_INDICATORS.map((ind) => {
                const covered = coveredIndicators.has(ind.key);
                return (
                  <div key={ind.key} className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs",
                    covered ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-400"
                  )}>
                    {covered
                      ? <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      : <XCircle className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                    }
                    <span className="flex-1 truncate">{ind.label}</span>
                  </div>
                );
              })}
              {qualiopi_covered < qualiopi_total && (
                <p className="text-[10px] text-amber-600 pt-1">
                  {qualiopi_total - qualiopi_covered} indicateur{qualiopi_total - qualiopi_covered > 1 ? "s" : ""} sans questionnaire actif.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Table détaillée */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-700">
            Détail par questionnaire
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : stats.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              Aucun questionnaire trouvé.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">Questionnaire</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">Type</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase text-right">Réponses</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase text-right">Score moy.</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">Dernière rép.</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase text-center">Statut</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((q) => (
                    <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 text-sm">{q.title}</p>
                        {q.quality_indicator_type && (
                          <p className="text-[10px] text-gray-400 mt-0.5">{q.quality_indicator_type.replace(/_/g, " ")}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={cn("text-xs", TYPE_COLORS[q.type] ?? "bg-gray-100 text-gray-600")}>
                          {TYPE_LABELS[q.type] ?? q.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn("font-bold", q.responses_count > 0 ? "text-gray-800" : "text-gray-300")}>
                          {q.responses_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {q.avg_rating !== null ? (
                          <span className="flex items-center justify-end gap-1 font-medium text-amber-600">
                            <Star className="h-3.5 w-3.5" fill="currentColor" />
                            {q.avg_rating}/5
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-sm">
                        {q.last_response_at ? formatDate(q.last_response_at) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={cn("text-xs", q.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                          {q.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href="/admin/questionnaires"
                          className="text-xs text-[#DC2626] hover:underline font-medium"
                        >
                          Voir résultats →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
