import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/emails/page.tsx",
);

const pageSource = readFileSync(PAGE_PATH, "utf-8");

describe("em-c-2 — Wiring EmailsTabsNav + QuickActions dans page.tsx", () => {
  describe("Imports", () => {
    it("importe EmailsTabsNav depuis _components", () => {
      expect(pageSource).toMatch(
        /import \{ EmailsTabsNav \} from "\.\/_components\/EmailsTabsNav"/,
      );
    });

    it("importe QuickActions depuis _components", () => {
      expect(pageSource).toMatch(
        /import \{ QuickActions \} from "\.\/_components\/QuickActions"/,
      );
    });

    it("importe ArchivedTab (placeholder em-c-4)", () => {
      expect(pageSource).toMatch(
        /import \{ ArchivedTab \} from "\.\/_components\/ArchivedTab"/,
      );
    });

    it("import shadcn Tabs réduit (TabsList et TabsTrigger retirés)", () => {
      expect(pageSource).toMatch(
        /import \{ Tabs, TabsContent \} from "@\/components\/ui\/tabs"/,
      );
      // Exclure les commentaires explicatifs qui peuvent mentionner historiquement TabsList
      const codeOnly = pageSource
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      expect(codeOnly).not.toMatch(/<TabsList|<TabsTrigger/);
    });
  });

  describe("State machine activeTab", () => {
    it("type activeTab étendu avec automations + archived (renommage relances)", () => {
      expect(pageSource).toMatch(
        /useState<"templates" \| "history" \| "automations" \| "archived">/,
      );
    });

    it("aucune référence textuelle à 'relances' restante (renommé)", () => {
      // Renommé en "automations" — la valeur de tab
      expect(pageSource).not.toMatch(/value="relances"/);
      expect(pageSource).not.toMatch(/setActiveTab\("relances"\)/);
    });
  });

  describe("JSX rendering", () => {
    it("3 quick action cards remplacées par <QuickActions onCreateTemplate onSendOneShot />", () => {
      expect(pageSource).toMatch(/<QuickActions[\s\S]+?onCreateTemplate=/);
      expect(pageSource).toMatch(/onSendOneShot=/);
    });

    it("Tabs/TabsList remplacée par <EmailsTabsNav activeTab onTabChange historyFailedCount />", () => {
      expect(pageSource).toMatch(
        /<EmailsTabsNav[\s\S]+?activeTab=\{activeTab\}[\s\S]+?onTabChange=/,
      );
      expect(pageSource).toMatch(/historyFailedCount=\{failedCount\}/);
    });

    it("TabsContent value='automations' présent (renommage)", () => {
      expect(pageSource).toMatch(/<TabsContent value="automations"/);
    });

    it("TabsContent value='archived' présent (placeholder em-c-4)", () => {
      expect(pageSource).toMatch(
        /<TabsContent value="archived"[\s\S]+?<ArchivedTab \/>/,
      );
    });

    it("ancien 'Voir l'historique des envois' button retiré (intégré dans EmailsTabsNav badge)", () => {
      expect(pageSource).not.toMatch(/Voir l&apos;historique des envois/);
    });
  });

  describe("UX-DR2 — UsageBadge orange (warning si template utilisé)", () => {
    it("badge utilise bg-orange-100 / text-orange-700 au lieu de emerald", () => {
      expect(pageSource).toMatch(/bg-orange-100 text-orange-700 border-orange-200/);
    });

    it("label badge explicite : 'Utilisé par N automation(s)' au lieu de cryptique '🤖 N/M auto'", () => {
      expect(pageSource).toMatch(/Utilisé par \$\{automationRules\.length\} automation/);
    });
  });
});
