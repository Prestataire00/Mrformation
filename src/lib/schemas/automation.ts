/**
 * Story aut-c-1 — Zod schemas pour validation des règles CRM.
 *
 * Pattern : discriminated union sur action_type (ID-AUT-5 architecture)
 * - create_task → TaskConfig
 * - create_notification → NotificationConfig
 * - update_prospect_status → StatusUpdateConfig
 * - update_scores → ScoringConfig
 *
 * Versioning : chaque config inclut `version: 1` (ID-AUT-6) pour permettre
 * migration JSONB schema en V2 sans breaking change DB.
 */

import { z } from "zod";

// ── Action configs (discriminated union) ─────────────────────────────────

export const taskConfigSchema = z.object({
  action_type: z.literal("create_task"),
  version: z.literal(1),
  title: z.string().min(1, "Le titre est requis"),
  description: z.string().optional(),
  due_in_days: z.number().int().min(0).max(365).default(3),
  assignee: z.enum(["auto", "owner", "specific"]).default("auto"),
  assignee_user_id: z.string().uuid().optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

export const notificationConfigSchema = z.object({
  action_type: z.literal("create_notification"),
  version: z.literal(1),
  title: z.string().min(1, "Le titre est requis"),
  message: z.string().min(1, "Le message est requis"),
  recipient: z.enum(["admin", "commercial", "all"]).default("admin"),
});

export const statusUpdateConfigSchema = z.object({
  action_type: z.literal("update_prospect_status"),
  version: z.literal(1),
  new_status: z.enum(["active", "qualified", "dormant", "won", "lost"]),
  reason: z.string().optional(),
});

export const scoringConfigSchema = z.object({
  action_type: z.literal("update_scores"),
  version: z.literal(1),
  // weights libre (recalcul de score selon critères pondérés — détail V2)
  weights: z.record(z.string(), z.number()).default({}),
});

export const crmActionConfigSchema = z.discriminatedUnion("action_type", [
  taskConfigSchema,
  notificationConfigSchema,
  statusUpdateConfigSchema,
  scoringConfigSchema,
]);

export type CrmActionConfig = z.infer<typeof crmActionConfigSchema>;
export type TaskConfig = z.infer<typeof taskConfigSchema>;
export type NotificationConfig = z.infer<typeof notificationConfigSchema>;
export type StatusUpdateConfig = z.infer<typeof statusUpdateConfigSchema>;
export type ScoringConfig = z.infer<typeof scoringConfigSchema>;

// ── Triggers CRM V1 (cohérence avec CHECK migration crm-automation-rules.sql) ──

export const CRM_TRIGGER_TYPES = [
  "quote_all_accepted",
  "quote_all_rejected",
  "quote_created_for_new",
  "prospect_inactive_30d",
  "quote_expiring_3d",
  "prospect_created",
  "prospect_qualified",
  "task_overdue_3d",
  "daily_digest",
  "weekly_summary",
  "recalculate_scores",
] as const;

export type CrmTriggerType = (typeof CRM_TRIGGER_TYPES)[number];

export const CRM_ACTION_TYPES = [
  "create_task",
  "create_notification",
  "update_prospect_status",
  "update_scores",
] as const;

export type CrmActionType = (typeof CRM_ACTION_TYPES)[number];

// ── Schema complet d'une règle CRM pour validation Server Action ──

export const crmRulePayloadSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  description: z.string().optional(),
  trigger_type: z.enum(CRM_TRIGGER_TYPES),
  action_type: z.enum(CRM_ACTION_TYPES),
  is_enabled: z.boolean().default(true),
  config: crmActionConfigSchema,
});

export type CrmRulePayload = z.infer<typeof crmRulePayloadSchema>;

// ── Labels pour UI (FR locale) ────────────────────────────────────────────

export const CRM_TRIGGER_LABELS: Record<CrmTriggerType, string> = {
  prospect_created: "Quand un prospect est créé",
  prospect_qualified: "Quand un prospect est qualifié",
  prospect_inactive_30d: "Quand un prospect devient inactif (30j)",
  quote_expiring_3d: "Quand un devis expire dans 3 jours",
  quote_created_for_new: "Quand un devis est créé pour un nouveau prospect",
  quote_all_accepted: "Quand tous les devis sont acceptés",
  quote_all_rejected: "Quand tous les devis sont rejetés",
  task_overdue_3d: "Quand une tâche est en retard de 3 jours",
  daily_digest: "Récurrent : digest quotidien",
  weekly_summary: "Récurrent : résumé hebdomadaire",
  recalculate_scores: "Recalculer périodiquement les scores",
};

export const CRM_ACTION_LABELS: Record<CrmActionType, string> = {
  create_task: "Créer une tâche commerciale",
  create_notification: "Envoyer une notification interne",
  update_prospect_status: "Changer le statut du prospect",
  update_scores: "Recalculer le score",
};

export const CRM_TRIGGER_CATEGORIES: Record<
  CrmTriggerType,
  { category: string; icon: string }
> = {
  prospect_created: { category: "Acquisition", icon: "🎯" },
  prospect_qualified: { category: "Acquisition", icon: "🎯" },
  prospect_inactive_30d: { category: "Relances", icon: "📞" },
  quote_expiring_3d: { category: "Relances", icon: "📞" },
  task_overdue_3d: { category: "Relances", icon: "📞" },
  quote_created_for_new: { category: "Conversion", icon: "✅" },
  quote_all_accepted: { category: "Conversion", icon: "✅" },
  quote_all_rejected: { category: "Conversion", icon: "✅" },
  daily_digest: { category: "Reporting", icon: "📊" },
  weekly_summary: { category: "Reporting", icon: "📊" },
  recalculate_scores: { category: "Reporting", icon: "📊" },
};
