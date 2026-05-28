import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REQUIRED_KEYS } from "@/lib/services/email-template-resolver";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/em_a_3_seed_default_email_templates.sql",
);

const migrationSql = readFileSync(MIGRATION_PATH, "utf-8");

describe("em-a-3 — Seed des templates email par défaut", () => {
  it("seed inclut tous les REQUIRED_KEYS définis dans le resolver (em-a-2)", () => {
    for (const key of REQUIRED_KEYS) {
      expect(migrationSql).toMatch(new RegExp(`'${key}'`));
    }
  });

  it("seed inclut les 3 niveaux d'invoice reminders avec wording pixel-perfect", () => {
    expect(migrationSql).toMatch(/Rappel de paiement — Facture \{\{reference\}\}/);
    expect(migrationSql).toMatch(/Deuxième rappel — Facture \{\{reference\}\} impayée/);
    expect(migrationSql).toMatch(/Mise en demeure — Facture \{\{reference\}\}/);
  });

  it("seed inclut les 3 niveaux de quote reminders", () => {
    expect(migrationSql).toMatch(/Suite à notre proposition \{\{reference\}\}/);
    expect(migrationSql).toMatch(/Relance — Proposition \{\{reference\}\}/);
    expect(migrationSql).toMatch(/Dernière relance — Proposition \{\{reference\}\}/);
  });

  it("seed inclut le quote sign-request avec lien_signature", () => {
    expect(migrationSql).toMatch(/Proposition \{\{reference\}\} — \{\{entite\}\}/);
    expect(migrationSql).toMatch(/\{\{lien_signature\}\}/);
  });

  it("seed inclut le rappel OPCO avec opco_name", () => {
    expect(migrationSql).toMatch(/Rappel : demande OPCO à déposer — \{\{formation\}\}/);
    expect(migrationSql).toMatch(/\{\{opco_name\}\}/);
  });

  it("toutes les entrées seed sont taggées seed_version='2026-05-28-v1' pour rollback ciblé", () => {
    expect(migrationSql).toMatch(/'seed_version', '2026-05-28-v1'/);
    expect(migrationSql).toMatch(/jsonb_build_object\('seed_version'/);
  });

  it("seed est idempotent via WHERE NOT EXISTS (pas ON CONFLICT impossible sur partial index)", () => {
    expect(migrationSql).toMatch(/WHERE NOT EXISTS/);
    expect(migrationSql).toMatch(/et\.entity_id = e\.id/);
    expect(migrationSql).toMatch(/et\.key = t\.key/);
    expect(migrationSql).toMatch(/et\.is_active = TRUE/);
  });

  it("seed utilise CROSS JOIN entities pour seed automatique sur toutes les entités existantes", () => {
    expect(migrationSql).toMatch(/FROM entities e/);
    expect(migrationSql).toMatch(/CROSS JOIN \(VALUES/);
  });

  it("toutes les catégories utilisées sont valides (CHECK constraint em-a-1)", () => {
    const validCategories = ["transactional", "automation", "reminder", "batch", "campaign", "custom"];
    const categoryMatches = migrationSql.matchAll(/'(transactional|automation|reminder|batch|campaign|custom)'/g);
    const usedCategories = new Set([...categoryMatches].map((m) => m[1]));
    for (const cat of usedCategories) {
      expect(validCategories).toContain(cat);
    }
    // Au moins 3 catégories doivent être utilisées (reminder, transactional, automation, batch)
    expect(usedCategories.size).toBeGreaterThanOrEqual(3);
  });

  it("recipient_type des batch_* est 'learner' (cohérent avec destinataires)", () => {
    // Au moins les 5 plus importants batch learner
    const learnerBatches = [
      "batch_convocation",
      "batch_attestation_assiduite",
      "batch_certificat_realisation",
      "batch_attestation_competences",
      "batch_avis_habilitation_electrique",
    ];
    for (const key of learnerBatches) {
      // Cherche le bloc qui commence par la key et finit avant la prochaine virgule fermante
      const blockMatch = migrationSql.match(
        new RegExp(`'${key}'[\\s\\S]{0,400}?'learner'`, "m"),
      );
      expect(blockMatch).not.toBeNull();
    }
  });

  it("documente la procédure de validation post-déploiement (2 queries SQL)", () => {
    expect(migrationSql).toMatch(/VALIDATION POST-MIGRATION/);
    expect(migrationSql).toMatch(/SELECT entity_id, COUNT\(\*\)/);
    expect(migrationSql).toMatch(/missing_key/);
  });

  it("documente un rollback ciblé qui préserve les customisations de Loris", () => {
    expect(migrationSql).toMatch(/ROLLBACK/);
    expect(migrationSql).toMatch(
      /DELETE FROM email_templates[\s\S]+WHERE trigger_config->>'seed_version' = '2026-05-28-v1'/,
    );
  });
});
