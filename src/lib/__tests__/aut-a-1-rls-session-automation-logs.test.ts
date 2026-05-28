import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/aut-a-1-hotfix-rls-session-automation-logs.sql",
);

const ORIGINAL_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/extend_automation_system.sql",
);

describe("aut-a-1 — HOTFIX RLS session_automation_logs INSERT (B7)", () => {
  const migrationSql = readFileSync(MIGRATION_PATH, "utf-8");

  it("drop l'ancienne policy permissive session_auto_logs_insert", () => {
    expect(migrationSql).toMatch(
      /DROP POLICY IF EXISTS "session_auto_logs_insert" ON session_automation_logs/,
    );
  });

  it("crée une nouvelle policy stricte session_auto_logs_insert_strict", () => {
    expect(migrationSql).toMatch(
      /CREATE POLICY "session_auto_logs_insert_strict" ON session_automation_logs/,
    );
  });

  it("autorise explicitement le service_role (pour cron + scheduled functions)", () => {
    expect(migrationSql).toMatch(/auth\.role\(\) = 'service_role'/);
  });

  it("restreint aux admin/super_admin de l'entité propriétaire de la session (helpers public)", () => {
    expect(migrationSql).toMatch(
      /public\.user_role\(\) IN \('admin', 'super_admin'\)/,
    );
    expect(migrationSql).toMatch(
      /entity_id = public\.user_entity_id\(\)/,
    );
  });

  it("filtre via jointure sessions (session_id IN SELECT entity-scoped)", () => {
    expect(migrationSql).toMatch(
      /session_id IN \(\s*SELECT id FROM sessions WHERE entity_id = public\.user_entity_id\(\)\s*\)/,
    );
  });

  it("n'utilise pas auth.user_role() ou auth.user_entity_id() (helpers sont en public, pas auth)", () => {
    // Exclure les commentaires qui peuvent documenter l'erreur d'origine
    const executableLines = migrationSql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(executableLines).not.toMatch(/auth\.user_role\(\)/);
    expect(executableLines).not.toMatch(/auth\.user_entity_id\(\)/);
  });

  it("a un WITH CHECK (pas USING) car c'est une policy INSERT", () => {
    expect(migrationSql).toMatch(/FOR INSERT TO authenticated/);
    expect(migrationSql).toMatch(/WITH CHECK\s*\(/);
  });

  it("n'introduit aucun pattern allow_all WITH CHECK (true) en code SQL exécutable", () => {
    // Exclure les lignes commentées (-- ...) qui peuvent documenter le rollback
    const executableLines = migrationSql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(executableLines).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/);
  });

  it("documente l'audit callers (3 lieux SELECT + 1 INSERT service_role)", () => {
    expect(migrationSql).toMatch(/Audit callers/i);
    expect(migrationSql).toMatch(/run-cron\/route\.ts/);
    expect(migrationSql).toMatch(/createServiceClient/);
    expect(migrationSql).toMatch(/TabAutomation\.tsx/);
    expect(migrationSql).toMatch(/compute-events\.ts/);
  });

  it("référence le bug B7 du deep-dive et le cadrage", () => {
    expect(migrationSql).toMatch(/B7/);
    expect(migrationSql).toMatch(/deep-dive-automatisations\.md/);
    expect(migrationSql).toMatch(/cadrage-module-automatisations\.md/);
  });
});

describe("aut-a-1 — Confirmation du bug B7 dans la migration originelle", () => {
  const originalSql = readFileSync(ORIGINAL_MIGRATION_PATH, "utf-8");

  it("confirme que extend_automation_system.sql contenait bien WITH CHECK (true)", () => {
    expect(originalSql).toMatch(/"session_auto_logs_insert"/);
    expect(originalSql).toMatch(/WITH CHECK \(true\)/);
  });
});
