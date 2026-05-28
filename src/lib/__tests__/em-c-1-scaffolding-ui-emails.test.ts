import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = resolve(process.cwd(), "src/app/(dashboard)/admin/emails");

function read(rel: string): string {
  return readFileSync(resolve(BASE, rel), "utf-8");
}

function exists(rel: string): boolean {
  return existsSync(resolve(BASE, rel));
}

describe("em-c-1 — Scaffolding UI /admin/emails (non destructif)", () => {
  describe("Composants UI", () => {
    it("EmailsTabsNav.tsx existe avec 4 tabs et props state-local", () => {
      expect(exists("_components/EmailsTabsNav.tsx")).toBe(true);
      const src = read("_components/EmailsTabsNav.tsx");
      // Type EmailsTab exporté avec 4 valeurs
      expect(src).toMatch(/export type EmailsTab = "templates" \| "history" \| "automations" \| "archived"/);
      // 4 tabs avec labels Modèles / Historique / Automatisations / Archivés
      expect(src).toMatch(/key: "templates", label: "Modèles"/);
      expect(src).toMatch(/key: "history", label: "Historique"/);
      expect(src).toMatch(/key: "automations", label: "Automatisations"/);
      expect(src).toMatch(/key: "archived", label: "Archivés"/);
      // Props activeTab + onTabChange + badges
      expect(src).toMatch(/activeTab: EmailsTab/);
      expect(src).toMatch(/onTabChange: \(tab: EmailsTab\) => void/);
      expect(src).toMatch(/historyFailedCount\?: number/);
      expect(src).toMatch(/archivedCount\?: number/);
      // Sticky top-0 (cohérent avec DocumentsTabsNav)
      expect(src).toMatch(/sticky top-0 z-10/);
    });

    it("QuickActions.tsx existe avec 2 cards emerald-50 + props callbacks", () => {
      expect(exists("_components/QuickActions.tsx")).toBe(true);
      const src = read("_components/QuickActions.tsx");
      expect(src).toMatch(/onCreateTemplate: \(category: EmailTemplateCategory\) => void/);
      expect(src).toMatch(/onSendOneShot: \(\) => void/);
      // Style cohérent /admin/documents V2.2
      expect(src).toMatch(/border-emerald-200 bg-emerald-50/);
      // 2 boutons avec labels précis
      expect(src).toMatch(/Créer un modèle/);
      expect(src).toMatch(/Envoyer un mail maintenant/);
    });

    it("TemplateListView et HistoryTab scaffolds existent (return null en attendant em-c-X)", () => {
      // ArchivedTab → em-c-4, AutomationsTab → em-c-5 (désormais implémentés).
      const stubs = [
        "_components/TemplateListView.tsx",
        "_components/HistoryTab.tsx",
      ];
      for (const s of stubs) {
        expect(exists(s), `${s} doit exister`).toBe(true);
        const src = read(s);
        expect(src).toMatch(/Scaffold em-c-1/);
        expect(src).toMatch(/return null;/);
      }
    });

    it("AutomationsTab existe et est désormais implémenté (em-c-5, 3 sous-tabs)", () => {
      expect(exists("_components/AutomationsTab.tsx")).toBe(true);
      const src = read("_components/AutomationsTab.tsx");
      expect(src).toMatch(/Story em-c-5/);
      expect(src).toMatch(/TabsTrigger value="formation"/);
      expect(src).toMatch(/TabsTrigger value="crm"/);
    });

    it("ArchivedTab existe et est désormais implémenté (em-c-4)", () => {
      expect(exists("_components/ArchivedTab.tsx")).toBe(true);
      const src = read("_components/ArchivedTab.tsx");
      expect(src).toMatch(/Story em-c-4/);
      // Pas de return null — c'est désormais une vraie implémentation
      expect(src).toMatch(/restoreTemplate/);
      expect(src).toMatch(/deleteTemplatePermanent/);
    });
  });

  describe("Server Actions scaffolds", () => {
    it("saveTemplate.ts exporte le schema Zod + signature + Result type", () => {
      expect(exists("_actions/save-template.ts")).toBe(true);
      const src = read("_actions/save-template.ts");
      expect(src).toMatch(/"use server"/);
      expect(src).toMatch(/export const saveTemplateSchema = z\.object/);
      expect(src).toMatch(/initialUpdatedAt: z\.string/); // optimistic lock
      expect(src).toMatch(/category: z[\s\S]+?\.enum\(\["transactional", "automation", "reminder", "batch", "campaign", "custom"\]/);
      expect(src).toMatch(/export type SaveTemplateResult/);
      expect(src).toMatch(/concurrent_edit/);
      expect(src).toMatch(/export async function saveTemplate/);
    });

    it("archiveTemplate.ts schema + check usage_count documenté", () => {
      expect(exists("_actions/archive-template.ts")).toBe(true);
      const src = read("_actions/archive-template.ts");
      expect(src).toMatch(/archiveTemplateSchema/);
      expect(src).toMatch(/"in_use"/);
      expect(src).toMatch(/usageCount: number/);
    });

    it("restoreTemplate.ts schema minimal", () => {
      expect(exists("_actions/restore-template.ts")).toBe(true);
      const src = read("_actions/restore-template.ts");
      expect(src).toMatch(/restoreTemplateSchema/);
      expect(src).toMatch(/export async function restoreTemplate/);
    });

    it("deleteTemplatePermanent.ts requires confirmText='supprimer' + check references", () => {
      expect(exists("_actions/delete-template-permanent.ts")).toBe(true);
      const src = read("_actions/delete-template-permanent.ts");
      expect(src).toMatch(/confirmText: z\.literal\("supprimer"/);
      expect(src).toMatch(/"referenced_by_rules"/);
    });

    it("duplicateTemplateToEntity.ts pour super_admin (em-d-1)", () => {
      expect(exists("_actions/duplicate-to-entity.ts")).toBe(true);
      const src = read("_actions/duplicate-to-entity.ts");
      expect(src).toMatch(/duplicateTemplateToEntitySchema/);
      expect(src).toMatch(/targetEntityId: z\.string\(\)\.uuid/);
      expect(src).toMatch(/copyId: string/);
      expect(src).toMatch(/"forbidden"/); // super_admin check
    });
  });

  describe("Compat avec stories ultérieures", () => {
    // Note : le test "page.tsx PAS modifié" présent à em-c-1 a été retiré
    // en em-c-2 quand le wiring de EmailsTabsNav + QuickActions a été
    // intégré dans page.tsx (c'était justement le but de em-c-2).

    it("EmailPreviewDialog conservé (utilisé par TabConventionDocs, pas dead code en réalité)", () => {
      const previewExists = existsSync(
        resolve(process.cwd(), "src/components/emails/EmailPreviewDialog.tsx"),
      );
      expect(previewExists).toBe(true);
      const tabConventionDocs = readFileSync(
        resolve(
          process.cwd(),
          "src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx",
        ),
        "utf-8",
      );
      expect(tabConventionDocs).toMatch(/import \{ EmailPreviewDialog \}/);
    });
  });
});
