import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/em_a_4_fix_rls_crm_automation_rules.sql",
);

const OLD_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/crm-automation-rules.sql",
);

describe("em-a-4 — Fix RLS crm_automation_rules (hotfix P0)", () => {
  const migrationSql = readFileSync(MIGRATION_PATH, "utf-8");

  it("drop l'ancienne policy allow_all crm_automation_rules_admin", () => {
    expect(migrationSql).toMatch(
      /DROP POLICY IF EXISTS "crm_automation_rules_admin" ON crm_automation_rules/,
    );
  });

  it("crée une nouvelle policy entity-scoped granular", () => {
    expect(migrationSql).toMatch(
      /CREATE POLICY "crm_automation_rules_admin_entity" ON crm_automation_rules/,
    );
  });

  it("utilise les helpers user_role() et user_entity_id() de défense en profondeur", () => {
    expect(migrationSql).toMatch(/user_role\(\) IN \('admin', 'super_admin'\)/);
    expect(migrationSql).toMatch(/entity_id = user_entity_id\(\)/);
  });

  it("a un WITH CHECK pour bloquer les INSERT/UPDATE cross-entity", () => {
    expect(migrationSql).toMatch(/WITH CHECK\s*\([\s\S]*user_role\(\)/);
    expect(migrationSql).toMatch(/WITH CHECK\s*\([\s\S]*entity_id = user_entity_id\(\)/);
  });

  it("n'introduit aucun pattern allow_all USING (true) en code SQL exécutable", () => {
    // Exclure les lignes commentées (-- ...) qui peuvent documenter le rollback
    const executableLines = migrationSql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(executableLines).not.toMatch(/USING\s*\(\s*true\s*\)/);
  });

  it("documente l'audit callers + la procédure de validation post-déploiement", () => {
    expect(migrationSql).toMatch(/AUDIT CALLERS PRÉALABLE/);
    expect(migrationSql).toMatch(/VALIDATION POST-MIGRATION/);
    expect(migrationSql).toMatch(/pg_policy/);
  });
});

describe("em-a-4 — Compat avec la migration originelle", () => {
  const oldMigrationSql = readFileSync(OLD_MIGRATION_PATH, "utf-8");

  it("confirme que la migration originelle contenait bien USING (true) (anti-pattern corrigé)", () => {
    expect(oldMigrationSql).toMatch(/USING \(true\)/);
    expect(oldMigrationSql).toMatch(/"crm_automation_rules_admin"/);
  });
});
