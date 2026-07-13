-- ============================================================
-- MIGRATION : Intégration facturation électronique Abby
-- Feature : pont manuel LMS → Abby (connexions par entité,
-- liaison clients, suivi de push sur formation_invoices)
--
-- ⚠️ À exécuter dans le Supabase Dashboard AVANT de pousser le
-- code (AD-20). Rejouable sans erreur (idempotente).
--
-- ⚠️ entities.siret existe DÉJÀ en prod et porte les vrais SIRET
-- (add_invoice_auto_fields.sql : MR 91311329600036 ;
-- init_entity_c3v_formation.sql : C3V 98525216200021).
-- AUCUN UPDATE sur entities ici — le ADD COLUMN ci-dessous est
-- un no-op de sûreté pour les bases vierges.
-- Vérification post-exécution attendue :
--   SELECT slug, siret FROM entities;
--   → mr-formation = 91311329600036, c3v-formation = 98525216200021
-- ============================================================

-- 0. Sûreté base vierge (no-op en prod)
ALTER TABLE entities ADD COLUMN IF NOT EXISTS siret TEXT;

-- ============================================================
-- 1. Connexions Abby (une par entité, clé API chiffrée AES-256-GCM)
-- ============================================================
CREATE TABLE IF NOT EXISTS abby_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID UNIQUE NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  encrypted_api_key TEXT NOT NULL,
  key_iv TEXT NOT NULL,
  key_auth_tag TEXT NOT NULL,
  company_name TEXT,
  company_siret TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  connected_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- NB : pas de trigger updated_at — les services posent updated_at = NOW()
-- à chaque UPDATE (convention feature Abby).

ALTER TABLE abby_connections ENABLE ROW LEVEL SECURITY;

-- Accès admin (son entité) + super_admin (cross-entité : le gérant gère les
-- deux entités via le sélecteur ; l'isolation par entité active reste
-- garantie par resolveActiveEntityId dans chaque route — AD-3/AD-18).
-- Helpers en public.* (JAMAIS auth.*) — cf. HOTFIX_auth_helpers.sql.
DROP POLICY IF EXISTS "abby_connections_admin" ON abby_connections;
CREATE POLICY "abby_connections_admin" ON abby_connections
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'super_admin'
    OR (public.user_role() = 'admin' AND entity_id = public.user_entity_id())
  )
  WITH CHECK (
    public.user_role() = 'super_admin'
    OR (public.user_role() = 'admin' AND entity_id = public.user_entity_id())
  );

-- ============================================================
-- 2. Liaisons Client facturé (polymorphe) ↔ client Abby
-- ============================================================
CREATE TABLE IF NOT EXISTS abby_customer_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('learner', 'company', 'financier')),
  recipient_id UUID NOT NULL,
  abby_customer_id TEXT NOT NULL,
  abby_customer_type TEXT NOT NULL CHECK (abby_customer_type IN ('contact', 'organization')),
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, recipient_type, recipient_id)
);

ALTER TABLE abby_customer_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "abby_customer_links_admin" ON abby_customer_links;
CREATE POLICY "abby_customer_links_admin" ON abby_customer_links
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'super_admin'
    OR (public.user_role() = 'admin' AND entity_id = public.user_entity_id())
  )
  WITH CHECK (
    public.user_role() = 'super_admin'
    OR (public.user_role() = 'admin' AND entity_id = public.user_entity_id())
  );

-- ============================================================
-- 3. Suivi de push sur formation_invoices (colonnes additives)
-- reference / external_reference / status restent intouchées (FR-20)
-- ============================================================
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS abby_invoice_id TEXT;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS abby_invoice_number TEXT;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS abby_push_state TEXT
  CHECK (abby_push_state IN ('pushing', 'draft_created', 'lines_set', 'details_set', 'finalized'));
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS abby_push_locked_at TIMESTAMPTZ;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS abby_state TEXT;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS abby_pushed_at TIMESTAMPTZ;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS abby_finalized_at TIMESTAMPTZ;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS abby_paid_at TIMESTAMPTZ;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS abby_synced_at TIMESTAMPTZ;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS abby_last_error TEXT;

-- Anti-doublon (FR-11) : une facture LMS = au plus une facture Abby.
-- Index unique partiel : autorise les NULL multiples, sert aussi d'index
-- de lookup par abby_invoice_id (pas d'index additionnel nécessaire).
CREATE UNIQUE INDEX IF NOT EXISTS uq_formation_invoices_abby_invoice_id
  ON formation_invoices (abby_invoice_id) WHERE abby_invoice_id IS NOT NULL;

-- ============================================================
-- Vérifications post-exécution (à lancer manuellement) :
--   SELECT slug, siret FROM entities;
--   SELECT COUNT(*) FROM abby_connections;        -- 0
--   SELECT COUNT(*) FROM abby_customer_links;     -- 0
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'formation_invoices' AND column_name LIKE 'abby_%';  -- 10 lignes
-- ============================================================
