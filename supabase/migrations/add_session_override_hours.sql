-- ============================================================
-- Migration : Ajout de computed_hours / override_hours sur sessions (Story 2.3)
-- ============================================================
-- Sépare l'heure calculée automatiquement depuis les créneaux (computed_hours)
-- de l'heure éventuellement surchargée manuellement (override_hours).
--
-- L'UI affichera `override_hours ?? computed_hours` (avec fallback `planned_hours`
-- pour les sessions historiques avant cette migration).
--
-- `planned_hours` est CONSERVÉE en l'état pour ne pas casser les lecteurs existants
-- (renommage propre différé au Lot C — décision Wissam, cadrage v1.1).
--
-- Le trigger existant `trg_recompute_planned_hours` est adapté pour écrire dans
-- les 2 colonnes simultanément (planned_hours legacy + computed_hours canonique).
--
-- Idempotente : ADD COLUMN IF NOT EXISTS + UPDATE WHERE NULL.
-- ============================================================

-- ── 1. Nouvelles colonnes ──
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS computed_hours DECIMAL(10, 2);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS override_hours DECIMAL(10, 2);

-- ── 2. Fonction trigger adaptée : écrit dans planned_hours ET computed_hours ──
CREATE OR REPLACE FUNCTION recompute_session_planned_hours(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
  total_seconds NUMERIC;
  total_hours NUMERIC;
BEGIN
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))), 0)
    INTO total_seconds
    FROM formation_time_slots
    WHERE session_id = p_session_id;

  total_hours := ROUND((total_seconds / 3600)::numeric, 2);

  UPDATE sessions
    SET planned_hours = total_hours,      -- legacy, conservé pour rétro-compat
        computed_hours = total_hours      -- Story 2.3 : nouvelle colonne canonique
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. Backfill : copie planned_hours vers computed_hours pour les sessions existantes ──
UPDATE sessions
   SET computed_hours = planned_hours
 WHERE computed_hours IS NULL
   AND planned_hours IS NOT NULL;

-- ── 4. Diagnostic ──
DO $$
DECLARE
  v_total INTEGER;
  v_with_computed INTEGER;
  v_with_override INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM sessions;
  SELECT COUNT(*) INTO v_with_computed FROM sessions WHERE computed_hours IS NOT NULL;
  SELECT COUNT(*) INTO v_with_override FROM sessions WHERE override_hours IS NOT NULL;

  RAISE NOTICE 'Sessions total : %', v_total;
  RAISE NOTICE 'Sessions avec computed_hours : %', v_with_computed;
  RAISE NOTICE 'Sessions avec override_hours : %', v_with_override;
END $$;

-- ============================================================
-- Vérification :
--   SELECT id, planned_hours, computed_hours, override_hours FROM sessions LIMIT 5;
-- ============================================================
