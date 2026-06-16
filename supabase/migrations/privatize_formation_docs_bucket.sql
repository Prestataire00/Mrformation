-- ============================================================
-- RGPD Lot B — Task 4 : privatiser le bucket formation-docs
-- ============================================================
-- ⚠️ ORDRE CRITIQUE : à exécuter dans Supabase Dashboard SEULEMENT APRÈS que
-- le code de signed-URL (PR #265 : endpoint /api/storage/signed-url + bascule
-- des téléchargements) soit DÉPLOYÉ EN PROD. Sinon les téléchargements basés
-- sur getPublicUrl casseraient immédiatement.
--
-- Un signed-URL fonctionne sur un bucket privé comme public : une fois le code
-- live, privatiser ne casse rien (et bloque l'accès public permanent — RGPD).
-- ============================================================

UPDATE storage.buckets SET public = false WHERE id = 'formation-docs';

DROP POLICY IF EXISTS "formation-docs public read" ON storage.objects;

-- Lecture restreinte aux utilisateurs authentifiés (le contrôle fin rôle+entité
-- est fait par l'endpoint /api/storage/signed-url qui génère les liens).
DROP POLICY IF EXISTS "formation-docs auth read" ON storage.objects;
CREATE POLICY "formation-docs auth read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'formation-docs');

-- ============================================================
-- Vérifications (après) :
--   SELECT public FROM storage.buckets WHERE id = 'formation-docs';  -- false
--   -- Un téléchargement via l'UI (qui passe par /api/storage/signed-url) doit
--   -- toujours fonctionner ; une URL publique directe doit renvoyer 400/403.
-- ============================================================
