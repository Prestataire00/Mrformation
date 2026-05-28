import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/em_a_5_vue_email_template_usage.sql",
);

const migrationSql = readFileSync(MIGRATION_PATH, "utf-8");
const executableLines = migrationSql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("em-a-5 — Vue SQL email_template_usage", () => {
  it("crée la vue via CREATE OR REPLACE VIEW (idempotent)", () => {
    expect(executableLines).toMatch(/CREATE OR REPLACE VIEW email_template_usage AS/);
  });

  it("agrège depuis formation_automation_rules avec template_id FK direct", () => {
    expect(executableLines).toMatch(
      /FROM formation_automation_rules far[\s\S]+far\.template_id/,
    );
    expect(executableLines).toMatch(/far\.is_enabled = TRUE/);
    expect(executableLines).toMatch(/far\.template_id IS NOT NULL/);
  });

  it("agrège depuis crm_automation_rules avec template_id extrait du JSONB config", () => {
    expect(executableLines).toMatch(/FROM crm_automation_rules car/);
    expect(executableLines).toMatch(/\(car\.config->>'template_id'\)::uuid/);
    expect(executableLines).toMatch(/car\.is_enabled = TRUE/);
    expect(executableLines).toMatch(/car\.config \? 'template_id'/);
  });

  it("source taggée pour différencier formation vs CRM dans le payload", () => {
    expect(executableLines).toMatch(/'formation_automation_rules'::text AS source/);
    expect(executableLines).toMatch(/'crm_automation_rules'::text AS source/);
  });

  it("retourne le count + un array_agg des usages détaillés", () => {
    expect(executableLines).toMatch(/COUNT\(\*\) AS usage_count/);
    expect(executableLines).toMatch(/array_agg/);
    expect(executableLines).toMatch(/jsonb_build_object/);
  });

  it("le jsonb_build_object expose source / rule_id / name / trigger_type", () => {
    expect(executableLines).toMatch(/'source', source/);
    expect(executableLines).toMatch(/'rule_id', rule_id/);
    expect(executableLines).toMatch(/'name', name/);
    expect(executableLines).toMatch(/'trigger_type', trigger_type/);
  });

  it("group by template_id + entity_id (clef d'agrégation)", () => {
    expect(executableLines).toMatch(/GROUP BY template_id, entity_id/);
  });

  it("filtre NULL template_id en outer WHERE pour éviter pollution", () => {
    // Le WHERE template_id IS NOT NULL externe agit après le UNION
    expect(executableLines).toMatch(/\) AS u[\s\S]+WHERE template_id IS NOT NULL/);
  });

  it("commente la vue avec son rôle business", () => {
    expect(executableLines).toMatch(/COMMENT ON VIEW email_template_usage IS/);
    expect(migrationSql).toMatch(/badge "Utilisé par N automations"/);
  });

  it("documente la décision ID-EML-1 (vue simple, pas materialized)", () => {
    expect(migrationSql).toMatch(/DÉCISION ARCHITECTURE.*ID-EML-1/);
    expect(migrationSql).toMatch(/materialized view/i);
  });

  it("documente validation post-déploiement + RLS check", () => {
    expect(migrationSql).toMatch(/VALIDATION POST-MIGRATION/);
    expect(migrationSql).toMatch(/RLS check/);
  });

  it("documente le rollback (DROP VIEW IF EXISTS)", () => {
    expect(migrationSql).toMatch(/-- ROLLBACK[\s\S]+DROP VIEW IF EXISTS email_template_usage/);
  });
});
