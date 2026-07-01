"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveTrainerTasksStatus, type TrainerTasksStatus } from "@/lib/services/trainer-tasks";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface Props {
  sessionId: string;
}

export function TrainerTasksIndicator({ sessionId }: Props) {
  const supabase = createClient();
  const [status, setStatus] = useState<TrainerTasksStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await resolveTrainerTasksStatus(supabase, sessionId);
        if (!cancelled) setStatus(result);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Chargement tâches formateur…</span>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground font-medium">Tâches formateur :</span>
      <Badge
        variant="outline"
        className={status.deroule ? "border-green-400 text-green-700 bg-green-50" : "border-gray-300 text-gray-500"}
      >
        Déroulé {status.deroule ? "✓" : "—"}
      </Badge>
      <Badge
        variant="outline"
        className={
          status.bilan === null
            ? "border-gray-200 text-gray-400"
            : status.bilan
            ? "border-green-400 text-green-700 bg-green-50"
            : "border-gray-300 text-gray-500"
        }
      >
        Bilan {status.bilan === null ? "n/a" : status.bilan ? "✓" : "—"}
      </Badge>
      <Badge
        variant="outline"
        className={status.support ? "border-green-400 text-green-700 bg-green-50" : "border-gray-300 text-gray-500"}
      >
        Support {status.support ? "✓" : "—"}
      </Badge>
    </div>
  );
}
