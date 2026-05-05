-- ============================================================
-- Migration : Créer le bucket Storage "organization-assets"
-- ============================================================
-- Bug client : impossible d'uploader le logo / tampon / signature dans
-- /admin/settings/organization (page Identité visuelle).
-- Cause : le bucket n'a jamais été créé en prod.
--
-- Path convention : {entity_id}/{field}-{timestamp}.{ext}
-- Ex: a1b2c3.../logo_url-1714900000.png
--
-- Le bucket est PUBLIC en lecture (les logos doivent s'afficher dans les
-- PDFs générés et l'UI publique sans auth).
-- L'upload est réservé aux admins authentifiés.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('organization-assets', 'organization-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Lecture publique (nécessaire pour afficher les logos dans les PDFs/web)
DROP POLICY IF EXISTS "organization-assets public read" ON storage.objects;
CREATE POLICY "organization-assets public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'organization-assets');

-- Upload réservé aux admins authentifiés
DROP POLICY IF EXISTS "organization-assets admin upload" ON storage.objects;
CREATE POLICY "organization-assets admin upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'organization-assets'
    AND public.user_role() IN ('admin', 'super_admin')
  );

-- Update (upsert) réservé aux admins
DROP POLICY IF EXISTS "organization-assets admin update" ON storage.objects;
CREATE POLICY "organization-assets admin update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'organization-assets'
    AND public.user_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    bucket_id = 'organization-assets'
    AND public.user_role() IN ('admin', 'super_admin')
  );

-- Delete réservé aux admins
DROP POLICY IF EXISTS "organization-assets admin delete" ON storage.objects;
CREATE POLICY "organization-assets admin delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'organization-assets'
    AND public.user_role() IN ('admin', 'super_admin')
  );

-- ============================================================
-- Vérification :
--   SELECT id, public FROM storage.buckets WHERE id = 'organization-assets';
--   SELECT policyname FROM pg_policies
--     WHERE tablename = 'objects' AND policyname LIKE 'organization-assets%';
-- ============================================================
