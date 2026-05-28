import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/automation/page.tsx",
);
const DOMAIN_TOGGLE_PATH = resolve(
  process.cwd(),
  "src/components/automation/DomainToggle.tsx",
);
const NEXT_RUN_BADGE_PATH = resolve(
  process.cwd(),
  "src/components/automation/NextRunBadge.tsx",
);
const RULE_AUDIT_SHEET_PATH = resolve(
  process.cwd(),
  "src/components/automation/RuleAuditSheet.tsx",
);
const USE_NEXT_RUNS_PATH = resolve(
  process.cwd(),
  "src/components/automation/useNextRuns.ts",
);

const pageSrc = readFileSync(PAGE_PATH, "utf-8");

describe("aut-b-2 — UI /admin/automation enrichie", () => {
  describe("Composants enfants créés", () => {
    it("<DomainToggle> existe", () => {
      const src = readFileSync(DOMAIN_TOGGLE_PATH, "utf-8");
      expect(src).toMatch(/"use client"/);
      expect(src).toMatch(/export function DomainToggle/);
    });

    it("<NextRunBadge> existe", () => {
      const src = readFileSync(NEXT_RUN_BADGE_PATH, "utf-8");
      expect(src).toMatch(/"use client"/);
      expect(src).toMatch(/export function NextRunBadge/);
    });

    it("<RuleAuditSheet> existe", () => {
      const src = readFileSync(RULE_AUDIT_SHEET_PATH, "utf-8");
      expect(src).toMatch(/"use client"/);
      expect(src).toMatch(/export function RuleAuditSheet/);
    });

    it("useNextRuns hook existe", () => {
      const src = readFileSync(USE_NEXT_RUNS_PATH, "utf-8");
      expect(src).toMatch(/"use client"/);
      expect(src).toMatch(/export function useNextRuns/);
    });
  });

  describe("DomainToggle (UX-DR-AUT-4 — toggle 2 univers en haut de page)", () => {
    const src = readFileSync(DOMAIN_TOGGLE_PATH, "utf-8");

    it("contient 2 liens : /admin/automation et /admin/crm/automations", () => {
      expect(src).toMatch(/href="\/admin\/automation"/);
      expect(src).toMatch(/href="\/admin\/crm\/automations"/);
    });

    it("accepte activeDomain: 'formation' | 'crm'", () => {
      expect(src).toMatch(/activeDomain: "formation" \| "crm"/);
    });

    it("a role='tablist' + aria-selected pour a11y (NFR-AUT-A11Y)", () => {
      expect(src).toMatch(/role="tablist"/);
      expect(src).toMatch(/aria-selected=/);
    });
  });

  describe("NextRunBadge (UX-DR-AUT-5 — langage naturel)", () => {
    const src = readFileSync(NEXT_RUN_BADGE_PATH, "utf-8");

    it("affiche un libellé naturel via info.natural_language", () => {
      expect(src).toMatch(/info\.natural_language/);
    });

    it("style bleu gras pour 'Ce soir 7h' et 'Demain 7h' (imminent)", () => {
      expect(src).toMatch(
        /natural_language === "Ce soir 7h"[\s\S]+?natural_language === "Demain 7h"/,
      );
      expect(src).toMatch(/text-blue-700 font-semibold/);
    });

    it("style gris barré si 'Désactivée'", () => {
      expect(src).toMatch(/line-through/);
    });

    it("a un aria-label complet pour screen reader (NFR-AUT-A11Y-3)", () => {
      expect(src).toMatch(/aria-label=/);
      expect(src).toMatch(/Prochain déclenchement/);
    });
  });

  describe("RuleAuditSheet (UX-DR-AUT-9 — 3 statuts visuels)", () => {
    const src = readFileSync(RULE_AUDIT_SHEET_PATH, "utf-8");

    it("utilise Sheet shadcn (slide-in latéral)", () => {
      expect(src).toMatch(/from "@\/components\/ui\/sheet"/);
      expect(src).toMatch(/<Sheet open=/);
    });

    it("charge session_automation_logs limité à 10", () => {
      expect(src).toMatch(/\.from\("session_automation_logs"\)/);
      expect(src).toMatch(/\.limit\(10\)/);
    });

    it("filtre par rule_id + tri executed_at desc", () => {
      expect(src).toMatch(/\.eq\("rule_id", ruleId\)/);
      expect(src).toMatch(/executed_at[^)]+ascending: false/);
    });

    it("mapStatusVisual : 3 niveaux seulement (failed/partial/success)", () => {
      expect(src).toMatch(/status === "failed"/);
      expect(src).toMatch(/status === "partial"/);
      // skipped → mappé sur Succès avec recipient_count=0
      expect(src).toMatch(/Succès \(0 cibles\)/);
    });

    it("utilise icônes différenciées (CheckCircle2 / AlertTriangle / XCircle)", () => {
      expect(src).toMatch(/CheckCircle2/);
      expect(src).toMatch(/AlertTriangle/);
      expect(src).toMatch(/XCircle/);
    });
  });

  describe("Page /admin/automation — intégration des nouveaux composants", () => {
    it("importe DomainToggle + NextRunBadge + RuleAuditSheet + DryRunDialog + useNextRuns", () => {
      expect(pageSrc).toMatch(/import \{ DryRunDialog \} from/);
      expect(pageSrc).toMatch(/import \{ DomainToggle \} from/);
      expect(pageSrc).toMatch(/import \{ NextRunBadge \} from/);
      expect(pageSrc).toMatch(/import \{ RuleAuditSheet \} from/);
      expect(pageSrc).toMatch(/import \{ useNextRuns \} from/);
    });

    it("affiche <DomainToggle activeDomain='formation' />", () => {
      expect(pageSrc).toMatch(/<DomainToggle/);
      expect(pageSrc).toMatch(/activeDomain="formation"/);
    });

    it("consomme useNextRuns(entity?.id) au top-level du composant", () => {
      expect(pageSrc).toMatch(/useNextRuns\(entity\?\.id\)/);
    });

    it("rend <NextRunBadge info={nextRunInfo} /> dans renderRuleRow", () => {
      expect(pageSrc).toMatch(/const nextRunInfo = nextRuns\.get\(rule\.id\)/);
      expect(pageSrc).toMatch(/<NextRunBadge info=\{nextRunInfo\}/);
    });

    it("bouton 'Tester sans envoyer' avec libellé EXACT (UX-DR-AUT-2)", () => {
      expect(pageSrc).toMatch(/Tester sans envoyer/);
    });

    it("ouvre DryRunDialog avec domain='formation' au click 'Tester sans envoyer'", () => {
      expect(pageSrc).toMatch(/handleTest = \(rule: Rule\)/);
      expect(pageSrc).toMatch(/<DryRunDialog/);
      expect(pageSrc).toMatch(/domain="formation"/);
    });

    it("bouton 'Audit' ouvre <RuleAuditSheet>", () => {
      expect(pageSrc).toMatch(/handleViewAudit = \(rule: Rule\)/);
      expect(pageSrc).toMatch(/<RuleAuditSheet/);
    });

    it("Switch toggle a aria-label explicite (a11y)", () => {
      expect(pageSrc).toMatch(/aria-label=\{`Activer\/désactiver la règle/);
    });

    it("3 boutons d'actions ont chacun aria-label + title (a11y + UX)", () => {
      expect(pageSrc).toMatch(/aria-label=\{`Tester la règle/);
      expect(pageSrc).toMatch(/aria-label=\{`Voir l'audit/);
      expect(pageSrc).toMatch(/aria-label=\{`Supprimer la règle/);
    });

    it("Input recherche a aria-label explicite (a11y)", () => {
      expect(pageSrc).toMatch(/aria-label="Rechercher dans les règles/);
    });
  });

  describe("Cohérence vocabulaire (Pack → Modèle, refactor 2026-05-28)", () => {
    it("UI utilise 'Modèle' au lieu de 'Pack' dans les labels visibles", () => {
      // Le bouton existant "Ajouter un pack" → renommé "Ajouter un modèle"
      expect(pageSrc).toMatch(/Ajouter un modèle/);
      // L'empty state mentionne "modèle" au lieu de "pack"
      expect(pageSrc).toMatch(/Activez un modèle/);
    });
  });
});
