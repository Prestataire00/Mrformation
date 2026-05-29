import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DRY_RUN_ROUTE_PATH = resolve(
  process.cwd(),
  "src/app/api/crm/automations/dry-run/route.ts",
);
const ELIGIBLE_ROUTE_PATH = resolve(
  process.cwd(),
  "src/app/api/crm/automations/eligible-targets/route.ts",
);
const DIALOG_PATH = resolve(
  process.cwd(),
  "src/components/automation/DryRunDialog.tsx",
);

const dryRunSrc = readFileSync(DRY_RUN_ROUTE_PATH, "utf-8");
const eligibleSrc = readFileSync(ELIGIBLE_ROUTE_PATH, "utf-8");
const dialogSrc = readFileSync(DIALOG_PATH, "utf-8");

describe("aut-c-5 — Eligible-targets + DryRunDialog adapté pour update_scores/update_prospect_status", () => {
  describe("Route eligible-targets (préexistante aut-a-6, sanity)", () => {
    it("POST endpoint avec auth admin/super_admin", () => {
      expect(eligibleSrc).toMatch(/export async function POST/);
      expect(eligibleSrc).toMatch(/"admin", "super_admin"/);
    });

    it("retourne { count, sample } pour les 3 triggers V1", () => {
      expect(eligibleSrc).toMatch(/count: countRes\.count \?\? 0/);
      expect(eligibleSrc).toMatch(/sample:.+\.map/);
    });

    it("supporte les 3 triggers V1 (prospect_inactive_30d, quote_expiring_3d, task_overdue_3d)", () => {
      expect(eligibleSrc).toMatch(/"prospect_inactive_30d"/);
      expect(eligibleSrc).toMatch(/"quote_expiring_3d"/);
      expect(eligibleSrc).toMatch(/"task_overdue_3d"/);
    });

    it("sample limité à top 5", () => {
      const limit5 = eligibleSrc.match(/\.limit\(5\)/g) ?? [];
      expect(limit5.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Route dry-run CRM — enrichissement action_preview", () => {
    it("importe calculateLeadScore (recalcul score réel, NFR-AUT-SEC-5)", () => {
      expect(dryRunSrc).toMatch(
        /import \{ calculateLeadScore \} from "@\/lib\/crm\/lead-scoring"/,
      );
    });

    it("PREVIEW_ENABLED_ACTIONS contient update_prospect_status + update_scores", () => {
      expect(dryRunSrc).toMatch(/PREVIEW_ENABLED_ACTIONS/);
      expect(dryRunSrc).toMatch(/"update_prospect_status"/);
      expect(dryRunSrc).toMatch(/"update_scores"/);
    });

    it("charge la rule avec action_type + config (en plus de trigger_type)", () => {
      expect(dryRunSrc).toMatch(
        /\.select\("entity_id, trigger_type, action_type, config, name"\)/,
      );
    });

    it("appelle computeActionPreview si rule + action_type pertinent", () => {
      expect(dryRunSrc).toMatch(/computeActionPreview\(supabase, loadedRule\)/);
      expect(dryRunSrc).toMatch(
        /PREVIEW_ENABLED_ACTIONS\.has\(loadedRule\.action_type\)/,
      );
    });

    it("action_preview ajouté au payload retour (non-destructif)", () => {
      expect(dryRunSrc).toMatch(
        /action_preview \? \{ \.\.\.proxyData, action_preview \}/,
      );
    });

    it("calcul update_prospect_status : current=status, next=config.new_status", () => {
      expect(dryRunSrc).toMatch(/current: p\.status/);
      expect(dryRunSrc).toMatch(/rule\.config\?\.new_status/);
    });

    it("calcul update_scores : utilise calculateLeadScore (pure SELECT)", () => {
      expect(dryRunSrc).toMatch(
        /const newScore = await calculateLeadScore\(/,
      );
      expect(dryRunSrc).toMatch(/delta: newScore - currentScore/);
    });

    it("agrégat update_scores : avg_before + avg_after + avg_delta", () => {
      expect(dryRunSrc).toMatch(/avg_before:/);
      expect(dryRunSrc).toMatch(/avg_after:/);
      expect(dryRunSrc).toMatch(/avg_delta:/);
    });

    it("PROSPECT_TRIGGERS gate : retourne null si trigger non-prospect (ex: quote_expiring_3d)", () => {
      expect(dryRunSrc).toMatch(/PROSPECT_TRIGGERS/);
      expect(dryRunSrc).toMatch(
        /if \(!PROSPECT_TRIGGERS\.has\(rule\.trigger_type\)\) \{[\s\S]+?return null/,
      );
    });

    it("limit top 20 (PREVIEW_SAMPLE_LIMIT)", () => {
      expect(dryRunSrc).toMatch(/PREVIEW_SAMPLE_LIMIT = 20/);
      expect(dryRunSrc).toMatch(/\.limit\(PREVIEW_SAMPLE_LIMIT\)/);
    });

    it("try/catch englobant computeActionPreview (non-blocking)", () => {
      expect(dryRunSrc).toMatch(
        /try \{[\s\S]+?action_preview = await computeActionPreview[\s\S]+?\} catch \(previewErr\)/,
      );
      expect(dryRunSrc).toMatch(
        /console\.error\(\s*"\[crm\/automations\/dry-run\] action_preview failed/,
      );
    });

    it("NFR-AUT-SEC-5 : aucun INSERT/UPDATE dans computeActionPreview", () => {
      // Heuristique : pas de .insert/.update/.upsert/.delete dans computeActionPreview
      const previewFnStart = dryRunSrc.indexOf("async function computeActionPreview");
      const previewBlock = dryRunSrc.slice(previewFnStart);
      expect(previewBlock).not.toMatch(/\.insert\(/);
      expect(previewBlock).not.toMatch(/\.update\(/);
      expect(previewBlock).not.toMatch(/\.upsert\(/);
      expect(previewBlock).not.toMatch(/\.delete\(/);
    });
  });

  describe("DryRunDialog — onglet 'Prospects impactés'", () => {
    it("définit le type ActionPreview avec discriminator action_type", () => {
      expect(dialogSrc).toMatch(/type ActionPreview = \{/);
      expect(dialogSrc).toMatch(
        /action_type: "update_prospect_status" \| "update_scores"/,
      );
    });

    it("ActionPreview inclut sample + total_count + avg_before/after/delta optionnels", () => {
      expect(dialogSrc).toMatch(/total_count: number/);
      expect(dialogSrc).toMatch(/sample: ActionPreviewSampleItem\[\]/);
      expect(dialogSrc).toMatch(/avg_before\?: number/);
      expect(dialogSrc).toMatch(/avg_after\?: number/);
      expect(dialogSrc).toMatch(/avg_delta\?: number/);
    });

    it("CrmDryRunResult étendu avec action_preview optionnel", () => {
      expect(dialogSrc).toMatch(/action_preview\?: ActionPreview/);
    });

    it("rend 2 onglets si action_preview présent (Prospects impactés + Déclencheur évalué)", () => {
      expect(dialogSrc).toMatch(/hasActionPreview/);
      expect(dialogSrc).toMatch(/Prospects impactés \(\{impactedCount\}\)/);
      expect(dialogSrc).toMatch(/Déclencheur évalué/);
    });

    it("ActionPreviewContent affiche current → next pour chaque prospect", () => {
      expect(dialogSrc).toMatch(/function ActionPreviewContent/);
      expect(dialogSrc).toMatch(/\{item\.current\}/);
      expect(dialogSrc).toMatch(/\{item\.next\}/);
    });

    it("sub-resume 'Score moyen' avant → après pour update_scores", () => {
      expect(dialogSrc).toMatch(/Score moyen/);
      expect(dialogSrc).toMatch(/preview\.avg_before/);
      expect(dialogSrc).toMatch(/preview\.avg_after/);
    });

    it("badge delta affiché pour chaque ligne update_scores", () => {
      expect(dialogSrc).toMatch(/item\.delta !== undefined/);
      expect(dialogSrc).toMatch(/\{item\.delta >= 0 \? "\+" : ""\}/);
    });

    it("icônes TrendingUp/TrendingDown selon delta moyen", () => {
      expect(dialogSrc).toMatch(/TrendingUp/);
      expect(dialogSrc).toMatch(/TrendingDown/);
      expect(dialogSrc).toMatch(/\(preview\.avg_delta \?\? 0\) >= 0/);
    });

    it("Empty state si sample vide", () => {
      expect(dialogSrc).toMatch(/Aucun prospect impacté actuellement/);
    });

    it("affiche count total + 'autres non affichés' si total_count > sample.length", () => {
      expect(dialogSrc).toMatch(
        /preview\.total_count > preview\.sample\.length/,
      );
      expect(dialogSrc).toMatch(/non affiché/);
    });

    it("conserve le rendu CRM par défaut (create_task/create_notification) sans regression", () => {
      // EligibilityList toujours utilisé dans le fallback
      expect(dialogSrc).toMatch(/function EligibilityList/);
      expect(dialogSrc).toMatch(/<EligibilityList entries=\{entries\}/);
    });
  });

  describe("Cohérence : pas de leak update_scores dans branche formation", () => {
    it("FormationDryRunContent ne référence pas action_preview", () => {
      const formationStart = dialogSrc.indexOf("function FormationDryRunContent");
      // Borne fin : jusqu'à la fin de la fonction (premier `\n}\n` qui clôt FormationDryRunContent)
      // On prend la prochaine déclaration de sous-composant (function ... ou const ...)
      const afterFormation = dialogSrc.slice(formationStart);
      const nextFnIdx = afterFormation.indexOf("\n// ── Sous-composant");
      const formationBlock = afterFormation.slice(0, nextFnIdx > 0 ? nextFnIdx : afterFormation.length);
      expect(formationBlock).not.toMatch(/action_preview/);
    });
  });
});
