-- ============================================================
-- Migration : Story h-17 — Accès commerciaux au CRM (Epic H)
-- ============================================================
--
-- Étend les policies RLS des 9 tables CRM core pour autoriser
-- le rôle 'commercial' en plus de 'admin' (en gardant le filtre
-- entity_id = public.user_entity_id() pour isolation multi-tenant).
--
-- Inclut aussi 'super_admin' par sécurité : sur 5 des 9 tables couvertes
-- ici, le HOTFIX_auth_helpers.sql n'avait PAS ajouté de policy parallèle
-- super_admin (`crm_quote_lines`, `crm_client_tags`, `crm_prospect_tags`,
-- `crm_automation_rules`, `crm_commercial_actions`). Sans cette inclusion,
-- on risquerait de bloquer aussi super_admin en prod sur ces tables.
--
-- AVANT : auth.user_role() = 'admin'  (helper en schema 'auth' VERROUILLÉ
--         côté Supabase hébergé — ne fonctionne pas en prod)
-- APRÈS : public.user_role() IN ('admin', 'super_admin', 'commercial')
--
-- IMPORTANT — Ne touche PAS :
--   - Les policies sales reps trainers (CRM sales reps read/update own
--     prospects/tasks/quotes) définies dans `crm-access.sql` :
--     scope différent (assigned_to/created_by + has_crm_access).
--     Elles coexistent : un trainer avec has_crm_access voit
--     uniquement ses propres records, un commercial voit tout
--     dans son entity_id.
--   - Les policies parallèles super_admin (crm_*_super_admin_all) ajoutées
--     par HOTFIX_auth_helpers.sql : leur PRÉSENCE n'est pas garantie
--     sur toutes les 9 tables, donc on les laisse intactes (PostgreSQL
--     combine policies en OR, c'est additif).
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
  USING (public.user_role() IN ('admin', 'super_admin', 'commercial') AND entity_id = public.user_entity_id())
  WITH CHECK (public.user_role() IN ('admin', 'super_admin', 'commercial') AND entity_id = public.user_entity_id());

-- ===== crm_tasks =====
DROP POLICY IF EXISTS "crm_tasks_admin_all" ON crm_tasks;
DROP POLICY IF EXISTS "crm_tasks_admin_commercial_all" ON crm_tasks;
CREATE POLICY "crm_tasks_admin_commercial_all" ON crm_tasks
  FOR ALL TO authenticated
  USING (public.user_role() IN ('admin', 'super_admin', 'commercial') AND entity_id = public.user_entity_id())
  WITH CHECK (public.user_role() IN ('admin', 'super_admin', 'commercial') AND entity_id = public.user_entity_id());

-- ===== crm_quotes =====
DROP POLICY IF EXISTS "crm_quotes_admin_all" ON crm_quotes;
DROP POLICY IF EXISTS "crm_quotes_admin_commercial_all" ON crm_quotes;
CREATE POLICY "crm_quotes_admin_commercial_all" ON crm_quotes
  FOR ALL TO authenticated
  USING (public.user_role() IN ('admin', 'super_admin', 'commercial') AND entity_id = public.user_entity_id())
  WITH CHECK (public.user_role() IN ('admin', 'super_admin', 'commercial') AND entity_id = public.user_entity_id());

-- ===== crm_quote_lines =====
-- Pas de colonne entity_id native -> check via JOIN sur crm_quotes parent.
DROP POLICY IF EXISTS "crm_quote_lines_admin_all" ON crm_quote_lines;
DROP POLICY IF EXISTS "crm_quote_lines_all" ON crm_quote_lines;
DROP POLICY IF EXISTS "crm_quote_lines_admin_commercial_all" ON crm_quote_lines;
CREATE POLICY "crm_quote_lines_admin_commercial_all" ON crm_quote_lines
  FOR ALL TO authenticated
  USING (
    public.user_role() IN ('admin', 'super_admin', 'commercial')
    AND quote_id IN (SELECT id FROM crm_quotes WHERE entity_id = public.user_entity_id())
  )
  WITH CHECK (
    public.user_role() IN ('admin', 'super_admin', 'commercial')
    AND quote_id IN (SELECT id FROM crm_quotes WHERE entity_id = public.user_entity_id())
  );

-- ===== crm_campaigns =====
DROP POLICY IF EXISTS "crm_campaigns_admin_all" ON crm_campaigns;
DROP POLICY IF EXISTS "crm_campaigns_admin_commercial_all" ON crm_campaigns;
CREATE POLICY "crm_campaigns_admin_commercial_all" ON crm_campaigns
  FOR ALL TO authenticated
  USING (public.user_role() IN ('admin', 'super_admin', 'commercial') AND entity_id = public.user_entity_id())
  WITH CHECK (public.user_role() IN ('admin', 'super_admin', 'commercial') AND entity_id = public.user_entity_id());

-- ===== crm_client_tags =====
-- Pas de colonne entity_id native -> check via JOIN sur clients parent.
DROP POLICY IF EXISTS "crm_client_tags_admin_all" ON crm_client_tags;
DROP POLICY IF EXISTS "crm_client_tags_admin_commercial_all" ON crm_client_tags;
CREATE POLICY "crm_client_tags_admin_commercial_all" ON crm_client_tags
  FOR ALL TO authenticated
  USING (
    public.user_role() IN ('admin', 'super_admin', 'commercial')
    AND client_id IN (SELECT id FROM clients WHERE entity_id = public.user_entity_id())
  )
  WITH CHECK (
    public.user_role() IN ('admin', 'super_admin', 'commercial')
    AND client_id IN (SELECT id FROM clients WHERE entity_id = public.user_entity_id())
  );

-- ===== crm_prospect_tags =====
-- Pas de colonne entity_id native -> check via JOIN sur crm_prospects parent.
DROP POLICY IF EXISTS "crm_prospect_tags_admin_all" ON crm_prospect_tags;
DROP POLICY IF EXISTS "crm_prospect_tags_admin_commercial_all" ON crm_prospect_tags;
CREATE POLICY "crm_prospect_tags_admin_commercial_all" ON crm_prospect_tags
  FOR ALL TO authenticated
  USING (
    public.user_role() IN ('admin', 'super_admin', 'commercial')
    AND prospect_id IN (SELECT id FROM crm_prospects WHERE entity_id = public.user_entity_id())
  )
  WITH CHECK (
    public.user_role() IN ('admin', 'super_admin', 'commercial')
    AND prospect_id IN (SELECT id FROM crm_prospects WHERE entity_id = public.user_entity_id())
  );

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
  USING (public.user_role() IN ('admin', 'super_admin', 'commercial') AND entity_id = public.user_entity_id())
  WITH CHECK (public.user_role() IN ('admin', 'super_admin', 'commercial') AND entity_id = public.user_entity_id());

-- ===== crm_commercial_actions =====
DROP POLICY IF EXISTS "crm_commercial_actions_admin_all" ON crm_commercial_actions;
DROP POLICY IF EXISTS "crm_commercial_actions_admin_commercial_all" ON crm_commercial_actions;
CREATE POLICY "crm_commercial_actions_admin_commercial_all" ON crm_commercial_actions
  FOR ALL TO authenticated
  USING (public.user_role() IN ('admin', 'super_admin', 'commercial') AND entity_id = public.user_entity_id())
  WITH CHECK (public.user_role() IN ('admin', 'super_admin', 'commercial') AND entity_id = public.user_entity_id());

-- ============================================================
-- Vérifications post-exécution (à lancer dans le Dashboard) :
-- ============================================================
--
-- 1. Confirmer que public.user_role() existe et répond :
--    SELECT public.user_role();
--    -- Doit retourner ton role (admin / super_admin) — sinon HOTFIX_auth_helpers.sql
--    -- doit être exécuté d'abord pour créer les helpers.
--
-- 2. Lister les policies créées :
--    SELECT tablename, policyname FROM pg_policies
--    WHERE policyname LIKE '%admin_commercial_all'
--    ORDER BY tablename;
--    -- Doit lister 9 lignes (une par table).
--
-- 3. Smoke test avec un compte commercial réel (depuis l'app) :
--    se connecter avec un user role='commercial', aller sur /admin/crm,
--    vérifier que les prospects/devis/tâches s'affichent.
-- ============================================================
