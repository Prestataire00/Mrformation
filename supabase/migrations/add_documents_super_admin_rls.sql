-- ════════════════════════════════════════════════════════════════════════
-- FIX : super_admin cross-entité sur la table `documents`
-- ════════════════════════════════════════════════════════════════════════
--
-- Problème : la table unifiée `documents` (add_documents_unified_table.sql) n'a
-- qu'une policy "entity_isolation" :
--     USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()))
-- Comme c'est une policy FOR ALL sans WITH CHECK dédié, l'insert exige
-- entity_id = entity_id DU PROFIL. Un super_admin (cross-entité par design,
-- dont profiles.entity_id = SON entité home) ne peut donc PAS créer/lire/modifier
-- les documents d'une formation appartenant à une AUTRE entité.
--
-- Symptôme : « Impossible de créer les documents par défaut » sur l'onglet
-- Documents d'une formation d'une autre entité (ex. super_admin home=C3V
-- ouvrant une formation MR FORMATION). La table `documents` avait été créée
-- dans une migration séparée et n'a jamais reçu la policy `super_admin_all`
-- que HOTFIX_auth_helpers.sql a posée sur sessions/clients/learners/etc.
--
-- Fix : ajoute la policy `documents_super_admin_all` (même pattern que
-- HOTFIX_auth_helpers.sql). Les policies sont OR'd : la policy entity_isolation
-- continue de scoper les admins normaux ; super_admin obtient l'accès complet.
--
-- ⚠ Helper en `public` (pas `auth`) : public.user_role() (cf mémoire RLS prod).
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "documents_super_admin_all" ON documents;
CREATE POLICY "documents_super_admin_all" ON documents
  FOR ALL TO authenticated
  USING (public.user_role() = 'super_admin')
  WITH CHECK (public.user_role() = 'super_admin');

-- Vérification (optionnel) :
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'documents';
--   -> doit lister "entity_isolation" ET "documents_super_admin_all".
