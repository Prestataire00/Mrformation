/**
 * Snapshots Qualiopi : pour chaque session active d'une entité, recalcule le
 * score actuel et insère un row dans qualiopi_snapshots SI le score diffère
 * du dernier snapshot connu. Évite l'inflation de la table par redondance.
 *
 * Source unique du calcul : @/lib/services/qualiopi-score
 * Appelé par : /api/qualiopi/snapshots (POST) déclenché par le cron Netlify.
 *
 * Définition « session active » :
 *   end_date   >= NOW() - INTERVAL '6 months'
 *   OR start_date <= NOW() + INTERVAL '12 months'
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeQualiopiScore } from "@/lib/services/qualiopi-score";
import { mapStatusToFlags } from "@/lib/utils/document-status";
import type { Session } from "@/lib/types";

export interface SnapshotResult {
  inserted: number;
  skipped: number;
  errors: number;
}

const ACTIVE_END_DATE_FLOOR_MS = 6 * 30 * 24 * 3600 * 1000; // ~6 mois
const ACTIVE_START_DATE_CEIL_MS = 12 * 30 * 24 * 3600 * 1000; // ~12 mois

export async function snapshotEntityQualiopi(
  supabase: SupabaseClient,
  entityId: string,
): Promise<SnapshotResult> {
  const result: SnapshotResult = { inserted: 0, skipped: 0, errors: 0 };

  const now = Date.now();
  const endFloor = new Date(now - ACTIVE_END_DATE_FLOOR_MS).toISOString().slice(0, 10);
  const startCeil = new Date(now + ACTIVE_START_DATE_CEIL_MS).toISOString().slice(0, 10);

  // 1. Lister les sessions actives de l'entité (avec leurs relations utiles pour le score)
  const { data: sessions, error: sessionsErr } = await supabase
    .from("sessions")
    .select(`
      id, entity_id, is_subcontracted, start_date, end_date,
      formation_evaluation_assignments(evaluation_type, questionnaire_id),
      formation_satisfaction_assignments(questionnaire_id),
      formation_elearning_assignments(id),
      enrollments(learner_id),
      qualiopi_manual
    `)
    .eq("entity_id", entityId)
    .or(`end_date.gte.${endFloor},start_date.lte.${startCeil}`);

  if (sessionsErr || !sessions) {
    console.warn(`[qualiopi-snapshots] sessions fetch failed for ${entityId}:`, sessionsErr?.message);
    result.errors += 1;
    return result;
  }

  for (const session of sessions as Array<Session & { id: string; entity_id: string }>) {
    try {
      // 2. Charger les documents (via table unifiée `documents`)
      const { data: documentsRows } = await supabase
        .from("documents")
        .select("doc_type, status, owner_type")
        .eq("entity_id", entityId)
        .eq("source_table", "sessions")
        .eq("source_id", session.id);

      // Adapter shape pour la lib qualiopi-score (qui s'attend à is_signed/is_sent).
      // On délègue à mapStatusToFlags pour rester DRY (import statique en tête).
      const docs = (documentsRows ?? []).map(d => {
        const flags = mapStatusToFlags(d.status as string);
        return { doc_type: d.doc_type, owner_type: d.owner_type, ...flags };
      });

      // 3. Charger les responseCounts agrégés via la RPC créée en Tâche 1
      const evalAssignments = (session.formation_evaluation_assignments ?? []) as Array<{ evaluation_type: string; questionnaire_id: string }>;
      const satisAssignments = (session.formation_satisfaction_assignments ?? []) as Array<{ questionnaire_id: string }>;
      const enrollmentsCount = ((session.enrollments ?? []) as Array<{ learner_id: string }>).length || 1;

      const preIds = evalAssignments.filter(a => a.evaluation_type === "eval_preformation").map(a => a.questionnaire_id);
      const postIds = evalAssignments.filter(a => a.evaluation_type === "eval_postformation").map(a => a.questionnaire_id);
      const satisIds = satisAssignments.map(a => a.questionnaire_id);
      const allIds = [...preIds, ...postIds, ...satisIds];

      let responseCounts: Record<string, { total: number; done: number }> = {};
      if (allIds.length > 0) {
        const { data: counts } = await supabase.rpc("count_responses_by_questionnaire", {
          p_session_id: session.id,
          p_questionnaire_ids: allIds,
        });
        const m = new Map<string, number>(
          (counts as Array<{ questionnaire_id: string; response_count: number }> | null ?? [])
            .map(r => [r.questionnaire_id, Number(r.response_count)]),
        );
        const sumFor = (ids: string[]) => ids.reduce((s, q) => s + (m.get(q) ?? 0), 0);
        responseCounts = {
          eval_preformation: { total: preIds.length > 0 ? enrollmentsCount : 0, done: Math.min(sumFor(preIds), preIds.length > 0 ? enrollmentsCount : 0) },
          eval_postformation: { total: postIds.length > 0 ? enrollmentsCount : 0, done: Math.min(sumFor(postIds), postIds.length > 0 ? enrollmentsCount : 0) },
          satisfaction: { total: satisIds.length > 0 ? enrollmentsCount : 0, done: Math.min(sumFor(satisIds), satisIds.length > 0 ? enrollmentsCount : 0) },
        };
      }

      // 4. Score actuel via la lib unifiée
      const sessionForScore = { ...session, formation_convention_documents: docs } as unknown as Session;
      const manualChecks = session.qualiopi_manual ?? {};
      const score = computeQualiopiScore(sessionForScore, { responseCounts, manualChecks });

      // 5. Lire le dernier snapshot pour cette session
      const { data: lastSnap } = await supabase
        .from("qualiopi_snapshots")
        .select("global_score")
        .eq("session_id", session.id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastSnap && lastSnap.global_score === score) {
        result.skipped += 1;
        continue;
      }

      // 6. Insert le nouveau snapshot
      const { error: insertErr } = await supabase.from("qualiopi_snapshots").insert({
        session_id: session.id,
        entity_id: entityId,
        global_score: score,
        items: {},  // détail laissé vide pour l'instant — peut être enrichi plus tard
      });
      if (insertErr) {
        console.warn(`[qualiopi-snapshots] insert failed for ${session.id}:`, insertErr.message);
        result.errors += 1;
      } else {
        result.inserted += 1;
      }
    } catch (err) {
      console.error(`[qualiopi-snapshots] error on session ${session.id}:`, err instanceof Error ? err.message : err);
      result.errors += 1;
    }
  }

  return result;
}
