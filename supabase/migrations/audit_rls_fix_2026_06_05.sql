-- =============================================================================
-- Audit RLS multi-tenant LMS du 2026-06-05 — VERSION CORRIGÉE 2026-06-06
-- =============================================================================
-- Fix les tables à risque résiduel post-cleanup phase 2 (mai 2026).
--
-- ⚠ POST-MORTEM IMPORTANT — VERSION INITIALE INVALIDE :
-- ----------------------------------------------------------------------------
-- L'audit Workflow (BMAD adversarial) du 2026-06-05 avait identifié 10 tables
-- à risque. Après tentative d'exécution en prod, vérification croisée avec le
-- code source du repo montre que 8 sur 10 étaient des HALLUCINATIONS des
-- agents d'audit — des noms plausibles inventés pour le sous-système
-- CRM/Finance/Infra mais qui n'existent NULLE PART dans le schéma.
--
-- Tables hallucinées (n'existent ni dans schema.sql, ni dans aucune migration) :
--   - sellsy_company_mappings, sellsy_contact_mappings → en réalité Sellsy est
--     géré via colonnes JSONB sur clients/contacts existants
--   - payment_methods, credit_notes, factoring_states → pas de modèle
--     comptable séparé en V1, tout vit dans formation_invoices /
--     formation_invoice_lines / affacturage_*
--   - opportunities → en réalité crm_prospects + crm_quotes
--   - automation_runs → en réalité crm_automation_logs +
--     session_automation_logs
--   - oauth_tokens → en réalité gmail_connections (déjà scoped par entity_id)
--
-- Tables vraiment à risque (vérifiées dans le code) :
--   ✓ elearning_global_flashcards (defined in add-elearning-v2.sql + schema.sql)
--   ✓ generated_documents (schema.sql:305)
--
-- L'audit aurait dû couvrir aussi : crm_prospects, crm_quotes,
-- formation_invoices, formation_charges, gmail_connections, et les autres
-- vraies tables CRM. C'est une todo pour V1.1 (audit RLS round 2 avec
-- inventaire pg_tables réel, pas inféré).
-- ----------------------------------------------------------------------------
--
-- Helpers utilisés : public.user_role(), public.user_entity_id()
--   (SANS préfixe auth.* — cf. memory feedback_rls_helpers_public_not_auth)
--
-- Idempotent + safe : chaque bloc est wrap dans DO $$ ... IF EXISTS ... $$
-- pour ne PAS échouer si la table cible n'existe pas en prod (cas de
-- elearning_global_flashcards si la migration add-elearning-v2.sql n'a
-- jamais été exécutée).
--
-- Référence : docs/audit-rls-2026-06-05.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. elearning_global_flashcards : ajout filtre entity_id (si table existe)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'elearning_global_flashcards'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "elearning_global_flashcards_admin_select" ON public.elearning_global_flashcards';
    EXECUTE 'DROP POLICY IF EXISTS "elearning_global_flashcards_admin_modify" ON public.elearning_global_flashcards';
    EXECUTE 'DROP POLICY IF EXISTS "elearning_global_flashcards_select" ON public.elearning_global_flashcards';
    EXECUTE 'DROP POLICY IF EXISTS "elearning_global_flashcards_modify" ON public.elearning_global_flashcards';
    EXECUTE 'DROP POLICY IF EXISTS "allow_all" ON public.elearning_global_flashcards';

    EXECUTE $POL$
      CREATE POLICY "elearning_global_flashcards_select" ON public.elearning_global_flashcards
        FOR SELECT TO authenticated
        USING (
          entity_id = public.user_entity_id()
          OR public.user_role() = 'super_admin'
        )
    $POL$;

    EXECUTE $POL$
      CREATE POLICY "elearning_global_flashcards_modify" ON public.elearning_global_flashcards
        FOR ALL TO authenticated
        USING (
          public.user_role() IN ('admin', 'super_admin')
          AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
        )
        WITH CHECK (
          public.user_role() IN ('admin', 'super_admin')
          AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
        )
    $POL$;

    RAISE NOTICE 'elearning_global_flashcards : RLS policies appliquées';
  ELSE
    RAISE NOTICE 'elearning_global_flashcards : table absente — skip (OK)';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. generated_documents : ajout check entity_id direct + via session FK
--    Pré-requis : la colonne entity_id existe sur generated_documents.
--    Si elle n'existe pas, la policy passe quand même via le EXISTS sessions.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  has_entity_id_col BOOLEAN;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'generated_documents'
  ) THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'generated_documents'
        AND column_name = 'entity_id'
    ) INTO has_entity_id_col;

    EXECUTE 'DROP POLICY IF EXISTS "generated_documents_via_session" ON public.generated_documents';
    EXECUTE 'DROP POLICY IF EXISTS "generated_documents_select" ON public.generated_documents';
    EXECUTE 'DROP POLICY IF EXISTS "generated_documents_modify" ON public.generated_documents';
    EXECUTE 'DROP POLICY IF EXISTS "allow_all" ON public.generated_documents';

    IF has_entity_id_col THEN
      -- Cas idéal : entity_id direct disponible + fallback FK sessions
      EXECUTE $POL$
        CREATE POLICY "generated_documents_select" ON public.generated_documents
          FOR SELECT TO authenticated
          USING (
            public.user_role() = 'super_admin'
            OR entity_id = public.user_entity_id()
            OR EXISTS (
              SELECT 1 FROM public.sessions s
              WHERE s.id = generated_documents.session_id
                AND s.entity_id = public.user_entity_id()
            )
          )
      $POL$;

      EXECUTE $POL$
        CREATE POLICY "generated_documents_modify" ON public.generated_documents
          FOR ALL TO authenticated
          USING (
            public.user_role() IN ('admin', 'super_admin', 'trainer')
            AND (
              public.user_role() = 'super_admin'
              OR entity_id = public.user_entity_id()
              OR EXISTS (
                SELECT 1 FROM public.sessions s
                WHERE s.id = generated_documents.session_id
                  AND s.entity_id = public.user_entity_id()
              )
            )
          )
          WITH CHECK (
            public.user_role() IN ('admin', 'super_admin', 'trainer')
            AND (
              public.user_role() = 'super_admin'
              OR entity_id = public.user_entity_id()
              OR EXISTS (
                SELECT 1 FROM public.sessions s
                WHERE s.id = generated_documents.session_id
                  AND s.entity_id = public.user_entity_id()
              )
            )
          )
      $POL$;

      RAISE NOTICE 'generated_documents : RLS policies appliquées (avec entity_id direct)';
    ELSE
      -- Fallback : pas de colonne entity_id, on isole seulement via FK sessions
      EXECUTE $POL$
        CREATE POLICY "generated_documents_select" ON public.generated_documents
          FOR SELECT TO authenticated
          USING (
            public.user_role() = 'super_admin'
            OR EXISTS (
              SELECT 1 FROM public.sessions s
              WHERE s.id = generated_documents.session_id
                AND s.entity_id = public.user_entity_id()
            )
          )
      $POL$;

      EXECUTE $POL$
        CREATE POLICY "generated_documents_modify" ON public.generated_documents
          FOR ALL TO authenticated
          USING (
            public.user_role() IN ('admin', 'super_admin', 'trainer')
            AND (
              public.user_role() = 'super_admin'
              OR EXISTS (
                SELECT 1 FROM public.sessions s
                WHERE s.id = generated_documents.session_id
                  AND s.entity_id = public.user_entity_id()
              )
            )
          )
          WITH CHECK (
            public.user_role() IN ('admin', 'super_admin', 'trainer')
            AND (
              public.user_role() = 'super_admin'
              OR EXISTS (
                SELECT 1 FROM public.sessions s
                WHERE s.id = generated_documents.session_id
                  AND s.entity_id = public.user_entity_id()
              )
            )
          )
      $POL$;

      RAISE NOTICE 'generated_documents : RLS policies appliquées (via sessions FK seulement, colonne entity_id absente)';
    END IF;
  ELSE
    RAISE NOTICE 'generated_documents : table absente — skip (OK)';
  END IF;
END $$;

-- =============================================================================
-- BLOCS SUPPRIMÉS (audit hallucinations) — ne pas restaurer sans vérification
-- pg_tables :
--   ✗ sellsy_company_mappings        → utiliser clients.sellsy_id (JSONB?)
--   ✗ sellsy_contact_mappings        → utiliser contacts.sellsy_id
--   ✗ payment_methods                → pas de modèle dédié en V1
--   ✗ credit_notes                   → pas de modèle dédié en V1
--   ✗ factoring_states               → utiliser affacturage_lots/lot_invoices
--   ✗ opportunities                  → utiliser crm_prospects + crm_quotes
--   ✗ automation_runs                → utiliser crm_automation_logs +
--                                       session_automation_logs
--   ✗ oauth_tokens                   → utiliser gmail_connections
--
-- TODO V1.1 : refaire un audit RLS *réel* avec pg_tables comme source de
-- vérité (pas via inférence d'agent), notamment sur :
--   - crm_prospects, crm_quotes, crm_quote_lines, crm_campaigns
--   - formation_invoices, formation_invoice_lines, formation_charges
--   - affacturage_lots, affacturage_lot_invoices
--   - gmail_connections (déjà OK probable)
--   - session_automation_logs, crm_automation_logs, crm_automation_rules
-- =============================================================================

-- =============================================================================
-- Fin migration audit_rls_fix_2026_06_05.sql (version corrigée 2026-06-06)
-- =============================================================================
