import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(process.cwd(), "docs/emails.md");

describe("em-f-3 — Doc opérationnelle docs/emails.md", () => {
  it("docs/emails.md existe", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const docSource = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf-8") : "";

  it("contient les 11 sections principales", () => {
    const requiredSections = [
      "## 1. Architecture en 1 schéma",
      "## 2. Liste des `key` \"système\" seedés",
      "## 3. Format `trigger_config` JSONB",
      "## 4. Comment ajouter un nouveau pipeline email",
      "## 5. Liste des `logEvent()` structurés",
      "## 6. RLS (Row Level Security)",
      "## 7. Runbook ops",
      "## 8. Variables d'env Netlify",
      "## 9. Tests Vitest",
      "## 10. Hors scope V1",
      "## 11. Liens vers les artefacts BMAD",
    ];
    for (const section of requiredSections) {
      expect(docSource).toContain(section);
    }
  });

  it("liste les ~22 REQUIRED_KEYS seedés avec leur pipeline", () => {
    const requiredKeys = [
      "reminder_invoice_first",
      "reminder_invoice_second",
      "reminder_invoice_final",
      "reminder_quote_first",
      "reminder_quote_second",
      "reminder_quote_final",
      "quote_sign_request",
      "opco_deposit",
      "batch_convocation",
      "batch_attestation_assiduite",
    ];
    for (const key of requiredKeys) {
      expect(docSource).toContain(`\`${key}\``);
    }
  });

  it("documente les 12+ events logEvent() structurés", () => {
    const events = [
      "email_template_resolved",
      "email_template_missing",
      "email_template_seed_incomplete",
      "email_template_edit_completed",
      "email_template_archived",
      "email_template_restored",
      "email_template_deleted_permanent",
      "email_template_concurrent_edit_conflict",
      "email_template_duplicated_cross_entity",
      "email_template_duplicate_forbidden",
    ];
    for (const event of events) {
      expect(docSource).toContain(`\`${event}\``);
    }
  });

  it("documente le tag rollback seed_version='2026-05-28-v1'", () => {
    expect(docSource).toContain("2026-05-28-v1");
    expect(docSource).toMatch(/DELETE FROM email_templates[\s\S]+?seed_version[\s\S]+?2026-05-28-v1/);
  });

  it("documente le runbook pour 3 cas opérationnels (seed missing / template missing / rollback)", () => {
    expect(docSource).toMatch(/Détecter un seed incomplet/i);
    expect(docSource).toMatch(/Investiguer un `email_template_missing`/);
    expect(docSource).toMatch(/Rollback complet/i);
  });

  it("documente les 5 variables d'env Netlify supprimées en em-b-6", () => {
    const envVars = [
      "USE_TEMPLATE_RESOLVER_INVOICES",
      "USE_TEMPLATE_RESOLVER_QUOTES",
      "USE_TEMPLATE_RESOLVER_SIGN_REQUEST",
      "USE_TEMPLATE_RESOLVER_OPCO",
      "USE_TEMPLATE_RESOLVER_BATCH",
    ];
    for (const v of envVars) {
      expect(docSource).toContain(v);
    }
  });

  it("documente RLS post-fix em-a-4 (crm_automation_rules entity-scoped)", () => {
    expect(docSource).toMatch(/crm_automation_rules[\s\S]{0,200}?em-a-4 fix P0/);
    expect(docSource).toMatch(/user_entity_id\(\)/);
  });

  it("liens vers tous les artefacts BMAD planning", () => {
    const refs = [
      "cadrage-module-emails.md",
      "ux-design-module-emails.md",
      "prd-emails.md",
      "architecture-module-emails.md",
      "epics-emails.md",
      "implementation-readiness-report-emails-2026-05-28.md",
      "sprint-status-emails.yaml",
    ];
    for (const ref of refs) {
      expect(docSource).toContain(ref);
    }
  });

  it("documente les éléments hors scope V1 (em-c-3c, em-f-4 Playwright, Lot E)", () => {
    expect(docSource).toMatch(/em-c-3c[\s\S]{0,300}?Dialog Édition 3-colonnes/);
    expect(docSource).toMatch(/em-f-4[\s\S]{0,200}?Playwright/);
    expect(docSource).toMatch(/Lot E[\s\S]{0,200}?CRM campaigns/);
  });
});
