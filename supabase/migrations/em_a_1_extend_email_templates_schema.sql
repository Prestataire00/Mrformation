-- ============================================================
-- Story em-a-1 — Migration schéma email_templates étendu
-- ============================================================
--
-- Auteur : Wissam (proxy Loris VICHOT) + workflow BMAD multi-agents
-- Date   : 2026-05-28
-- Source : bmad_output/planning-artifacts/cadrage-module-emails.md §4.2
--          + prd-emails.md FR-EML-6 → 11 + §9.1 Data Model
--          + architecture-module-emails.md §9.1 Data Architecture
--          + epics-emails.md Story em-a-1
--
-- ============================================================
-- OBJECTIF
-- ============================================================
-- Étendre email_templates avec 10 colonnes lifecycle/audit/gouvernance
-- pour permettre :
--   - Un service resolver unifié (em-a-2) lookup par `key`
--   - Soft-archive via `is_active` (em-c-4)
--   - Audit trail via `created_by` / `updated_by` / `updated_at`
--   - Override expéditeur per template (UX Sally §7.1 MetaPanel)
--   - Catégorisation visuelle UI (em-c-2)
--   - Config trigger inline pour automations (em-a-5 vue usage)
--
-- ============================================================
-- ÉTAT INITIAL (avant cette migration)
-- ============================================================
-- email_templates (schema.sql + add_email_template_attachments.sql) :
--   id UUID PK, entity_id UUID FK NOT NULL, name TEXT, subject TEXT,
--   body TEXT, type TEXT, variables JSONB, created_at TIMESTAMPTZ,
--   attachment_doc_types TEXT[]
--
-- Manque : key, category, is_active, created_by, updated_at,
--          updated_by, sender_name, sender_email, recipient_type,
--          trigger_config.
--
-- ============================================================
-- MIGRATION (idempotente)
-- ============================================================

-- 1. Ajout des 10 colonnes (toutes nullable / avec défaut sûr)
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS key TEXT,                            -- clef sémantique pour resolver (ex: 'reminder_invoice_first')
  ADD COLUMN IF NOT EXISTS category TEXT,                       -- filtrage UI (CHECK contraint ci-dessous)
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,      -- soft-archive (TRUE par défaut pour back-compat)
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS sender_name TEXT,                    -- override expéditeur per template (NULL = fallback entité)
  ADD COLUMN IF NOT EXISTS sender_email TEXT,
  ADD COLUMN IF NOT EXISTS recipient_type TEXT,                 -- 'learner' | 'trainer' | 'client' | 'manager' | 'custom'
  ADD COLUMN IF NOT EXISTS trigger_config JSONB DEFAULT '{}';   -- pour automations : { seed_version, trigger, offset_days, ... }

-- 2. CHECK constraint sur category (idempotent via DROP + ADD)
ALTER TABLE email_templates
  DROP CONSTRAINT IF EXISTS email_templates_category_check;

ALTER TABLE email_templates
  ADD CONSTRAINT email_templates_category_check
  CHECK (category IS NULL OR category IN (
    'transactional', 'automation', 'reminder', 'batch', 'campaign', 'custom'
  ));

-- 3. Index UNIQUE partial pour le resolver (FR-EML-8)
-- Garantit 1 seule ligne active par (entity_id, key) tout en autorisant
-- les NULL multiples (templates custom sans key sémantique).
CREATE UNIQUE INDEX IF NOT EXISTS email_templates_entity_key_uniq
  ON email_templates(entity_id, key)
  WHERE key IS NOT NULL AND is_active = TRUE;

-- 4. Index pour le filtre UI par catégorie (FR-EML-9)
CREATE INDEX IF NOT EXISTS email_templates_category_active
  ON email_templates(entity_id, category, is_active);

-- 5. Trigger updated_at automatique (FR-EML-7)
-- Convention : 1 fonction trigger par table (pattern existant cf.
-- update_documents_updated_at() dans add_documents_unified_table.sql).
CREATE OR REPLACE FUNCTION set_email_templates_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS email_templates_set_updated_at ON email_templates;
CREATE TRIGGER email_templates_set_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION set_email_templates_updated_at();

-- ============================================================
-- VALIDATION POST-MIGRATION
-- ============================================================
-- Exécuter dans le SQL Editor Supabase après le DEPLOY :
--
-- a) Vérifier les 10 nouvelles colonnes :
--    SELECT column_name, data_type, is_nullable, column_default
--    FROM information_schema.columns
--    WHERE table_name = 'email_templates'
--      AND column_name IN ('key','category','is_active','created_by',
--                          'updated_at','updated_by','sender_name',
--                          'sender_email','recipient_type','trigger_config')
--    ORDER BY column_name;
--    → Résultat attendu : 10 lignes
--
-- b) Vérifier la CHECK constraint :
--    SELECT conname, pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conrelid = 'email_templates'::regclass AND contype = 'c';
--    → Résultat attendu : email_templates_category_check
--      avec les 6 valeurs autorisées
--
-- c) Vérifier les 2 index :
--    SELECT indexname, indexdef
--    FROM pg_indexes
--    WHERE tablename = 'email_templates'
--      AND indexname IN ('email_templates_entity_key_uniq',
--                        'email_templates_category_active');
--    → Résultat attendu : 2 lignes
--
-- d) Vérifier le trigger :
--    SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'email_templates'::regclass
--      AND tgname = 'email_templates_set_updated_at';
--    → Résultat attendu : 1 ligne
--
-- e) Test fonctionnel updated_at :
--    SELECT id, updated_at FROM email_templates LIMIT 1;
--    -- noter la valeur
--    UPDATE email_templates SET name = name WHERE id = '<id>';
--    SELECT updated_at FROM email_templates WHERE id = '<id>';
--    → updated_at doit avoir été mis à jour à NOW()
--
-- ============================================================
-- IMPACT FONCTIONNEL
-- ============================================================
-- - Backward compat : tous les anciens templates restent valides
--   (colonnes nullable, is_active = TRUE par défaut = "actif").
-- - Aucun caller existant n'est cassé (les colonnes sont juste
--   ajoutées, jamais lues par les routes existantes avant em-a-2).
-- - La CHECK constraint n'impacte que les nouvelles lignes / updates
--   qui spécifient une category (NULL est toléré pour back-compat).
--
-- ============================================================
-- ROLLBACK
-- ============================================================
-- À utiliser uniquement en cas d'incident bloquant. Note : les
-- nouvelles colonnes ne sont jamais lues avant em-a-2 mergé, donc
-- ce rollback est safe avant la suite du sprint.
--
-- DROP TRIGGER IF EXISTS email_templates_set_updated_at ON email_templates;
-- DROP FUNCTION IF EXISTS set_email_templates_updated_at();
-- DROP INDEX IF EXISTS email_templates_category_active;
-- DROP INDEX IF EXISTS email_templates_entity_key_uniq;
-- ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_category_check;
-- ALTER TABLE email_templates
--   DROP COLUMN IF EXISTS trigger_config,
--   DROP COLUMN IF EXISTS recipient_type,
--   DROP COLUMN IF EXISTS sender_email,
--   DROP COLUMN IF EXISTS sender_name,
--   DROP COLUMN IF EXISTS updated_by,
--   DROP COLUMN IF EXISTS updated_at,
--   DROP COLUMN IF EXISTS created_by,
--   DROP COLUMN IF EXISTS is_active,
--   DROP COLUMN IF EXISTS category,
--   DROP COLUMN IF EXISTS key;
