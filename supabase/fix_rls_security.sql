-- ============================================================
-- CORRECTION SÉCURITÉ — Empêcher l'auto-promotion de rôle
-- À exécuter dans Supabase SQL Editor
-- ============================================================
-- CONTEXTE : La policy "profiles_self_update" permet à un utilisateur
-- de modifier sa propre ligne sans restriction de colonnes.
-- Un apprenant peut donc faire : supabase.from('profiles').update({ role: 'admin' })
-- et se promouvoir administrateur.
--
-- SOLUTION : Restreindre les colonnes modifiables au niveau des privilèges
-- de colonne PostgreSQL. Le rôle `authenticated` ne peut plus toucher
-- `role` ni `entity_id`. Le `service_role` (API routes) bypasse RLS
-- et peut toujours tout modifier.
-- ============================================================

-- 1. Retirer tous les droits UPDATE sur profiles au rôle authenticated
REVOKE UPDATE ON profiles FROM authenticated;

-- 2. Ne re-donner que les colonnes "safe" (infos personnelles uniquement)
GRANT UPDATE (first_name, last_name, phone, avatar_url, address, updated_at) ON profiles TO authenticated;

-- ============================================================
-- VÉRIFICATION (facultatif) : exécuter cette requête pour confirmer
-- SELECT grantee, column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_name = 'profiles' AND privilege_type = 'UPDATE';
-- ============================================================
