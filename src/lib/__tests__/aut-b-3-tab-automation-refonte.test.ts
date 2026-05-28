import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TAB_AUTOMATION_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/formations/[id]/_components/TabAutomation.tsx",
);

const src = readFileSync(TAB_AUTOMATION_PATH, "utf-8");

describe("aut-b-3 — Refonte TabAutomation (vue Règles + dry-run + lien profond)", () => {
  describe("Suppression de l'ancien bouton 'Exécuter' trompeur", () => {
    it("handleRunRule supprimé du code exécutable (envoyait vraiment des emails)", () => {
      // Exclure les commentaires qui peuvent référencer l'ancien handler
      const executableLines = src
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      expect(executableLines).not.toMatch(/handleRunRule/);
    });

    it("plus d'appel à trigger-event en mode execute depuis TabAutomation", () => {
      expect(src).not.toMatch(
        /\/api\/formations\/automation-rules\/trigger-event/,
      );
    });

    it("plus de string 'Exécuter' sur le bouton de test", () => {
      // Match `>Exécuter<` ou similaire (bouton text). Le mot 'Exécuter' peut
      // exister ailleurs dans des labels neutres (ex: 'Exécutée') donc on cible
      // précisément la balise bouton-text de l'ancien render.
      expect(src).not.toMatch(/>\s*Exécuter\s*</);
    });

    it("plus d'usage de l'icône Play (remplacée par FlaskConical)", () => {
      expect(src).not.toMatch(/\bPlay\b/);
    });
  });

  describe("Bouton 'Tester sans envoyer' (UX-DR-AUT-2 — libellé exact)", () => {
    it("imports FlaskConical depuis lucide-react", () => {
      expect(src).toMatch(/FlaskConical/);
    });

    it("bouton avec libellé EXACT 'Tester sans envoyer'", () => {
      expect(src).toMatch(/Tester sans envoyer/);
    });

    it("handler handleTest existe et reçoit la rule", () => {
      expect(src).toMatch(/const handleTest = \(rule: AutoRule\)/);
    });

    it("bouton 'Tester sans envoyer' a aria-label et title (a11y NFR-AUT-A11Y)", () => {
      expect(src).toMatch(
        /aria-label=\{`Tester sans envoyer la règle \$\{rule\.name/,
      );
      expect(src).toMatch(/title="Tester sans envoyer/);
    });
  });

  describe("Intégration DryRunDialog (b-1)", () => {
    it("importe DryRunDialog depuis @/components/automation/DryRunDialog", () => {
      expect(src).toMatch(
        /import \{ DryRunDialog \} from "@\/components\/automation\/DryRunDialog"/,
      );
    });

    it("state dryRunTarget géré côté composant", () => {
      expect(src).toMatch(
        /const \[dryRunTarget, setDryRunTarget\] = useState/,
      );
    });

    it("handleTest setDryRunTarget avec ruleId + ruleName", () => {
      expect(src).toMatch(/setDryRunTarget\(\{[\s\S]+?ruleId: rule\.id/);
      expect(src).toMatch(/ruleName:/);
    });

    it("rend <DryRunDialog> avec domain='formation' + sessionId du contexte", () => {
      expect(src).toMatch(/<DryRunDialog/);
      expect(src).toMatch(/domain="formation"/);
      expect(src).toMatch(/sessionId=\{formation\.id\}/);
    });
  });

  describe("Lien profond bidirectionnel vers /admin/automation (UX-DR-AUT-13)", () => {
    it("plus de référence à /admin/trainings/automation (legacy)", () => {
      expect(src).not.toMatch(/\/admin\/trainings\/automation/);
    });

    it("liens pointent vers /admin/automation?tab=rules", () => {
      const matches = src.match(/\/admin\/automation\?tab=rules/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(2); // 1 dans header + 1 dans empty state
    });

    it("bouton 'Configurer les règles globales' (libellé clarifié)", () => {
      expect(src).toMatch(/Configurer les règles globales/);
    });
  });

  describe("Switch toggle override avec aria-label (a11y NFR-AUT-A11Y)", () => {
    it("Switch a un aria-label dynamique selon l'état", () => {
      expect(src).toMatch(
        /aria-label=\{`\$\{enabled \? "Désactiver" : "Réactiver"\} pour cette session/,
      );
    });
  });

  describe("Conservation de l'existant (FR-AUT-50 : AutomationTimeline inchangé)", () => {
    it("AutomationTimeline toujours importée et rendue", () => {
      expect(src).toMatch(/import \{ AutomationTimeline \}/);
      expect(src).toMatch(/<AutomationTimeline sessionId=\{formation\.id\}/);
    });

    it("2 sub-tabs préservés (Timeline + Règles)", () => {
      expect(src).toMatch(/<TabsTrigger value="timeline"/);
      expect(src).toMatch(/<TabsTrigger value="rules"/);
    });

    it("handleToggle override par-session conservé (sémantique D5 différée Lot E)", () => {
      expect(src).toMatch(/const handleToggle = async \(ruleId: string, enabled: boolean\)/);
      expect(src).toMatch(/session_automation_overrides/);
    });

    it("Section Historique expandable conservée", () => {
      expect(src).toMatch(/setShowLogs/);
      expect(src).toMatch(/Historique \(\{logs\.length\}\)/);
    });
  });

  describe("Pas de boutons d'actions manuelles en masse (B3 / UX-DR-AUT-6 toujours respecté)", () => {
    it("pas de string 'Envoyer toutes les convocations/conventions/certificats'", () => {
      expect(src).not.toMatch(/Envoyer toutes les convocations/i);
      expect(src).not.toMatch(/Envoyer toutes les conventions/i);
      expect(src).not.toMatch(/Envoyer tous les certificats/i);
    });
  });
});
