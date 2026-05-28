import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HANDLER_PATH = resolve(
  process.cwd(),
  "src/lib/services/batch-email-handler.ts",
);

const handlerSource = readFileSync(HANDLER_PATH, "utf-8");

describe("em-b-5 — Refactor batch-email-handler vers resolver", () => {
  it("importe resolveEmailTemplate", () => {
    expect(handlerSource).toMatch(
      /import \{ resolveEmailTemplate \} from "@\/lib\/services\/email-template-resolver"/,
    );
  });

  it("lit le feature flag USE_TEMPLATE_RESOLVER_BATCH", () => {
    expect(handlerSource).toMatch(
      /const USE_RESOLVER_BATCH = process\.env\.USE_TEMPLATE_RESOLVER_BATCH === "true"/,
    );
  });

  it("path resolver : appelle resolveEmailTemplate(supabase, `batch_${docType}`, entityId) UNE FOIS avant tasks.map", () => {
    expect(handlerSource).toMatch(
      /if \(USE_RESOLVER_BATCH\)\s*\{\s*const resolved = await resolveEmailTemplate\(\s*supabase,\s*`batch_\$\{docType\}`,\s*entityId/,
    );
    // Le lookup doit être AVANT le tasks.map
    const lookupIdx = handlerSource.indexOf("resolveEmailTemplate(supabase, `batch_");
    const mapIdx = handlerSource.indexOf("recipientRows.map");
    expect(lookupIdx).toBeGreaterThan(0);
    expect(mapIdx).toBeGreaterThan(lookupIdx);
  });

  it("path resolver : fail-soft sur null avec console.warn + fallback EMAIL_SUBJECT_LABELS", () => {
    expect(handlerSource).toMatch(/if \(resolved\)/);
    expect(handlerSource).toMatch(/console\.warn\([\s\S]{0,100}batch-email[\s\S]{0,200}fallback hardcoded/);
  });

  it("applyBatchVars factorisé sur 5 variables", () => {
    expect(handlerSource).toMatch(/const applyBatchVars = \(s: string\) =>/);
    expect(handlerSource).toMatch(/\{\{formation\}\}/);
    expect(handlerSource).toMatch(/\{\{entite\}\}/);
    expect(handlerSource).toMatch(/\{\{prenom_apprenant\}\}/);
    expect(handlerSource).toMatch(/\{\{prenom_formateur\}\}/);
    expect(handlerSource).toMatch(/\{\{nom_apprenant\}\}/);
  });

  it("finalSubject : applyBatchVars(resolvedSubjectTpl) ou legacy `${subjectLabel} — ${sessionTitle}`", () => {
    expect(handlerSource).toMatch(/const finalSubject = resolvedSubjectTpl/);
    expect(handlerSource).toMatch(/applyBatchVars\(resolvedSubjectTpl\)/);
    expect(handlerSource).toMatch(/`\$\{subjectLabel\} — \$\{sessionTitle\}`/);
  });

  it("finalTextBody : applyBatchVars(resolvedBodyTpl) ou buildEmailTextBody legacy", () => {
    expect(handlerSource).toMatch(/const finalTextBody = resolvedBodyTpl/);
    expect(handlerSource).toMatch(/applyBatchVars\(resolvedBodyTpl\)/);
    expect(handlerSource).toMatch(/buildEmailTextBody\(docType, sessionTitle, recipient\.name\)/);
  });

  it("finalHtmlBody : applyBatchVars + wrap HTML basique (whitespace-pre-wrap)", () => {
    expect(handlerSource).toMatch(/const finalHtmlBody = resolvedBodyTpl/);
    expect(handlerSource).toMatch(/font-family:sans-serif/);
    expect(handlerSource).toMatch(/white-space:pre-wrap/);
    expect(handlerSource).toMatch(/\.replace\(\/\\n\/g, "<br\/>"\)/);
  });

  it("EMAIL_SUBJECT_LABELS et FILENAME_LABELS conservés (cleanup em-b-6)", () => {
    expect(handlerSource).toMatch(/const EMAIL_SUBJECT_LABELS: Record<string, string> = \{/);
    expect(handlerSource).toMatch(/const FILENAME_LABELS: Record<string, string> = \{/);
  });

  it("buildEmailHtmlBody et buildEmailTextBody conservés (cleanup em-b-6)", () => {
    expect(handlerSource).toMatch(/function buildEmailHtmlBody\(/);
    expect(handlerSource).toMatch(/function buildEmailTextBody\(/);
  });

  it("documente em-b-5 + plan cleanup em-b-6", () => {
    expect(handlerSource).toMatch(/Story em-b-5/);
    expect(handlerSource).toMatch(/em-b-6/);
  });
});
