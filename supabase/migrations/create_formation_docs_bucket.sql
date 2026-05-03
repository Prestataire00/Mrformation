-- ============================================================
-- Migration : Créer le bucket Storage "formation-docs"
-- ============================================================
-- Le bucket héberge les modèles .docx uploadés par les admins
-- depuis /admin/documents (page templates de documents).
--
-- Path convention : templates/{entity_id}/{uuid}.docx
--
-- Le bucket est PUBLIC en lecture (les URLs `getPublicUrl()` doivent
-- être accessibles sans auth pour permettre la conversion CloudConvert
-- + le download depuis l'éditeur). L'upload se fait via service_role
-- (bypass RLS) côté API route /api/documents/upload-template.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('formation-docs', 'formation-docs', true)
ON CONFLICT (id) DO NOTHING;

-- Lecture publique (nécessaire pour getPublicUrl + CloudConvert fetch)
DROP POLICY IF EXISTS "formation-docs public read" ON storage.objects;
CREATE POLICY "formation-docs public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'formation-docs');

-- Upload réservé aux admins (le service_role bypass de toute façon,
-- mais cette policy permet aussi l'upload via anon_key si jamais
-- on en avait besoin côté client, par exemple pour un éditeur drag&drop).
DROP POLICY IF EXISTS "formation-docs admin write" ON storage.objects;
CREATE POLICY "formation-docs admin write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'formation-docs'
    AND user_role() IN ('admin', 'super_admin')
  );

-- Suppression réservée aux admins
DROP POLICY IF EXISTS "formation-docs admin delete" ON storage.objects;
CREATE POLICY "formation-docs admin delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'formation-docs'
    AND user_role() IN ('admin', 'super_admin')
  );

-- ============================================================
-- Vérification :
--   SELECT id, public FROM storage.buckets WHERE id = 'formation-docs';
--   SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'formation-docs%';
-- ============================================================
