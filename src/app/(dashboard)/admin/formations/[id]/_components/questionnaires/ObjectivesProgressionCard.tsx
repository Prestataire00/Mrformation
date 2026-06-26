"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ObjectiveProgression } from "@/lib/services/load-session-aggregates";
import { computeSessionHeadlineIndicators } from "@/lib/services/load-session-aggregates";

const fmtPct = (n: number | null) => (n !== null ? `${Math.round(n)}%` : "—");
const fmtOn5 = (n: number | null) =>
  n !== null ? `${(Math.round(n * 10) / 10).toFixed(1).replace(".", ",")}/5` : "—";

/** Évolution avant→après en points de %, avec icône de tendance. */
function EvolutionBadge({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) return null;
  const pts = Math.round(deltaPct);
  if (pts > 0) {
    return (
      <Badge className="text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
        <TrendingUp className="h-3 w-3 mr-0.5" />+{pts} pts
      </Badge>
    );
  }
  if (pts < 0) {
    return (
      <Badge className="text-xs font-medium bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
        <TrendingDown className="h-3 w-3 mr-0.5" />{pts} pts
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs font-medium text-gray-600">
      <Minus className="h-3 w-3 mr-0.5" />0 pt
    </Badge>
  );
}

interface Props {
  satisfactionRate: number | null;
  progressions: ObjectiveProgression[];
}

function ratingToPct(rating: number): number {
  return (rating / 5) * 100;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <Badge variant="outline" className="text-xs font-medium text-gray-500">
        <Minus className="h-3 w-3 mr-0.5" />
        —
      </Badge>
    );
  }

  const rounded = Math.round(delta * 10) / 10;
  const sign = rounded > 0 ? "+" : "";

  if (rounded > 0) {
    return (
      <Badge className="text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
        <TrendingUp className="h-3 w-3 mr-0.5" />
        {sign}{rounded}
      </Badge>
    );
  }

  if (rounded < 0) {
    return (
      <Badge className="text-xs font-medium bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
        <TrendingDown className="h-3 w-3 mr-0.5" />
        {rounded}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs font-medium text-gray-600">
      <Minus className="h-3 w-3 mr-0.5" />
      0
    </Badge>
  );
}

export function ObjectivesProgressionCard({ satisfactionRate, progressions }: Props) {
  // Masquer complètement si aucune donnée de progression
  if (progressions.length === 0 && satisfactionRate === null) return null;

  const { beforePct, afterPct, deltaPct, satisfactionOn5 } = computeSessionHeadlineIndicators(
    progressions,
    satisfactionRate,
  );
  const satisfactionOk = satisfactionRate !== null && satisfactionRate >= 70;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-600" />
          Résultats de la session
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Bandeau 3 indicateurs de synthèse */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-blue-50/40 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Positionnement avant</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{fmtPct(beforePct)}</p>
            <p className="text-[10px] text-gray-400">niveau moyen</p>
          </div>
          <div className="rounded-lg border bg-indigo-50/40 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Positionnement après</p>
            <p className="text-2xl font-bold text-indigo-700 mt-1">{fmtPct(afterPct)}</p>
            <div className="mt-0.5 flex justify-center min-h-[20px]">
              <EvolutionBadge deltaPct={deltaPct} />
            </div>
          </div>
          <div className={cn("rounded-lg border p-3 text-center", satisfactionOk ? "bg-emerald-50/40" : "bg-amber-50/40")}>
            <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Satisfaction</p>
            <p className={cn("text-2xl font-bold mt-1", satisfactionOk ? "text-emerald-700" : "text-amber-600")}>
              {fmtOn5(satisfactionOn5)}
            </p>
            {satisfactionRate !== null && (
              <p className="text-[10px] text-gray-400">{Math.round(satisfactionRate)}%</p>
            )}
          </div>
        </div>

        {/* Barres par objectif */}
        {progressions.length > 0 && (
          <div className="space-y-3">
            {progressions.map((p, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-700 truncate flex-1">{p.objective}</span>
                  <DeltaBadge delta={p.delta} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {/* Avant */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase text-gray-400 font-medium">Avant</span>
                      {p.avgBefore !== null && (
                        <span className="text-[10px] text-gray-500 font-medium">
                          {(Math.round(p.avgBefore * 10) / 10).toFixed(1)}/5
                        </span>
                      )}
                    </div>
                    <Progress
                      value={p.avgBefore !== null ? ratingToPct(p.avgBefore) : 0}
                      className={cn("h-1.5", p.avgBefore !== null ? "[&>div]:bg-blue-400" : "[&>div]:bg-gray-200")}
                    />
                  </div>
                  {/* Après */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase text-gray-400 font-medium">Après</span>
                      {p.avgAfter !== null && (
                        <span className="text-[10px] text-gray-500 font-medium">
                          {(Math.round(p.avgAfter * 10) / 10).toFixed(1)}/5
                        </span>
                      )}
                    </div>
                    <Progress
                      value={p.avgAfter !== null ? ratingToPct(p.avgAfter) : 0}
                      className={cn("h-1.5", p.avgAfter !== null ? "[&>div]:bg-indigo-500" : "[&>div]:bg-gray-200")}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
