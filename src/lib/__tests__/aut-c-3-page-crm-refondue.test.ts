import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/crm/automations/page.tsx",
);

const src = readFileSync(PAGE_PATH, "utf-8");

describe("aut-c-3 — Page /admin/crm/automations refondue", () => {
  describe("Conventions Next.js", () => {
    it("est un Client Component ('use client')", () => {
      expect(src).toMatch(/^"use client";/);
    });

    it("default export pour la route Next.js App Router", () => {
      expect(src).toMatch(/export default function/);
    });
  });

  describe("Imports des composants Epic B+C (intégration)", () => {
    it("importe DomainToggle (b-2)", () => {
      expect(src).toMatch(
        /import \{ DomainToggle \} from "@\/components\/automation\/DomainToggle"/,
      );
    });

    it("importe CrmRuleWizard (c-1)", () => {
      expect(src).toMatch(
        /import \{ CrmRuleWizard \} from "@\/components\/automation\/CrmRuleWizard"/,
      );
    });

    it("importe CrmRuleTemplates (c-2)", () => {
      expect(src).toMatch(
        /import \{ CrmRuleTemplates \} from "@\/components\/automation\/CrmRuleTemplates"/,
      );
    });

    it("importe DryRunDialog (b-1)", () => {
      expect(src).toMatch(
        /import \{ DryRunDialog \} from "@\/components\/automation\/DryRunDialog"/,
      );
    });
  });

  describe("UX-DR-AUT-4 : DomainToggle activeDomain='crm'", () => {
    it("rend <DomainToggle activeDomain='crm'>", () => {
      expect(src).toMatch(/<DomainToggle/);
      expect(src).toMatch(/activeDomain="crm"/);
    });

    it("passe crmActiveCount calculé depuis enabledCount", () => {
      expect(src).toMatch(/crmActiveCount=\{enabledCount\}/);
    });
  });

  describe("Structure miroir /admin/automation", () => {
    it("4 cards d'état (Total / Actives / Désactivées / Modèles)", () => {
      expect(src).toMatch(/Total/);
      expect(src).toMatch(/Actives/);
      expect(src).toMatch(/Désactivées/);
      expect(src).toMatch(/Modèles dispo/);
    });

    it("bouton 'Nouvelle règle CRM' ouvre CrmRuleWizard", () => {
      expect(src).toMatch(/Nouvelle règle CRM/);
      expect(src).toMatch(/setWizardOpen\(true\)/);
    });

    it("bouton 'Ajouter un modèle' scrolle vers la section templates", () => {
      expect(src).toMatch(/Ajouter un modèle/);
      expect(src).toMatch(/crm-templates-section/);
    });

    it("section CrmRuleTemplates avec id 'crm-templates-section'", () => {
      expect(src).toMatch(/id="crm-templates-section"/);
      expect(src).toMatch(/<CrmRuleTemplates/);
    });

    it("passe existingRuleNames + onActivated à CrmRuleTemplates", () => {
      expect(src).toMatch(/onActivated=\{fetchRules\}/);
      expect(src).toMatch(/existingRuleNames=\{existingRuleNames\}/);
    });
  });

  describe("UX-DR-AUT-2 : bouton 'Tester sans envoyer' (libellé exact)", () => {
    it("bouton 'Tester sans envoyer' sur chaque règle", () => {
      expect(src).toMatch(/Tester sans envoyer/);
    });

    it("handleTest ouvre DryRunDialog avec domain='crm'", () => {
      expect(src).toMatch(/handleTest = \(rule: AutomationRule\)/);
      expect(src).toMatch(/setDryRunTarget\(\{[\s\S]+?ruleId: rule\.id/);
      expect(src).toMatch(/<DryRunDialog/);
      expect(src).toMatch(/domain="crm"/);
    });
  });

  describe("Bouton 'Exécuter maintenant' conservé (utile Loris)", () => {
    it("appel à /api/crm/automations/run en POST", () => {
      expect(src).toMatch(
        /fetch\("\/api\/crm\/automations\/run", \{ method: "POST" \}\)/,
      );
    });

    it("toast après exécution", () => {
      expect(src).toMatch(/Exécution lancée/);
    });
  });

  describe("CRUD règles (existant amélioré)", () => {
    it("fetchRules via GET /api/crm/automations", () => {
      expect(src).toMatch(/fetch\("\/api\/crm\/automations"\)/);
    });

    it("handleToggle via PATCH /api/crm/automations", () => {
      expect(src).toMatch(
        /fetch\("\/api\/crm\/automations"[\s\S]{0,200}?method: "PATCH"/,
      );
    });

    it("handleDelete via DELETE /api/crm/automations", () => {
      expect(src).toMatch(
        /fetch\("\/api\/crm\/automations"[\s\S]{0,200}?method: "DELETE"/,
      );
    });

    it("Switch toggle (cohérence avec /admin/automation b-2)", () => {
      expect(src).toMatch(/<Switch/);
      expect(src).toMatch(/checked=\{rule\.is_enabled\}/);
    });
  });

  describe("A11y (mitigation DoD #2)", () => {
    it("aria-label sur Switch toggle (dynamique selon état)", () => {
      expect(src).toMatch(
        /aria-label=\{`\$\{rule\.is_enabled \? "Désactiver" : "Activer"\} la règle CRM/,
      );
    });

    it("aria-label sur bouton Tester sans envoyer", () => {
      expect(src).toMatch(/aria-label=\{`Tester sans envoyer la règle CRM/);
    });

    it("aria-label sur bouton Supprimer", () => {
      expect(src).toMatch(/aria-label=\{`Supprimer la règle CRM/);
    });

    it("aria-label sur bouton Nouvelle règle + Exécuter maintenant", () => {
      expect(src).toMatch(
        /aria-label="Créer une nouvelle règle CRM via le wizard"/,
      );
      expect(src).toMatch(
        /aria-label="Exécuter immédiatement toutes les règles CRM actives"/,
      );
    });

    it("aria-label sur lien retour CRM", () => {
      expect(src).toMatch(/aria-label="Retour au CRM"/);
    });
  });

  describe("Empty state + loading + UX raffiné", () => {
    it("empty state si aucune règle (avec CTA modèle/wizard)", () => {
      expect(src).toMatch(/Aucune règle CRM configurée/);
      expect(src).toMatch(/Activez un modèle ci-dessus ou créez votre première règle/);
    });

    it("loading state avec Loader2", () => {
      expect(src).toMatch(/<Loader2/);
    });

    it("error handling avec toast pour fetchRules", () => {
      expect(src).toMatch(/console\.error\("\[CrmAutomationsPage\]/);
      expect(src).toMatch(/toast\(/);
    });
  });

  describe("Vocabulaire 'modèle' (post-refactor Pack→Modèle)", () => {
    it("utilise 'modèle' au lieu de 'pack'", () => {
      expect(src).toMatch(/modèle/i);
      // Exclure les références CRM_RULE_TEMPLATES qui contiennent "templates" (terme technique anglophone, OK)
      const userFacingText = src.replace(/[A-Z_]+_TEMPLATES/g, "").replace(/\.tsx?/g, "");
      expect(userFacingText).not.toMatch(/\bpack\b/i);
    });
  });
});
