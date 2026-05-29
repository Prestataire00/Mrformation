/**
 * Story aut-c-2 — Définitions des modèles de règles CRM préétablis.
 *
 * UX-DR-AUT-12 : 4 modèles avec catégorisation visuelle forte
 * (Acquisition / Relances / Conversion (Suivi qualifiés) / Reporting).
 *
 * Pattern miroir de src/lib/automation/default-packs.ts (formations).
 * Le renommage de ce dernier en formation-rule-templates.ts est différé
 * au Lot E (aut-e-1) pour cohérence cross-system.
 *
 * Chaque règle inclut un `config` valide selon le Zod discriminated union
 * (cf. src/lib/schemas/automation.ts) avec `version: 1` (ID-AUT-6).
 */

import type { CrmActionConfig } from "@/lib/schemas/automation";

export interface CrmRuleDefinition {
  name: string;
  description: string;
  trigger_type: string;
  action_type: string;
  config: CrmActionConfig;
}

export interface CrmRuleTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: "emerald" | "orange" | "green" | "purple";
  rules: CrmRuleDefinition[];
}

export const CRM_RULE_TEMPLATES: CrmRuleTemplate[] = [
  // ── 🎯 Acquisition prospects (3 règles) ────────────────────────────────
  {
    id: "acquisition",
    name: "Acquisition prospects",
    description:
      "Démarre fort avec tes nouveaux prospects : premier contact, qualification, première proposition.",
    icon: "🎯",
    color: "emerald",
    rules: [
      {
        name: "Premier contact J+2",
        description:
          "Crée une tâche de premier contact 2 jours après l'arrivée d'un nouveau prospect.",
        trigger_type: "prospect_created",
        action_type: "create_task",
        config: {
          action_type: "create_task",
          version: 1,
          title: "Premier contact : {{prospect_name}}",
          description: "Appeler pour qualifier l'intérêt et le besoin.",
          due_in_days: 2,
          assignee: "auto",
          priority: "high",
        },
      },
      {
        name: "Notification prospect qualifié",
        description:
          "Notifie l'admin quand un prospect passe en statut qualifié.",
        trigger_type: "prospect_qualified",
        action_type: "create_notification",
        config: {
          action_type: "create_notification",
          version: 1,
          title: "Prospect qualifié : {{prospect_name}}",
          message:
            "Un nouveau prospect vient d'être qualifié. Pense à préparer une proposition.",
          recipient: "admin",
        },
      },
      {
        name: "Préparer proposition",
        description:
          "Crée une tâche de préparation de proposition à la création d'un devis pour un nouveau prospect.",
        trigger_type: "quote_created_for_new",
        action_type: "create_task",
        config: {
          action_type: "create_task",
          version: 1,
          title: "Préparer proposition : {{quote_reference}}",
          description:
            "Premier devis pour ce prospect — prends le temps de bien le calibrer.",
          due_in_days: 5,
          assignee: "auto",
          priority: "normal",
        },
      },
    ],
  },

  // ── 📞 Relances commerciales (4 règles) ────────────────────────────────
  {
    id: "relances",
    name: "Relances commerciales",
    description:
      "Ne laisse aucun prospect ou devis en plan : relance automatique des cas chauds.",
    icon: "📞",
    color: "orange",
    rules: [
      {
        name: "Relancer prospect inactif 30j",
        description:
          "Crée une tâche de relance pour les prospects sans activité depuis 30 jours.",
        trigger_type: "prospect_inactive_30d",
        action_type: "create_task",
        config: {
          action_type: "create_task",
          version: 1,
          title: "Relancer : {{prospect_name}}",
          description:
            "Aucune activité depuis 30 jours. Recontacter pour vérifier l'intérêt.",
          due_in_days: 3,
          assignee: "auto",
          priority: "normal",
        },
      },
      {
        name: "Devis expirant dans 3 jours",
        description:
          "Crée une tâche de relance commerciale 3 jours avant l'expiration d'un devis.",
        trigger_type: "quote_expiring_3d",
        action_type: "create_task",
        config: {
          action_type: "create_task",
          version: 1,
          title: "Devis expirant : {{quote_reference}}",
          description:
            "Le devis arrive à échéance — relancer le prospect pour décision.",
          due_in_days: 1,
          assignee: "auto",
          priority: "high",
        },
      },
      {
        name: "Comprendre un refus",
        description:
          "Crée une tâche de feedback quand tous les devis d'un prospect sont refusés.",
        trigger_type: "quote_all_rejected",
        action_type: "create_task",
        config: {
          action_type: "create_task",
          version: 1,
          title: "Comprendre refus : {{prospect_name}}",
          description:
            "Tous les devis ont été refusés. Recueillir un retour pour ajuster.",
          due_in_days: 7,
          assignee: "auto",
          priority: "normal",
        },
      },
      {
        name: "Notification tâche en retard",
        description:
          "Notifie le commercial quand une tâche est en retard de 3 jours.",
        trigger_type: "task_overdue_3d",
        action_type: "create_notification",
        config: {
          action_type: "create_notification",
          version: 1,
          title: "Tâche en retard",
          message: "Une tâche commerciale est en retard de 3+ jours.",
          recipient: "commercial",
        },
      },
    ],
  },

  // ── ✅ Suivi qualifiés / Conversion (3 règles) ─────────────────────────
  {
    id: "qualifies",
    name: "Suivi qualifiés",
    description:
      "Suis la conversion de tes prospects qualifiés : statuts gagné/perdu, scoring.",
    icon: "✅",
    color: "green",
    rules: [
      {
        name: "Marquer gagné si tous devis acceptés",
        description:
          "Met le statut du prospect en 'gagné' quand tous ses devis sont acceptés.",
        trigger_type: "quote_all_accepted",
        action_type: "update_prospect_status",
        config: {
          action_type: "update_prospect_status",
          version: 1,
          new_status: "won",
          reason: "Tous les devis ont été acceptés (auto)",
        },
      },
      {
        name: "Marquer perdu si tous devis refusés",
        description:
          "Met le statut du prospect en 'perdu' quand tous ses devis sont refusés.",
        trigger_type: "quote_all_rejected",
        action_type: "update_prospect_status",
        config: {
          action_type: "update_prospect_status",
          version: 1,
          new_status: "lost",
          reason: "Tous les devis ont été refusés (auto)",
        },
      },
      {
        name: "Recalcul périodique des scores",
        description:
          "Recalcule automatiquement les scores prospects selon les critères configurés.",
        trigger_type: "recalculate_scores",
        action_type: "update_scores",
        config: {
          action_type: "update_scores",
          version: 1,
          weights: {},
        },
      },
    ],
  },

  // ── 📊 Reporting (2 règles) ─────────────────────────────────────────────
  {
    id: "reporting",
    name: "Reporting",
    description:
      "Garde le pouls de ton activité commerciale via digests automatiques.",
    icon: "📊",
    color: "purple",
    rules: [
      {
        name: "Digest quotidien",
        description:
          "Notifie l'admin chaque matin avec un résumé des nouveautés CRM.",
        trigger_type: "daily_digest",
        action_type: "create_notification",
        config: {
          action_type: "create_notification",
          version: 1,
          title: "Résumé quotidien CRM",
          message:
            "Voici un récap des nouveautés CRM des dernières 24h (prospects, devis, tâches).",
          recipient: "admin",
        },
      },
      {
        name: "Résumé hebdomadaire",
        description:
          "Notifie l'admin chaque lundi avec un résumé de la semaine passée.",
        trigger_type: "weekly_summary",
        action_type: "create_notification",
        config: {
          action_type: "create_notification",
          version: 1,
          title: "Résumé hebdomadaire CRM",
          message:
            "Voici un récap de la semaine passée : prospects entrants, devis émis, conversions, tâches.",
          recipient: "admin",
        },
      },
    ],
  },
];
