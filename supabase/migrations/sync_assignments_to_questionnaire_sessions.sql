-- ============================================================================
-- Migration : Trigger PostgreSQL de mirroring (Volet E) — résout P0-1 du
-- deep-dive 2026-05-25 (découplage architectural data).
--
-- AVANT : TabQuestionnaires écrit dans formation_evaluation_assignments /
--         formation_satisfaction_assignments mais TOUS les consommateurs
--         (PDFs loadSessionAggregates, KPIs Qualiopi loadQualiopiIndicators,
--         portail learner, auto-send cron) lisent questionnaire_sessions.
--         Aucun trigger ne synchronise → admin attribue dans le vide.
--
-- APRÈS : Trigger AFTER INSERT/UPDATE/DELETE sur les 2 nouvelles tables
--         alimente automatiquement questionnaire_sessions (uni-directionnel).
--         Backfill one-time pour les attributions existantes.
--
-- Stratégie 3 (cf brainstorming Q2) : préserve la granularité satisfaction_
-- chaud/froid dans les nouvelles tables ; le miroir questionnaire_sessions
-- reste générique (1 ligne par couple (q_id, s_id)).
--
-- Source : docs/superpowers/specs/2026-05-25-questionnaires-solidification-p0-design.md §5
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fonction de mirroring
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_assignment_to_questionnaire_sessions()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Upsert dans questionnaire_sessions (idempotent grâce à ON CONFLICT)
    INSERT INTO questionnaire_sessions (questionnaire_id, session_id, created_at)
    VALUES (NEW.questionnaire_id, NEW.session_id, COALESCE(NEW.created_at, NOW()))
    ON CONFLICT (questionnaire_id, session_id) DO NOTHING;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Si la paire (q_id, s_id) ne change pas (typique : modif evaluation_type
    -- ou learner_id), no-op : le miroir reste inchangé.
    IF OLD.questionnaire_id = NEW.questionnaire_id
       AND OLD.session_id = NEW.session_id THEN
      RETURN NEW;
    END IF;

    -- Cas rare : la paire change. Supprimer l'ancien miroir si plus aucune
    -- attribution pour cette paire dans l'une des 2 tables.
    IF NOT EXISTS (
      SELECT 1 FROM formation_evaluation_assignments
      WHERE questionnaire_id = OLD.questionnaire_id AND session_id = OLD.session_id
    ) AND NOT EXISTS (
      SELECT 1 FROM formation_satisfaction_assignments
      WHERE questionnaire_id = OLD.questionnaire_id AND session_id = OLD.session_id
    ) THEN
      DELETE FROM questionnaire_sessions
      WHERE questionnaire_id = OLD.questionnaire_id AND session_id = OLD.session_id;
    END IF;

    -- Insérer le nouveau miroir
    INSERT INTO questionnaire_sessions (questionnaire_id, session_id, created_at)
    VALUES (NEW.questionnaire_id, NEW.session_id, COALESCE(NEW.created_at, NOW()))
    ON CONFLICT (questionnaire_id, session_id) DO NOTHING;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- Garder le miroir tant qu'il reste au moins 1 attribution pour ce couple
    -- (cas typique : satisfaction_chaud + satisfaction_froid du même
    -- questionnaire — on garde le miroir tant que l'un des deux existe).
    IF NOT EXISTS (
      SELECT 1 FROM formation_evaluation_assignments
      WHERE questionnaire_id = OLD.questionnaire_id AND session_id = OLD.session_id
    ) AND NOT EXISTS (
      SELECT 1 FROM formation_satisfaction_assignments
      WHERE questionnaire_id = OLD.questionnaire_id AND session_id = OLD.session_id
    ) THEN
      DELETE FROM questionnaire_sessions
      WHERE questionnaire_id = OLD.questionnaire_id AND session_id = OLD.session_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SECURITY DEFINER permet au trigger d'écrire dans questionnaire_sessions
-- même si l'appelant n'a pas les permissions directes (les RLS strictes du
-- Volet A peuvent bloquer un INSERT direct par un admin via service client).

-- ----------------------------------------------------------------------------
-- 2. Triggers (2)
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_sync_eval_assignment ON formation_evaluation_assignments;
CREATE TRIGGER trg_sync_eval_assignment
  AFTER INSERT OR UPDATE OR DELETE ON formation_evaluation_assignments
  FOR EACH ROW EXECUTE FUNCTION sync_assignment_to_questionnaire_sessions();

DROP TRIGGER IF EXISTS trg_sync_satis_assignment ON formation_satisfaction_assignments;
CREATE TRIGGER trg_sync_satis_assignment
  AFTER INSERT OR UPDATE OR DELETE ON formation_satisfaction_assignments
  FOR EACH ROW EXECUTE FUNCTION sync_assignment_to_questionnaire_sessions();

-- ----------------------------------------------------------------------------
-- 3. Backfill one-time
-- ----------------------------------------------------------------------------

-- Pour chaque paire (questionnaire_id, session_id) existante dans l'une des
-- 2 nouvelles tables et absente de questionnaire_sessions, créer le miroir.
-- ON CONFLICT DO NOTHING empêche d'écraser les attributions legacy faites
-- via /admin/questionnaires/page.tsx directement.

INSERT INTO questionnaire_sessions (questionnaire_id, session_id, created_at)
SELECT questionnaire_id, session_id, MIN(created_at) AS created_at
FROM (
  SELECT questionnaire_id, session_id, created_at FROM formation_evaluation_assignments
  UNION ALL
  SELECT questionnaire_id, session_id, created_at FROM formation_satisfaction_assignments
) AS all_assignments
GROUP BY questionnaire_id, session_id
ON CONFLICT (questionnaire_id, session_id) DO NOTHING;
