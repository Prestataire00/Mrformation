-- Migration : Backfill formation_companies à partir du legacy sessions.client_id
-- Idempotente : ON CONFLICT (session_id, client_id) DO NOTHING
-- Prérequis : aucun (la table formation_companies existe depuis add-formation-management.sql).

INSERT INTO formation_companies (session_id, client_id, amount)
SELECT
  s.id          AS session_id,
  s.client_id   AS client_id,
  s.total_price AS amount   -- INTRA mono-entreprise : amount = total_price ; ajustable manuellement par Loris ensuite
FROM sessions s
WHERE s.client_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM formation_companies fc
    WHERE fc.session_id = s.id
      AND fc.client_id  = s.client_id
  )
ON CONFLICT (session_id, client_id) DO NOTHING;

-- Diagnostic (visible dans psql / Supabase SQL Editor) :
DO $$
DECLARE
  v_legacy_count   INTEGER;
  v_backfilled_now INTEGER;
  v_orphans        INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_legacy_count FROM sessions WHERE client_id IS NOT NULL;
  RAISE NOTICE 'Sessions avec sessions.client_id non null : %', v_legacy_count;

  SELECT COUNT(*) INTO v_backfilled_now
  FROM sessions s
  WHERE s.client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM formation_companies fc
      WHERE fc.session_id = s.id AND fc.client_id = s.client_id
    );
  RAISE NOTICE 'Sessions ayant désormais une ligne formation_companies correspondante : %', v_backfilled_now;

  v_orphans := v_legacy_count - v_backfilled_now;
  RAISE NOTICE 'Sessions legacy SANS formation_companies après migration (devrait être 0) : %', v_orphans;

  IF v_orphans <> 0 THEN
    RAISE WARNING 'Backfill incomplet : % sessions legacy non backfillées. À investiguer.', v_orphans;
  END IF;
END $$;
