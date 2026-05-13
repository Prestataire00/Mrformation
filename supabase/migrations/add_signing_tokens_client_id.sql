-- ============================================================
-- Migration : Ajout de signing_tokens.client_id (Story 3.4)
-- ============================================================
-- Lie chaque signing_token à l'entreprise rattachée à l'apprenant via enrollments.client_id
-- au moment de la génération du token. Permet l'export segmenté des feuilles d'émargement
-- par entreprise (cf. US-1 du cadrage).
--
-- Trace défensive : si l'apprenant change d'entreprise plus tard, le token reste lié
-- au snapshot du moment.
--
-- Pour les tokens "session" (token_type='session', pas de learner_id), client_id reste null :
-- les apprenants se sélectionnent au scan et leur entreprise vient d'enrollments.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS + UPDATE WHERE client_id IS NULL.
-- ============================================================

-- ── 1. Nouvelle colonne ──
ALTER TABLE signing_tokens ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- ── 2. Index ──
CREATE INDEX IF NOT EXISTS idx_signing_tokens_client ON signing_tokens(client_id);

-- ── 3. Backfill best-effort à partir d'enrollments ──
-- Lie le token à l'entreprise courante de l'apprenant dans cette session.
-- Skip les tokens "session" (learner_id null) ou les enrollments orphelins (client_id null).
UPDATE signing_tokens st
   SET client_id = e.client_id
  FROM enrollments e
 WHERE st.session_id = e.session_id
   AND st.learner_id = e.learner_id
   AND st.client_id IS NULL
   AND st.learner_id IS NOT NULL
   AND e.client_id IS NOT NULL;

-- ── 4. Diagnostic ──
DO $$
DECLARE
  v_total INTEGER;
  v_with_client INTEGER;
  v_session_tokens INTEGER;
  v_orphans INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM signing_tokens;
  SELECT COUNT(*) INTO v_with_client FROM signing_tokens WHERE client_id IS NOT NULL;
  SELECT COUNT(*) INTO v_session_tokens FROM signing_tokens WHERE learner_id IS NULL;
  SELECT COUNT(*) INTO v_orphans
    FROM signing_tokens
    WHERE client_id IS NULL
      AND learner_id IS NOT NULL;

  RAISE NOTICE 'Signing tokens total : %', v_total;
  RAISE NOTICE 'Signing tokens avec client_id (backfill effectif) : %', v_with_client;
  RAISE NOTICE 'Signing tokens "session" (learner_id null, OK) : %', v_session_tokens;
  RAISE NOTICE 'Signing tokens "individual" SANS client_id (orphans à investiguer si > 0) : %', v_orphans;
END $$;

-- ============================================================
-- Vérification :
--   SELECT id, session_id, learner_id, client_id, token_type FROM signing_tokens LIMIT 5;
-- ============================================================
