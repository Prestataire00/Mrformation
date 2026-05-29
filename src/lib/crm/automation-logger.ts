/**
 * Story aut-c-4 — Helper pour logger les exécutions CRM dans crm_automation_logs.
 *
 * Pattern centralisé évitant de modifier les 9 fonctions de lib/crm/automations.ts
 * une par une. Appelé depuis les callers (route.ts user + cron branch) après
 * chaque appel à une fonction du moteur.
 *
 * Pour chaque exécution de trigger_type, on récupère TOUTES les rules actives
 * de l'entité associées à ce trigger, et on log une ligne par rule (résolution
 * du rule_id propre — UX-DR-AUT-9 audit visible côté Loris).
 *
 * NFR-AUT-REL-2 : try/catch interne — un fail d'INSERT log ne casse JAMAIS
 * l'exécution du moteur (les emails sont déjà envoyés, les tâches déjà créées).
 *
 * UX-DR-AUT-9 : status à 3 niveaux uniquement (success / partial / failed).
 * Skipped (recipient_count=0) → mappé sur success avec details.note="no eligible".
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CrmLogStatus = "success" | "partial" | "failed";

export type CrmLogParams = {
  entity_id: string;
  trigger_type: string;
  action_type: string;
  recipient_count: number;
  status: CrmLogStatus;
  details?: Record<string, unknown>;
  executed_by?: string | null; // NULL si exécuté par service_role (cron)
  is_manual?: boolean;
};

/**
 * Log une exécution CRM dans crm_automation_logs.
 *
 * Résout les rule_id correspondants au trigger_type + entity_id et insère
 * une ligne par rule trouvée (avec rule_name snapshot). Si aucune rule
 * active, insère un seul log avec rule_id=NULL et rule_name=trigger_type.
 */
export async function logCrmAutomationExecution(
  supabase: SupabaseClient,
  params: CrmLogParams,
): Promise<void> {
  try {
    // Récupère les rules actives correspondant au trigger
    const { data: matchingRules } = await supabase
      .from("crm_automation_rules")
      .select("id, name")
      .eq("entity_id", params.entity_id)
      .eq("trigger_type", params.trigger_type)
      .eq("is_enabled", true);

    const baseRow = {
      entity_id: params.entity_id,
      trigger_type: params.trigger_type,
      action_type: params.action_type,
      recipient_count: params.recipient_count,
      status: params.status,
      details: params.details ?? {},
      executed_by: params.executed_by ?? null,
      is_manual: params.is_manual ?? false,
    };

    if (!matchingRules || matchingRules.length === 0) {
      // Pas de rule active → 1 log avec rule_id NULL (snapshot trigger_type)
      await supabase.from("crm_automation_logs").insert({
        ...baseRow,
        rule_id: null,
        rule_name: params.trigger_type,
      });
      // Fonction PG d'incrément non applicable (pas de rule_id)
      return;
    }

    // 1 log par rule active (rule_id propre + rule_name snapshot)
    const rows = matchingRules.map((r) => ({
      ...baseRow,
      rule_id: r.id,
      rule_name: r.name,
    }));
    await supabase.from("crm_automation_logs").insert(rows);

    // Met à jour last_executed_at + execution_count pour chaque rule
    // via la fonction PG créée en aut-a-5 (idempotente, SECURITY DEFINER).
    for (const rule of matchingRules) {
      await supabase.rpc("increment_crm_rule_execution", {
        rule_id_param: rule.id,
      });
    }
  } catch (err) {
    // NFR-AUT-REL-2 : un fail de log ne casse jamais le moteur
    console.error(
      "[logCrmAutomationExecution] failed (non-blocking):",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Helper pour déterminer le status visuel d'une exécution selon count + erreurs.
 *
 * UX-DR-AUT-9 mapping :
 * - Si erreurs > 0 ET succès > 0 → "partial"
 * - Si erreurs > 0 ET succès === 0 → "failed"
 * - Sinon (erreurs === 0) → "success" (avec count=0 acceptable = skip silencieux)
 */
export function deriveStatus(succeeded: number, failed: number = 0): CrmLogStatus {
  if (failed > 0 && succeeded > 0) return "partial";
  if (failed > 0 && succeeded === 0) return "failed";
  return "success";
}
