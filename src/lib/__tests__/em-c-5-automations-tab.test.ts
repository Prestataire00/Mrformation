import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMP_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/emails/_components/AutomationsTab.tsx",
);
const PAGE_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/emails/page.tsx",
);

const compSource = readFileSync(COMP_PATH, "utf-8");
const pageSource = readFileSync(PAGE_PATH, "utf-8");

describe("em-c-5 — AutomationsTab avec 3 sous-tabs", () => {
  it("3 sous-tabs : reminders / formation / crm", () => {
    expect(compSource).toMatch(/<TabsTrigger value="reminders"/);
    expect(compSource).toMatch(/<TabsTrigger value="formation"/);
    expect(compSource).toMatch(/<TabsTrigger value="crm"/);
  });

  it("sub-tab 'reminders' contient le RelancesTab existant (compat)", () => {
    expect(compSource).toMatch(
      /<TabsContent value="reminders">[\s\S]{0,200}?<RelancesTab \/>/,
    );
  });

  it("fetch formation_automation_rules avec template join + scope entity_id", () => {
    expect(compSource).toMatch(
      /\.from\("formation_automation_rules"\)[\s\S]{0,200}?template:email_templates\(name\)/,
    );
    expect(compSource).toMatch(/\.eq\("entity_id", entity\.id\)/);
  });

  it("fetch crm_automation_rules scoped entity_id (RLS post em-a-4)", () => {
    expect(compSource).toMatch(
      /\.from\("crm_automation_rules"\)[\s\S]{0,200}?\.eq\("entity_id", entity\.id\)/,
    );
  });

  it("fetch lazy : seulement quand le sub-tab devient actif (useEffect deps)", () => {
    expect(compSource).toMatch(
      /useEffect\([\s\S]{0,200}?activeSubTab === "formation"[\s\S]{0,80}?activeSubTab === "crm"/,
    );
  });

  it("Empty states explicites pour formation et CRM (UX-DR11)", () => {
    // Source utilise &apos; HTML entity (JSX), pas apostrophe directe
    expect(compSource).toMatch(/Aucune règle d&apos;automation formation configurée/);
    expect(compSource).toMatch(/Aucune automation CRM configurée/);
  });

  it("Loading skeleton pendant fetch", () => {
    expect(compSource).toMatch(/animate-pulse/);
  });

  it("Badges Actif/Désactivé selon is_enabled (couleurs sémantiques)", () => {
    expect(compSource).toMatch(/is_enabled \? "Actif" : "Désactivé"/);
    expect(compSource).toMatch(/bg-emerald-100/);
  });

  it("Lien profond vers /admin/crm/automations pour édition CRM", () => {
    expect(compSource).toMatch(/href="\/admin\/crm\/automations"/);
    expect(compSource).toMatch(/Éditer dans/);
  });

  it("page.tsx wire AutomationsTab et retire l'import RelancesTab direct", () => {
    expect(pageSource).toMatch(/import \{ AutomationsTab \} from "\.\/_components\/AutomationsTab"/);
    expect(pageSource).toMatch(/<AutomationsTab \/>/);
    // RelancesTab n'est plus importé directement dans page.tsx
    // (il est utilisé seulement à l'intérieur de AutomationsTab)
    expect(pageSource).not.toMatch(/import \{ RelancesTab \}/);
  });

  it("page.tsx : ancien <RelancesTab /> direct dans TabsContent automations retiré", () => {
    // Le RelancesTab ne doit plus être référencé directement dans page.tsx
    expect(pageSource).not.toMatch(/<RelancesTab/);
  });
});
