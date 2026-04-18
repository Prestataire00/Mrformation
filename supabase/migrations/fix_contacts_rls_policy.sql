-- ============================================================
-- Fix : Policy SELECT manquante sur contacts
-- Cause : jointure clients + contacts retournait 0 résultats
-- ============================================================

-- Ajouter la policy si elle n'existe pas déjà
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contacts' AND policyname = 'contacts_entity_read'
  ) THEN
    CREATE POLICY "contacts_entity_read" ON contacts
      FOR SELECT TO authenticated
      USING (
        client_id IN (
          SELECT id FROM clients
          WHERE entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())
        )
      );
  END IF;
END $$;
