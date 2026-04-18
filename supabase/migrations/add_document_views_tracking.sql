-- ============================================================
-- Migration : Tracking consultation documents (Qualiopi critère 14)
-- ============================================================

CREATE TABLE IF NOT EXISTS document_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL,
  document_type TEXT NOT NULL,
  viewer_type TEXT NOT NULL CHECK (viewer_type IN ('learner', 'client', 'trainer', 'admin')),
  viewer_id UUID NOT NULL,
  viewer_email TEXT,
  ip_address INET,
  user_agent TEXT,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  view_duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_document_views_doc ON document_views(document_id, document_type);
CREATE INDEX IF NOT EXISTS idx_document_views_viewer ON document_views(viewer_type, viewer_id);
CREATE INDEX IF NOT EXISTS idx_document_views_session ON document_views(session_id);
CREATE INDEX IF NOT EXISTS idx_document_views_entity ON document_views(entity_id);

ALTER TABLE document_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_views_entity_access" ON document_views
  FOR ALL TO authenticated
  USING (
    entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "document_views_public_insert" ON document_views
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);
