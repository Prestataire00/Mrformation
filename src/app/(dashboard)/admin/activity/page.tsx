"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Activity, UserPlus, FolderPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

interface ActivityEntry {
  id: string;
  action: string;
  resource_type: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const RESOURCE_LABELS: Record<string, string> = {
  training: "Formation",
  session: "Session",
  client: "Client",
  learner: "Apprenant",
  prospect: "Prospect",
  quote: "Devis",
  trainer: "Formateur",
  document: "Document",
  email: "Email",
};

const PAGE_SIZE = 50;

export default function ActivityPage() {
  const supabase = createClient();
  const { entityId } = useEntity();

  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchActivities = useCallback(async (offset = 0, append = false) => {
    setLoading(true);
    try {
      let query = supabase
        .from("activity_log")
        .select("id, action, resource_type, details, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (entityId) query = query.eq("entity_id", entityId);

      const { data, count } = await query;
      if (data) {
        setActivities((prev) => append ? [...prev, ...(data as ActivityEntry[])] : (data as ActivityEntry[]));
      }
      setTotalCount(count ?? 0);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [supabase, entityId]);

  useEffect(() => {
    if (entityId === undefined) return;
    fetchActivities(0, false);
  }, [entityId, fetchActivities]);

  function getIcon(action: string) {
    if (action.includes("creat") || action.includes("ajout"))
      return <FolderPlus className="h-4 w-4 text-green-500" />;
    if (action.includes("inscri") || action.includes("enroll"))
      return <UserPlus className="h-4 w-4 text-blue-500" />;
    return <Activity className="h-4 w-4 text-gray-400" />;
  }

  const hasMore = activities.length < totalCount;

  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <span className="font-medium text-gray-700">Administration</span>
        <span className="mx-2">/</span>
        <span>Activités</span>
      </div>

      <Card className="bg-white border border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-700 flex items-center gap-2">
            <Activity className="h-4 w-4" style={{ color: "#3DB5C5" }} />
            Historique des activités
            {totalCount > 0 && (
              <Badge variant="outline" className="text-[10px] ml-1">
                {totalCount} entrée{totalCount > 1 ? "s" : ""}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && activities.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Activity className="h-10 w-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">Aucune activité enregistrée.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {activities.map((act) => {
                const resourceLabel = act.resource_type
                  ? RESOURCE_LABELS[act.resource_type] ?? act.resource_type
                  : "";

                return (
                  <div key={act.id} className="flex items-start gap-3 py-3 px-3 rounded-md hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                    <div className="mt-0.5">{getIcon(act.action)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">
                        {act.action}
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
                    <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
                      {formatDate(act.created_at)}
                    </span>
                  </div>
                );
              })}

              {/* Load more */}
              {hasMore && (
                <div className="text-center pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchActivities(activities.length, true)}
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
    </div>
  );
}
