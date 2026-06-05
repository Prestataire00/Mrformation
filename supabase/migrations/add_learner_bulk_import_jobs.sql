-- ============================================================
-- Pédagogie V2 Epic 2.5 — TASK 10
-- Migration : Table `learner_bulk_import_jobs` (idempotent jobs)
-- À exécuter dans Supabase SQL Editor.
--
-- Contexte : la route POST /api/sessions/[id]/learners/bulk/start crée un
-- job pour suivre l'exécution d'un import en masse d'apprenants (créés via
-- `createLearnerWithCredentials`). En dessous de 50 apprenants, la création
-- est inline (réponse sync). Au-dessus, elle est déléguée à la Netlify
-- Background Function `learners-bulk-create-background.mts` (timeout 15min).
--
-- Sécurité multi-tenant :
--  - entity_id NOT NULL pour filtrage RLS strict
--  - UNIQUE (entity_id, idempotency_key) : un POST replay avec la même
--    clé sur la même entité retourne le job déjà créé (anti double-clic)
--  - RLS : admin/super_admin de l'entité uniquement (helpers public.*)
--
-- Données stockées :
--  - results : JSONB avec { created_count, learners: [{learnerId, username,
--      email, syntheticEmailUsed, isError, errorMessage}] }
--    SANS aucun mot de passe (cf. plan TASK 10 §5 + SEC-9).
--  - pdf_path / pdf_signed_url / pdf_signed_url_expires_at : pointeurs vers
--    le bucket Storage `learner-credentials` (PDF généré post-création).
--
-- Migration idempotente : CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS
-- + CREATE OR REPLACE TRIGGER.
-- ============================================================

CREATE TABLE IF NOT EXISTS learner_bulk_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  payload_count INT NOT NULL DEFAULT 0,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_path TEXT,
  pdf_signed_url TEXT,
  pdf_signed_url_expires_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_learner_bulk_import_jobs_session_id
  ON learner_bulk_import_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_learner_bulk_import_jobs_entity_status
  ON learner_bulk_import_jobs(entity_id, status, created_at DESC);

-- Trigger updated_at (pattern projet)
CREATE OR REPLACE FUNCTION public.set_learner_bulk_import_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_learner_bulk_import_jobs_updated_at
  ON learner_bulk_import_jobs;
CREATE TRIGGER tg_learner_bulk_import_jobs_updated_at
  BEFORE UPDATE ON learner_bulk_import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_learner_bulk_import_jobs_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE learner_bulk_import_jobs ENABLE ROW LEVEL SECURITY;

-- SELECT : admin/super_admin de l'entité propriétaire.
-- (super_admin a accès à toutes les entités via public.user_role(), mais on
-- garde le filtre par entity_id pour la cohérence cross-entity — la route
-- API utilise resolveActiveEntityId pour piloter l'entité active.)
DROP POLICY IF EXISTS learner_bulk_import_jobs_admin_select ON learner_bulk_import_jobs;
CREATE POLICY learner_bulk_import_jobs_admin_select
  ON learner_bulk_import_jobs
  FOR SELECT
  TO authenticated
  USING (
    public.user_role() IN ('admin', 'super_admin')
    AND (
      public.user_role() = 'super_admin'
      OR entity_id = public.user_entity_id()
    )
  );

-- INSERT : idem (les inserts en pratique passent par service_role qui
-- bypass RLS, mais on borne la surface authentifiée).
DROP POLICY IF EXISTS learner_bulk_import_jobs_admin_insert ON learner_bulk_import_jobs;
CREATE POLICY learner_bulk_import_jobs_admin_insert
  ON learner_bulk_import_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_role() IN ('admin', 'super_admin')
    AND (
      public.user_role() = 'super_admin'
      OR entity_id = public.user_entity_id()
    )
  );

-- UPDATE : la BG function update via service_role (bypass), cette policy
-- existe pour cohérence si un admin annule un job depuis le front un jour.
DROP POLICY IF EXISTS learner_bulk_import_jobs_admin_update ON learner_bulk_import_jobs;
CREATE POLICY learner_bulk_import_jobs_admin_update
  ON learner_bulk_import_jobs
  FOR UPDATE
  TO authenticated
  USING (
    public.user_role() IN ('admin', 'super_admin')
    AND (
      public.user_role() = 'super_admin'
      OR entity_id = public.user_entity_id()
    )
  )
  WITH CHECK (
    public.user_role() IN ('admin', 'super_admin')
    AND (
      public.user_role() = 'super_admin'
      OR entity_id = public.user_entity_id()
    )
  );

-- DELETE : admin/super_admin (purge manuelle ou cron RGPD).
DROP POLICY IF EXISTS learner_bulk_import_jobs_admin_delete ON learner_bulk_import_jobs;
CREATE POLICY learner_bulk_import_jobs_admin_delete
  ON learner_bulk_import_jobs
  FOR DELETE
  TO authenticated
  USING (
    public.user_role() IN ('admin', 'super_admin')
    AND (
      public.user_role() = 'super_admin'
      OR entity_id = public.user_entity_id()
    )
  );

-- ============================================================
-- Vérifications post-exécution :
-- 1. Table existe + colonnes attendues :
--      \d+ learner_bulk_import_jobs
--    Attendu : 13 colonnes incluant idempotency_key UNIQUE composite.
--
-- 2. RLS activée + 4 policies :
--      SELECT policyname FROM pg_policies
--      WHERE schemaname = 'public' AND tablename = 'learner_bulk_import_jobs';
--    Attendu : 4 policies (select/insert/update/delete admin).
--
-- 3. Trigger updated_at présent :
--      SELECT tgname FROM pg_trigger
--      WHERE tgrelid = 'learner_bulk_import_jobs'::regclass;
--    Attendu : `tg_learner_bulk_import_jobs_updated_at`.
-- ============================================================
