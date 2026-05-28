import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/emails/page.tsx",
);

const pageSource = readFileSync(PAGE_PATH, "utf-8");

describe("em-c-3b — Wiring handleSaveTemplate sur Server Action saveTemplate", () => {
  it("importe saveTemplate Server Action depuis _actions", () => {
    expect(pageSource).toMatch(
      /import \{ saveTemplate \} from "\.\/_actions\/save-template"/,
    );
  });

  it("UPDATE path : appelle la Server Action saveTemplate (pas supabase direct)", () => {
    expect(pageSource).toMatch(
      /if \(editingTemplate\)\s*\{[\s\S]{0,500}?const result = await saveTemplate\(/,
    );
  });

  it("passe initialUpdatedAt depuis editingTemplate.updated_at (fallback created_at)", () => {
    expect(pageSource).toMatch(
      /const initialUpdatedAt =\s*\(editingTemplate as EmailTemplate\)\.updated_at \?\? editingTemplate\.created_at/,
    );
  });

  it("gère 5 cas de retour du Server Action (ok, concurrent_edit, validation_failed, unauthorized, not_found, fallback)", () => {
    // Each branch checked
    expect(pageSource).toMatch(/if \(result\.ok\)/);
    expect(pageSource).toMatch(/result\.error === "concurrent_edit"/);
    expect(pageSource).toMatch(/result\.error === "validation_failed"/);
    expect(pageSource).toMatch(/result\.error === "unauthorized"/);
    expect(pageSource).toMatch(/result\.error === "not_found"/);
  });

  it("toast 'Modification concurrente détectée' quand concurrent_edit", () => {
    expect(pageSource).toMatch(/Modification concurrente détectée/);
    expect(pageSource).toMatch(
      /Quelqu['']un a modifié ce template entre-temps/,
    );
  });

  it("INSERT path conservé inline (pas encore migré vers Server Action)", () => {
    // L'INSERT continue d'utiliser supabase.from("email_templates").insert
    expect(pageSource).toMatch(/supabase\.from\("email_templates"\)\.insert\(/);
  });

  it("UPDATE path NE PASSE PLUS par supabase.from('email_templates').update() direct", () => {
    // Vérifie qu'on n'a plus de .update(payload) sur email_templates dans handleSaveTemplate
    // (l'ancien code legacy supprimé)
    const handleSaveBlock = pageSource.substring(
      pageSource.indexOf("const handleSaveTemplate"),
      pageSource.indexOf("const handleSaveTemplate") + 3500,
    );
    expect(handleSaveBlock).not.toMatch(
      /supabase\.from\("email_templates"\)\.update/,
    );
  });

  it("documente em-c-3b avec note sur Server Action", () => {
    expect(pageSource).toMatch(/em-c-3b/);
    expect(pageSource).toMatch(/Server Action saveTemplate/);
  });
});
