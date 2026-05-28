import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TAB_AUTOMATION_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/formations/[id]/_components/TabAutomation.tsx",
);

const RUN_CRON_PATH = resolve(
  process.cwd(),
  "src/app/api/formations/automation-rules/run-cron/route.ts",
);

const CRM_RUN_PATH = resolve(
  process.cwd(),
  "src/app/api/crm/automations/run/route.ts",
);

const TRIGGER_EVENT_PATH = resolve(
  process.cwd(),
  "src/app/api/formations/automation-rules/trigger-event/route.ts",
);

describe("aut-a-3 — Fix B1 + B6 + B2 + mode dry-run", () => {
  describe("B1 — TabAutomation utilise is_enabled (pas is_active)", () => {
    const tabSource = readFileSync(TAB_AUTOMATION_PATH, "utf-8");

    it("aucune occurrence de is_active dans le composant", () => {
      expect(tabSource).not.toMatch(/is_active/);
    });

    it("utilise is_enabled dans le SELECT des règles", () => {
      expect(tabSource).toMatch(/is_enabled/);
      expect(tabSource).toMatch(
        /\.select\([^)]*is_enabled[^)]*\)/,
      );
    });

    it("filtre applicableRules sur is_enabled", () => {
      expect(tabSource).toMatch(
        /\.filter\(r => r\.is_enabled && ruleApplies\(r\)\)/,
      );
    });
  });

  describe("B6 — TabAutomation surface les erreurs (plus de catch silencieux)", () => {
    const tabSource = readFileSync(TAB_AUTOMATION_PATH, "utf-8");

    it("aucun catch sans paramètre err (catch {} silencieux interdit)", () => {
      // Match `} catch {` (sans paramètre) hors commentaires
      const executableLines = tabSource
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      expect(executableLines).not.toMatch(/\}\s*catch\s*\{/);
    });

    it("fetchData utilise console.error + toast (résout B6)", () => {
      expect(tabSource).toMatch(
        /catch \(err\)[\s\S]{0,200}?console\.error\([\s\S]{0,100}?TabAutomation/,
      );
    });

    it("handleToggle utilise console.error + toast", () => {
      expect(tabSource).toMatch(
        /handleToggle[\s\S]+?catch \(err\)[\s\S]{0,200}?console\.error/,
      );
    });

    it("handleRunRule utilise console.error + toast", () => {
      expect(tabSource).toMatch(
        /handleRunRule[\s\S]+?catch \(err\)[\s\S]{0,200}?console\.error/,
      );
    });
  });

  describe("B2 — trigger-event transmet rule_id à run-cron", () => {
    const triggerEventSource = readFileSync(TRIGGER_EVENT_PATH, "utf-8");

    it("le body forwarded à run-cron contient rule_id si présent", () => {
      expect(triggerEventSource).toMatch(
        /body:\s*JSON\.stringify\(rule_id \? \{ rule_id, session_id \} : \{ trigger_type, session_id \}\)/,
      );
    });

    it("accepte rule_id OU trigger_type (l'un des deux requis)", () => {
      expect(triggerEventSource).toMatch(
        /!session_id \|\| \(!trigger_type && !rule_id\)/,
      );
    });
  });

  describe("Mode dry-run dans run-cron (rule-scoped)", () => {
    const runCronSource = readFileSync(RUN_CRON_PATH, "utf-8");

    it("parse body.mode et détecte 'dry-run'", () => {
      expect(runCronSource).toMatch(
        /let mode:\s*"execute"\s*\|\s*"dry-run"\s*=\s*"execute"/,
      );
      expect(runCronSource).toMatch(/body\.mode === "dry-run"/);
    });

    it("importe resolveRecipients depuis execute-rule", () => {
      expect(runCronSource).toMatch(
        /import \{[\s\S]+?resolveRecipients[\s\S]+?\} from "@\/lib\/automation\/execute-rule"/,
      );
    });

    it("dans la branche rule-scoped, gère mode === 'dry-run'", () => {
      expect(runCronSource).toMatch(
        /if \(mode === "dry-run"\)[\s\S]{0,2000}?resolveRecipients\(supabase, session\.id/,
      );
    });

    it("le payload dry-run contient recipients + rendered_email + attachments + warnings", () => {
      expect(runCronSource).toMatch(/mode: "dry-run"/);
      expect(runCronSource).toMatch(/recipients\.map/);
      expect(runCronSource).toMatch(/rendered_email/);
      expect(runCronSource).toMatch(/attachmentDescriptors/);
      // const warnings + property shorthand `warnings,`
      expect(runCronSource).toMatch(/const warnings:\s*string\[\]/);
      expect(runCronSource).toMatch(/\bwarnings,\s*\}\);/);
    });

    it("dry-run respecte le filtre condition_subcontracted (cohérence avec execute)", () => {
      expect(runCronSource).toMatch(
        /if \(mode === "dry-run"\)[\s\S]+?condition_subcontracted/,
      );
    });

    it("dry-run n'appelle PAS executeRuleForSession (NFR-AUT-SEC-5)", () => {
      // Dans la branche if (mode === "dry-run"), aucun call à executeRuleForSession
      // (qui enqueue). On vérifie via structure : le return du dry-run est avant
      // l'appel executeRuleForSession.
      const dryRunBlock = runCronSource.match(
        /if \(mode === "dry-run"\) \{[\s\S]+?return NextResponse\.json\([\s\S]+?\}\);/,
      );
      expect(dryRunBlock).not.toBeNull();
      expect(dryRunBlock?.[0]).not.toMatch(/executeRuleForSession/);
    });
  });

  describe("Mode dry-run dans /api/crm/automations/run (branche user)", () => {
    const crmRunSource = readFileSync(CRM_RUN_PATH, "utf-8");

    it("parse body.mode dans la branche user", () => {
      expect(crmRunSource).toMatch(
        /let bodyMode:\s*"execute"\s*\|\s*"dry-run"\s*=\s*"execute"/,
      );
      expect(crmRunSource).toMatch(/body\?\.mode === "dry-run"/);
    });

    it("retourne un payload avec eligibility par trigger_type", () => {
      expect(crmRunSource).toMatch(
        /if \(bodyMode === "dry-run"\)[\s\S]{0,2000}?eligibility/,
      );
    });

    it("calcule cibles pour prospect_inactive_30d", () => {
      expect(crmRunSource).toMatch(
        /eligibility\.prospect_inactive_30d[\s\S]{0,100}?count[\s\S]{0,100}?sample/,
      );
    });

    it("calcule cibles pour quote_expiring_3d", () => {
      expect(crmRunSource).toMatch(
        /eligibility\.quote_expiring_3d[\s\S]{0,100}?count[\s\S]{0,100}?sample/,
      );
    });

    it("calcule cibles pour task_overdue_3d", () => {
      expect(crmRunSource).toMatch(
        /eligibility\.task_overdue_3d[\s\S]{0,100}?count[\s\S]{0,100}?sample/,
      );
    });

    it("dry-run n'appelle PAS relanceInactiveProspects / createExpiringQuoteTasks / notifyOverdueTasks (NFR-AUT-SEC-5)", () => {
      // Dans la branche if (bodyMode === "dry-run"), aucun call aux fonctions effet-de-bord
      const dryRunBlock = crmRunSource.match(
        /if \(bodyMode === "dry-run"\) \{[\s\S]+?return NextResponse\.json\([\s\S]+?\}\);[\s\S]{0,200}?\}/,
      );
      expect(dryRunBlock).not.toBeNull();
      expect(dryRunBlock?.[0]).not.toMatch(/relanceInactiveProspects\(/);
      expect(dryRunBlock?.[0]).not.toMatch(/createExpiringQuoteTasks\(/);
      expect(dryRunBlock?.[0]).not.toMatch(/notifyOverdueTasks\(/);
    });

    it("limite le sample à top 5 (preview UI) — au moins 3 occurrences .limit(5) dans le fichier", () => {
      const limitCount = (crmRunSource.match(/\.limit\(5\)/g) ?? []).length;
      // 3 triggers V1 supportés × 1 SELECT sample chacun = 3 minimum
      expect(limitCount).toBeGreaterThanOrEqual(3);
    });
  });
});
