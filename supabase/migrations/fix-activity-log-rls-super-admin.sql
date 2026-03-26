-- ============================================================
-- Migration: Corriger RLS activity_log pour super_admin
-- L'ancienne policy utilisait public.user_role() = 'admin'
-- ce qui excluait super_admin. On accepte maintenant les deux rôles.
-- ============================================================

DROP POLICY IF EXISTS "activity_log_admin_all" ON activity_log;
CREATE POLICY "activity_log_admin_all" ON activity_log
  FOR ALL TO authenticated
  USING (
    public.user_role() IN ('super_admin', 'admin')
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() IN ('super_admin', 'admin')
    AND entity_id = public.user_entity_id()
  );
