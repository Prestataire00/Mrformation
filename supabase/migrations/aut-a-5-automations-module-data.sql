-- ─────────────────────────────────────────────────────────────────────────
-- Story aut-a-5 — Migration data module Automatisations
-- ─────────────────────────────────────────────────────────────────────────
--
-- Couvre :
-- 1. ADD COLUMN description (formations only, déjà côté CRM) — FR-AUT-62
-- 2. ADD COLUMN last_executed_at + execution_count (les 2 tables) — FR-AUT-62, FR-AUT-63
-- 3. DROP COLUMN document_types[] orpheline — FR-AUT-57 (idempotent si automation_solidification.sql
--    a déjà été appliquée en prod)
-- 4. CREATE TABLE crm_automation_logs — FR-AUT-43
-- 5. RLS stricte sur crm_automation_logs (cohérence avec aut-a-1 hotfix B7)
-- 6. Fonctions PG increment_rule_execution + increment_crm_rule_execution — FR-AUT-64
-- 7. (OPTIONNEL — à exécuter après audit) Restriction CHECK trigger_type aux 7 valeurs V1
--    → cf. section dédiée en bas (FR-AUT-54, FR-AUT-55)
--
-- Référence : bmad_output/planning-artifacts/architecture-module-automatisations.md
-- §Data Architecture + PRD §9.
--
-- Helpers RLS en prod : public.user_role(), public.user_entity_id()
-- (cf. feedback memory rls_helpers_public_not_auth — surtout pas auth.*)
--
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. ALTER formation_automation_rules : description + audit columns ──
ALTER TABLE formation_automation_rules
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS last_executed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_count INTEGER DEFAULT 0 NOT NULL;

-- ── 2. ALTER crm_automation_rules : audit columns (description existe déjà côté CRM) ──
ALTER TABLE crm_automation_rules
  ADD COLUMN IF NOT EXISTS last_executed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_count INTEGER DEFAULT 0 NOT NULL;

-- ── 3. DROP colonne orpheline document_types[] (D2) ──
-- Idempotent : la migration automation_solidification.sql du 22 mai
-- l'a peut-être déjà faite en prod. IF EXISTS protège.
-- Avant DROP en prod, vérifier qu'aucune donnée n'est dans cette colonne :
--   SELECT COUNT(*) FROM formation_automation_rules
--   WHERE document_types IS NOT NULL AND array_length(document_types, 1) > 0;
ALTER TABLE formation_automation_rules
  DROP COLUMN IF EXISTS document_types;

-- ── 4. CREATE TABLE crm_automation_logs (équivalent session_automation_logs côté CRM) ──
CREATE TABLE IF NOT EXISTS crm_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES crm_automation_rules(id) ON DELETE SET NULL,
  rule_name TEXT NOT NULL, -- snapshot pour audit après éventuelle suppression de la rule
  trigger_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  recipient_count INTEGER DEFAULT 0 NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  -- 3 statuts seulement (UX-DR-AUT-9 : skipped → success avec recipient_count=0 dans details)
  details JSONB DEFAULT '{}'::jsonb NOT NULL,
  executed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- NULL si exécuté par service_role (cron Netlify), UUID si déclenché par admin
  is_manual BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 5. RLS sur crm_automation_logs ──
ALTER TABLE crm_automation_logs ENABLE ROW LEVEL SECURITY;

-- SELECT entity-scoped : tout user de l'entité peut lire l'audit
DROP POLICY IF EXISTS "crm_automation_logs_select" ON crm_automation_logs;
CREATE POLICY "crm_automation_logs_select" ON crm_automation_logs
  FOR SELECT TO authenticated
  USING (entity_id = public.user_entity_id());

-- INSERT strict : service_role (cron) OU admin de l'entité (cohérence avec aut-a-1)
DROP POLICY IF EXISTS "crm_automation_logs_insert_strict" ON crm_automation_logs;
CREATE POLICY "crm_automation_logs_insert_strict" ON crm_automation_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      public.user_role() IN ('admin', 'super_admin')
      AND entity_id = public.user_entity_id()
    )
  );

-- Index pour audit panel par règle (10 dernières exécutions)
CREATE INDEX IF NOT EXISTS crm_automation_logs_rule_executed_at_idx
  ON crm_automation_logs(rule_id, executed_at DESC);

-- Index pour audit global (filtres date + status)
CREATE INDEX IF NOT EXISTS crm_automation_logs_entity_executed_at_idx
  ON crm_automation_logs(entity_id, executed_at DESC);

-- ── 6. Fonctions PG d'incrémentation atomique des compteurs ──
-- Appelées par le moteur (run-cron + lib/crm/automations) en fin d'exécution réussie.
-- SECURITY DEFINER + STABLE → contourne RLS pour permettre l'update même hors entité
-- du caller (cas service_role / cron).

CREATE OR REPLACE FUNCTION increment_rule_execution(rule_id_param UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE formation_automation_rules
  SET last_executed_at = NOW(),
      execution_count = execution_count + 1
  WHERE id = rule_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_crm_rule_execution(rule_id_param UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE crm_automation_rules
  SET last_executed_at = NOW(),
      execution_count = execution_count + 1
  WHERE id = rule_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. RESTRICTION CHECK trigger_type (OPTIONNEL — à exécuter manuellement après audit)
-- ─────────────────────────────────────────────────────────────────────────
--
-- FR-AUT-54 + FR-AUT-55 : restreindre formation_automation_rules.trigger_type
-- aux 7 valeurs V1 (les 3 autres sont différées V2 avec ADR).
--
-- ⚠️ ATTENTION : avant d'exécuter cette section, vérifier si des règles
-- existantes utilisent un trigger_type V2 :
--   SELECT id, name, trigger_type, is_enabled
--   FROM formation_automation_rules
--   WHERE trigger_type IN ('on_signature_complete', 'questionnaire_reminder', 'invoice_overdue');
--
-- Si des règles ressortent :
-- - OPTION A (recommandée pour V1) : les désactiver manuellement
--     UPDATE formation_automation_rules SET is_enabled = FALSE
--     WHERE trigger_type IN ('on_signature_complete', 'questionnaire_reminder', 'invoice_overdue');
-- - OPTION B : skip cette section, garder le CHECK actuel (10 valeurs) jusqu'à V2
--
-- ─── Section commentée — décommenter et exécuter manuellement après audit ───
--
-- ALTER TABLE formation_automation_rules
--   DROP CONSTRAINT IF EXISTS formation_automation_rules_trigger_type_check;
--
-- ALTER TABLE formation_automation_rules
--   ADD CONSTRAINT formation_automation_rules_trigger_type_check
--   CHECK (trigger_type IN (
--     'session_start_minus_days',
--     'session_end_plus_days',
--     'on_session_creation',
--     'on_session_completion',
--     'on_enrollment',
--     'opco_deposit_reminder',
--     'certificate_ready'
--   ));
--
-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (commenté — à exécuter manuellement si rollback nécessaire)
-- ─────────────────────────────────────────────────────────────────────────
--
-- DROP TABLE IF EXISTS crm_automation_logs CASCADE;
-- DROP FUNCTION IF EXISTS increment_rule_execution(UUID);
-- DROP FUNCTION IF EXISTS increment_crm_rule_execution(UUID);
--
-- ALTER TABLE formation_automation_rules
--   DROP COLUMN IF EXISTS description,
--   DROP COLUMN IF EXISTS last_executed_at,
--   DROP COLUMN IF EXISTS execution_count;
--
-- ALTER TABLE crm_automation_rules
--   DROP COLUMN IF EXISTS last_executed_at,
--   DROP COLUMN IF EXISTS execution_count;
--
-- ⚠️ Le DROP COLUMN document_types est IRRÉVERSIBLE (impossible de récupérer
-- les valeurs antérieures sans backup). Acceptable car colonne orpheline.
