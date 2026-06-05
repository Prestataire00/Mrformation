-- ============================================================
-- Pédagogie V2 Epic 2.5 — TASK 11
-- Migration : Bucket Storage privé `learner-credentials`
-- À exécuter dans Supabase SQL Editor.
--
-- Contexte : stocke les PDFs récapitulatifs d'identifiants de
-- connexion générés par le bulk import apprenants (cf
-- `learner-credentials-pdf.ts` + route bulk de l'Epic).
--
-- Sécurité :
--  - Bucket privé (public = false) → accès uniquement via signed URL.
--  - RLS : seuls les admin/super_admin de l'entité créatrice peuvent
--    lire/écrire/supprimer (le path encode `<entity_id>/<session_id>/...`
--    et on extrait `entity_id` du premier segment via split_part).
--  - TTL signed URL côté code : 24h.
--  - Suppression manuelle ou via cron : ces PDFs contiennent des
--    mots de passe temporaires en clair, ne doivent PAS persister.
--
-- Migration idempotente : ON CONFLICT DO NOTHING + DROP POLICY IF EXISTS.
-- Pattern aligné sur `add_trainer_documents_storage_bucket.sql` et
-- `create_formation_docs_bucket.sql`.
-- ============================================================

-- ── Bucket privé `learner-credentials` ───────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('learner-credentials', 'learner-credentials', false)
ON CONFLICT (id) DO NOTHING;

-- ── Storage Policies ─────────────────────────────────────────
-- Les RLS utilisent les helpers `public.user_role()` et
-- `public.user_entity_id()` (cf MEMORY note feedback_rls_helpers_public_not_auth).
--
-- Le path Storage est `<entity_id>/<session_id>/credentials_<timestamp>.pdf`,
-- donc `split_part(name, '/', 1)::uuid` extrait l'entity_id pour la
-- comparaison RLS multi-tenant.

-- SELECT : admin/super_admin de l'entité propriétaire.
DROP POLICY IF EXISTS "learner-credentials admin read" ON storage.objects;
CREATE POLICY "learner-credentials admin read" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'learner-credentials'
    AND public.user_role() IN ('admin', 'super_admin')
    AND split_part(name, '/', 1)::uuid = public.user_entity_id()
  );

-- INSERT : admin/super_admin de l'entité propriétaire.
-- (En pratique l'upload se fait via service_role qui bypass RLS, mais
-- cette policy permet de sécuriser tout upload futur en session admin.)
DROP POLICY IF EXISTS "learner-credentials admin insert" ON storage.objects;
CREATE POLICY "learner-credentials admin insert" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'learner-credentials'
    AND public.user_role() IN ('admin', 'super_admin')
    AND split_part(name, '/', 1)::uuid = public.user_entity_id()
  );

-- UPDATE : admin/super_admin de l'entité (peu probable car les PDFs
-- ne sont pas modifiés, mais on garde pour cohérence).
DROP POLICY IF EXISTS "learner-credentials admin update" ON storage.objects;
CREATE POLICY "learner-credentials admin update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'learner-credentials'
    AND public.user_role() IN ('admin', 'super_admin')
    AND split_part(name, '/', 1)::uuid = public.user_entity_id()
  )
  WITH CHECK (
    bucket_id = 'learner-credentials'
    AND public.user_role() IN ('admin', 'super_admin')
    AND split_part(name, '/', 1)::uuid = public.user_entity_id()
  );

-- DELETE : admin/super_admin (purge manuelle ou cron RGPD).
DROP POLICY IF EXISTS "learner-credentials admin delete" ON storage.objects;
CREATE POLICY "learner-credentials admin delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'learner-credentials'
    AND public.user_role() IN ('admin', 'super_admin')
    AND split_part(name, '/', 1)::uuid = public.user_entity_id()
  );

-- ============================================================
-- Vérifications post-exécution :
-- 1. Bucket existe et est privé :
--      SELECT id, name, public FROM storage.buckets
--      WHERE id = 'learner-credentials';
--    Attendu : 1 row, public = false.
--
-- 2. Policies créées :
--      SELECT policyname FROM pg_policies
--      WHERE schemaname = 'storage' AND tablename = 'objects'
--      AND policyname LIKE 'learner-credentials%';
--    Attendu : 4 policies (read/insert/update/delete).
--
-- 3. Test signed URL depuis une session admin :
--    Vérifier que GET sur la signed URL retourne 200 + le PDF.
-- ============================================================
