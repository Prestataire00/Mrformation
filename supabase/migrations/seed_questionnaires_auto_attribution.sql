-- ============================================================
-- Migration (seed) : Auto-attribution des questionnaires Qualiopi
-- ============================================================
-- Goal A du SPEC spec-questionnaires-auto-eval.
--
-- Crée, par entité (MR FORMATION + C3V FORMATION), les 2 questionnaires
-- `program_objectives` manquants — positionnement (AVANT) et auto-évaluation
-- (APRÈS) — et seede les règles d'auto-attribution dans
-- formation_automation_rules :
--   • positionnement          → on_enrollment          (à l'inscription)
--   • auto-évaluation post     → on_session_completion  (fin de formation)
--   • satisfaction à chaud     → on_session_completion  (fin de formation)
--
-- Contrat gelé (partagé avec Goal B / visu) :
--   positionnement = quality_indicator_type 'auto_eval_pre'
--   auto-évaluation = quality_indicator_type 'auto_eval_post'
--
-- 100 % IDEMPOTENT : ré-exécutable sans créer de doublon (gardes
-- WHERE NOT EXISTS / SELECT préalable). N'altère aucune donnée existante
-- (les questionnaires satisfaction déjà créés, et les 5 règles MR
-- documents/emails, ne sont pas touchés).
-- ============================================================

-- ── Prérequis auto-suffisant : autoriser le type de question 'program_objectives' ──
-- Réaffirmé ici (idempotent, identique à add_program_objectives_question_type.sql)
-- pour que ce seed ne dépende pas de l'ordre d'application des migrations.
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('rating', 'text', 'multiple_choice', 'yes_no', 'program_objectives'));

-- ── Prérequis auto-suffisant : colonnes & triggers de formation_automation_rules ──
-- extend_automation_system.sql / add_automation_template.sql peuvent ne pas avoir
-- été appliqués sur tous les environnements (drift de migrations). On réaffirme
-- ici, de façon idempotente, ce dont ce seed dépend :
--   • colonnes name / recipient_type
--   • triggers événementiels (on_enrollment, on_session_completion) dans le CHECK
ALTER TABLE formation_automation_rules ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE formation_automation_rules ADD COLUMN IF NOT EXISTS recipient_type TEXT DEFAULT 'learners';
ALTER TABLE formation_automation_rules DROP CONSTRAINT IF EXISTS formation_automation_rules_trigger_type_check;
ALTER TABLE formation_automation_rules ADD CONSTRAINT formation_automation_rules_trigger_type_check
  CHECK (trigger_type IN (
    'session_start_minus_days', 'session_end_plus_days',
    'on_session_creation', 'on_session_completion', 'on_enrollment',
    'on_signature_complete', 'opco_deposit_reminder', 'invoice_overdue',
    'questionnaire_reminder', 'certificate_ready'
  ));

DO $$
DECLARE
  v_entity   RECORD;
  v_qid_pre  UUID;
  v_qid_post UUID;
BEGIN
  FOR v_entity IN
    SELECT id, slug FROM entities WHERE slug IN ('mr-formation', 'c3v-formation')
  LOOP
    -- ── 1. Questionnaire positionnement (AVANT) : auto_eval_pre ──
    SELECT id INTO v_qid_pre
      FROM questionnaires
      WHERE entity_id = v_entity.id AND quality_indicator_type = 'auto_eval_pre'
      LIMIT 1;

    IF v_qid_pre IS NULL THEN
      INSERT INTO questionnaires (entity_id, title, description, type, quality_indicator_type, is_active)
      VALUES (
        v_entity.id,
        'Positionnement (avant formation)',
        'Auto-évaluation du niveau sur les objectifs pédagogiques, renseignée avant le démarrage de la formation.',
        'evaluation', 'auto_eval_pre', TRUE
      )
      RETURNING id INTO v_qid_pre;

      INSERT INTO questions (questionnaire_id, text, type, order_index, is_required)
      VALUES (
        v_qid_pre,
        'Évaluez votre niveau pour chaque objectif de la formation',
        'program_objectives', 0, TRUE
      );
    END IF;

    -- ── 2. Questionnaire auto-évaluation (APRÈS) : auto_eval_post ──
    SELECT id INTO v_qid_post
      FROM questionnaires
      WHERE entity_id = v_entity.id AND quality_indicator_type = 'auto_eval_post'
      LIMIT 1;

    IF v_qid_post IS NULL THEN
      INSERT INTO questionnaires (entity_id, title, description, type, quality_indicator_type, is_active)
      VALUES (
        v_entity.id,
        'Auto-évaluation (après formation)',
        'Auto-évaluation du niveau sur les mêmes objectifs pédagogiques, renseignée à l''issue de la formation (mesure de progression).',
        'evaluation', 'auto_eval_post', TRUE
      )
      RETURNING id INTO v_qid_post;

      INSERT INTO questions (questionnaire_id, text, type, order_index, is_required)
      VALUES (
        v_qid_post,
        'Évaluez votre niveau pour chaque objectif de la formation',
        'program_objectives', 0, TRUE
      );
    END IF;

    -- ── 3. Règles d'auto-attribution (idempotent par entity_id+trigger+document_type) ──
    INSERT INTO formation_automation_rules
      (entity_id, trigger_type, document_type, days_offset, recipient_type, is_enabled, name)
    SELECT v_entity.id, 'on_enrollment', 'questionnaire_positionnement',
           0, 'learners', TRUE, 'Positionnement à l''inscription'
    WHERE NOT EXISTS (
      SELECT 1 FROM formation_automation_rules
      WHERE entity_id = v_entity.id AND trigger_type = 'on_enrollment'
        AND document_type = 'questionnaire_positionnement'
    );

    INSERT INTO formation_automation_rules
      (entity_id, trigger_type, document_type, days_offset, recipient_type, is_enabled, name)
    SELECT v_entity.id, 'on_session_completion', 'questionnaire_autoevaluation',
           0, 'learners', TRUE, 'Auto-évaluation en fin de formation'
    WHERE NOT EXISTS (
      SELECT 1 FROM formation_automation_rules
      WHERE entity_id = v_entity.id AND trigger_type = 'on_session_completion'
        AND document_type = 'questionnaire_autoevaluation'
    );

    INSERT INTO formation_automation_rules
      (entity_id, trigger_type, document_type, days_offset, recipient_type, is_enabled, name)
    SELECT v_entity.id, 'on_session_completion', 'questionnaire_satisfaction',
           0, 'learners', TRUE, 'Satisfaction à chaud'
    WHERE NOT EXISTS (
      SELECT 1 FROM formation_automation_rules
      WHERE entity_id = v_entity.id AND trigger_type = 'on_session_completion'
        AND document_type = 'questionnaire_satisfaction'
    );
  END LOOP;
END $$;

-- ============================================================
-- Idempotence des assignments auto-créés « en masse » (lazy-create)
-- ============================================================
-- En Postgres, NULL ≠ NULL dans une contrainte UNIQUE : la contrainte
-- UNIQUE(session_id, evaluation_type, learner_id) ne protège donc PAS les
-- assignments en masse (learner_id NULL) que crée resolveQuestionnaireIdForRule.
-- On dédoublonne l'existant (garde le plus ancien) puis on pose un index
-- unique partiel → l'INSERT concurrent lèvera 23505 (avalé côté code),
-- garantissant 1 seul assignment masse par (session, type).

-- 1. Dédoublonnage des assignments masse existants (conserve le plus ancien).
DELETE FROM formation_evaluation_assignments a
  USING formation_evaluation_assignments b
  WHERE a.learner_id IS NULL AND b.learner_id IS NULL
    AND a.session_id = b.session_id
    AND a.evaluation_type = b.evaluation_type
    AND a.ctid > b.ctid;

DELETE FROM formation_satisfaction_assignments a
  USING formation_satisfaction_assignments b
  WHERE a.target_id IS NULL AND b.target_id IS NULL
    AND a.session_id = b.session_id
    AND a.satisfaction_type = b.satisfaction_type
    AND a.target_type = b.target_type
    AND a.ctid > b.ctid;

-- 2. Index uniques partiels (cas masse) — idempotents.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fea_session_evaltype_mass
  ON formation_evaluation_assignments (session_id, evaluation_type)
  WHERE learner_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fsa_session_sattype_target_mass
  ON formation_satisfaction_assignments (session_id, satisfaction_type, target_type)
  WHERE target_id IS NULL;

-- ============================================================
-- Vérification :
--   SELECT e.slug, q.title, q.quality_indicator_type
--     FROM questionnaires q JOIN entities e ON e.id = q.entity_id
--     WHERE q.quality_indicator_type IN ('auto_eval_pre','auto_eval_post')
--     ORDER BY e.slug;
--   SELECT e.slug, r.trigger_type, r.document_type
--     FROM formation_automation_rules r JOIN entities e ON e.id = r.entity_id
--     WHERE r.document_type LIKE 'questionnaire_%' ORDER BY e.slug, r.trigger_type;
-- ============================================================
