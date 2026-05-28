-- ============================================================
-- Story em-a-3 — Seed des templates email par défaut (~22 keys)
-- ============================================================
--
-- Auteur : Wissam (proxy Loris VICHOT) + workflow BMAD multi-agents
-- Date   : 2026-05-28
-- Source : bmad_output/planning-artifacts/cadrage-module-emails.md §4.3
--          + prd-emails.md FR-EML-12 → 15
--          + architecture-module-emails.md §Risques #8 (snapshot wording)
--          + epics-emails.md Story em-a-3
--
-- ============================================================
-- OBJECTIF
-- ============================================================
-- Seed initial de ~22 templates email par défaut PAR ENTITÉ (MR + C3V)
-- reprenant exactement les wordings actuellement hardcodés dans :
--   - src/app/api/invoices/process-reminders/route.ts (REMINDER_TEMPLATES)
--   - src/app/api/crm/quotes/process-reminders/route.ts (TEMPLATES)
--   - src/app/api/crm/quotes/sign-request/route.ts (fallback ligne 121)
--   - src/app/api/formations/automation-rules/run-cron/route.ts:358 (OPCO)
--   - src/lib/services/batch-email-handler.ts:252 (EMAIL_SUBJECT_LABELS)
--
-- Permet à em-b-1..em-b-5 de migrer les 5 pipelines vers le resolver
-- (em-a-2) en garantissant une transparence wording 100% pour Loris.
--
-- ============================================================
-- IDEMPOTENCE
-- ============================================================
-- Le INSERT utilise un WHERE NOT EXISTS pour éviter les doublons.
-- Ré-exécutable safely : si une ligne (entity_id, key, is_active=TRUE)
-- existe déjà, elle n'est PAS écrasée (Loris a peut-être déjà
-- customisé le wording, on ne veut pas le perdre).
--
-- ============================================================
-- DÉPENDANCES
-- ============================================================
-- Cette migration nécessite que em-a-1 soit appliquée AVANT (les
-- colonnes `key`, `category`, `is_active`, `trigger_config` doivent
-- exister sur `email_templates`).
--
-- ============================================================
-- SEED
-- ============================================================

INSERT INTO email_templates (
  entity_id, name, subject, body, type, variables,
  key, category, is_active, recipient_type, trigger_config
)
SELECT
  e.id AS entity_id,
  t.name, t.subject, t.body, t.type, t.variables::jsonb,
  t.key, t.category, TRUE AS is_active, t.recipient_type,
  jsonb_build_object('seed_version', '2026-05-28-v1') AS trigger_config
FROM entities e
CROSS JOIN (VALUES
  -- ─── INVOICE REMINDERS (em-b-1) ────────────────────────────
  (
    'reminder_invoice_first', 'reminder', 'client',
    'Rappel facture — 1er rappel',
    'Rappel de paiement — Facture {{reference}}',
    E'Bonjour,\n\nNous vous informons que la facture {{reference}} d''un montant de {{montant}} relative à la formation "{{formation}}" est arrivée à échéance le {{date_echeance}}.\n\nNous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.\n\nCordialement,\nL''équipe formation',
    'reminder_invoice',
    '["reference","montant","entreprise","formation","date_echeance"]'
  ),
  (
    'reminder_invoice_second', 'reminder', 'client',
    'Rappel facture — 2e rappel',
    'Deuxième rappel — Facture {{reference}} impayée',
    E'Bonjour,\n\nMalgré notre précédent rappel, la facture {{reference}} d''un montant de {{montant}} relative à la formation "{{formation}}" reste impayée.\n\nÉchéance initiale : {{date_echeance}}\n\nNous vous prions de régulariser cette situation dans un délai de 7 jours.\n\nCordialement,\nL''équipe formation',
    'reminder_invoice',
    '["reference","montant","entreprise","formation","date_echeance"]'
  ),
  (
    'reminder_invoice_final', 'reminder', 'client',
    'Rappel facture — Mise en demeure',
    'Mise en demeure — Facture {{reference}}',
    E'Bonjour,\n\nLa présente vaut mise en demeure.\n\nLa facture {{reference}} d''un montant de {{montant}} relative à la formation "{{formation}}" reste impayée malgré nos précédents rappels.\n\nÉchéance initiale : {{date_echeance}}\n\nSans règlement sous 8 jours, nous serons contraints d''engager des procédures de recouvrement. Des pénalités de retard de 40€ seront également appliquées conformément à la réglementation.\n\nCordialement,\nL''équipe formation',
    'reminder_invoice',
    '["reference","montant","entreprise","formation","date_echeance"]'
  ),

  -- ─── QUOTE REMINDERS (em-b-2) ──────────────────────────────
  (
    'reminder_quote_first', 'reminder', 'client',
    'Suivi proposition — 1ʳᵉ relance',
    'Suite à notre proposition {{reference}}',
    E'Bonjour,\n\nAvez-vous eu le temps de consulter notre proposition {{reference}} ?\n\nNous restons à votre disposition pour toute question ou adaptation de notre offre.\n\nCordialement,\nL''équipe formation',
    'reminder_quote',
    '["reference","prospect","valid_until"]'
  ),
  (
    'reminder_quote_second', 'reminder', 'client',
    'Suivi proposition — 2e relance',
    'Relance — Proposition {{reference}}',
    E'Bonjour,\n\nNous revenons vers vous concernant notre proposition {{reference}}.\n\nNous restons à disposition pour adapter notre offre à vos besoins. N''hésitez pas à nous contacter.\n\nCordialement,\nL''équipe formation',
    'reminder_quote',
    '["reference","prospect","valid_until"]'
  ),
  (
    'reminder_quote_final', 'reminder', 'client',
    'Suivi proposition — Dernière relance',
    'Dernière relance — Proposition {{reference}}',
    E'Bonjour,\n\nNotre proposition {{reference}} arrive à expiration{{date_validite_clause}}.\n\nSouhaitez-vous donner suite ? Nous serions ravis de finaliser ce projet avec vous.\n\nCordialement,\nL''équipe formation',
    'reminder_quote',
    '["reference","prospect","valid_until","date_validite_clause"]'
  ),

  -- ─── QUOTE SIGN-REQUEST (em-b-3) ───────────────────────────
  (
    'quote_sign_request', 'transactional', 'client',
    'Demande de signature de proposition',
    'Proposition {{reference}} — {{entite}}',
    E'Bonjour {{destinataire}},\n\nVeuillez trouver notre proposition commerciale {{reference}} d''un montant de {{montant}}.\n\nPour accepter cette proposition, veuillez la signer électroniquement en cliquant sur le lien suivant :\n\n{{lien_signature}}\n\nCe lien est valide {{date_validite}}.\n\nN''hésitez pas à nous contacter pour toute question.\n\nCordialement,\nL''équipe {{entite}}',
    'quote_sign_request',
    '["reference","montant","destinataire","lien_signature","date_validite","entite"]'
  ),

  -- ─── OPCO DEPOSIT REMINDER (em-b-4) ────────────────────────
  (
    'opco_deposit', 'automation', 'manager',
    'Rappel dépôt OPCO',
    'Rappel : demande OPCO à déposer — {{formation}}',
    E'Bonjour {{prenom_admin}},\n\nLa demande de prise en charge OPCO "{{opco_name}}" pour la formation "{{formation}}" n''a pas encore été déposée.\n\nLa formation commence le {{date_debut}}.\n\nPensez à déposer la demande rapidement.\n\nCordialement,\nL''équipe {{entite}}',
    'opco_deposit',
    '["prenom_admin","opco_name","formation","date_debut","entite"]'
  ),

  -- ─── BATCH DOCUMENT SENDS (em-b-5) ─────────────────────────
  -- Wording uniforme : "Veuillez trouver ci-joint <label>." Body court,
  -- Loris pourra le personnaliser par doc_type s'il le souhaite.
  (
    'batch_convocation', 'batch', 'learner',
    'Envoi batch — Convocation',
    'Convocation — {{formation}}',
    E'Bonjour {{prenom_apprenant}},\n\nVeuillez trouver ci-joint votre convocation pour la formation "{{formation}}" qui commence le {{date_debut}}.\n\nCordialement,\nL''équipe {{entite}}',
    'batch_convocation',
    '["prenom_apprenant","formation","date_debut","entite"]'
  ),
  (
    'batch_attestation_assiduite', 'batch', 'learner',
    'Envoi batch — Attestation d''assiduité',
    'Attestation d''assiduité — {{formation}}',
    E'Bonjour {{prenom_apprenant}},\n\nVeuillez trouver ci-joint votre attestation d''assiduité pour la formation "{{formation}}".\n\nCordialement,\nL''équipe {{entite}}',
    'batch_attestation_assiduite',
    '["prenom_apprenant","formation","entite"]'
  ),
  (
    'batch_certificat_realisation', 'batch', 'learner',
    'Envoi batch — Certificat de réalisation',
    'Certificat de réalisation — {{formation}}',
    E'Bonjour {{prenom_apprenant}},\n\nVeuillez trouver ci-joint votre certificat de réalisation pour la formation "{{formation}}".\n\nCordialement,\nL''équipe {{entite}}',
    'batch_certificat_realisation',
    '["prenom_apprenant","formation","entite"]'
  ),
  (
    'batch_attestation_competences', 'batch', 'learner',
    'Envoi batch — Attestation de compétences',
    'Attestation de compétences — {{formation}}',
    E'Bonjour {{prenom_apprenant}},\n\nVeuillez trouver ci-joint votre attestation de compétences pour la formation "{{formation}}".\n\nCordialement,\nL''équipe {{entite}}',
    'batch_attestation_competences',
    '["prenom_apprenant","formation","entite"]'
  ),
  (
    'batch_attestation_abandon', 'batch', 'learner',
    'Envoi batch — Attestation d''abandon',
    'Attestation d''abandon de formation — {{formation}}',
    E'Bonjour {{prenom_apprenant}},\n\nVeuillez trouver ci-joint votre attestation d''abandon de formation pour "{{formation}}".\n\nCordialement,\nL''équipe {{entite}}',
    'batch_attestation_abandon',
    '["prenom_apprenant","formation","entite"]'
  ),
  (
    'batch_avis_habilitation_electrique', 'batch', 'learner',
    'Envoi batch — Avis d''habilitation électrique',
    'Avis d''habilitation électrique — {{formation}}',
    E'Bonjour {{prenom_apprenant}},\n\nVeuillez trouver ci-joint votre avis d''habilitation électrique pour la formation "{{formation}}".\n\nCordialement,\nL''équipe {{entite}}',
    'batch_avis_habilitation_electrique',
    '["prenom_apprenant","formation","entite"]'
  ),
  (
    'batch_certificat_travail_hauteur', 'batch', 'learner',
    'Envoi batch — Certificat travail en hauteur',
    'Certificat de travail en hauteur — {{formation}}',
    E'Bonjour {{prenom_apprenant}},\n\nVeuillez trouver ci-joint votre certificat de travail en hauteur pour la formation "{{formation}}".\n\nCordialement,\nL''équipe {{entite}}',
    'batch_certificat_travail_hauteur',
    '["prenom_apprenant","formation","entite"]'
  ),
  (
    'batch_attestation_aipr', 'batch', 'learner',
    'Envoi batch — Attestation AIPR',
    'Attestation AIPR — {{formation}}',
    E'Bonjour {{prenom_apprenant}},\n\nVeuillez trouver ci-joint votre attestation AIPR pour la formation "{{formation}}".\n\nCordialement,\nL''équipe {{entite}}',
    'batch_attestation_aipr',
    '["prenom_apprenant","formation","entite"]'
  ),
  (
    'batch_reponses_satisfaction', 'batch', 'learner',
    'Envoi batch — Réponses satisfaction',
    'Réponses satisfaction — {{formation}}',
    E'Bonjour {{prenom_apprenant}},\n\nVeuillez trouver ci-joint le récapitulatif de vos réponses au questionnaire de satisfaction pour la formation "{{formation}}".\n\nCordialement,\nL''équipe {{entite}}',
    'batch_reponses_satisfaction',
    '["prenom_apprenant","formation","entite"]'
  ),
  (
    'batch_resultats_evaluations', 'batch', 'learner',
    'Envoi batch — Résultats des évaluations',
    'Résultats des évaluations — {{formation}}',
    E'Bonjour {{prenom_apprenant}},\n\nVeuillez trouver ci-joint vos résultats des évaluations pour la formation "{{formation}}".\n\nCordialement,\nL''équipe {{entite}}',
    'batch_resultats_evaluations',
    '["prenom_apprenant","formation","entite"]'
  ),
  (
    'batch_cgv', 'batch', 'client',
    'Envoi batch — Conditions Générales de Vente',
    'Conditions Générales de Vente — {{entite}}',
    E'Bonjour,\n\nVeuillez trouver ci-joint nos Conditions Générales de Vente.\n\nCordialement,\nL''équipe {{entite}}',
    'batch_cgv',
    '["entite"]'
  ),
  (
    'batch_politique_confidentialite', 'batch', 'client',
    'Envoi batch — Politique de confidentialité',
    'Politique de confidentialité — {{entite}}',
    E'Bonjour,\n\nVeuillez trouver ci-joint notre politique de confidentialité.\n\nCordialement,\nL''équipe {{entite}}',
    'batch_politique_confidentialite',
    '["entite"]'
  ),
  (
    'batch_bilans_poe', 'batch', 'learner',
    'Envoi batch — Bilan POE',
    'Bilan POE — {{formation}}',
    E'Bonjour {{prenom_apprenant}},\n\nVeuillez trouver ci-joint votre bilan POE pour la formation "{{formation}}".\n\nCordialement,\nL''équipe {{entite}}',
    'batch_bilans_poe',
    '["prenom_apprenant","formation","entite"]'
  ),
  (
    'batch_programme', 'batch', 'learner',
    'Envoi batch — Programme de formation',
    'Programme — {{formation}}',
    E'Bonjour,\n\nVeuillez trouver ci-joint le programme de la formation "{{formation}}".\n\nCordialement,\nL''équipe {{entite}}',
    'batch_programme',
    '["formation","entite"]'
  ),
  (
    'batch_convention_entreprise', 'batch', 'client',
    'Envoi batch — Convention entreprise',
    'Convention de formation — {{formation}}',
    E'Bonjour,\n\nVeuillez trouver ci-joint votre convention de formation pour "{{formation}}".\n\nCordialement,\nL''équipe {{entite}}',
    'batch_convention_entreprise',
    '["formation","entite"]'
  ),
  (
    'batch_convention_intervention', 'batch', 'trainer',
    'Envoi batch — Convention intervention',
    'Convention d''intervention — {{formation}}',
    E'Bonjour {{prenom_formateur}},\n\nVeuillez trouver ci-joint votre convention d''intervention pour la formation "{{formation}}".\n\nCordialement,\nL''équipe {{entite}}',
    'batch_convention_intervention',
    '["prenom_formateur","formation","entite"]'
  )
) AS t(key, category, recipient_type, name, subject, body, type, variables)
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates et
  WHERE et.entity_id = e.id
    AND et.key = t.key
    AND et.is_active = TRUE
);

-- ============================================================
-- VALIDATION POST-MIGRATION
-- ============================================================
--
-- a) Compter les seedés par entité (attendu : 22 par entité) :
--    SELECT entity_id, COUNT(*) AS seeded
--    FROM email_templates
--    WHERE trigger_config->>'seed_version' = '2026-05-28-v1'
--    GROUP BY entity_id;
--
-- b) Vérifier que tous les REQUIRED_KEYS sont présents pour chaque entité :
--    SELECT e.name AS entity, k.key AS missing_key
--    FROM entities e
--    CROSS JOIN (VALUES
--      ('reminder_invoice_first'),('reminder_invoice_second'),('reminder_invoice_final'),
--      ('reminder_quote_first'),('reminder_quote_second'),('reminder_quote_final'),
--      ('quote_sign_request'),('opco_deposit'),
--      ('batch_convocation'),('batch_attestation_assiduite'),('batch_certificat_realisation'),
--      ('batch_attestation_competences'),('batch_attestation_abandon'),
--      ('batch_avis_habilitation_electrique'),('batch_certificat_travail_hauteur'),
--      ('batch_attestation_aipr'),('batch_reponses_satisfaction'),
--      ('batch_resultats_evaluations'),('batch_cgv'),('batch_politique_confidentialite'),
--      ('batch_bilans_poe'),('batch_programme'),('batch_convention_entreprise'),
--      ('batch_convention_intervention')
--    ) AS k(key)
--    WHERE NOT EXISTS (
--      SELECT 1 FROM email_templates t
--      WHERE t.entity_id = e.id AND t.key = k.key AND t.is_active = TRUE
--    )
--    ORDER BY e.name, k.key;
--    → Résultat attendu : 0 ligne (aucun missing)
--
-- ============================================================
-- ROLLBACK
-- ============================================================
-- Supprime uniquement les lignes seedées (préserve les customisations
-- éventuelles de Loris) :
--
-- DELETE FROM email_templates
-- WHERE trigger_config->>'seed_version' = '2026-05-28-v1';
