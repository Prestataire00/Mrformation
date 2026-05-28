import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HANDLER_PATH = resolve(
  process.cwd(),
  "src/lib/services/batch-email-handler.ts",
);

const handlerSource = readFileSync(HANDLER_PATH, "utf-8");

describe("em-b-5 / em-b-6 — batch-email-handler sur resolver unifié", () => {
  it("importe resolveEmailTemplate", () => {
    expect(handlerSource).toMatch(
      /import \{ resolveEmailTemplate \} from "@\/lib\/services\/email-template-resolver"/,
    );
  });

  it("post-cleanup em-b-6 : aucun flag USE_TEMPLATE_RESOLVER_BATCH", () => {
    expect(handlerSource).not.toMatch(/USE_TEMPLATE_RESOLVER_BATCH/);
    expect(handlerSource).not.toMatch(/const USE_RESOLVER_BATCH/);
  });

  it("resolver appelé directement (sans gate flag) 1× avant tasks.map", () => {
    expect(handlerSource).toMatch(
      /resolveEmailTemplate\(\s*supabase,\s*`batch_\$\{docType\}`,\s*entityId/,
    );
    const lookupIdx = handlerSource.indexOf("resolveEmailTemplate(supabase, `batch_");
    const mapIdx = handlerSource.indexOf("recipientRows.map");
    expect(lookupIdx).toBeGreaterThan(0);
    expect(mapIdx).toBeGreaterThan(lookupIdx);
  });

  it("fail-soft sur null : console.warn + fallback hardcoded conservé", () => {
    expect(handlerSource).toMatch(/if \(resolvedBatch\)/);
    expect(handlerSource).toMatch(/console\.warn[\s\S]{0,200}batch-email[\s\S]{0,200}fallback hardcoded/);
  });

  it("applyBatchVars factorisé sur 5 variables", () => {
    expect(handlerSource).toMatch(/const applyBatchVars = \(s: string\) =>/);
    expect(handlerSource).toMatch(/\{\{formation\}\}/);
    expect(handlerSource).toMatch(/\{\{entite\}\}/);
    expect(handlerSource).toMatch(/\{\{prenom_apprenant\}\}/);
    expect(handlerSource).toMatch(/\{\{prenom_formateur\}\}/);
    expect(handlerSource).toMatch(/\{\{nom_apprenant\}\}/);
  });

  it("finalSubject : applyBatchVars(resolvedSubjectTpl) ou legacy label hardcoded", () => {
    expect(handlerSource).toMatch(/const finalSubject = resolvedSubjectTpl/);
    expect(handlerSource).toMatch(/applyBatchVars\(resolvedSubjectTpl\)/);
    expect(handlerSource).toMatch(/`\$\{subjectLabel\} — \$\{sessionTitle\}`/);
  });

  it("finalTextBody : applyBatchVars ou buildEmailTextBody legacy", () => {
    expect(handlerSource).toMatch(/const finalTextBody = resolvedBodyTpl/);
    expect(handlerSource).toMatch(/applyBatchVars\(resolvedBodyTpl\)/);
    expect(handlerSource).toMatch(/buildEmailTextBody\(docType, sessionTitle, recipient\.name\)/);
  });

  it("finalHtmlBody : wrap HTML dynamique ou buildEmailHtmlBody", () => {
    expect(handlerSource).toMatch(/const finalHtmlBody = resolvedBodyTpl/);
    expect(handlerSource).toMatch(/font-family:sans-serif/);
    expect(handlerSource).toMatch(/white-space:pre-wrap/);
  });

  it("EMAIL_SUBJECT_LABELS + FILENAME_LABELS + buildEmail* préservés (utilisés en fail-soft)", () => {
    expect(handlerSource).toMatch(/const EMAIL_SUBJECT_LABELS: Record<string, string> = \{/);
    expect(handlerSource).toMatch(/const FILENAME_LABELS: Record<string, string> = \{/);
    expect(handlerSource).toMatch(/function buildEmailHtmlBody\(/);
    expect(handlerSource).toMatch(/function buildEmailTextBody\(/);
  });

  it("documente em-b-6 cleanup", () => {
    expect(handlerSource).toMatch(/em-b-6/);
  });
});
