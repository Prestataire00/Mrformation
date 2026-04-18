-- ============================================================
-- Fix : RLS formation_evaluation_assignments — policies séparées
-- ============================================================

DROP POLICY IF EXISTS "fea_entity_access" ON formation_evaluation_assignments;

CREATE POLICY "fea_entity_read" ON formation_evaluation_assignments
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT s.id FROM sessions s
      WHERE s.entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "fea_entity_insert" ON formation_evaluation_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT s.id FROM sessions s
      WHERE s.entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "fea_entity_update" ON formation_evaluation_assignments
  FOR UPDATE TO authenticated
  USING (
    session_id IN (
      SELECT s.id FROM sessions s
      WHERE s.entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "fea_entity_delete" ON formation_evaluation_assignments
  FOR DELETE TO authenticated
  USING (
    session_id IN (
      SELECT s.id FROM sessions s
      WHERE s.entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())
    )
  );
