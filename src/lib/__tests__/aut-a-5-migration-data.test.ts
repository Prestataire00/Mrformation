import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/aut-a-5-automations-module-data.sql",
);

describe("aut-a-5 — Migration data : crm_automation_logs + ALTER colonnes + DROP orpheline", () => {
  const migrationSql = readFileSync(MIGRATION_PATH, "utf-8");

  describe("Colonnes audit ajoutées (FR-AUT-62 + FR-AUT-63)", () => {
    it("ajoute description sur formation_automation_rules (formations only)", () => {
      expect(migrationSql).toMatch(
        /ALTER TABLE formation_automation_rules[\s\S]+?ADD COLUMN IF NOT EXISTS description TEXT/,
      );
    });

    it("ajoute last_executed_at + execution_count sur formation_automation_rules", () => {
      expect(migrationSql).toMatch(
        /ALTER TABLE formation_automation_rules[\s\S]+?ADD COLUMN IF NOT EXISTS last_executed_at TIMESTAMPTZ/,
      );
      expect(migrationSql).toMatch(
        /ALTER TABLE formation_automation_rules[\s\S]+?ADD COLUMN IF NOT EXISTS execution_count INTEGER DEFAULT 0/,
      );
    });

    it("ajoute last_executed_at + execution_count sur crm_automation_rules", () => {
      expect(migrationSql).toMatch(
        /ALTER TABLE crm_automation_rules[\s\S]+?ADD COLUMN IF NOT EXISTS last_executed_at TIMESTAMPTZ/,
      );
      expect(migrationSql).toMatch(
        /ALTER TABLE crm_automation_rules[\s\S]+?ADD COLUMN IF NOT EXISTS execution_count INTEGER DEFAULT 0/,
      );
    });
  });

  describe("DROP colonne orpheline document_types[] (FR-AUT-57)", () => {
    it("DROP COLUMN IF EXISTS document_types (idempotent)", () => {
      expect(migrationSql).toMatch(
        /ALTER TABLE formation_automation_rules[\s\S]+?DROP COLUMN IF EXISTS document_types/,
      );
    });

    it("documente la vérification préalable (count = 0)", () => {
      expect(migrationSql).toMatch(/SELECT COUNT\(\*\) FROM formation_automation_rules/);
      expect(migrationSql).toMatch(/document_types IS NOT NULL/);
    });
  });

  describe("CREATE TABLE crm_automation_logs (FR-AUT-43)", () => {
    it("crée la table avec toutes les colonnes attendues", () => {
      expect(migrationSql).toMatch(
        /CREATE TABLE IF NOT EXISTS crm_automation_logs/,
      );
      expect(migrationSql).toMatch(/entity_id UUID NOT NULL REFERENCES entities/);
      expect(migrationSql).toMatch(/rule_id UUID REFERENCES crm_automation_rules\(id\) ON DELETE SET NULL/);
      expect(migrationSql).toMatch(/rule_name TEXT NOT NULL/); // snapshot post-delete
      expect(migrationSql).toMatch(/trigger_type TEXT NOT NULL/);
      expect(migrationSql).toMatch(/action_type TEXT NOT NULL/);
      expect(migrationSql).toMatch(/executed_at TIMESTAMPTZ/);
      expect(migrationSql).toMatch(/recipient_count INTEGER DEFAULT 0/);
      expect(migrationSql).toMatch(/details JSONB DEFAULT '\{\}'::jsonb/);
      expect(migrationSql).toMatch(/executed_by UUID REFERENCES profiles/);
      expect(migrationSql).toMatch(/is_manual BOOLEAN DEFAULT FALSE/);
    });

    it("status restreint à 3 valeurs (UX-DR-AUT-9 : success/partial/failed, pas skipped/test)", () => {
      expect(migrationSql).toMatch(
        /status TEXT NOT NULL CHECK \(status IN \('success', 'partial', 'failed'\)\)/,
      );
    });
  });

  describe("RLS stricte sur crm_automation_logs (cohérence aut-a-1 B7)", () => {
    it("active RLS sur la nouvelle table", () => {
      expect(migrationSql).toMatch(
        /ALTER TABLE crm_automation_logs ENABLE ROW LEVEL SECURITY/,
      );
    });

    it("policy SELECT entity-scoped", () => {
      expect(migrationSql).toMatch(
        /CREATE POLICY "crm_automation_logs_select"[\s\S]+?USING \(entity_id = public\.user_entity_id\(\)\)/,
      );
    });

    it("policy INSERT stricte : service_role OU admin de l'entité (helpers public)", () => {
      expect(migrationSql).toMatch(
        /CREATE POLICY "crm_automation_logs_insert_strict"[\s\S]+?WITH CHECK[\s\S]+?auth\.role\(\) = 'service_role'/,
      );
      expect(migrationSql).toMatch(
        /public\.user_role\(\) IN \('admin', 'super_admin'\)/,
      );
      expect(migrationSql).toMatch(
        /entity_id = public\.user_entity_id\(\)/,
      );
    });

    it("n'utilise PAS auth.user_role() ou auth.user_entity_id() (helpers sont en public)", () => {
      const executableLines = migrationSql
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n");
      expect(executableLines).not.toMatch(/auth\.user_role\(\)/);
      expect(executableLines).not.toMatch(/auth\.user_entity_id\(\)/);
    });

    it("crée les 2 index attendus pour audit panel + audit global", () => {
      expect(migrationSql).toMatch(
        /CREATE INDEX IF NOT EXISTS crm_automation_logs_rule_executed_at_idx[\s\S]+?\(rule_id, executed_at DESC\)/,
      );
      expect(migrationSql).toMatch(
        /CREATE INDEX IF NOT EXISTS crm_automation_logs_entity_executed_at_idx[\s\S]+?\(entity_id, executed_at DESC\)/,
      );
    });
  });

  describe("Fonctions PG d'incrémentation (FR-AUT-64)", () => {
    it("increment_rule_execution(rule_id_param UUID) RETURNS VOID", () => {
      expect(migrationSql).toMatch(
        /CREATE OR REPLACE FUNCTION increment_rule_execution\(rule_id_param UUID\)\s+RETURNS VOID/,
      );
      expect(migrationSql).toMatch(
        /UPDATE formation_automation_rules[\s\S]+?last_executed_at = NOW\(\)[\s\S]+?execution_count = execution_count \+ 1/,
      );
    });

    it("increment_crm_rule_execution(rule_id_param UUID) RETURNS VOID", () => {
      expect(migrationSql).toMatch(
        /CREATE OR REPLACE FUNCTION increment_crm_rule_execution\(rule_id_param UUID\)\s+RETURNS VOID/,
      );
      expect(migrationSql).toMatch(
        /UPDATE crm_automation_rules[\s\S]+?last_executed_at = NOW\(\)[\s\S]+?execution_count = execution_count \+ 1/,
      );
    });

    it("utilise SECURITY DEFINER (contourne RLS pour cron service_role)", () => {
      // 2 fonctions × 1 SECURITY DEFINER chacune
      const matches = migrationSql.match(/SECURITY DEFINER/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Restriction CHECK trigger_type (FR-AUT-54, OPTIONNEL section commentée)", () => {
    it("section CHECK restreint est documentée mais commentée (à exécuter après audit)", () => {
      // La section doit exister en commentaire (-- ALTER ... CHECK ...)
      expect(migrationSql).toMatch(
        /-- ALTER TABLE formation_automation_rules[\s\S]+?--\s+DROP CONSTRAINT IF EXISTS formation_automation_rules_trigger_type_check/,
      );
      expect(migrationSql).toMatch(/⚠️ ATTENTION/);
    });

    it("documente le SELECT préalable pour identifier les lignes V2", () => {
      expect(migrationSql).toMatch(/SELECT id, name, trigger_type, is_enabled/);
      expect(migrationSql).toMatch(/'on_signature_complete'/);
      expect(migrationSql).toMatch(/'questionnaire_reminder'/);
      expect(migrationSql).toMatch(/'invoice_overdue'/);
    });

    it("liste les 7 valeurs V1 supportées dans le CHECK commenté", () => {
      // Match lignes commentées contenant ces strings (peu importe l'indentation exacte)
      expect(migrationSql).toMatch(/--\s+'session_start_minus_days'/);
      expect(migrationSql).toMatch(/--\s+'session_end_plus_days'/);
      expect(migrationSql).toMatch(/--\s+'on_session_creation'/);
      expect(migrationSql).toMatch(/--\s+'on_session_completion'/);
      expect(migrationSql).toMatch(/--\s+'on_enrollment'/);
      expect(migrationSql).toMatch(/--\s+'opco_deposit_reminder'/);
      expect(migrationSql).toMatch(/--\s+'certificate_ready'/);
    });
  });

  describe("Idempotence + Rollback", () => {
    it("toutes les ALTER ADD COLUMN exécutables utilisent IF NOT EXISTS pour idempotence", () => {
      // Exclure les lignes commentées
      const executableSql = migrationSql
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n");
      const addColumns = executableSql.match(/ADD COLUMN(?: IF NOT EXISTS)?/g) ?? [];
      const safeAddColumns = executableSql.match(/ADD COLUMN IF NOT EXISTS/g) ?? [];
      expect(safeAddColumns.length).toBe(addColumns.length);
      expect(addColumns.length).toBeGreaterThan(0); // sanity check
    });

    it("section ROLLBACK documentée", () => {
      expect(migrationSql).toMatch(/ROLLBACK \(commenté/i);
      expect(migrationSql).toMatch(/-- DROP TABLE IF EXISTS crm_automation_logs/);
    });

    it("documente la story aut-a-5 + références FR-AUT", () => {
      expect(migrationSql).toMatch(/aut-a-5/);
      expect(migrationSql).toMatch(/FR-AUT-43/); // CREATE table CRM logs
      expect(migrationSql).toMatch(/FR-AUT-57/); // DROP orpheline
      expect(migrationSql).toMatch(/FR-AUT-62/); // ADD columns formations
      expect(migrationSql).toMatch(/FR-AUT-63/); // ADD columns CRM
      expect(migrationSql).toMatch(/FR-AUT-64/); // Fonctions PG
    });
  });
});
