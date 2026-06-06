import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Story E2-S08 — TabFinances : orchestration state-driven (suppression des
// setTimeout 50ms entre dialogs / changement de type). FR-A-04 (Epic 2 —
// archétype A "Signaux de fin").
//
// Avant : 2 setTimeout(...50ms) orchestraient la séquence picker entreprise →
// pré-remplissage de la facture, et le changement de recipient_type → INTRA
// company pré-remplissage. Timing-dépendant, source de race conditions
// sous charge.
//
// Après : state machine simple (useState pendingCompanyPrefill + useEffect
// déclenché par la fermeture du picker) + appel direct pour le cas INTRA
// (l'override de type bypass la closure stale).
//
// Ce test verrouille le contrat : aucun setTimeout dans TabFinances.tsx.

const TAB_FINANCES_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx",
);

describe("E2-S08 — TabFinances : pas de setTimeout (orchestration state-driven)", () => {
  it("TabFinances.tsx ne contient aucun appel setTimeout(", () => {
    const source = readFileSync(TAB_FINANCES_PATH, "utf8");
    // On cherche uniquement les appels (avec parenthèse ouvrante), pas les
    // mentions en commentaire ou string.
    const matches = source.match(/setTimeout\s*\(/g) || [];
    expect(matches.length).toBe(0);
  });

  it("expose un state `pendingCompanyPrefill` (orchestration post-picker)", () => {
    const source = readFileSync(TAB_FINANCES_PATH, "utf8");
    // Présence du state qui pilote la séquence picker fermé → pré-remplissage.
    expect(source).toMatch(/setPendingCompanyPrefill/);
    expect(source).toMatch(/pendingCompanyPrefill/);
  });

  it("orchestre la séquence picker → pré-remplissage via useEffect", () => {
    const source = readFileSync(TAB_FINANCES_PATH, "utf8");
    // Approche simple : on cherche un useEffect dont les dépendances
    // contiennent à la fois companyPickerOpen et pendingCompanyPrefill.
    // Le tableau de deps de cet effet précis est compact et localisable.
    const depsPattern = /\[\s*companyPickerOpen\s*,\s*pendingCompanyPrefill\s*\]/;
    expect(source).toMatch(depsPattern);
    // Et la garde "if (!companyPickerOpen && pendingCompanyPrefill)" doit exister.
    expect(source).toMatch(/!companyPickerOpen\s*&&\s*pendingCompanyPrefill/);
  });

  it("handleCompanyPicked enregistre l'id pending avant de fermer le picker", () => {
    const source = readFileSync(TAB_FINANCES_PATH, "utf8");
    // Regex souple : on cherche la fonction et la présence des 2 appels dans
    // son corps (pas d'ordre strict, mais les 2 doivent être là).
    const fnMatch = source.match(/const handleCompanyPicked[^{]*\{([\s\S]*?)\n  \};/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![1];
    expect(body).toMatch(/setPendingCompanyPrefill\(/);
    expect(body).toMatch(/setCompanyPickerOpen\(false\)/);
    // Et surtout : pas de setTimeout dans cette fonction.
    expect(body).not.toMatch(/setTimeout/);
  });
});
