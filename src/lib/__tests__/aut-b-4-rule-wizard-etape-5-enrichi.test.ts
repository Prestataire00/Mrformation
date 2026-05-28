import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RULE_WIZARD_PATH = resolve(
  process.cwd(),
  "src/components/automation/RuleWizard.tsx",
);

const src = readFileSync(RULE_WIZARD_PATH, "utf-8");

describe("aut-b-4 — RuleWizard étape 4 enrichie (description + activer + dry-run)", () => {
  describe("Imports + states (aut-b-4)", () => {
    it("importe DryRunDialog (b-1)", () => {
      expect(src).toMatch(
        /import \{ DryRunDialog \} from "@\/components\/automation\/DryRunDialog"/,
      );
    });

    it("state ruleDescription pour le champ multiline", () => {
      expect(src).toMatch(
        /const \[ruleDescription, setRuleDescription\] = useState/,
      );
    });

    it("state activateImmediately initialisé à true (par défaut activée)", () => {
      expect(src).toMatch(
        /const \[activateImmediately, setActivateImmediately\] = useState\(true\)/,
      );
    });

    it("state dryRunAfterCreate pour ouvrir DryRunDialog post-création", () => {
      expect(src).toMatch(
        /const \[dryRunAfterCreate, setDryRunAfterCreate\] = useState/,
      );
    });
  });

  describe("handleCreate enrichi (aut-b-4)", () => {
    it("accepte un paramètre openDryRunAfter: boolean (default false)", () => {
      expect(src).toMatch(
        /handleCreate = async \(openDryRunAfter: boolean = false\)/,
      );
    });

    it("payload inclut description + is_enabled selon activateImmediately", () => {
      expect(src).toMatch(/description: ruleDescription \|\| null/);
      expect(src).toMatch(/is_enabled: activateImmediately/);
    });

    it("toast s'adapte selon activateImmediately (créée+activée vs créée désactivée)", () => {
      expect(src).toMatch(/Règle créée et activée/);
      expect(src).toMatch(/Règle créée \(désactivée\)/);
    });

    it("récupère createdRuleId pour permettre le dry-run après création", () => {
      expect(src).toMatch(/let createdRuleId/);
      expect(src).toMatch(/createdRuleId = .*\?.*\.id/);
    });

    it("ouvre DryRunDialog si openDryRunAfter=true ET createdRuleId disponible", () => {
      expect(src).toMatch(/if \(openDryRunAfter && createdRuleId\)/);
      expect(src).toMatch(/setDryRunAfterCreate\(\{[\s\S]*?ruleId: createdRuleId/);
    });
  });

  describe("Étape 4 UI enrichie (UX-DR-AUT-11)", () => {
    it("champ description multiline (textarea) avec id + label associé", () => {
      expect(src).toMatch(/<Label htmlFor="rule-description"/);
      expect(src).toMatch(/<textarea[\s\S]+?id="rule-description"/);
      expect(src).toMatch(/value=\{ruleDescription\}/);
      expect(src).toMatch(/rows=\{2\}/);
    });

    it("checkbox 'Activer immédiatement' avec id + label associé (a11y)", () => {
      expect(src).toMatch(/id="activate-immediately"/);
      expect(src).toMatch(/<Label\s+htmlFor="activate-immediately"/);
      expect(src).toMatch(/checked=\{activateImmediately\}/);
    });

    it("texte explicatif sur l'effet de la checkbox activate", () => {
      expect(src).toMatch(/évaluée au prochain run/);
      expect(src).toMatch(/sera créée désactivée/);
    });

    it("Label 'Nom de la règle' associé à l'Input via htmlFor (a11y)", () => {
      expect(src).toMatch(/<Label htmlFor="rule-name"/);
      expect(src).toMatch(/id="rule-name"/);
    });
  });

  describe("Footer : 2 boutons CTA (Créer + Créer puis tester)", () => {
    it("bouton 'Créer puis tester' à variant=outline (secondaire vs primary)", () => {
      // Match plus large : le bouton a beaucoup de props (className, aria-label, etc.)
      expect(src).toMatch(
        /<Button[\s\S]{0,100}?variant="outline"[\s\S]{0,500}?Créer puis tester/,
      );
    });

    it("bouton 'Créer puis tester' appelle handleCreate(true)", () => {
      expect(src).toMatch(/onClick=\{\(\) => handleCreate\(true\)\}/);
    });

    it("bouton 'Créer la règle' appelle handleCreate(false)", () => {
      expect(src).toMatch(/onClick=\{\(\) => handleCreate\(false\)\}/);
    });

    it("bouton 'Créer puis tester' a aria-label explicite (a11y)", () => {
      expect(src).toMatch(
        /aria-label="Créer la règle puis la tester sans envoyer"/,
      );
    });
  });

  describe("DryRunDialog après création", () => {
    it("rendu conditionnel sur dryRunAfterCreate", () => {
      expect(src).toMatch(/\{dryRunAfterCreate && \(/);
      expect(src).toMatch(/<DryRunDialog/);
    });

    it("DryRunDialog avec domain='formation' (RuleWizard est formations-scoped)", () => {
      expect(src).toMatch(
        /<DryRunDialog[\s\S]{0,500}?domain="formation"/,
      );
    });

    it("onClose : reset dryRunAfterCreate ET ferme le wizard (resetAndClose)", () => {
      expect(src).toMatch(/setDryRunAfterCreate\(null\)/);
      expect(src).toMatch(
        /onClose=\{\(\) => \{[\s\S]+?setDryRunAfterCreate\(null\);[\s\S]+?resetAndClose\(\);/,
      );
    });
  });

  describe("resetAndClose réinitialise les nouveaux states (zero leak)", () => {
    it("reset ruleDescription + activateImmediately + dryRunAfterCreate", () => {
      expect(src).toMatch(/setRuleDescription\(""\)/);
      expect(src).toMatch(/setActivateImmediately\(true\)/);
      expect(src).toMatch(/setDryRunAfterCreate\(null\)/);
    });
  });
});
