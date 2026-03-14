"use client";

import Link from "next/link";
import { Activity, UserPlus, FolderPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { RecentActivity } from "./types";

interface AdminRecentActivityProps {
  activities: RecentActivity[];
}

export function AdminRecentActivity({ activities }: AdminRecentActivityProps) {
  return (
    <Card className="bg-white border border-gray-200 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold text-gray-700 flex items-center gap-2">
          <Activity className="h-4 w-4" style={{ color: "#3DB5C5" }} />
          Activités récentes
        </CardTitle>
        <Link href="/admin/activity" className="text-xs text-[#3DB5C5] hover:underline font-medium">
          Voir tout
        </Link>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center italic">
            Aucune activité récente enregistrée.
          </p>
        ) : (
          <div className="space-y-3">
            {activities.map((act) => {
              const icon = act.action.includes("creat") || act.action.includes("ajout")
                ? <FolderPlus className="h-4 w-4 text-green-500" />
                : act.action.includes("inscri") || act.action.includes("enroll")
                ? <UserPlus className="h-4 w-4 text-blue-500" />
                : <Activity className="h-4 w-4 text-gray-400" />;

              const resourceLabel = act.resource_type
                ? ({ training: "Formation", session: "Session", client: "Client", learner: "Apprenant", prospect: "Prospect", quote: "Devis", task: "Tâche", email: "Email", signature: "Signature", enrollment: "Inscription", elearning_course: "E-Learning", user: "Utilisateur", trainer: "Formateur" } as Record<string, string>)[act.resource_type] ?? act.resource_type
                : "";

              return (
                <div key={act.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="mt-0.5">{icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">
                      {({ create: "Création", update: "Modification", delete: "Suppression" } as Record<string, string>)[act.action] ?? act.action}
                      {resourceLabel && (
                        <Badge variant="outline" className="ml-2 text-[10px]">{resourceLabel}</Badge>
                      )}
                    </p>
                    {act.details && typeof (act.details as Record<string, unknown>).name === "string" && (
                      <p className="text-xs text-gray-400 truncate">
                        {(act.details as Record<string, string>).name}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 whitespace-nowrap">
                    {formatDate(act.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
