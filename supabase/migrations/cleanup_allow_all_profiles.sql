-- ============================================================
-- Migration : Cleanup allow_all sur profiles (FINAL)
-- ============================================================
-- ⚠️ TABLE LA PLUS CRITIQUE de tout le système :
-- Le middleware Next.js lit profiles.role à CHAQUE request via le JWT user :
--   supabase.from("profiles").select("role").eq("id", user.id).single()
--
-- Si la policy `self_read` est absente quand on DROP allow_all,
-- → toutes les requêtes middleware échouent
-- → toute l'app retourne 500 ou redirige en boucle
--
-- Stratégie : CREATE les nouvelles policies AVANT le DROP de allow_all,
-- en gardant allow_all temporairement comme filet de sécurité.
-- Si tout fonctionne, lancer la 2ème partie pour DROP allow_all.
--
-- ⚠️ TEST APRÈS PARTIE 1 :
--   - Ouvrir l'app : login + navigation normale → OK car allow_all encore actif
--   - Vérifier que les nouvelles policies sont bien créées
--
-- ⚠️ TEST APRÈS PARTIE 2 :
--   - Login admin : navigation OK ?
--   - Page /admin/users : voir les autres users de l'entité ?
--   - Page /admin/profile : modifier son propre profil ?
--   - Login trainer/learner/client : accès à leur propre profil ?
--
-- ROLLBACK PARTIE 2 si problème :
--   CREATE POLICY "allow_all" ON profiles FOR ALL TO authenticated
--     USING (true) WITH CHECK (true);
-- ============================================================

-- ====================================================
-- PARTIE 1 : Créer les policies granulaires (allow_all conservé)
-- ====================================================
-- À ce stade, l'app continue de tourner avec allow_all.
-- On crée juste les policies "officielles" qui prendront le relais.

-- self_read : ABSOLUMENT CRITIQUE pour le middleware
DROP POLICY IF EXISTS "profiles_self_read" ON profiles;
CREATE POLICY "profiles_self_read" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- admin_read : voir les autres profils de son entité
DROP POLICY IF EXISTS "profiles_admin_read" ON profiles;
CREATE POLICY "profiles_admin_read" ON profiles
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND (
      entity_id = user_entity_id()
      OR user_role() = 'super_admin'  -- super_admin voit tout cross-entité
    )
  );

-- self_update : un user peut modifier son propre profil (avatar, phone, etc.)
-- ⚠️ Ne contrôle PAS la modification de role/entity_id côté DB.
-- Les routes API qui modifient ces champs doivent utiliser service_role
-- + check de rôle. Un trigger BEFORE UPDATE serait l'option robuste
-- (à ajouter dans une migration séparée si besoin).
DROP POLICY IF EXISTS "profiles_self_update" ON profiles;
CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- admin_update : admin/super_admin peut modifier les profils de son entité
DROP POLICY IF EXISTS "profiles_admin_update" ON profiles;
CREATE POLICY "profiles_admin_update" ON profiles
  FOR UPDATE TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND (
      entity_id = user_entity_id()
      OR user_role() = 'super_admin'
    )
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND (
      entity_id = user_entity_id()
      OR user_role() = 'super_admin'
    )
  );

-- admin_delete : admin/super_admin peut supprimer dans son entité
DROP POLICY IF EXISTS "profiles_admin_delete" ON profiles;
CREATE POLICY "profiles_admin_delete" ON profiles
  FOR DELETE TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND (
      entity_id = user_entity_id()
      OR user_role() = 'super_admin'
    )
  );

-- INSERT : créé via trigger handle_new_user (SECURITY DEFINER bypass RLS)
-- ou via /api/admin/users en service_role. Pas besoin de policy INSERT user.

-- ============================================================
-- ⏸ STOP ICI APRÈS PARTIE 1.
-- Vérifier dans Supabase :
--   SELECT policyname FROM pg_policies WHERE tablename = 'profiles';
-- → doit lister allow_all + les 5 nouvelles policies
--
-- Tester l'app brièvement (login + navigation).
-- Si tout va bien, exécuter la PARTIE 2 ci-dessous.
-- ============================================================

-- ====================================================
-- PARTIE 2 : DROP allow_all (à exécuter SÉPARÉMENT après test partie 1)
-- ====================================================
-- ⚠️ Décommenter et exécuter UNIQUEMENT après avoir vérifié que la
-- partie 1 est bien appliquée et que l'app fonctionne.

-- DROP POLICY IF EXISTS "allow_all" ON profiles;

-- ============================================================
-- Vérification finale (après partie 2) :
--
-- 1. Plus aucune policy permissive sur profiles :
--   SELECT policyname FROM pg_policies
--   WHERE tablename = 'profiles' AND qual = 'true';
-- (devrait retourner 0 lignes)
--
-- 2. Compte total restant sur toute la prod (cible : 0) :
--   SELECT tablename FROM pg_policies
--   WHERE schemaname = 'public' AND qual = 'true'
--     AND tablename NOT IN ('entities','learner_access_tokens','signing_tokens',
--                           'pappers_cache','training_domains');
-- ============================================================
