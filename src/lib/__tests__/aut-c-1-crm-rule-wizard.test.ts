import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  CRM_TRIGGER_TYPES,
  CRM_ACTION_TYPES,
  CRM_TRIGGER_LABELS,
  CRM_ACTION_LABELS,
  CRM_TRIGGER_CATEGORIES,
  crmActionConfigSchema,
  crmRulePayloadSchema,
} from "@/lib/schemas/automation";

const SCHEMAS_PATH = resolve(
  process.cwd(),
  "src/lib/schemas/automation.ts",
);

const WIZARD_PATH = resolve(
  process.cwd(),
  "src/components/automation/CrmRuleWizard.tsx",
);

const TASK_FORM_PATH = resolve(
  process.cwd(),
  "src/components/automation/forms/TaskConfigForm.tsx",
);

const NOTIF_FORM_PATH = resolve(
  process.cwd(),
  "src/components/automation/forms/NotificationConfigForm.tsx",
);

const STATUS_FORM_PATH = resolve(
  process.cwd(),
  "src/components/automation/forms/StatusUpdateConfigForm.tsx",
);

const SCORING_FORM_PATH = resolve(
  process.cwd(),
  "src/components/automation/forms/ScoringConfigForm.tsx",
);

describe("aut-c-1 — CrmRuleWizard (5 étapes + Zod discriminated union)", () => {
  describe("Zod schemas (src/lib/schemas/automation.ts)", () => {
    it("11 triggers CRM V1 (cohérence avec CHECK migration crm-automation-rules.sql)", () => {
      expect(CRM_TRIGGER_TYPES.length).toBe(11);
      expect(CRM_TRIGGER_TYPES).toContain("prospect_inactive_30d");
      expect(CRM_TRIGGER_TYPES).toContain("quote_expiring_3d");
      expect(CRM_TRIGGER_TYPES).toContain("task_overdue_3d");
      expect(CRM_TRIGGER_TYPES).toContain("daily_digest");
    });

    it("4 action_types CRM V1", () => {
      expect(CRM_ACTION_TYPES.length).toBe(4);
      expect(CRM_ACTION_TYPES).toEqual(
        expect.arrayContaining([
          "create_task",
          "create_notification",
          "update_prospect_status",
          "update_scores",
        ]),
      );
    });

    it("CRM_TRIGGER_LABELS couvre les 11 triggers", () => {
      CRM_TRIGGER_TYPES.forEach((t) => {
        expect(CRM_TRIGGER_LABELS[t]).toBeTruthy();
      });
    });

    it("CRM_ACTION_LABELS couvre les 4 actions", () => {
      CRM_ACTION_TYPES.forEach((a) => {
        expect(CRM_ACTION_LABELS[a]).toBeTruthy();
      });
    });

    it("CRM_TRIGGER_CATEGORIES regroupe en 4 catégories (Acquisition/Relances/Conversion/Reporting)", () => {
      const categories = new Set(
        CRM_TRIGGER_TYPES.map((t) => CRM_TRIGGER_CATEGORIES[t].category),
      );
      expect(categories.size).toBe(4);
      expect(categories).toContain("Acquisition");
      expect(categories).toContain("Relances");
      expect(categories).toContain("Conversion");
      expect(categories).toContain("Reporting");
    });

    it("crmActionConfigSchema est un discriminated union sur action_type (ID-AUT-5)", () => {
      // task config valide
      const taskValid = crmActionConfigSchema.safeParse({
        action_type: "create_task",
        version: 1,
        title: "Relancer X",
        due_in_days: 3,
        assignee: "auto",
        priority: "normal",
      });
      expect(taskValid.success).toBe(true);

      // notification config valide
      const notifValid = crmActionConfigSchema.safeParse({
        action_type: "create_notification",
        version: 1,
        title: "Test",
        message: "Test",
        recipient: "admin",
      });
      expect(notifValid.success).toBe(true);

      // mauvais action_type → erreur
      const invalid = crmActionConfigSchema.safeParse({
        action_type: "create_task",
        version: 1,
        // title manquant → invalide
      });
      expect(invalid.success).toBe(false);
    });

    it("config inclut version: literal 1 (ID-AUT-6 versioning JSONB)", () => {
      const src = readFileSync(SCHEMAS_PATH, "utf-8");
      // 4 schemas × 1 version: z.literal(1) = 4 occurrences
      const matches = src.match(/version: z\.literal\(1\)/g) ?? [];
      expect(matches.length).toBe(4);
    });

    it("crmRulePayloadSchema valide une règle complète", () => {
      const valid = crmRulePayloadSchema.safeParse({
        name: "Relance auto 30j",
        trigger_type: "prospect_inactive_30d",
        action_type: "create_task",
        is_enabled: true,
        config: {
          action_type: "create_task",
          version: 1,
          title: "Relancer {{prospect_name}}",
          due_in_days: 3,
          assignee: "auto",
          priority: "normal",
        },
      });
      expect(valid.success).toBe(true);
    });

    it("Status update_prospect_status accepte les 5 statuts (active/qualified/dormant/won/lost)", () => {
      const statuses = ["active", "qualified", "dormant", "won", "lost"] as const;
      statuses.forEach((s) => {
        const parsed = crmActionConfigSchema.safeParse({
          action_type: "update_prospect_status",
          version: 1,
          new_status: s,
        });
        expect(parsed.success).toBe(true);
      });
    });
  });

  describe("Sub-forms (4 composants par action_type)", () => {
    it("TaskConfigForm existe ('use client' + export)", () => {
      expect(existsSync(TASK_FORM_PATH)).toBe(true);
      const src = readFileSync(TASK_FORM_PATH, "utf-8");
      expect(src).toMatch(/^"use client";/);
      expect(src).toMatch(/export function TaskConfigForm/);
    });

    it("NotificationConfigForm existe", () => {
      expect(existsSync(NOTIF_FORM_PATH)).toBe(true);
      const src = readFileSync(NOTIF_FORM_PATH, "utf-8");
      expect(src).toMatch(/export function NotificationConfigForm/);
    });

    it("StatusUpdateConfigForm existe avec 5 statuts (active/qualified/dormant/won/lost)", () => {
      expect(existsSync(STATUS_FORM_PATH)).toBe(true);
      const src = readFileSync(STATUS_FORM_PATH, "utf-8");
      expect(src).toMatch(/export function StatusUpdateConfigForm/);
      expect(src).toMatch(/active/);
      expect(src).toMatch(/qualified/);
      expect(src).toMatch(/dormant/);
      expect(src).toMatch(/won/);
      expect(src).toMatch(/lost/);
    });

    it("ScoringConfigForm existe (V1 simplifié — V2 fera l'UI fine)", () => {
      expect(existsSync(SCORING_FORM_PATH)).toBe(true);
      const src = readFileSync(SCORING_FORM_PATH, "utf-8");
      expect(src).toMatch(/export function ScoringConfigForm/);
      expect(src).toMatch(/V2/); // mention que la config fine arrive V2
    });

    it("chaque sub-form utilise des id + Label htmlFor associés (a11y)", () => {
      for (const path of [TASK_FORM_PATH, NOTIF_FORM_PATH, STATUS_FORM_PATH]) {
        const src = readFileSync(path, "utf-8");
        expect(src).toMatch(/<Label htmlFor=/);
        expect(src).toMatch(/id="[a-z-]+"/);
      }
    });
  });

  describe("CrmRuleWizard composant principal", () => {
    const src = readFileSync(WIZARD_PATH, "utf-8");

    it("est un Client Component avec export CrmRuleWizard", () => {
      expect(src).toMatch(/^"use client";/);
      expect(src).toMatch(/export function CrmRuleWizard/);
    });

    it("a 5 étapes (type Step = 1 | 2 | 3 | 4 | 5)", () => {
      expect(src).toMatch(/type Step = 1 \| 2 \| 3 \| 4 \| 5/);
    });

    it("importe les 4 sub-forms + DryRunDialog + schemas Zod", () => {
      expect(src).toMatch(/import \{ TaskConfigForm \}/);
      expect(src).toMatch(/import \{ NotificationConfigForm \}/);
      expect(src).toMatch(/import \{ StatusUpdateConfigForm \}/);
      expect(src).toMatch(/import \{ ScoringConfigForm \}/);
      expect(src).toMatch(/import \{ DryRunDialog \}/);
      expect(src).toMatch(/from "@\/lib\/schemas\/automation"/);
    });

    it("setActionTypeAndInit initialise actionConfig avec version: 1", () => {
      expect(src).toMatch(/setActionTypeAndInit/);
      expect(src).toMatch(/version: 1/);
    });

    it("Étape 1 affiche les triggers groupés par catégorie", () => {
      expect(src).toMatch(/triggersByCategory/);
      expect(src).toMatch(/CRM_TRIGGER_CATEGORIES/);
    });

    it("Étape 3 affiche les 4 action_types", () => {
      expect(src).toMatch(/CRM_ACTION_TYPES\.map/);
    });

    it("Étape 4 rendu conditionnel par action_type (4 sub-forms)", () => {
      expect(src).toMatch(/actionType === "create_task"/);
      expect(src).toMatch(/actionType === "create_notification"/);
      expect(src).toMatch(/actionType === "update_prospect_status"/);
      expect(src).toMatch(/actionType === "update_scores"/);
    });

    it("Étape 5 : description + activer immédiatement + récap", () => {
      expect(src).toMatch(/crm-rule-description/);
      expect(src).toMatch(/crm-activate-immediately/);
      expect(src).toMatch(/Récapitulatif/);
    });

    it("handleCreate valide via crmRulePayloadSchema.safeParse avant POST", () => {
      expect(src).toMatch(/crmRulePayloadSchema\.safeParse/);
    });

    it("POST vers /api/crm/automations", () => {
      expect(src).toMatch(/fetch\("\/api\/crm\/automations"/);
    });

    it("toast distingue activé/désactivé selon activateImmediately", () => {
      expect(src).toMatch(/Règle CRM créée et activée/);
      expect(src).toMatch(/Règle CRM créée \(désactivée\)/);
    });

    it("bouton 'Créer puis tester' (UX-DR-AUT-11)", () => {
      expect(src).toMatch(/Créer puis tester/);
      expect(src).toMatch(/handleCreate\(true\)/);
      expect(src).toMatch(
        /aria-label="Créer la règle CRM puis la tester sans envoyer"/,
      );
    });

    it("DryRunDialog avec domain='crm' rendu si dryRunAfterCreate", () => {
      expect(src).toMatch(/<DryRunDialog/);
      expect(src).toMatch(/domain="crm"/);
    });

    it("Progress bar avec aria-valuenow + aria-valuemax (a11y)", () => {
      expect(src).toMatch(/role="progressbar"/);
      expect(src).toMatch(/aria-valuenow=\{step\}/);
      expect(src).toMatch(/aria-valuemax=\{5\}/);
    });

    it("boutons triggers/actions ont aria-pressed (a11y radio-like)", () => {
      expect(src).toMatch(/aria-pressed=\{triggerType === t\}/);
      expect(src).toMatch(/aria-pressed=\{actionType === a\}/);
    });

    it("resetAndClose réinitialise tous les states (zero leak)", () => {
      expect(src).toMatch(/setStep\(1\)/);
      expect(src).toMatch(/setTriggerType\(""\)/);
      expect(src).toMatch(/setActionType\(""\)/);
      expect(src).toMatch(/setActionConfig\(\{\}\)/);
      expect(src).toMatch(/setRuleDescription\(""\)/);
      expect(src).toMatch(/setActivateImmediately\(true\)/);
      expect(src).toMatch(/setDryRunAfterCreate\(null\)/);
    });
  });
});
