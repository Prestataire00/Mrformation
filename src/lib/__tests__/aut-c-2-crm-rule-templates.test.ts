import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CRM_RULE_TEMPLATES,
  type CrmRuleTemplate,
} from "@/lib/crm/rule-templates";
import {
  crmRulePayloadSchema,
  crmActionConfigSchema,
} from "@/lib/schemas/automation";

const COMPONENT_PATH = resolve(
  process.cwd(),
  "src/components/automation/CrmRuleTemplates.tsx",
);

const componentSrc = readFileSync(COMPONENT_PATH, "utf-8");

describe("aut-c-2 — CrmRuleTemplates (4 modèles + 12 règles préétablies)", () => {
  describe("Définitions src/lib/crm/rule-templates.ts", () => {
    it("exporte CRM_RULE_TEMPLATES avec 4 modèles", () => {
      expect(CRM_RULE_TEMPLATES).toHaveLength(4);
    });

    it("4 modèles avec ids attendus (acquisition / relances / qualifies / reporting)", () => {
      const ids = CRM_RULE_TEMPLATES.map((t) => t.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          "acquisition",
          "relances",
          "qualifies",
          "reporting",
        ]),
      );
    });

    it("Acquisition prospects contient 3 règles (FR-AUT-42)", () => {
      const acquisition = CRM_RULE_TEMPLATES.find((t) => t.id === "acquisition");
      expect(acquisition?.rules).toHaveLength(3);
    });

    it("Relances commerciales contient 4 règles", () => {
      const relances = CRM_RULE_TEMPLATES.find((t) => t.id === "relances");
      expect(relances?.rules).toHaveLength(4);
    });

    it("Suivi qualifiés contient 3 règles", () => {
      const qualifies = CRM_RULE_TEMPLATES.find((t) => t.id === "qualifies");
      expect(qualifies?.rules).toHaveLength(3);
    });

    it("Reporting contient 2 règles", () => {
      const reporting = CRM_RULE_TEMPLATES.find((t) => t.id === "reporting");
      expect(reporting?.rules).toHaveLength(2);
    });

    it("12 règles au total (3+4+3+2 = 12)", () => {
      const total = CRM_RULE_TEMPLATES.reduce(
        (sum, t) => sum + t.rules.length,
        0,
      );
      expect(total).toBe(12);
    });

    it("4 couleurs distinctes (UX-DR-AUT-12)", () => {
      const colors = new Set(CRM_RULE_TEMPLATES.map((t) => t.color));
      expect(colors.size).toBe(4);
      expect(colors).toContain("emerald");
      expect(colors).toContain("orange");
      expect(colors).toContain("green");
      expect(colors).toContain("purple");
    });

    it("4 icônes distinctes (🎯 / 📞 / ✅ / 📊)", () => {
      const icons = CRM_RULE_TEMPLATES.map((t) => t.icon);
      expect(icons).toContain("🎯");
      expect(icons).toContain("📞");
      expect(icons).toContain("✅");
      expect(icons).toContain("📊");
    });

    it("chaque règle a tous les champs requis (name, description, trigger_type, action_type, config)", () => {
      CRM_RULE_TEMPLATES.forEach((template: CrmRuleTemplate) => {
        template.rules.forEach((rule) => {
          expect(rule.name).toBeTruthy();
          expect(rule.description).toBeTruthy();
          expect(rule.trigger_type).toBeTruthy();
          expect(rule.action_type).toBeTruthy();
          expect(rule.config).toBeTruthy();
        });
      });
    });

    it("chaque règle a un config valide selon le Zod discriminated union", () => {
      CRM_RULE_TEMPLATES.forEach((template) => {
        template.rules.forEach((rule) => {
          const parsed = crmActionConfigSchema.safeParse(rule.config);
          expect(parsed.success, `Config invalide pour ${rule.name}`).toBe(true);
        });
      });
    });

    it("chaque règle complète (payload entier) passe crmRulePayloadSchema", () => {
      CRM_RULE_TEMPLATES.forEach((template) => {
        template.rules.forEach((rule) => {
          const parsed = crmRulePayloadSchema.safeParse({
            name: rule.name,
            description: rule.description,
            trigger_type: rule.trigger_type,
            action_type: rule.action_type,
            is_enabled: true,
            config: rule.config,
          });
          expect(parsed.success, `Payload invalide pour ${rule.name}`).toBe(true);
        });
      });
    });

    it("chaque config inclut version: 1 (ID-AUT-6)", () => {
      CRM_RULE_TEMPLATES.forEach((template) => {
        template.rules.forEach((rule) => {
          expect((rule.config as { version: number }).version).toBe(1);
        });
      });
    });

    it("noms de règles uniques au sein de chaque modèle", () => {
      CRM_RULE_TEMPLATES.forEach((template) => {
        const names = template.rules.map((r) => r.name);
        expect(new Set(names).size).toBe(names.length);
      });
    });
  });

  describe("Composant <CrmRuleTemplates>", () => {
    it("est un Client Component avec export CrmRuleTemplates", () => {
      expect(componentSrc).toMatch(/^"use client";/);
      expect(componentSrc).toMatch(/export function CrmRuleTemplates/);
    });

    it("importe les 4 modèles depuis @/lib/crm/rule-templates", () => {
      expect(componentSrc).toMatch(
        /import \{[\s\S]+?CRM_RULE_TEMPLATES[\s\S]+?\} from "@\/lib\/crm\/rule-templates"/,
      );
    });

    it("accepte props onActivated + existingRuleNames", () => {
      expect(componentSrc).toMatch(/onActivated: \(\) => void/);
      expect(componentSrc).toMatch(/existingRuleNames: string\[\]/);
    });

    it("rend 4 cards via CRM_RULE_TEMPLATES.map", () => {
      expect(componentSrc).toMatch(/CRM_RULE_TEMPLATES\.map\(\(template\)/);
    });

    it("ouvre un modal d'aperçu au click sur card (openTemplate)", () => {
      expect(componentSrc).toMatch(/openTemplate = \(template: CrmRuleTemplate\)/);
      expect(componentSrc).toMatch(/setSelectedTemplate\(template\)/);
    });

    it("FR-AUT-72 : pré-décoche les règles dont le nom existe déjà (case-insensitive)", () => {
      expect(componentSrc).toMatch(
        /existingRuleNames\.some\([\s\S]{0,200}?n\.toLowerCase\(\) === r\.name\.toLowerCase\(\)/,
      );
    });

    it("toggle individuel des règles (toggleRule)", () => {
      expect(componentSrc).toMatch(/toggleRule = \(idx: number\)/);
    });

    it("POST /api/crm/automations pour chaque règle cochée", () => {
      expect(componentSrc).toMatch(/fetch\("\/api\/crm\/automations"/);
      expect(componentSrc).toMatch(
        /for \(const rule of rulesToCreate\)/,
      );
    });

    it("FR-AUT-73 : toast partiel si certaines règles ont échoué", () => {
      expect(componentSrc).toMatch(/\$\{created\}\/\$\{rulesToCreate\.length\} règles créées/);
      expect(componentSrc).toMatch(/failures\.join/);
    });

    it("toast succès complet si toutes les règles créées", () => {
      expect(componentSrc).toMatch(/règle.* CRM activée/);
    });

    it("bouton Activer désactivé si checkedRules.size === 0", () => {
      expect(componentSrc).toMatch(
        /disabled=\{activating \|\| checkedRules\.size === 0\}/,
      );
    });

    it("aria-label sur cards de modèles (a11y)", () => {
      expect(componentSrc).toMatch(
        /aria-label=\{`Ouvrir le modèle \$\{template\.name\}/,
      );
    });

    it("role='button' + tabIndex pour cards cliquables", () => {
      expect(componentSrc).toMatch(/role="button"/);
      expect(componentSrc).toMatch(/tabIndex=\{0\}/);
    });

    it("onKeyDown gère Enter + Space (a11y keyboard)", () => {
      expect(componentSrc).toMatch(/onKeyDown=/);
      expect(componentSrc).toMatch(/e\.key === "Enter" \|\| e\.key === " "/);
    });

    it("checkbox a id + aria-describedby liés à description (a11y)", () => {
      expect(componentSrc).toMatch(/id=\{`crm-template-rule-\$\{i\}`\}/);
      expect(componentSrc).toMatch(/aria-describedby=/);
    });

    it("vocabulaire 'modèle' partout (post-refactor Pack→Modèle)", () => {
      expect(componentSrc).toMatch(/modèle/);
      expect(componentSrc).not.toMatch(/\bpack\b/i);
    });
  });
});
