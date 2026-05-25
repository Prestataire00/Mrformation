-- ============================================================
-- Migration : Solidification Qualiopi — 2026-05-25
-- ============================================================
-- Cf docs/superpowers/specs/2026-05-25-solidification-qualiopi-design.md
-- À EXÉCUTER DANS LE SUPABASE DASHBOARD SQL EDITOR après le déploiement.
-- ============================================================

-- 1. Nouvelle colonne sessions.qualiopi_manual pour les checks manuels Qualiopi
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS qualiopi_manual JSONB DEFAULT '{}'::jsonb;

-- 2. Migration depuis sessions.notes (best-effort, tolérante au texte invalide).
--    Une fonction temporaire intercepte les exceptions du cast ::jsonb pour les
--    sessions dont notes contient du texte libre commençant par { mais qui n'est
--    pas du JSON valide.
CREATE OR REPLACE FUNCTION pg_temp.safe_extract_qualiopi_manual(input_notes TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
  IF input_notes IS NULL THEN RETURN '{}'::jsonb; END IF;
  RETURN COALESCE((input_notes::jsonb -> 'qualiopi_manual'), '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN '{}'::jsonb;
END;
$$;

UPDATE sessions
SET qualiopi_manual = pg_temp.safe_extract_qualiopi_manual(notes)
WHERE qualiopi_manual = '{}'::jsonb OR qualiopi_manual IS NULL;

-- 3. Fonction RPC pour batching des response counts (résout N+1 dans TabQualiopi)
CREATE OR REPLACE FUNCTION count_responses_by_questionnaire(
  p_session_id UUID,
  p_questionnaire_ids UUID[]
) RETURNS TABLE(questionnaire_id UUID, response_count BIGINT)
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT questionnaire_id, COUNT(*)::BIGINT
  FROM questionnaire_responses
  WHERE session_id = p_session_id
    AND questionnaire_id = ANY(p_questionnaire_ids)
  GROUP BY questionnaire_id;
$$;
GRANT EXECUTE ON FUNCTION count_responses_by_questionnaire TO authenticated;

-- 4. Drop check-proof (À EXÉCUTER MANUELLEMENT APRÈS VÉRIFICATION COUNT = 0)
-- Vérification préalable :
--   SELECT count(*) FROM qualiopi_proof_checks;
-- Si 0 → décommenter :
-- DROP TABLE IF EXISTS qualiopi_proof_checks;
