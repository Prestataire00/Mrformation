-- ============================================================
-- Fix RLS prod : un formateur ne pouvait PAS lire sa propre fiche `trainers`
-- → espace /trainer cassé : « Profil formateur non configuré / non trouvé ».
--
-- Cause (diagnostiquée le 2026-06-19) : la policy entity-based de schema.sql
--   (trainers_trainer_read : entity_id = auth.user_entity_id())
-- référence des helpers dans le schéma `auth.*` qui, en PROD, renvoient NULL
-- (les helpers réellement déployés sont en `public.*`). `entity_id = NULL` est
-- toujours faux → 0 ligne pour TOUT formateur (vérifié empiriquement sur 2
-- formateurs de test, entités C3V et MR : 0 ligne visible dans `trainers`).
--
-- Fix robuste, SANS dépendre du helper d'entité : autoriser un formateur à lire
-- SA PROPRE fiche via profile_id = auth.uid() (exactement la requête de /trainer).
-- Additif (les policies SELECT sont combinées en OR) → n'enlève aucun accès
-- existant (admin/super_admin conservent trainers_admin_all).
--
-- À exécuter dans le SQL Editor du Dashboard Supabase (prod).
-- ============================================================

DROP POLICY IF EXISTS "trainers_trainer_read_own" ON trainers;
CREATE POLICY "trainers_trainer_read_own" ON trainers
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());
