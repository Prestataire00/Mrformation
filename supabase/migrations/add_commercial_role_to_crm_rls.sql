-- ============================================================
-- Migration : Story h-17 — Accès commerciaux au CRM (Epic H)
-- ============================================================
--
-- Étend les policies RLS des 9 tables CRM core pour autoriser
-- le rôle 'commercial' en plus de 'admin' (en gardant le filtre
-- entity_id = auth.user_entity_id() pour isolation multi-tenant).
--
-- AVANT : auth.user_role() = 'admin'
-- APRÈS : auth.user_role() IN ('admin', 'commercial')
--
-- IMPORTANT — Ne touche PAS :
--   - Les policies sales reps trainers (CRM sales reps read/update own
--     prospects/tasks/quotes) définies dans `crm-access.sql` :
--     scope différent (assigned_to/created_by + has_crm_access).
--     Elles coexistent : un trainer avec has_crm_access voit
--     uniquement ses propres records, un commercial voit tout
--     dans son entity_id.
--   - Les autres tables CRM (crm_custom_fields, crm_sequences,
--     crm_prospect_comments, crm_quote_reminders, crm_notifications)
--     qui utilisent des patterns RLS différents (_entity, _access,
--     entity_isolation, owner-based). Si besoin d'extension commercial,
--     les ajouter dans une future story h-18 après validation scope.
--
-- Idempotent : DROP POLICY IF EXISTS + CREATE POLICY.
-- Naming : suffixe `_admin_commercial_all` pour distinguer clairement
-- du legacy `_admin_all` et faciliter audit RLS futur.
--
-- À exécuter manuellement dans Supabase Dashboard SQL Editor AVANT
-- déploiement Netlify (sinon les commerciaux verront un menu OK
-- mais resteront bloqués en RLS).
-- ============================================================

-- ===== crm_prospects =====
DROP POLICY IF EXISTS "crm_prospects_admin_all" ON crm_prospects;
DROP POLICY IF EXISTS "crm_prospects_admin_commercial_all" ON crm_prospects;
CREATE POLICY "crm_prospects_admin_commercial_all" ON crm_prospects
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id());

-- ===== crm_tasks =====
DROP POLICY IF EXISTS "crm_tasks_admin_all" ON crm_tasks;
DROP POLICY IF EXISTS "crm_tasks_admin_commercial_all" ON crm_tasks;
CREATE POLICY "crm_tasks_admin_commercial_all" ON crm_tasks
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id());

-- ===== crm_quotes =====
DROP POLICY IF EXISTS "crm_quotes_admin_all" ON crm_quotes;
DROP POLICY IF EXISTS "crm_quotes_admin_commercial_all" ON crm_quotes;
CREATE POLICY "crm_quotes_admin_commercial_all" ON crm_quotes
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id());

-- ===== crm_quote_lines =====
DROP POLICY IF EXISTS "crm_quote_lines_admin_all" ON crm_quote_lines;
DROP POLICY IF EXISTS "crm_quote_lines_admin_commercial_all" ON crm_quote_lines;
CREATE POLICY "crm_quote_lines_admin_commercial_all" ON crm_quote_lines
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id());

-- ===== crm_campaigns =====
DROP POLICY IF EXISTS "crm_campaigns_admin_all" ON crm_campaigns;
DROP POLICY IF EXISTS "crm_campaigns_admin_commercial_all" ON crm_campaigns;
CREATE POLICY "crm_campaigns_admin_commercial_all" ON crm_campaigns
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id());

-- ===== crm_client_tags =====
DROP POLICY IF EXISTS "crm_client_tags_admin_all" ON crm_client_tags;
DROP POLICY IF EXISTS "crm_client_tags_admin_commercial_all" ON crm_client_tags;
CREATE POLICY "crm_client_tags_admin_commercial_all" ON crm_client_tags
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id());

-- ===== crm_prospect_tags =====
DROP POLICY IF EXISTS "crm_prospect_tags_admin_all" ON crm_prospect_tags;
DROP POLICY IF EXISTS "crm_prospect_tags_admin_commercial_all" ON crm_prospect_tags;
CREATE POLICY "crm_prospect_tags_admin_commercial_all" ON crm_prospect_tags
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id());

-- ===== crm_automation_rules =====
-- Note : l'API /api/crm/automations reste admin-only (story scope),
-- mais on étend la RLS au commercial pour cohérence si jamais une
-- future story ouvre la lecture des règles à commercial (audit).
-- Le blocage applicatif reste opérant.
DROP POLICY IF EXISTS "crm_automation_rules_admin_all" ON crm_automation_rules;
DROP POLICY IF EXISTS "crm_automation_rules_admin" ON crm_automation_rules;
DROP POLICY IF EXISTS "crm_automation_rules_admin_commercial_all" ON crm_automation_rules;
CREATE POLICY "crm_automation_rules_admin_commercial_all" ON crm_automation_rules
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id());

-- ===== crm_commercial_actions =====
DROP POLICY IF EXISTS "crm_commercial_actions_admin_all" ON crm_commercial_actions;
DROP POLICY IF EXISTS "crm_commercial_actions_admin_commercial_all" ON crm_commercial_actions;
CREATE POLICY "crm_commercial_actions_admin_commercial_all" ON crm_commercial_actions
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id());

-- ============================================================
-- Smoke test (à exécuter dans le Dashboard pour valider) :
-- ============================================================
-- SET LOCAL request.jwt.claims = '{"sub": "<uuid_d_un_commercial>", "role": "authenticated"}';
-- SELECT count(*) FROM crm_prospects;  -- doit retourner > 0 si données dans l'entité
-- SELECT count(*) FROM crm_quotes;
-- SELECT count(*) FROM crm_tasks;
-- RESET request.jwt.claims;
-- ============================================================
