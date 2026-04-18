-- ============================================================
-- Migration : RLS sur tables critiques manquantes
-- ============================================================

-- 1. affacturage_lot_invoices
ALTER TABLE affacturage_lot_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affacturage_lot_invoices_entity_access" ON affacturage_lot_invoices
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM affacturage_lots al
      JOIN profiles p ON p.entity_id = al.entity_id
      WHERE al.id = affacturage_lot_invoices.lot_id
      AND p.id = auth.uid()
    )
  );

-- 2. questionnaire_sessions
ALTER TABLE questionnaire_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questionnaire_sessions_entity_access" ON questionnaire_sessions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.entity_id = s.entity_id
      WHERE s.id = questionnaire_sessions.session_id
      AND p.id = auth.uid()
    )
  );

-- 3. signing_tokens — lecture publique (page /sign/{token}), ecriture authentifiée
ALTER TABLE signing_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signing_tokens_public_read" ON signing_tokens
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "signing_tokens_authenticated_all" ON signing_tokens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.entity_id = signing_tokens.entity_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.entity_id = signing_tokens.entity_id
    )
  );
