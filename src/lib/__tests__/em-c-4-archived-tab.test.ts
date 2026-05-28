import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMP_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/emails/_components/ArchivedTab.tsx",
);

const compSource = readFileSync(COMP_PATH, "utf-8");

describe("em-c-4 — Tab Archivés implémenté", () => {
  it("ArchivedTab fetch les templates is_active=false de l'entité", () => {
    expect(compSource).toMatch(/\.from\("email_templates"\)[\s\S]+?\.eq\("entity_id", entity\.id\)[\s\S]+?\.eq\("is_active", false\)/);
  });

  it("importe les Server Actions restoreTemplate + deleteTemplatePermanent", () => {
    expect(compSource).toMatch(/import \{ restoreTemplate \} from "\.\.\/_actions\/restore-template"/);
    expect(compSource).toMatch(/import \{ deleteTemplatePermanent \} from "\.\.\/_actions\/delete-template-permanent"/);
  });

  it("handleRestore appelle restoreTemplate({ id }) avec gestion key_already_active", () => {
    expect(compSource).toMatch(/restoreTemplate\(\{ id: t\.id \}\)/);
    expect(compSource).toMatch(/result\.error === "key_already_active"/);
    expect(compSource).toMatch(/conflictingKey/);
  });

  it("handleDeleteConfirm appelle deleteTemplatePermanent avec confirmText", () => {
    expect(compSource).toMatch(/deleteTemplatePermanent\(\s*\{[\s\S]+?confirmText: confirmText as "supprimer"/);
  });

  it("gère result.error referenced_by_rules avec affichage des références", () => {
    expect(compSource).toMatch(/result\.error === "referenced_by_rules"/);
    expect(compSource).toMatch(/references[\s\S]+?length/);
  });

  it("Empty state quand aucun template archivé", () => {
    expect(compSource).toMatch(/Aucun modèle archivé/);
    expect(compSource).toMatch(/Les modèles que tu archiveras apparaîtront ici/);
  });

  it("Skeleton loading pendant fetch", () => {
    expect(compSource).toMatch(/animate-pulse/);
  });

  it("Cards opacity-70 hover:opacity-100 (UX-DR9 visual subdued)", () => {
    expect(compSource).toMatch(/opacity-70[\s\S]{0,80}hover:opacity-100/);
  });

  it("2 boutons par card : Restaurer (outline) + Supprimer (ghost red)", () => {
    expect(compSource).toMatch(/Restaurer/);
    expect(compSource).toMatch(/onClick=\{\(\) => handleRestore\(t\)\}/);
    expect(compSource).toMatch(/Supprimer/);
    expect(compSource).toMatch(/text-red-600/);
  });

  it("Modal de confirmation forte avec input 'supprimer' required + bouton disabled si mismatch", () => {
    expect(compSource).toMatch(/Tape <strong>supprimer<\/strong>/);
    expect(compSource).toMatch(/placeholder="supprimer"/);
    expect(compSource).toMatch(/disabled=\{confirmText !== "supprimer" \|\| deleting\}/);
  });

  it("Cleanup state à la fermeture du modal (setDeleteTarget(null) + setConfirmText(''))", () => {
    expect(compSource).toMatch(/setDeleteTarget\(null\)[\s\S]{0,50}setConfirmText\(""\)/);
  });
});
