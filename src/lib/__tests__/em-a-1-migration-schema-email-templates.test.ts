import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/em_a_1_extend_email_templates_schema.sql",
);

const migrationSql = readFileSync(MIGRATION_PATH, "utf-8");

const executableLines = migrationSql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("em-a-1 — Migration schéma email_templates étendu", () => {
  const TEN_NEW_COLUMNS = [
    "key",
    "category",
    "is_active",
    "created_by",
    "updated_at",
    "updated_by",
    "sender_name",
    "sender_email",
    "recipient_type",
    "trigger_config",
  ];

  it("ajoute les 10 nouvelles colonnes lifecycle/audit/gouvernance", () => {
    for (const col of TEN_NEW_COLUMNS) {
      expect(executableLines).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`));
    }
  });

  it("typage correct sur les colonnes critiques", () => {
    expect(executableLines).toMatch(/ADD COLUMN IF NOT EXISTS key TEXT/);
    expect(executableLines).toMatch(/ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE/);
    expect(executableLines).toMatch(/ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles\(id\)/);
    expect(executableLines).toMatch(/ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW\(\)/);
    expect(executableLines).toMatch(/ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles\(id\)/);
    expect(executableLines).toMatch(/ADD COLUMN IF NOT EXISTS trigger_config JSONB DEFAULT '\{\}'/);
  });

  it("CHECK constraint catégorie idempotente (DROP IF EXISTS + ADD)", () => {
    expect(executableLines).toMatch(
      /DROP CONSTRAINT IF EXISTS email_templates_category_check/,
    );
    expect(executableLines).toMatch(
      /ADD CONSTRAINT email_templates_category_check[\s\S]+CHECK[\s\S]+category IS NULL OR category IN/,
    );
  });

  it("CHECK constraint contient les 6 catégories autorisées", () => {
    const categories = [
      "transactional",
      "automation",
      "reminder",
      "batch",
      "campaign",
      "custom",
    ];
    for (const cat of categories) {
      expect(executableLines).toMatch(new RegExp(`'${cat}'`));
    }
  });

  it("index UNIQUE partial pour le resolver (entity_id, key) WHERE active", () => {
    expect(executableLines).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS email_templates_entity_key_uniq[\s\S]+ON email_templates\(entity_id, key\)[\s\S]+WHERE key IS NOT NULL AND is_active = TRUE/,
    );
  });

  it("index secondaire pour le filtre UI catégorie", () => {
    expect(executableLines).toMatch(
      /CREATE INDEX IF NOT EXISTS email_templates_category_active[\s\S]+ON email_templates\(entity_id, category, is_active\)/,
    );
  });

  it("trigger updated_at automatique (fonction + trigger)", () => {
    expect(executableLines).toMatch(
      /CREATE OR REPLACE FUNCTION set_email_templates_updated_at\(\)/,
    );
    expect(executableLines).toMatch(/NEW\.updated_at = NOW\(\)/);
    expect(executableLines).toMatch(
      /DROP TRIGGER IF EXISTS email_templates_set_updated_at ON email_templates/,
    );
    expect(executableLines).toMatch(
      /CREATE TRIGGER email_templates_set_updated_at[\s\S]+BEFORE UPDATE ON email_templates[\s\S]+EXECUTE FUNCTION set_email_templates_updated_at/,
    );
  });

  it("migration entièrement idempotente (tous les CREATE/ADD sont IF NOT EXISTS ou OR REPLACE)", () => {
    // Toutes les colonnes utilisent IF NOT EXISTS
    const addColumnMatches = executableLines.match(/ADD COLUMN(?! IF NOT EXISTS)/g);
    expect(addColumnMatches).toBeNull();

    // Toutes les CREATE INDEX utilisent IF NOT EXISTS
    const createIndexMatches = executableLines.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/g);
    expect(createIndexMatches).toBeNull();
  });

  it("documente la procédure de validation post-déploiement", () => {
    expect(migrationSql).toMatch(/VALIDATION POST-MIGRATION/);
    expect(migrationSql).toMatch(/information_schema\.columns/);
    expect(migrationSql).toMatch(/pg_constraint/);
    expect(migrationSql).toMatch(/pg_indexes/);
    expect(migrationSql).toMatch(/pg_trigger/);
  });

  it("documente un rollback complet (couvre les 10 colonnes + constraint + indexes + trigger + fonction)", () => {
    // Le rollback est commenté donc on regarde le texte complet
    expect(migrationSql).toMatch(/-- ROLLBACK/);
    for (const col of TEN_NEW_COLUMNS) {
      expect(migrationSql).toMatch(new RegExp(`DROP COLUMN IF EXISTS ${col}`));
    }
    expect(migrationSql).toMatch(/DROP CONSTRAINT IF EXISTS email_templates_category_check/);
    expect(migrationSql).toMatch(/DROP INDEX IF EXISTS email_templates_entity_key_uniq/);
    expect(migrationSql).toMatch(/DROP INDEX IF EXISTS email_templates_category_active/);
    expect(migrationSql).toMatch(/DROP TRIGGER IF EXISTS email_templates_set_updated_at/);
    expect(migrationSql).toMatch(/DROP FUNCTION IF EXISTS set_email_templates_updated_at/);
  });
});
