-- =============================================================================
-- Audit RLS multi-tenant LMS du 2026-06-05
-- =============================================================================
-- Fix les 10 tables à risque résiduel post-cleanup phase 2 (mai 2026).
--
-- Helpers utilisés : public.user_role(), public.user_entity_id()
--   (SANS préfixe auth.* — cf. memory feedback_rls_helpers_public_not_auth)
--
-- Idempotent : DROP POLICY IF EXISTS + CREATE POLICY pour chaque table.
--
-- Référence audit : docs/audit-rls-2026-06-05.md (Section 5)
-- Référence code-bypass associé : docs/audit-rls-2026-06-05-codebypass.md
--
-- ⚠ AVANT EXÉCUTION EN PROD :
--   1. Exécuter d'abord en STAGING.
--   2. Vérifier les policies appliquées via :
--      SELECT tablename, policyname, cmd FROM pg_policies
--      WHERE tablename IN (
--        'elearning_global_flashcards','sellsy_company_mappings',
--        'sellsy_contact_mappings','payment_methods','credit_notes',
--        'factoring_states','opportunities','generated_documents',
--        'automation_runs','oauth_tokens'
--      );
--   3. Test manuel cross-tenant : admin C3V doit recevoir 0 lignes pour
--      les ressources MR Formation (et inversement).
--   4. Décision produit `payment_methods` : référentiel partagé ou par
--      entity ? (cf. bloc 4 ci-dessous, à adapter si nécessaire).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. elearning_global_flashcards : ajout filtre entity_id
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "elearning_global_flashcards_admin_select" ON public.elearning_global_flashcards;
DROP POLICY IF EXISTS "elearning_global_flashcards_admin_modify" ON public.elearning_global_flashcards;
DROP POLICY IF EXISTS "elearning_global_flashcards_select" ON public.elearning_global_flashcards;
DROP POLICY IF EXISTS "elearning_global_flashcards_modify" ON public.elearning_global_flashcards;

CREATE POLICY "elearning_global_flashcards_select" ON public.elearning_global_flashcards
  FOR SELECT TO authenticated
  USING (
    entity_id = public.user_entity_id()
    OR public.user_role() = 'super_admin'
  );

CREATE POLICY "elearning_global_flashcards_modify" ON public.elearning_global_flashcards
  FOR ALL TO authenticated
  USING (
    public.user_role() IN ('admin', 'super_admin')
    AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  )
  WITH CHECK (
    public.user_role() IN ('admin', 'super_admin')
    AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  );

-- -----------------------------------------------------------------------------
-- 2. sellsy_company_mappings : isolation par entity
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "sellsy_company_mappings_allow_all" ON public.sellsy_company_mappings;
DROP POLICY IF EXISTS "sellsy_company_mappings_select" ON public.sellsy_company_mappings;
DROP POLICY IF EXISTS "sellsy_company_mappings_modify" ON public.sellsy_company_mappings;

CREATE POLICY "sellsy_company_mappings_select" ON public.sellsy_company_mappings
  FOR SELECT TO authenticated
  USING (
    entity_id = public.user_entity_id()
    OR public.user_role() = 'super_admin'
  );

CREATE POLICY "sellsy_company_mappings_modify" ON public.sellsy_company_mappings
  FOR ALL TO authenticated
  USING (
    public.user_role() IN ('admin', 'super_admin')
    AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  )
  WITH CHECK (
    public.user_role() IN ('admin', 'super_admin')
    AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  );

-- -----------------------------------------------------------------------------
-- 3. sellsy_contact_mappings : isolation par entity
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "sellsy_contact_mappings_allow_all" ON public.sellsy_contact_mappings;
DROP POLICY IF EXISTS "sellsy_contact_mappings_select" ON public.sellsy_contact_mappings;
DROP POLICY IF EXISTS "sellsy_contact_mappings_modify" ON public.sellsy_contact_mappings;

CREATE POLICY "sellsy_contact_mappings_select" ON public.sellsy_contact_mappings
  FOR SELECT TO authenticated
  USING (
    entity_id = public.user_entity_id()
    OR public.user_role() = 'super_admin'
  );

CREATE POLICY "sellsy_contact_mappings_modify" ON public.sellsy_contact_mappings
  FOR ALL TO authenticated
  USING (
    public.user_role() IN ('admin', 'super_admin')
    AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  )
  WITH CHECK (
    public.user_role() IN ('admin', 'super_admin')
    AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  );

-- -----------------------------------------------------------------------------
-- 4. payment_methods : isolation par entity
--    ⚠ DÉCISION PRODUIT REQUISE :
--      Si payment_methods est en fait un référentiel partagé (CB, virement,
--      chèque… commun aux 2 entités), supprimer ce bloc et ajouter la table
--      à la liste LEGITIMATELY PERMISSIVE du memory. Sinon, la policy
--      ci-dessous isole strictement par entity_id (par défaut sécurisé).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "payment_methods_allow_all" ON public.payment_methods;
DROP POLICY IF EXISTS "payment_methods_select" ON public.payment_methods;
DROP POLICY IF EXISTS "payment_methods_modify" ON public.payment_methods;

CREATE POLICY "payment_methods_select" ON public.payment_methods
  FOR SELECT TO authenticated
  USING (
    entity_id = public.user_entity_id()
    OR public.user_role() = 'super_admin'
  );

CREATE POLICY "payment_methods_modify" ON public.payment_methods
  FOR ALL TO authenticated
  USING (
    public.user_role() IN ('admin', 'super_admin')
    AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  )
  WITH CHECK (
    public.user_role() IN ('admin', 'super_admin')
    AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  );

-- -----------------------------------------------------------------------------
-- 5. credit_notes : ajout check entity_id via join invoice
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "credit_notes_admin_only" ON public.credit_notes;
DROP POLICY IF EXISTS "credit_notes_select" ON public.credit_notes;
DROP POLICY IF EXISTS "credit_notes_modify" ON public.credit_notes;

CREATE POLICY "credit_notes_select" ON public.credit_notes
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = credit_notes.invoice_id
        AND i.entity_id = public.user_entity_id()
    )
  );

CREATE POLICY "credit_notes_modify" ON public.credit_notes
  FOR ALL TO authenticated
  USING (
    public.user_role() IN ('admin', 'super_admin')
    AND (
      public.user_role() = 'super_admin'
      OR EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = credit_notes.invoice_id
          AND i.entity_id = public.user_entity_id()
      )
    )
  )
  WITH CHECK (
    public.user_role() IN ('admin', 'super_admin')
    AND (
      public.user_role() = 'super_admin'
      OR EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = credit_notes.invoice_id
          AND i.entity_id = public.user_entity_id()
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 6. factoring_states : durcissement par entity_id
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "factoring_states_role_only" ON public.factoring_states;
DROP POLICY IF EXISTS "factoring_states_select" ON public.factoring_states;
DROP POLICY IF EXISTS "factoring_states_modify" ON public.factoring_states;

CREATE POLICY "factoring_states_select" ON public.factoring_states
  FOR SELECT TO authenticated
  USING (
    entity_id = public.user_entity_id()
    OR public.user_role() = 'super_admin'
  );

CREATE POLICY "factoring_states_modify" ON public.factoring_states
  FOR ALL TO authenticated
  USING (
    public.user_role() IN ('admin', 'super_admin')
    AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  )
  WITH CHECK (
    public.user_role() IN ('admin', 'super_admin')
    AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  );

-- -----------------------------------------------------------------------------
-- 7. opportunities : durcir INSERT/UPDATE avec WITH CHECK
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "opportunities_insert" ON public.opportunities;
DROP POLICY IF EXISTS "opportunities_update" ON public.opportunities;
DROP POLICY IF EXISTS "opportunities_modify" ON public.opportunities;

CREATE POLICY "opportunities_insert" ON public.opportunities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_role() IN ('admin', 'super_admin', 'commercial')
    AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  );

CREATE POLICY "opportunities_update" ON public.opportunities
  FOR UPDATE TO authenticated
  USING (
    public.user_role() IN ('admin', 'super_admin', 'commercial')
    AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  )
  WITH CHECK (
    public.user_role() IN ('admin', 'super_admin', 'commercial')
    AND (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  );

-- -----------------------------------------------------------------------------
-- 8. generated_documents : ajout check entity_id direct (sans FK détournée)
--    Pré-requis : la colonne entity_id existe sur generated_documents.
--    Si elle n'existe pas, voir migration séparée pour l'ajouter et la
--    backfill depuis sessions.entity_id.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "generated_documents_via_session" ON public.generated_documents;
DROP POLICY IF EXISTS "generated_documents_select" ON public.generated_documents;
DROP POLICY IF EXISTS "generated_documents_modify" ON public.generated_documents;

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
  );

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
  );

-- -----------------------------------------------------------------------------
-- 9. automation_runs : ajout entity_id sur les policies admin
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "automation_runs_admin" ON public.automation_runs;
DROP POLICY IF EXISTS "automation_runs_select" ON public.automation_runs;
DROP POLICY IF EXISTS "automation_runs_modify" ON public.automation_runs;

CREATE POLICY "automation_runs_select" ON public.automation_runs
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'super_admin'
    OR (
      public.user_role() = 'admin'
      AND entity_id = public.user_entity_id()
    )
  );

CREATE POLICY "automation_runs_modify" ON public.automation_runs
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'super_admin'
    OR (
      public.user_role() = 'admin'
      AND entity_id = public.user_entity_id()
    )
  )
  WITH CHECK (
    public.user_role() = 'super_admin'
    OR (
      public.user_role() = 'admin'
      AND entity_id = public.user_entity_id()
    )
  );

-- -----------------------------------------------------------------------------
-- 10. oauth_tokens : documenter explicitement la stratégie par user_id
--     (par design — OAuth est par user, pas par entity).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "oauth_tokens_self" ON public.oauth_tokens;

CREATE POLICY "oauth_tokens_self" ON public.oauth_tokens
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.user_role() = 'super_admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.user_role() = 'super_admin'
  );

COMMENT ON TABLE public.oauth_tokens IS
  'OAuth tokens stockés par user_id (par design, pas par entity_id). RLS isole par auth.uid().';

-- =============================================================================
-- Fin migration audit_rls_fix_2026_06_05.sql
-- =============================================================================
