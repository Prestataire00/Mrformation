"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { ChevronLeft, ChevronRight, Download, Loader2, FileText, BarChart3, Shield } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";
import { exportTableToPDF } from "@/lib/pdf-export";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// ─── Types ───────────────────────────────────────────

interface QualiteRow {
  id: string;
  formation: string;
  annee: number;
  month: string; // YYYY-MM for chart grouping
  eval_preformation: number | null;
  eval_pendant: number | null;
  eval_postformation: number | null;
  auto_eval_pre: number | null;
  auto_eval_post: number | null;
  satisfaction_chaud: number | null;
  satisfaction_froid: number | null;
  quest_financeurs: number | null;
  quest_formateurs: number | null;
  quest_managers: number | null;
  quest_entreprises: number | null;
  autres_quest: number | null;
}

type IndicatorKey = keyof Omit<QualiteRow, "id" | "formation" | "annee" | "month">;

// ─── Helpers ─────────────────────────────────────────

function fmt(val: number | null): string {
  if (val === null || val === undefined) return "-- %";
  return `${val.toFixed(1)} %`;
}

function fmtCell(val: number | null): { text: string; bg: string } {
  if (val === null || val === undefined) return { text: "-- %", bg: "" };
  const bg = val >= 80 ? "bg-green-100 text-green-800" : val >= 50 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
  return { text: `${val.toFixed(1)} %`, bg };
}

function avg(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && v !== undefined);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// All indicator columns — simpleView=true for the essential ones, ordered thematically
const ALL_INDICATOR_COLUMNS: { key: IndicatorKey; label: string; pdfLabel: string; simpleView: boolean }[] = [
  { key: "eval_preformation", label: "Éval. Préformation", pdfLabel: "Éval. Pré", simpleView: true },
  { key: "auto_eval_pre", label: "Auto-Éval. Pré", pdfLabel: "Auto Pré", simpleView: false },
  { key: "eval_pendant", label: "Éval. Pendant", pdfLabel: "Éval. Pend.", simpleView: true },
  { key: "eval_postformation", label: "Éval. Postformation", pdfLabel: "Éval. Post", simpleView: true },
  { key: "auto_eval_post", label: "Auto-Éval. Post", pdfLabel: "Auto Post", simpleView: false },
  { key: "satisfaction_chaud", label: "Satisfaction à chaud", pdfLabel: "Sat. Chaud", simpleView: true },
  { key: "satisfaction_froid", label: "Satisfaction à froid", pdfLabel: "Sat. Froid", simpleView: true },
  { key: "quest_financeurs", label: "Quest. Financeurs", pdfLabel: "Q. Financ.", simpleView: false },
  { key: "quest_formateurs", label: "Quest. Formateurs", pdfLabel: "Q. Format.", simpleView: false },
  { key: "quest_managers", label: "Quest. Managers", pdfLabel: "Q. Manag.", simpleView: false },
  { key: "quest_entreprises", label: "Quest. Entreprises", pdfLabel: "Q. Entrep.", simpleView: false },
  { key: "autres_quest", label: "Autres Questionnaires", pdfLabel: "Autres Q.", simpleView: false },
];

// ─── Qualiopi criteria ───────────────────────────────

const QUALIOPI_CRITERIA = [
  {
    num: 1,
    title: "Information du public",
    description: "Conditions d'information du public sur les prestations, les délais et les résultats obtenus",
    indicators: ["quest_financeurs", "quest_entreprises"] as IndicatorKey[],
  },
  {
    num: 2,
    title: "Identification des objectifs",
    description: "Identification précise des objectifs des prestations et adaptation aux bénéficiaires",
    indicators: ["eval_preformation", "auto_eval_pre"] as IndicatorKey[],
  },
  {
    num: 3,
    title: "Adaptation des prestations",
    description: "Adaptation aux publics bénéficiaires des prestations et des modalités d'accueil",
    indicators: ["eval_pendant"] as IndicatorKey[],
  },
  {
    num: 4,
    title: "Moyens pédagogiques",
    description: "Adéquation des moyens pédagogiques, techniques et d'encadrement",
    indicators: ["quest_formateurs"] as IndicatorKey[],
  },
  {
    num: 5,
    title: "Qualification des personnels",
    description: "Qualification et développement des connaissances et compétences des personnels",
    indicators: ["quest_formateurs"] as IndicatorKey[],
  },
  {
    num: 6,
    title: "Inscription dans l'environnement",
    description: "Inscription et investissement du prestataire dans son environnement professionnel",
    indicators: ["quest_managers", "quest_entreprises"] as IndicatorKey[],
  },
  {
    num: 7,
    title: "Amélioration continue",
    description: "Recueil et prise en compte des appréciations et des réclamations",
    indicators: ["satisfaction_chaud", "satisfaction_froid", "eval_postformation"] as IndicatorKey[],
  },
];

// ─── Component ───────────────────────────────────────

type ViewMode = "table" | "qualiopi";

export default function SuiviQualitePage() {
  const supabase = useMemo(() => createClient(), []);
  const { entityId } = useEntity();
  const [year, setYear] = useState<number>(2026);
  const dateFrom = `${year}-01-01`;
  const dateTo = `${year}-12-31`;
  const [searchName, setSearchName] = useState("");
  const [detailed, setDetailed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [rows, setRows] = useState<QualiteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // 1. Load pre-computed quality scores from quality_scores table
    let qsQuery = supabase
      .from("quality_scores")
      .select("*")
      .eq("year", year)
      .order("formation", { ascending: true });

    if (entityId) qsQuery = qsQuery.eq("entity_id", entityId);

    const { data: qualityScores } = await qsQuery;

    if (qualityScores && qualityScores.length > 0) {
      const mapped: QualiteRow[] = qualityScores.map((qs: Record<string, unknown>) => ({
        id: qs.id as string,
        formation: qs.formation as string,
        annee: qs.year as number,
        month: (qs.month as string) || `${qs.year}-01`,
        eval_preformation: qs.eval_preformation as number | null,
        eval_pendant: qs.eval_pendant as number | null,
        eval_postformation: qs.eval_postformation as number | null,
        auto_eval_pre: qs.auto_eval_pre as number | null,
        auto_eval_post: qs.auto_eval_post as number | null,
        satisfaction_chaud: qs.satisfaction_chaud as number | null,
        satisfaction_froid: qs.satisfaction_froid as number | null,
        quest_financeurs: qs.quest_financeurs as number | null,
        quest_formateurs: qs.quest_formateurs as number | null,
        quest_managers: qs.quest_managers as number | null,
        quest_entreprises: qs.quest_entreprises as number | null,
        autres_quest: qs.autres_quest as number | null,
      }));
      setRows(mapped);
      setLoading(false);
      return;
    }

    // 2. Fallback: compute from sessions + questionnaire_responses
    let query = supabase
      .from("sessions")
      .select("id, title, start_date, training:trainings(title)")
      .gte("start_date", dateFrom)
      .lte("start_date", dateTo + "T23:59:59")
      .neq("status", "cancelled")
      .order("start_date", { ascending: true });

    if (entityId) query = query.eq("entity_id", entityId);

    const { data: sessions } = await query;

    if (!sessions || sessions.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const sessionIds = sessions.map((s) => s.id as string);

    const { data: responses } = await supabase
      .from("questionnaire_responses")
      .select("session_id, responses, questionnaire:questionnaires(quality_indicator_type, questions(id, type))")
      .in("session_id", sessionIds);

    const scoreMap: Record<string, Record<string, number[]>> = {};

    if (responses) {
      for (const resp of responses) {
        const sessionId = resp.session_id as string;
        if (!sessionId) continue;

        const questionnaire = Array.isArray(resp.questionnaire)
          ? (resp.questionnaire as Record<string, unknown>[])[0]
          : (resp.questionnaire as Record<string, unknown> | null);

        const indicatorType = questionnaire?.quality_indicator_type as string | null;
        if (!indicatorType) continue;

        const questions = (questionnaire?.questions as { id: string; type: string }[]) || [];
        const ratingQuestionIds = new Set(questions.filter((q) => q.type === "rating").map((q) => q.id));

        const answersObj = (resp.responses as Record<string, unknown>) || {};
        const ratingValues: number[] = [];

        for (const [qId, answer] of Object.entries(answersObj)) {
          if (ratingQuestionIds.size > 0 && !ratingQuestionIds.has(qId)) continue;
          const num = typeof answer === "number" ? answer : parseFloat(String(answer));
          if (!isNaN(num) && num >= 0) {
            ratingValues.push(num);
          }
        }

        if (ratingValues.length > 0) {
          const avgRating = ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length;
          const maxScale = 5;
          const percentage = ((avgRating - 1) / (maxScale - 1)) * 100;

          if (!scoreMap[sessionId]) scoreMap[sessionId] = {};
          if (!scoreMap[sessionId][indicatorType]) scoreMap[sessionId][indicatorType] = [];
          scoreMap[sessionId][indicatorType].push(Math.min(100, Math.max(0, percentage)));
        }
      }
    }

    const mapped: QualiteRow[] = sessions.map((s: Record<string, unknown>) => {
      const training = Array.isArray(s.training)
        ? (s.training as { title: string }[])[0]
        : (s.training as { title: string } | null);
      const formationName = training?.title || (s.title as string) || "Sans titre";
      const startDate = new Date(s.start_date as string);
      const sessionId = s.id as string;
      const scores = scoreMap[sessionId] || {};

      const getScore = (key: string): number | null => {
        const vals = scores[key];
        if (!vals || vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      };

      return {
        id: sessionId,
        formation: formationName,
        annee: startDate.getFullYear(),
        month: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`,
        eval_preformation: getScore("eval_preformation"),
        eval_pendant: getScore("eval_pendant"),
        eval_postformation: getScore("eval_postformation"),
        auto_eval_pre: getScore("auto_eval_pre"),
        auto_eval_post: getScore("auto_eval_post"),
        satisfaction_chaud: getScore("satisfaction_chaud"),
        satisfaction_froid: getScore("satisfaction_froid"),
        quest_financeurs: getScore("quest_financeurs"),
        quest_formateurs: getScore("quest_formateurs"),
        quest_managers: getScore("quest_managers"),
        quest_entreprises: getScore("quest_entreprises"),
        autres_quest: getScore("autres_quest"),
      };
    });

    setRows(mapped);
    setLoading(false);
  }, [supabase, entityId, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter by search name
  const filtered = rows.filter((r) => {
    if (!searchName.trim()) return true;
    return r.formation.toLowerCase().includes(searchName.toLowerCase());
  });

  // Column config
  const visibleColumns = detailed
    ? ALL_INDICATOR_COLUMNS
    : ALL_INDICATOR_COLUMNS.filter(c => c.simpleView);

  // Compute averages for the "Moyenne Finale" row
  const colAverages: Record<string, number | null> = {};
  for (const col of visibleColumns) {
    colAverages[col.key] = avg(filtered.map((r) => r[col.key]));
  }

  // Computed columns per row
  function moyenneEval(r: QualiteRow): number | null {
    return avg([r.eval_preformation, r.eval_pendant, r.eval_postformation]);
  }
  function moyenneSat(r: QualiteRow): number | null {
    return avg([r.satisfaction_chaud, r.satisfaction_froid]);
  }
  function moyenneGen(r: QualiteRow): number | null {
    return avg([moyenneEval(r), moyenneSat(r)]);
  }

  // ─── Chart data ───
  const chartData = useMemo(() => {
    const monthMap: Record<string, { eval: number[]; sat: number[]; gen: number[] }> = {};

    for (const row of filtered) {
      if (!monthMap[row.month]) {
        monthMap[row.month] = { eval: [], sat: [], gen: [] };
      }
      const mE = moyenneEval(row);
      const mS = moyenneSat(row);
      const mG = moyenneGen(row);
      if (mE !== null) monthMap[row.month].eval.push(mE);
      if (mS !== null) monthMap[row.month].sat.push(mS);
      if (mG !== null) monthMap[row.month].gen.push(mG);
    }

    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => {
        const evalAvg = data.eval.length > 0 ? data.eval.reduce((a, b) => a + b, 0) / data.eval.length : null;
        const satAvg = data.sat.length > 0 ? data.sat.reduce((a, b) => a + b, 0) / data.sat.length : null;
        const genAvg = data.gen.length > 0 ? data.gen.reduce((a, b) => a + b, 0) / data.gen.length : null;

        // Format month label
        const [y, m] = month.split("-");
        const monthLabel = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });

        return {
          month: monthLabel,
          "Moy. Évaluation": evalAvg !== null ? parseFloat(evalAvg.toFixed(1)) : null,
          "Moy. Satisfaction": satAvg !== null ? parseFloat(satAvg.toFixed(1)) : null,
          "Moy. Générale": genAvg !== null ? parseFloat(genAvg.toFixed(1)) : null,
        };
      });
  }, [filtered]);

  // ─── Qualiopi scores ───
  const qualiopiScores = useMemo(() => {
    // Compute global averages for all indicators across all rows
    const allIndicators: Record<string, number[]> = {};
    const allColumns = ALL_INDICATOR_COLUMNS;

    for (const row of filtered) {
      for (const col of allColumns) {
        const val = row[col.key];
        if (val !== null && val !== undefined) {
          if (!allIndicators[col.key]) allIndicators[col.key] = [];
          allIndicators[col.key].push(val);
        }
      }
    }

    return QUALIOPI_CRITERIA.map((criterion) => {
      const scores: number[] = [];
      for (const ind of criterion.indicators) {
        const vals = allIndicators[ind];
        if (vals && vals.length > 0) {
          scores.push(vals.reduce((a, b) => a + b, 0) / vals.length);
        }
      }
      const score = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      const hasData = scores.length > 0;
      return { ...criterion, score, hasData };
    });
  }, [filtered]);

  // ─── Exports ───
  const handleDownloadExcel = () => {
    const headers = ["Formation", "Année", ...visibleColumns.map((c) => c.label), "Moyenne Évaluation", "Moyenne Satisfaction", "Moyenne Générale"];
    const dataRows = filtered.map((r) => [
      r.formation,
      r.annee.toString(),
      ...visibleColumns.map((c) => fmt(r[c.key])),
      fmt(moyenneEval(r)),
      fmt(moyenneSat(r)),
      fmt(moyenneGen(r)),
    ]);
    downloadXlsx(headers, dataRows, `suivi_qualite_${year}.xlsx`);
  };

  const handleDownloadPDF = () => {
    const headers = ["Formation", "Année", ...visibleColumns.map((c) => c.pdfLabel), "Moy. Éval.", "Moy. Sat.", "Moy. Gén."];
    const dataRows = filtered.map((r) => [
      r.formation,
      r.annee.toString(),
      ...visibleColumns.map((c) => fmt(r[c.key])),
      fmt(moyenneEval(r)),
      fmt(moyenneSat(r)),
      fmt(moyenneGen(r)),
    ]);
    const isWide = headers.length > 10;
    exportTableToPDF("Suivi Qualité — Évaluation & Satisfaction", headers, dataRows, `suivi_qualite_${year}.pdf`, "MR FORMATION", {
      orientation: isWide ? "landscape" : "portrait",
      firstColWidth: 40,
      fontSize: isWide ? 6.5 : 7.5,
    });
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Suivi Qualité (Évaluation & Satisfaction)
      </h1>

      {/* View Mode + Filters */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {/* View toggles */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 ${viewMode === "table" ? "bg-[#3DB5C5] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <BarChart3 className="h-4 w-4" />
              Tableau
            </button>
            <button
              onClick={() => setViewMode("qualiopi")}
              className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 ${viewMode === "qualiopi" ? "bg-[#3DB5C5] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <Shield className="h-4 w-4" />
              Qualiopi
            </button>
          </div>

          {viewMode === "table" && (
            <button
              onClick={() => setDetailed(d => !d)}
              className="text-white px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "#3DB5C5" }}
            >
              {detailed ? "Vue simplifiée" : "Vue détaillée"}
            </button>
          )}

          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Nom de la formation"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:border-[#3DB5C5]"
          />
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
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadExcel}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            style={{ background: "#3DB5C5" }}
          >
            <Download className="h-4 w-4" />
            Excel
          </button>
          <button
            onClick={handleDownloadPDF}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            style={{ background: "#2563EB" }}
          >
            <FileText className="h-4 w-4" />
            PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : viewMode === "qualiopi" ? (
        /* ─── QUALIOPI VIEW ─── */
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
            {qualiopiScores.map((criterion) => {
              const statusColor = !criterion.hasData
                ? "border-gray-200 bg-gray-50"
                : criterion.score !== null && criterion.score >= 80
                ? "border-green-200 bg-green-50"
                : criterion.score !== null && criterion.score >= 50
                ? "border-yellow-200 bg-yellow-50"
                : "border-red-200 bg-red-50";

              const dotColor = !criterion.hasData
                ? "bg-gray-300"
                : criterion.score !== null && criterion.score >= 80
                ? "bg-green-500"
                : criterion.score !== null && criterion.score >= 50
                ? "bg-yellow-500"
                : "bg-red-500";

              return (
                <div key={criterion.num} className={`rounded-xl border-2 p-5 ${statusColor}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-3 h-3 rounded-full ${dotColor}`} />
                    <span className="text-xs font-semibold text-gray-500 uppercase">Critère {criterion.num}</span>
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">{criterion.title}</h3>
                  <p className="text-xs text-gray-500 mb-3">{criterion.description}</p>
                  <div className="flex items-end justify-between">
                    <span className="text-2xl font-bold text-gray-900">
                      {criterion.score !== null ? `${criterion.score.toFixed(0)}%` : "—"}
                    </span>
                    {!criterion.hasData && (
                      <span className="text-xs text-gray-400">Pas de données</span>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${dotColor}`}
                        style={{ width: `${criterion.score ?? 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      ) : (
        /* ─── TABLE VIEW ─── */
        <>
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-8">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-3 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 min-w-[250px]">Formation</th>
                  <th className="px-3 py-3 text-center font-semibold text-gray-600 w-16">Année</th>
                  {visibleColumns.map((col) => (
                    <th key={col.key} className="px-3 py-3 text-center font-semibold text-gray-600 min-w-[100px]">
                      {col.label}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center font-semibold text-gray-600 min-w-[100px]">Moyenne Évaluation</th>
                  <th className="px-3 py-3 text-center font-semibold text-gray-600 min-w-[100px]">Moyenne Satisfaction</th>
                  <th className="px-3 py-3 text-center font-semibold text-gray-600 min-w-[100px]">Moyenne Générale</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 4} className="px-4 py-16 text-center text-gray-400">
                      Aucune formation trouvée sur cette période
                    </td>
                  </tr>
                ) : (
                  <>
                    {filtered.map((row) => {
                      const mEval = moyenneEval(row);
                      const mSat = moyenneSat(row);
                      const mGen = moyenneGen(row);
                      return (
                        <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 text-[#3DB5C5] font-medium sticky left-0 bg-white">{row.formation}</td>
                          <td className="px-3 py-2.5 text-center text-gray-600">{row.annee}</td>
                          {visibleColumns.map((col) => {
                            const val = row[col.key];
                            const { text, bg } = fmtCell(val);
                            return (
                              <td key={col.key} className={`px-3 py-2.5 text-center ${bg}`}>
                                {text}
                              </td>
                            );
                          })}
                          {[mEval, mSat, mGen].map((val, i) => {
                            const { text, bg } = fmtCell(val);
                            return (
                              <td key={i} className={`px-3 py-2.5 text-center font-medium ${bg}`}>
                                {text}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {/* Moyenne Finale row */}
                    <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                      <td className="px-3 py-3 sticky left-0 bg-gray-50 text-gray-800">Moyenne Finale</td>
                      <td className="px-3 py-3"></td>
                      {visibleColumns.map((col) => {
                        const val = colAverages[col.key];
                        const { text, bg } = fmtCell(val);
                        return (
                          <td key={col.key} className={`px-3 py-3 text-center ${bg}`}>
                            {text}
                          </td>
                        );
                      })}
                      {(() => {
                        const allEvalAvg = avg(
                          [colAverages["eval_preformation"], colAverages["eval_pendant"], colAverages["eval_postformation"]]
                        );
                        const allSatAvg = avg(
                          [colAverages["satisfaction_chaud"], colAverages["satisfaction_froid"]]
                        );
                        const allGenAvg = avg([allEvalAvg, allSatAvg]);
                        return [allEvalAvg, allSatAvg, allGenAvg].map((val, i) => {
                          const { text, bg } = fmtCell(val);
                          return (
                            <td key={i} className={`px-3 py-3 text-center ${bg}`}>
                              {text}
                            </td>
                          );
                        });
                      })()}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* ─── Evolution Chart ─── */}
          {chartData.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Évolution de la qualité</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`]} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Moy. Évaluation"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="Moy. Satisfaction"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="Moy. Générale"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
