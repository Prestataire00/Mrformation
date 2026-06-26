"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, BarChart3, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ObjectiveProgression } from "@/lib/services/load-session-aggregates";

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

  const satisfactionOk = satisfactionRate !== null && satisfactionRate >= 70;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-600" />
          Progression par objectif
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Jauge satisfaction */}
        {satisfactionRate !== null && (
          <div className="flex items-center gap-3">
            <ThumbsUp className={cn("h-4 w-4 shrink-0", satisfactionOk ? "text-emerald-600" : "text-amber-500")} />
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">Satisfaction globale</span>
                <span className={cn("font-semibold", satisfactionOk ? "text-emerald-700" : "text-amber-600")}>
                  {Math.round(satisfactionRate)}%
                </span>
              </div>
              <Progress
                value={satisfactionRate}
                className={cn("h-2", satisfactionOk ? "[&>div]:bg-emerald-500" : "[&>div]:bg-amber-500")}
              />
            </div>
          </div>
        )}

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
