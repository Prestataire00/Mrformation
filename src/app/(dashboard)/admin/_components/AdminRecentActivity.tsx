"use client";

import Link from "next/link";
import { Activity, UserPlus, FolderPlus, Edit3, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, getInitials, ROLE_LABELS } from "@/lib/utils";
import type { RecentActivity } from "./types";

interface AdminRecentActivityProps {
  activities: RecentActivity[];
  isSuperAdmin?: boolean;
}

const RESOURCE_MAP: Record<string, string> = {
  training: "Formation",
  session: "Session",
  client: "Client",
  learner: "Apprenant",
  prospect: "Prospect",
  quote: "Devis",
  task: "Tâche",
  email: "Email",
  signature: "Signature",
  enrollment: "Inscription",
  elearning_course: "E-Learning",
  user: "Utilisateur",
  trainer: "Formateur",
};

const ACTION_MAP: Record<string, string> = {
  create: "Création",
  update: "Modification",
  delete: "Suppression",
};

export function AdminRecentActivity({ activities, isSuperAdmin }: AdminRecentActivityProps) {
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
              const icon = act.action === "create" || act.action.includes("creat") || act.action.includes("ajout")
                ? <FolderPlus className="h-4 w-4 text-green-500" />
                : act.action === "update" || act.action.includes("modif")
                ? <Edit3 className="h-4 w-4 text-amber-500" />
                : act.action === "delete" || act.action.includes("suppr")
                ? <Trash2 className="h-4 w-4 text-red-500" />
                : act.action.includes("inscri") || act.action.includes("enroll")
                ? <UserPlus className="h-4 w-4 text-blue-500" />
                : <Activity className="h-4 w-4 text-gray-400" />;

              const resourceLabel = act.resource_type
                ? RESOURCE_MAP[act.resource_type] ?? act.resource_type
                : "";
              const actionLabel = ACTION_MAP[act.action] ?? act.action;

              const profile = act.profiles;
              const userName = profile
                ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
                : null;

              return (
                <div key={act.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="mt-0.5">{icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">
                      {isSuperAdmin && userName && (
                        <>
                          <span className="font-medium text-gray-800">{userName}</span>
                          <span className="text-gray-400 mx-1">—</span>
                        </>
                      )}
                      {actionLabel}
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
