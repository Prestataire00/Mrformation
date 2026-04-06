"use client";

import { SlidersHorizontal, ChevronUp, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEFAULT_WIDGET_CONFIG, DEFAULT_KPI_CONFIG } from "./constants";
import type { WidgetConfigItem, KpiConfigItem } from "./types";

interface AdminDashboardSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgetConfig: WidgetConfigItem[];
  kpiConfig: KpiConfigItem[];
  onToggleWidget: (id: string) => void;
  onToggleKpi: (id: string) => void;
  onMoveWidget: (id: string, dir: "up" | "down") => void;
  onMoveKpi: (id: string, dir: "up" | "down") => void;
  onResetAll: () => void;
}

export function AdminDashboardSettings({
  open,
  onOpenChange,
  widgetConfig,
  kpiConfig,
  onToggleWidget,
  onToggleKpi,
  onMoveWidget,
  onMoveKpi,
  onResetAll,
}: AdminDashboardSettingsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-[#DC2626]" />
            Personnaliser le tableau de bord
          </DialogTitle>
        </DialogHeader>

        {/* Widgets */}
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Widgets affichés</p>
            <div className="space-y-2">
              {[...widgetConfig].sort((a, b) => a.order - b.order).map((w, idx) => (
                <div key={w.id} className="flex items-center gap-3 p-2 rounded-lg border bg-white">
                  <Switch
                    checked={w.visible}
                    onCheckedChange={() => onToggleWidget(w.id)}
                    className="scale-75"
                  />
                  <span className={cn("flex-1 text-sm", !w.visible && "text-gray-400 line-through")}>
                    {w.label}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onMoveWidget(w.id, "up")} disabled={idx === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-400">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => onMoveWidget(w.id, "down")} disabled={idx === widgetConfig.length - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-400">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* KPIs */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Indicateurs clés (KPIs)</p>
            <div className="space-y-2">
              {[...kpiConfig].sort((a, b) => a.order - b.order).map((k, idx) => (
                <div key={k.id} className="flex items-center gap-3 p-2 rounded-lg border bg-white">
                  <Switch
                    checked={k.visible}
                    onCheckedChange={() => onToggleKpi(k.id)}
                    className="scale-75"
                  />
                  <span className={cn("flex-1 text-sm", !k.visible && "text-gray-400 line-through")}>
                    {k.label}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onMoveKpi(k.id, "up")} disabled={idx === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-400">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => onMoveKpi(k.id, "down")} disabled={idx === kpiConfig.length - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-400">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between pt-2 border-t">
            <button
              onClick={onResetAll}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Réinitialiser les paramètres
            </button>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
