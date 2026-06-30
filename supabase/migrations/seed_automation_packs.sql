-- Seed des packs formation (qualiopi-standard, opco, sous-traitance) pour chaque entité.
-- Idempotent : ne réinsère pas si un pack du même nom existe déjà pour l'entité.
DO $$
DECLARE
  ent RECORD;
  pack_id UUID;
BEGIN
  FOR ent IN SELECT id FROM entities LOOP

    -- ── Pack Qualiopi standard (is_default) ──
    IF NOT EXISTS (SELECT 1 FROM automation_packs WHERE entity_id = ent.id AND name = 'Pack Qualiopi standard') THEN
      INSERT INTO automation_packs (entity_id, name, description, icon, color, is_default)
      VALUES (ent.id, 'Pack Qualiopi standard', 'Les automations essentielles pour respecter Qualiopi', '🎓', 'blue', true)
      RETURNING id INTO pack_id;
      INSERT INTO automation_pack_steps (pack_id, order_index, trigger_type, days_offset, recipient_type, document_type, name, description) VALUES
        (pack_id, 0, 'session_start_minus_days', 5, 'learners', 'convocation', 'Convocation J-5', 'Envoi automatique de la convocation 5 jours avant le début'),
        (pack_id, 1, 'on_enrollment', 0, 'learners', 'questionnaire_positionnement', 'Positionnement à l''inscription', 'Questionnaire de positionnement dès l''inscription'),
        (pack_id, 2, 'on_session_completion', 0, 'learners', 'questionnaire_autoevaluation', 'Auto-évaluation en fin de formation', 'Auto-évaluation à la clôture'),
        (pack_id, 3, 'on_session_completion', 0, 'learners', 'questionnaire_satisfaction', 'Satisfaction à chaud', 'Questionnaire de satisfaction à la fin'),
        (pack_id, 4, 'session_end_plus_days', 7, 'companies', 'questionnaire_satisfaction_client', 'Satisfaction client J+7', 'Questionnaire satisfaction entreprise 7 jours après'),
        (pack_id, 5, 'session_end_plus_days', 30, 'learners', 'questionnaire_satisfaction_froid', 'Satisfaction à froid J+30', 'Évaluation à froid 30 jours après la fin'),
        (pack_id, 6, 'on_session_completion', 0, 'learners', 'certificat_realisation', 'Certificat de réalisation', 'Génération automatique à la fin');
    END IF;

    -- ── Pack OPCO ──
    IF NOT EXISTS (SELECT 1 FROM automation_packs WHERE entity_id = ent.id AND name = 'Pack OPCO') THEN
      INSERT INTO automation_packs (entity_id, name, description, icon, color)
      VALUES (ent.id, 'Pack OPCO', 'Rappels automatiques pour les dossiers OPCO', '💰', 'green')
      RETURNING id INTO pack_id;
      INSERT INTO automation_pack_steps (pack_id, order_index, trigger_type, days_offset, recipient_type, document_type, name, description) VALUES
        (pack_id, 0, 'opco_deposit_reminder', 10, 'all', NULL, 'Rappel dépôt OPCO J-10', 'Rappel 10 jours avant le début pour déposer le dossier OPCO'),
        (pack_id, 1, 'session_end_plus_days', 3, 'companies', 'opco_justificatifs', 'Rappel OPCO post-formation J+3', 'Rappel envoi des pièces justificatives 3 jours après');
    END IF;

    -- ── Pack Sous-traitance ──
    IF NOT EXISTS (SELECT 1 FROM automation_packs WHERE entity_id = ent.id AND name = 'Pack Sous-traitance') THEN
      INSERT INTO automation_packs (entity_id, name, description, icon, color)
      VALUES (ent.id, 'Pack Sous-traitance', 'Workflow spécial pour les formations sous-traitées', '🤝', 'amber')
      RETURNING id INTO pack_id;
      INSERT INTO automation_pack_steps (pack_id, order_index, trigger_type, days_offset, recipient_type, document_type, name, description) VALUES
        (pack_id, 0, 'session_start_minus_days', 10, 'trainers', 'convention_intervention', 'Convention intervention J-10', 'Envoi de la convention d''intervention 10 jours avant'),
        (pack_id, 1, 'session_end_plus_days', 3, 'trainers', 'documents_post_st', 'Documents post-formation ST J+3', 'Rappel récupération documents du sous-traitant');
    END IF;

  END LOOP;
END $$;
