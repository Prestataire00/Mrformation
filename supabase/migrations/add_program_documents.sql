-- ============================================================
-- Migration : Supports de cours attachés au programme
-- ============================================================
-- SPEC spec-program-supports-docs-partages.
--
-- Modèle SOURCE UNIQUE : les supports pédagogiques sont stockés une seule
-- fois au niveau du PROGRAMME (table `program_documents`). Ils sont ensuite
-- affichés par jointure à la lecture (aucune duplication, rétroactif) dans :
--   • l'onglet « Docs partagés » de chaque session liée au programme (admin)
--   • le portail apprenant des stagiaires de ces sessions
--
-- Fichiers stockés dans le bucket public existant `formation-docs`
-- (chemin `programs/{program_id}/…`).
--
-- RLS multi-tenant via `public.user_role()` / `public.user_entity_id()`
-- (helpers en schéma `public`, cf. aut-prog-b-fix-rls-programs.sql ; les
-- helpers `auth.*` sont verrouillés côté Supabase hébergé).
--
-- 100 % IDEMPOTENT (CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS).
-- À exécuter manuellement dans Supabase Dashboard SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS program_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_program_documents_program ON program_documents(program_id);
CREATE INDEX IF NOT EXISTS idx_program_documents_entity ON program_documents(entity_id);

ALTER TABLE program_documents ENABLE ROW LEVEL SECURITY;

-- ── Écriture : admin (son entité) + super_admin (cross-entité) ──
DROP POLICY IF EXISTS "program_documents_admin_all" ON program_documents;
CREATE POLICY "program_documents_admin_all" ON program_documents
  FOR ALL TO authenticated
  USING (public.user_role() = 'admin' AND entity_id = public.user_entity_id())
  WITH CHECK (public.user_role() = 'admin' AND entity_id = public.user_entity_id());

DROP POLICY IF EXISTS "program_documents_super_admin_all" ON program_documents;
CREATE POLICY "program_documents_super_admin_all" ON program_documents
  FOR ALL TO authenticated
  USING (public.user_role() = 'super_admin')
  WITH CHECK (public.user_role() = 'super_admin');

-- ── Lecture : trainer / client / learner de l'entité (supports hérités) ──
DROP POLICY IF EXISTS "program_documents_member_read" ON program_documents;
CREATE POLICY "program_documents_member_read" ON program_documents
  FOR SELECT TO authenticated
  USING (
    public.user_role() IN ('trainer', 'client', 'learner')
    AND entity_id = public.user_entity_id()
  );

-- ============================================================
-- Vérification :
--   SELECT e.slug, COUNT(*) FROM program_documents d
--     JOIN entities e ON e.id = d.entity_id GROUP BY e.slug;
-- ============================================================
