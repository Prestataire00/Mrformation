-- ============================================================
-- Migration : Table formation_qualiopi_audits (Story 5.1)
-- ============================================================
-- Remplace le pattern fragile de stockage des cases Qualiopi manuelles dans
-- sessions.notes (JSON blob, clé "qualiopi_manual"). Désormais une table dédiée
-- avec colonnes typées + RLS.
--
-- Modèle single-row : 1 ligne par session (UNIQUE session_id), upsert.
-- audited_at est mis à jour à chaque modification.
--
-- sessions.notes n'est PAS nettoyée par cette migration (lecture résiduelle
-- inoffensive — cleanup éventuel dans un lot ultérieur).
-- sessions.qualiopi_score est conservée (cache dénormalisé pour la vue liste).
--
-- Idempotente : CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING.
-- ============================================================

-- ── 1. Table ──
CREATE TABLE IF NOT EXISTS formation_qualiopi_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  manual_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  audited_at TIMESTAMPTZ DEFAULT NOW(),
  audited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Index + RLS ──
CREATE INDEX IF NOT EXISTS idx_formation_qualiopi_audits_session ON formation_qualiopi_audits(session_id);
CREATE INDEX IF NOT EXISTS idx_formation_qualiopi_audits_entity ON formation_qualiopi_audits(entity_id);

ALTER TABLE formation_qualiopi_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_isolation" ON formation_qualiopi_audits;
CREATE POLICY "entity_isolation" ON formation_qualiopi_audits
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));

-- ── 3. Migration des données depuis sessions.notes (JSON "qualiopi_manual") ──
-- sessions.notes peut contenir : du JSON valide (avec ou sans qualiopi_manual),
-- du texte libre, du JSON mal formé, NULL ou vide.
--
-- Choix d'implémentation : bloc DO $$ itératif avec EXCEPTION par session.
-- Un simple INSERT ... SELECT avec CASE + ::jsonb n'est PAS sûr : le cast ::jsonb
-- peut être évalué par le planner sur des lignes au notes mal formé (ex.
-- "{texte non terminé"), ce qui ferait planter TOUTE la migration. Ici chaque
-- session est traitée isolément : une notes invalide est simplement skippée
-- (WHEN others THEN CONTINUE) sans interrompre la migration.
DO $$
DECLARE
  r RECORD;
  v_manual JSONB;
BEGIN
  FOR r IN
    SELECT id, entity_id, qualiopi_score, notes, updated_at
    FROM sessions
    WHERE notes IS NOT NULL AND notes <> ''
  LOOP
    BEGIN
      -- Cast risqué isolé dans son propre BEGIN/EXCEPTION.
      v_manual := r.notes::jsonb -> 'qualiopi_manual';

      -- Pas la clé qualiopi_manual (ou JSON sans cette clé) → on ignore.
      IF v_manual IS NULL THEN
        CONTINUE;
      END IF;

      INSERT INTO formation_qualiopi_audits
        (session_id, entity_id, score, manual_checks, audited_at)
      VALUES
        (r.id, r.entity_id, COALESCE(r.qualiopi_score, 0), v_manual, r.updated_at)
      ON CONFLICT (session_id) DO NOTHING;

    EXCEPTION WHEN others THEN
      -- notes mal formée (pas du JSON valide) → on saute cette session.
      RAISE NOTICE 'Session % : notes ignorée (JSON invalide)', r.id;
      CONTINUE;
    END;
  END LOOP;
END $$;

-- ── 4. Diagnostic ──
DO $$
DECLARE
  v_sessions_scanned INTEGER;
  v_audits_created INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_sessions_scanned
    FROM sessions
    WHERE notes IS NOT NULL AND notes <> '';

  SELECT COUNT(*) INTO v_audits_created FROM formation_qualiopi_audits;

  RAISE NOTICE 'Sessions avec notes non vides scannées : %', v_sessions_scanned;
  RAISE NOTICE 'Lignes formation_qualiopi_audits après migration : %', v_audits_created;
END $$;

-- ============================================================
-- Vérification :
--   SELECT session_id, score, manual_checks, audited_at FROM formation_qualiopi_audits LIMIT 5;
-- ============================================================
