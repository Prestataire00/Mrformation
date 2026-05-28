import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  function walk(current: string) {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry)) {
        out.push(full);
      }
    }
  }
  walk(dir);
  return out;
}

// Story aut-a-4 — Cleanup du code mort + suppression actions stub B3
//
// Audit du 2026-05-28 : les routes/boutons listés par le deep-dive (2026-05-22)
// ont déjà été supprimés par des commits antérieurs (probablement durant les
// 24 PRs Epic A-D-F du module emails ou un nettoyage en parallèle).
//
// Cette suite de tests verrouille l'état du nettoyage pour empêcher toute
// régression future (réintroduction accidentelle de ces routes ou boutons).
//
// Résout :
// - B3 (deep-dive) : actions manuelles en masse stub trompeur
// - B8 (deep-dive) : automation-trigger sans entity_id check (mécaniquement
//   résolu par suppression de la route)
// - D1 (cadrage) : route /api/formations/automation-rules/run.ts code mort 273 LOC

const TAB_AUTOMATION_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/formations/[id]/_components/TabAutomation.tsx",
);

const DEAD_ROUTE_RUN = resolve(
  process.cwd(),
  "src/app/api/formations/automation-rules/run/route.ts",
);

const STUB_ROUTE_AUTOMATION_TRIGGER = resolve(
  process.cwd(),
  "src/app/api/formations/[id]/automation-trigger/route.ts",
);

describe("aut-a-4 — Code mort & stub supprimés (verrou anti-régression)", () => {
  it("la route /api/formations/automation-rules/run (273 LOC code mort, D1) est absente", () => {
    expect(existsSync(DEAD_ROUTE_RUN)).toBe(false);
  });

  it("la route /api/formations/[id]/automation-trigger (stub trompeur B3+B8) est absente", () => {
    expect(existsSync(STUB_ROUTE_AUTOMATION_TRIGGER)).toBe(false);
  });

  it("aucun caller de la route automation-trigger ne traîne dans src/ (hors tests)", () => {
    const tsFiles = listTsFiles(resolve(process.cwd(), "src")).filter(
      (f) => !f.includes("__tests__"),
    );
    const hits = tsFiles.filter((f) => {
      const content = readFileSync(f, "utf-8");
      return /\/api\/formations\/\[?id\]?\/automation-trigger/.test(content);
    });
    expect(hits).toEqual([]);
  });

  it("aucun caller de /api/formations/automation-rules/run (sans -cron) ne traîne (hors tests)", () => {
    const tsFiles = listTsFiles(resolve(process.cwd(), "src")).filter(
      (f) => !f.includes("__tests__"),
    );
    const hits = tsFiles.filter((f) => {
      const content = readFileSync(f, "utf-8");
      // Match /automation-rules/run" ou /automation-rules/run' mais PAS /automation-rules/run-cron
      return /\/api\/formations\/automation-rules\/run["']/.test(content);
    });
    expect(hits).toEqual([]);
  });
});

describe("aut-a-4 — TabAutomation : aucun bouton d'action manuelle en masse stub", () => {
  const tabSource = readFileSync(TAB_AUTOMATION_PATH, "utf-8");

  it("aucune string 'Envoyer toutes les convocations' (bouton supprimé)", () => {
    expect(tabSource).not.toMatch(/Envoyer toutes les convocations/i);
  });

  it("aucune string 'Envoyer toutes les conventions' (bouton supprimé)", () => {
    expect(tabSource).not.toMatch(/Envoyer toutes les conventions/i);
  });

  it("aucune string 'Envoyer tous les certificats' (bouton supprimé)", () => {
    expect(tabSource).not.toMatch(/Envoyer tous les certificats/i);
  });

  it("aucun handler bulk action stub (handleBulkAction / handleManualBulk)", () => {
    expect(tabSource).not.toMatch(/handleBulkAction/);
    expect(tabSource).not.toMatch(/handleManualBulk/);
  });

  it("aucun appel direct à automation-trigger depuis TabAutomation", () => {
    // Note : la route automation-trigger (par-session) n'existe plus.
    // La route automation-rules/trigger-event existe encore (utilisée par
    // handleRunRule pour le bouton Tester par règle — sera refactor en B.1
    // via DryRunDialog).
    expect(tabSource).not.toMatch(
      /\/api\/formations\/\$\{[^}]+\}\/automation-trigger/,
    );
    expect(tabSource).not.toMatch(/\/automation-trigger['"]/);
  });
});
