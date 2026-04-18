-- ============================================================
-- Migration : Bucket Storage pour factures externes
-- À exécuter dans Supabase SQL Editor (pas via CLI migrations)
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "invoices_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'invoices');

CREATE POLICY "invoices_authenticated_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoices');

CREATE POLICY "invoices_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'invoices');
