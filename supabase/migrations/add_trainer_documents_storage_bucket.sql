-- ============================================================
-- Migration : Bucket Storage pour documents/CV formateurs
-- À exécuter dans Supabase SQL Editor (pas via CLI migrations)
--
-- Contexte : retour Loris "Erreur lors de l'ajout de document sur le
-- formateur" + "Erreur lors du remplacement d'un CV". La cause racine
-- probable est l'absence du bucket `elearning-documents` en prod (la
-- migration `add-elearning-courses.sql:162` avait laissé la création
-- en commentaire) OU l'absence de Storage Policies autorisant l'upload
-- pour le rôle authenticated.
--
-- Cette migration est IDEMPOTENTE : ON CONFLICT DO NOTHING sur le
-- bucket, et DROP POLICY IF EXISTS avant chaque CREATE POLICY.
-- Pattern aligné sur `add_invoices_storage_bucket.sql`.
-- ============================================================

-- ── Bucket privé `elearning-documents` ──────────────────────────────
-- Utilisé pour :
--   - trainer_documents (admin upload via /admin/trainers/[id])
--   - CV formateurs (/api/trainers/[id]/cv)
--   - trainer_courses files (e-learning content uploadé par formateurs)
-- Privé : accès via signed URL uniquement (cf routes /api/trainer/.../file-url
-- et /api/trainers/[id]/cv/url).
INSERT INTO storage.buckets (id, name, public)
VALUES ('elearning-documents', 'elearning-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ── Storage Policies ────────────────────────────────────────────────

-- SELECT : tout authenticated peut lire (la sécurité fine est gérée
-- par la route serveur qui génère la signed URL après vérif d'accès
-- à la row metier — trainer_documents / trainers / trainer_courses).
DROP POLICY IF EXISTS "elearning-documents authenticated read" ON storage.objects;
CREATE POLICY "elearning-documents authenticated read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'elearning-documents');

-- INSERT : admin/super_admin/commercial/trainer (rôles autorisés à
-- uploader des docs trainer / CV / cours).
DROP POLICY IF EXISTS "elearning-documents authenticated upload" ON storage.objects;
CREATE POLICY "elearning-documents authenticated upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'elearning-documents'
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) IN ('admin', 'super_admin', 'commercial', 'trainer')
  );

-- UPDATE (upsert) : idem INSERT, pour autoriser le remplacement de CV
-- (path déterministe `trainers/cv/cv-<id>.pdf` avec upsert: true).
DROP POLICY IF EXISTS "elearning-documents authenticated update" ON storage.objects;
CREATE POLICY "elearning-documents authenticated update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'elearning-documents'
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) IN ('admin', 'super_admin', 'commercial', 'trainer')
  )
  WITH CHECK (
    bucket_id = 'elearning-documents'
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) IN ('admin', 'super_admin', 'commercial', 'trainer')
  );

-- DELETE : admin/super_admin/commercial/trainer (purge de docs/CV
-- via handleDelete dans la fiche formateur ou la route API).
DROP POLICY IF EXISTS "elearning-documents authenticated delete" ON storage.objects;
CREATE POLICY "elearning-documents authenticated delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'elearning-documents'
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) IN ('admin', 'super_admin', 'commercial', 'trainer')
  );

-- ============================================================
-- Vérifications post-exécution :
-- 1. Bucket existe et est privé :
--      SELECT id, name, public FROM storage.buckets WHERE id = 'elearning-documents';
--    Attendu : 1 row avec public = false.
--
-- 2. Policies créées :
--      SELECT policyname FROM pg_policies WHERE schemaname = 'storage'
--      AND tablename = 'objects' AND policyname LIKE 'elearning-documents%';
--    Attendu : 4 policies (read/upload/update/delete).
--
-- 3. Test upload super_admin (Loris) :
--    Se connecter en super_admin, aller sur /admin/trainers/<id>,
--    onglet Documents, uploader un PDF → succès sans erreur.
-- ============================================================
