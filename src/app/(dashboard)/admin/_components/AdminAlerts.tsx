"use client";

import { useState } from "react";
import { FileCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { MissingReportAlert, OverdueTask } from "./types";

interface AdminAlertsProps {
  alerts: MissingReportAlert[];
  overdueTasks: OverdueTask[];
}

export function AdminAlerts({ alerts, overdueTasks }: AdminAlertsProps) {
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  return (
    <>
      {/* Alert items — bilans manquants uniquement */}
      {alerts.length > 0 && (() => {
        const allAlertItems = alerts.map((alert) => (
          <div
            key={`alert-${alert.session_id}`}
            className="flex items-center gap-3 rounded-md bg-red-600 px-4 py-3 text-white text-sm"
          >
            <FileCheck className="h-4 w-4 flex-shrink-0" />
            <span>
              <strong>Bilan manquant</strong> — Créneau du{" "}
              <strong>{formatDate(alert.start_date)}</strong>
              {alert.training_title ? ` › ${alert.training_title}` : ""}
            </span>
          </div>
        ));
        const visible = showAllAlerts ? allAlertItems : allAlertItems.slice(0, 3);
        const hiddenCount = allAlertItems.length - 3;

        return (
          <div className="space-y-2">
            {visible}
            {allAlertItems.length > 3 && (
              <button
                onClick={() => setShowAllAlerts((v) => !v)}
                className="text-sm text-gray-600 hover:text-gray-900 underline"
              >
                {showAllAlerts ? "Réduire" : `Voir les ${hiddenCount} autres alertes`}
              </button>
            )}
          </div>
        );
      })()}

      {/* Summary banner — bilans manquants uniquement */}
      <div
        className="rounded-md px-5 py-4 text-white text-sm font-medium"
        style={{ backgroundColor: alerts.length === 0 ? "#22c55e" : "#DC2626" }}
      >
        {alerts.length === 0
          ? "Aucun bilan manquant"
          : `${alerts.length} bilan${alerts.length > 1 ? "s" : ""} manquant${alerts.length > 1 ? "s" : ""}`
        }
      </div>
    </>
  );
}
