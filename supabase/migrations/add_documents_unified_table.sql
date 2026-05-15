-- ============================================================
-- Migration : Table `documents` unifiée (refonte Documents — Story B1)
-- ============================================================
-- Cf bmad_output/planning-artifacts/prd-documents.md §9.1.
--
-- Cette table remplacera progressivement les 5 tables fragmentées :
--   - generated_documents (minimal, pas de status)
--   - formation_convention_documents (riche)
--   - signatures (audit signature)
--   - quote_signatures (signature devis)
--   - trainer_documents (à évaluer)
--
-- Stratégie : la nouvelle table coexiste avec les anciennes. Pendant la
-- migration, le nouveau code applicatif écrit dans `documents`. Les anciennes
-- tables sont conservées 90j en lecture seule pour permettre le rollback,
-- puis droppées en Lot E.
--
-- Idempotente : CREATE TABLE IF NOT EXISTS + contraintes UNIQUE protégées
-- par vérification pg_constraint.
-- ============================================================

-- ── 1. Table documents ──
CREATE TABLE IF NOT EXISTS documents (
  -- Identifiants
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Typologie
  -- doc_type : free-form pour permettre l'ajout de nouveaux types Loris sans
  -- migration de schéma (sera contraint applicativement via une enum TS).
  doc_type TEXT NOT NULL,
  template_id UUID REFERENCES document_templates(id) ON DELETE SET NULL,

  -- Source (la donnée qui a généré le doc)
  source_table TEXT NOT NULL CHECK (source_table IN (
    'sessions', 'crm_quotes', 'crm_invoices', 'enrollments', 'formation_invoices'
  )),
  source_id UUID NOT NULL,

  -- Propriétaire (à qui s'adresse le doc)
  -- Optional : convention_entreprise → owner=company, attestation → owner=learner, etc.
  owner_type TEXT CHECK (owner_type IS NULL OR owner_type IN (
    'session', 'learner', 'company', 'trainer', 'client', 'financier'
  )),
  owner_id UUID,

  -- Fichier
  file_url TEXT,
  file_size INTEGER,
  file_hash TEXT,                            -- SHA-256, pour cache invalidation

  -- État
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft', 'generated', 'sent', 'signed', 'cancelled')),

  -- Workflow timestamps
  generated_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,

  -- Signature électronique (audit trail complet pour Qualiopi)
  signed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  signature_data TEXT,                       -- SVG sanitize
  signature_ip INET,
  signature_user_agent TEXT,
  signature_method TEXT CHECK (signature_method IS NULL OR signature_method IN (
    'canvas_inline', 'token_public', 'qualified_eidas'
  )),
  signature_token TEXT,                      -- token public pour flux email
  signature_token_expires_at TIMESTAMPTZ,

  -- Métadonnées
  metadata JSONB,                            -- contexte de génération (variables, options PDF)

  -- Audit
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Indexes ──
-- Index pour la défense en profondeur (RLS + filter)
CREATE INDEX IF NOT EXISTS idx_documents_entity_status
  ON documents (entity_id, status);

-- Index pour retrouver les documents d'une source (ex : tous les docs d'une session)
CREATE INDEX IF NOT EXISTS idx_documents_source
  ON documents (source_table, source_id);

-- Index pour lookup public via token de signature
CREATE INDEX IF NOT EXISTS idx_documents_signature_token
  ON documents (signature_token)
  WHERE signature_token IS NOT NULL;

-- Index sur file_hash pour dédoublonnage éventuel
CREATE INDEX IF NOT EXISTS idx_documents_file_hash
  ON documents (file_hash)
  WHERE file_hash IS NOT NULL;

-- ── 3. Contrainte UNIQUE composite (anti-doublon) ──
-- Empêche d'avoir 2 documents identiques (même entité, même source, même type,
-- même propriétaire). Utile pour idempotence des INSERTs.
-- NB : owner_type et owner_id sont nullables → on les coalesce pour permettre
-- le UNIQUE sur (NULL, NULL) (un seul doc par source sans owner).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_unique_source_owner'
  ) THEN
    -- On crée un UNIQUE sur une expression : utilise COALESCE pour traiter NULL
    -- comme une valeur égale à elle-même. C'est l'astuce standard PostgreSQL.
    CREATE UNIQUE INDEX documents_unique_source_owner ON documents (
      entity_id,
      source_table,
      source_id,
      doc_type,
      COALESCE(owner_type, ''),
      COALESCE(owner_id::text, '')
    );
  END IF;
END $$;

-- ── 4. RLS entity_isolation ──
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_isolation" ON documents;
CREATE POLICY "entity_isolation" ON documents
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));

-- ── 5. Trigger updated_at ──
-- Met à jour updated_at automatiquement sur chaque UPDATE.
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_documents_updated_at();

-- ── 6. Vérification ──
SELECT
  (SELECT to_regclass('public.documents')) AS table_documents_existe,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'documents') AS nb_colonnes,
  (SELECT COUNT(*) FROM pg_indexes
     WHERE tablename = 'documents') AS nb_indexes,
  (SELECT COUNT(*) FROM pg_policies
     WHERE tablename = 'documents') AS nb_rls_policies;
-- Attendu : table_documents_existe = 'documents', nb_colonnes ≥ 24,
-- nb_indexes ≥ 4, nb_rls_policies ≥ 1.
