"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronRight, Loader2, CheckCircle2, Minus, Users } from "lucide-react";
import {
  computeSessionLearnerProgress,
  type LearnerProgressRow,
  type ProgressEnrollment,
  type ProgressSignature,
  type ProgressResponse,
} from "@/lib/trainers/session-learner-progress";

/**
 * Suivi des apprenants d'une session pour le formateur (EF-3.3) : présence
 * (signatures / créneaux) + complétion du questionnaire. Repli sous la carte de
 * session, chargé à l'ouverture (lazy). L'e-learning est couvert séparément par
 * CohortElearningProgress.
 */
export function SessionLearnersProgress({ sessionId }: { sessionId: string }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LearnerProgressRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [enrollRes, sigRes, slotsRes, respRes] = await Promise.all([
        supabase
          .from("enrollments")
          .select("learner:learners(id, profile_id, first_name, last_name)")
          .eq("session_id", sessionId),
        supabase
          .from("signatures")
          .select("signer_id, time_slot_id")
          .eq("session_id", sessionId)
          .eq("signer_type", "learner"),
        supabase
          .from("formation_time_slots")
          .select("id", { count: "exact", head: true })
          .eq("session_id", sessionId),
        supabase
          .from("questionnaire_responses")
          .select("learner_id")
          .eq("session_id", sessionId),
      ]);

      const computed = computeSessionLearnerProgress(
        (enrollRes.data as unknown as ProgressEnrollment[]) ?? [],
        (sigRes.data as ProgressSignature[]) ?? [],
        slotsRes.count ?? 0,
        (respRes.data as ProgressResponse[]) ?? [],
      );
      setRows(computed);
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }, [supabase, sessionId]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !loaded && !loading) load();
  };

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} className="mt-4 pt-4 border-t border-gray-100">
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
        <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
        <Users className="h-4 w-4 text-gray-400" />
        Suivi des apprenants
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">Aucun apprenant inscrit.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left font-medium py-1.5 pr-3">Apprenant</th>
                  <th className="text-left font-medium py-1.5 pr-3">Présence</th>
                  <th className="text-left font-medium py-1.5">Questionnaire</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.learnerId} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 pr-3 text-gray-900">{r.name}</td>
                    <td className="py-1.5 pr-3 text-gray-600">
                      {r.slotsCount > 0 ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px] font-medium",
                            r.signedCount >= r.slotsCount
                              ? "border-green-300 text-green-700"
                              : r.signedCount > 0
                                ? "border-amber-300 text-amber-700"
                                : "border-gray-200 text-gray-500",
                          )}
                        >
                          {r.signedCount}/{r.slotsCount}
                        </Badge>
                      ) : (
                        <span className="text-gray-500">{r.signedCount} signature{r.signedCount !== 1 ? "s" : ""}</span>
                      )}
                    </td>
                    <td className="py-1.5">
                      {r.questionnaireDone ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Rempli
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                          <Minus className="h-3.5 w-3.5" /> À remplir
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
