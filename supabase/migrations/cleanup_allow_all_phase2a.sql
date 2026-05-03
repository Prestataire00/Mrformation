-- ============================================================
-- Migration : Cleanup allow_all Phase 2A
-- ============================================================
-- DROP des policies `USING(true)` sur 19 tables qui ont DÉJÀ une
-- policy granulaire prête à prendre le relais.
--
-- Pour les 31 autres tables sans granulaire, voir Phase 2B
-- (création de policies granulaires + DROP allow_all).
--
-- ⚠️ TEST APRÈS APPLICATION :
--   - Login admin : dashboard, formations, clients, CRM, rapports
--   - Login trainer : ses sessions visibles
--   - Login client : son espace visible
--   - Login learner : ses formations visibles
--
-- Si une feature casse → c'est qu'un composant front fait du Supabase
-- direct via anon_key (au lieu de passer par une route API). Identifier
-- le composant et soit le migrer vers une route API, soit ajouter une
-- policy granulaire pour le rôle concerné.
--
-- ROLLBACK : recréer la policy permissive pour la table fautive :
--   CREATE POLICY "allow_all" ON <table> FOR ALL TO authenticated
--     USING (true) WITH CHECK (true);
-- ============================================================

-- 1-17. Tables avec policy nommée "allow_all"
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON activity_log;
DROP POLICY IF EXISTS "allow_all" ON clients;
DROP POLICY IF EXISTS "allow_all" ON contacts;
DROP POLICY IF EXISTS "allow_all" ON crm_campaigns;
DROP POLICY IF EXISTS "allow_all" ON crm_notifications;
DROP POLICY IF EXISTS "allow_all" ON crm_prospects;
DROP POLICY IF EXISTS "allow_all" ON crm_quotes;
DROP POLICY IF EXISTS "allow_all" ON crm_tags;
DROP POLICY IF EXISTS "allow_all" ON crm_tasks;
DROP POLICY IF EXISTS "allow_all" ON document_templates;
DROP POLICY IF EXISTS "allow_all" ON email_history;
DROP POLICY IF EXISTS "allow_all" ON email_templates;
DROP POLICY IF EXISTS "allow_all" ON enrollments;
DROP POLICY IF EXISTS "allow_all" ON learners;
DROP POLICY IF EXISTS "allow_all" ON programs;
DROP POLICY IF EXISTS "allow_all" ON sessions;
DROP POLICY IF EXISTS "allow_all" ON trainers;

-- 18-19. Tables avec autre nom de policy permissive (qual = true)
-- ============================================================
DROP POLICY IF EXISTS "quality_scores_read_all" ON quality_scores;
DROP POLICY IF EXISTS "questionnaire_sessions_admin_all" ON questionnaire_sessions;

-- ============================================================
-- Vérification (à exécuter après) :
--
-- 1. Confirme qu'aucune policy permissive ne reste sur ces tables :
--   SELECT tablename, policyname, qual
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND qual = 'true'
--     AND tablename IN (
--       'activity_log','clients','contacts','crm_campaigns',
--       'crm_notifications','crm_prospects','crm_quotes','crm_tags',
--       'crm_tasks','document_templates','email_history','email_templates',
--       'enrollments','learners','programs','quality_scores',
--       'questionnaire_sessions','sessions','trainers'
--     );
-- (devrait retourner 0 lignes)
--
-- 2. Test isolation cross-tenant :
--   SET ROLE authenticated;
--   -- Simuler un user de l'entité X qui essaye de lire l'entité Y
--   SELECT COUNT(*) FROM learners; -- ne doit retourner QUE les learners de son entity
--   RESET ROLE;
-- ============================================================
