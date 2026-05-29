import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LOGGER_PATH = resolve(
  process.cwd(),
  "src/lib/crm/automation-logger.ts",
);
const ROUTE_PATH = resolve(
  process.cwd(),
  "src/app/api/crm/automations/run/route.ts",
);

const loggerSrc = readFileSync(LOGGER_PATH, "utf-8");
const routeSrc = readFileSync(ROUTE_PATH, "utf-8");

describe("aut-c-4 — Intégration crm_automation_logs dans moteur CRM", () => {
  describe("automation-logger.ts (helper centralisé)", () => {
    it("exporte logCrmAutomationExecution avec signature attendue", () => {
      expect(loggerSrc).toMatch(
        /export async function logCrmAutomationExecution\(\s*supabase: SupabaseClient,\s*params: CrmLogParams,?\s*\): Promise<void>/,
      );
    });

    it("exporte deriveStatus helper (success/partial/failed)", () => {
      expect(loggerSrc).toMatch(/export function deriveStatus\(/);
      expect(loggerSrc).toMatch(/"success" \| "partial" \| "failed"/);
    });

    it("type CrmLogParams couvre les champs requis", () => {
      expect(loggerSrc).toMatch(/entity_id: string/);
      expect(loggerSrc).toMatch(/trigger_type: string/);
      expect(loggerSrc).toMatch(/action_type: string/);
      expect(loggerSrc).toMatch(/recipient_count: number/);
      expect(loggerSrc).toMatch(/status: CrmLogStatus/);
      expect(loggerSrc).toMatch(/executed_by\?: string \| null/);
      expect(loggerSrc).toMatch(/is_manual\?: boolean/);
    });

    it("résout les rules actives via trigger_type + entity_id + is_enabled", () => {
      expect(loggerSrc).toMatch(/from\("crm_automation_rules"\)/);
      expect(loggerSrc).toMatch(/\.eq\("entity_id", params\.entity_id\)/);
      expect(loggerSrc).toMatch(/\.eq\("trigger_type", params\.trigger_type\)/);
      expect(loggerSrc).toMatch(/\.eq\("is_enabled", true\)/);
    });

    it("insert dans crm_automation_logs (1 ligne par rule + fallback rule_id NULL)", () => {
      expect(loggerSrc).toMatch(/from\("crm_automation_logs"\)\.insert/);
      expect(loggerSrc).toMatch(/rule_id: null/);
      expect(loggerSrc).toMatch(/rule_name: params\.trigger_type/);
    });

    it("snapshot rule_name à l'insertion (UX-DR-AUT-9)", () => {
      expect(loggerSrc).toMatch(/rule_name: r\.name/);
    });

    it("appelle fonction PG increment_crm_rule_execution pour chaque rule", () => {
      expect(loggerSrc).toMatch(/\.rpc\("increment_crm_rule_execution"/);
      expect(loggerSrc).toMatch(/rule_id_param: rule\.id/);
    });

    it("try/catch englobant non-blocking (NFR-AUT-REL-2)", () => {
      expect(loggerSrc).toMatch(/try \{[\s\S]+?\} catch \(err\) \{/);
      expect(loggerSrc).toMatch(/console\.error\(\s*"\[logCrmAutomationExecution\] failed/);
    });

    it("executed_by NULL par défaut (cron service_role)", () => {
      expect(loggerSrc).toMatch(/executed_by: params\.executed_by \?\? null/);
    });
  });

  describe("route.ts — branche CRON (Bearer CRON_SECRET)", () => {
    it("importe logCrmAutomationExecution", () => {
      expect(routeSrc).toMatch(
        /import \{ logCrmAutomationExecution \} from "@\/lib\/crm\/automation-logger"/,
      );
    });

    it("log après prospect_inactive_30d (CRON, is_manual: false)", () => {
      expect(routeSrc).toMatch(
        /trigger_type: "prospect_inactive_30d",[\s\S]+?is_manual: false/,
      );
    });

    it("log après quote_expiring_3d (CRON, is_manual: false)", () => {
      expect(routeSrc).toMatch(
        /trigger_type: "quote_expiring_3d",[\s\S]+?is_manual: false/,
      );
    });

    it("log après task_overdue_3d (CRON, action_type: create_notification)", () => {
      expect(routeSrc).toMatch(
        /trigger_type: "task_overdue_3d",[\s\S]+?action_type: "create_notification"/,
      );
    });
  });

  describe("route.ts — branche USER (admin authenticated)", () => {
    it("log avec is_manual: true dans branche user", () => {
      expect(routeSrc).toMatch(/is_manual: true/);
    });

    it("log avec executed_by: user.id (résolu depuis getUser)", () => {
      expect(routeSrc).toMatch(/executed_by: user\.id/);
    });

    it("3 appels logCrmAutomationExecution avec is_manual: true (1 par trigger)", () => {
      const manualCalls = routeSrc.match(/is_manual: true/g) ?? [];
      expect(manualCalls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Cohérence globale", () => {
    it("statut 'success' par défaut (UX-DR-AUT-9 : skipped count=0 = success)", () => {
      const successStatusCalls = routeSrc.match(/status: "success"/g) ?? [];
      // 3 triggers × 2 branches (CRON + USER) = 6 occurrences
      expect(successStatusCalls.length).toBeGreaterThanOrEqual(6);
    });

    it("recipient_count toujours passé (jamais omis)", () => {
      const calls = routeSrc.match(/recipient_count:/g) ?? [];
      expect(calls.length).toBeGreaterThanOrEqual(6);
    });

    it("action_type cohérent (create_task pour relances/devis, create_notification pour overdue)", () => {
      const createTask = routeSrc.match(/action_type: "create_task"/g) ?? [];
      const createNotif = routeSrc.match(/action_type: "create_notification"/g) ?? [];
      // 2 triggers create_task × 2 branches = 4
      expect(createTask.length).toBeGreaterThanOrEqual(4);
      // 1 trigger create_notification × 2 branches = 2
      expect(createNotif.length).toBeGreaterThanOrEqual(2);
    });
  });
});
