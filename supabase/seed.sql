-- ============================================================
-- LMS MR FORMATION - Données de démonstration (seed.sql)
-- Version 1.0 - Février 2026
-- ============================================================
-- IMPORTANT: Ce script suppose que le schema.sql a déjà été
-- exécuté et que les deux entités (MR FORMATION, C3V FORMATION)
-- existent dans la table `entities`.
--
-- Les profils (profiles) sont créés automatiquement par le
-- trigger `on_auth_user_created` lors de la création d'un
-- utilisateur dans Supabase Auth. Il faut donc créer les
-- utilisateurs auth AVANT d'exécuter ce script si vous
-- voulez lier des profils aux formateurs.
--
-- Pour créer des utilisateurs auth :
--   Supabase Dashboard > Authentication > Users > Add user
-- ============================================================

-- ============================================================
-- VARIABLES LOCALES (UUIDs des entités)
-- ============================================================
-- Récupérer l'UUID de MR FORMATION
DO $$
DECLARE
  v_entity_mr   UUID;
  v_entity_c3v  UUID;

  -- Clients
  v_client_1    UUID := gen_random_uuid();
  v_client_2    UUID := gen_random_uuid();
  v_client_3    UUID := gen_random_uuid();
  v_client_4    UUID := gen_random_uuid();

  -- Formateurs
  v_trainer_1   UUID := gen_random_uuid();
  v_trainer_2   UUID := gen_random_uuid();
  v_trainer_3   UUID := gen_random_uuid();

  -- Formations
  v_training_1  UUID := gen_random_uuid();
  v_training_2  UUID := gen_random_uuid();
  v_training_3  UUID := gen_random_uuid();

  -- Sessions
  v_session_1   UUID := gen_random_uuid();
  v_session_2   UUID := gen_random_uuid();
  v_session_3   UUID := gen_random_uuid();

  -- Apprenants
  v_learner_1   UUID := gen_random_uuid();
  v_learner_2   UUID := gen_random_uuid();
  v_learner_3   UUID := gen_random_uuid();
  v_learner_4   UUID := gen_random_uuid();

  -- Prospects CRM
  v_prospect_1  UUID := gen_random_uuid();
  v_prospect_2  UUID := gen_random_uuid();
  v_prospect_3  UUID := gen_random_uuid();
  v_prospect_4  UUID := gen_random_uuid();

  -- Questionnaires
  v_questionnaire_1 UUID := gen_random_uuid();
  v_questionnaire_2 UUID := gen_random_uuid();

  -- Templates email
  v_email_tpl_1 UUID := gen_random_uuid();
  v_email_tpl_2 UUID := gen_random_uuid();

BEGIN

  -- ============================================================
  -- Récupérer les entités
  -- ============================================================
  SELECT id INTO v_entity_mr  FROM entities WHERE slug = 'mr-formation'  LIMIT 1;
  SELECT id INTO v_entity_c3v FROM entities WHERE slug = 'c3v-formation' LIMIT 1;

  IF v_entity_mr IS NULL THEN
    RAISE EXCEPTION 'Entité MR FORMATION introuvable. Assurez-vous d''avoir exécuté schema.sql en premier.';
  END IF;

  IF v_entity_c3v IS NULL THEN
    RAISE EXCEPTION 'Entité C3V FORMATION introuvable. Assurez-vous d''avoir exécuté schema.sql en premier.';
  END IF;

  -- ============================================================
  -- CLIENTS - MR FORMATION (2 clients)
  -- ============================================================
  INSERT INTO clients (id, entity_id, company_name, siret, address, city, postal_code, website, sector, status, notes)
  VALUES
    (
      v_client_1,
      v_entity_mr,
      'Groupe Technika Solutions',
      '82341567800024',
      '14 Rue de la République',
      'Lyon',
      '69001',
      'https://technika-solutions.fr',
      'Informatique & Numérique',
      'active',
      'Client fidèle depuis 2023. Commandes régulières de formations bureautique et cybersécurité.'
    ),
    (
      v_client_2,
      v_entity_mr,
      'BTP Horizon Constructions',
      '73812034500018',
      '8 Avenue des Entrepreneurs',
      'Bordeaux',
      '33000',
      NULL,
      'BTP & Construction',
      'active',
      'Partenariat sur les formations sécurité chantier et habilitations électriques.'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- CLIENTS - C3V FORMATION (2 clients supplémentaires)
  -- ============================================================
  INSERT INTO clients (id, entity_id, company_name, siret, address, city, postal_code, website, sector, status, notes)
  VALUES
    (
      v_client_3,
      v_entity_c3v,
      'Santé Plus Cliniques',
      '65234178900011',
      '22 Boulevard de la Santé',
      'Toulouse',
      '31000',
      'https://santeplus.fr',
      'Santé & Médico-social',
      'active',
      'Groupe de cliniques privées. Formations en gestes et postures, bientraitance.'
    ),
    (
      v_client_4,
      v_entity_c3v,
      'Mairie de Saint-Emilion',
      '21330072400017',
      '1 Place du Marché',
      'Saint-Emilion',
      '33330',
      'https://saint-emilion.fr',
      'Secteur Public',
      'prospect',
      'Contact pris en janvier 2026. Intéressés par formations management et communication.'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- CONTACTS des clients
  -- ============================================================
  INSERT INTO contacts (client_id, first_name, last_name, email, phone, job_title, is_primary)
  VALUES
    (v_client_1, 'Sophie',   'Marchand',  's.marchand@technika-solutions.fr',  '04 72 00 11 22', 'Responsable RH',         TRUE),
    (v_client_1, 'David',    'Lecomte',   'd.lecomte@technika-solutions.fr',   '04 72 00 33 44', 'Directeur Technique',    FALSE),
    (v_client_2, 'Pierre',   'Beaumont',  'p.beaumont@btphorizon.fr',          '05 56 00 12 34', 'DRH',                    TRUE),
    (v_client_2, 'Amélie',   'Fontaine',  'a.fontaine@btphorizon.fr',          '05 56 00 56 78', 'Assistante Formation',   FALSE),
    (v_client_3, 'Nathalie', 'Rousseau',  'n.rousseau@santeplus.fr',           '05 61 00 22 33', 'Directrice des Soins',   TRUE),
    (v_client_4, 'François', 'Dupont',    'f.dupont@saint-emilion.fr',         '05 57 24 70 71', 'Directeur Général',      TRUE)
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- FORMATEURS (2 pour MR FORMATION, 1 pour C3V FORMATION)
  -- ============================================================
  INSERT INTO trainers (id, entity_id, first_name, last_name, email, phone, type, bio, hourly_rate, availability_notes)
  VALUES
    (
      v_trainer_1,
      v_entity_mr,
      'Jean-Paul',
      'Moreau',
      'jp.moreau@mr-formation.fr',
      '06 12 34 56 78',
      'internal',
      'Formateur expert en bureautique et outils numériques. 15 ans d''expérience en formation professionnelle. Certifié Microsoft Office Specialist.',
      85.00,
      'Disponible lundi au vendredi. Déplacements possibles en Auvergne-Rhône-Alpes.'
    ),
    (
      v_trainer_2,
      v_entity_mr,
      'Isabelle',
      'Garnier',
      'i.garnier@mr-formation.fr',
      '06 98 76 54 32',
      'internal',
      'Spécialisée en management, leadership et communication interpersonnelle. Coach certifiée ICF. 10 ans en RH et formation.',
      95.00,
      'Disponible sur tout le territoire. Téléprésentiel et présentiel.'
    ),
    (
      v_trainer_3,
      v_entity_c3v,
      'Marc',
      'Lefebvre',
      'm.lefebvre@c3v-formation.fr',
      '06 55 44 33 22',
      'external',
      'Consultant indépendant, expert en sécurité au travail et prévention des risques. Intervenant habilité IPRP.',
      110.00,
      'Disponible 3 semaines par mois. Zone Nouvelle-Aquitaine et Occitanie.'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- COMPETENCES DES FORMATEURS
  -- ============================================================
  INSERT INTO trainer_competencies (trainer_id, competency, level)
  VALUES
    (v_trainer_1, 'Microsoft Excel',          'expert'),
    (v_trainer_1, 'Microsoft Word',           'expert'),
    (v_trainer_1, 'Microsoft PowerPoint',     'expert'),
    (v_trainer_1, 'Cybersécurité de base',    'intermediate'),
    (v_trainer_1, 'Google Workspace',         'intermediate'),
    (v_trainer_2, 'Management d''équipe',     'expert'),
    (v_trainer_2, 'Communication',            'expert'),
    (v_trainer_2, 'Leadership',               'expert'),
    (v_trainer_2, 'Gestion du stress',        'intermediate'),
    (v_trainer_2, 'Prise de parole',          'expert'),
    (v_trainer_3, 'Sécurité au travail',      'expert'),
    (v_trainer_3, 'Habilitations électriques','expert'),
    (v_trainer_3, 'Gestes et postures',       'expert'),
    (v_trainer_3, 'Prévention des risques',   'expert')
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- FORMATIONS (3 au catalogue - entité MR FORMATION)
  -- ============================================================
  INSERT INTO trainings (id, entity_id, title, description, objectives, duration_hours, max_participants, price_per_person, category, certification, prerequisites, is_active)
  VALUES
    (
      v_training_1,
      v_entity_mr,
      'Excel Avancé - Tableaux Croisés Dynamiques et Macros',
      'Formation approfondie sur Microsoft Excel pour utilisateurs intermédiaires souhaitant maîtriser les fonctionnalités avancées : TCD, formules complexes, VBA de base et automatisation.',
      E'- Maîtriser les tableaux croisés dynamiques\n- Créer des formules avancées (INDEX, EQUIV, SUMIFS)\n- Automatiser des tâches répétitives avec les macros VBA\n- Créer des tableaux de bord dynamiques',
      14.00,
      12,
      490.00,
      'Bureautique & Numérique',
      'Attestation de formation Microsoft Excel Avancé',
      'Connaissance de base d''Excel requise (formules simples, mise en forme)',
      TRUE
    ),
    (
      v_training_2,
      v_entity_mr,
      'Management et Leadership - Prendre sa Place de Manager',
      'Formation destinée aux nouveaux managers et managers confirmés souhaitant développer leur posture managériale, renforcer la cohésion de leur équipe et améliorer leur communication.',
      E'- Comprendre les différents styles de management\n- Développer son intelligence émotionnelle\n- Conduire des entretiens individuels efficaces\n- Gérer les conflits et situations difficiles\n- Motiver et fidéliser son équipe',
      21.00,
      10,
      890.00,
      'Management & Leadership',
      'Attestation de formation Management et Leadership',
      'Aucun prérequis. Recommandé pour toute personne en situation de management.',
      TRUE
    ),
    (
      v_training_3,
      v_entity_mr,
      'Sécurité Informatique - Sensibilisation aux Cybermenaces',
      'Formation de sensibilisation à la cybersécurité pour tous les collaborateurs. Comprendre les risques numériques et adopter les bons réflexes au quotidien.',
      E'- Identifier les principales cybermenaces (phishing, ransomware, ingénierie sociale)\n- Adopter les bonnes pratiques de gestion des mots de passe\n- Sécuriser ses communications et ses données\n- Réagir correctement en cas d''incident de sécurité',
      7.00,
      20,
      290.00,
      'Cybersécurité',
      'Attestation de sensibilisation à la cybersécurité',
      'Aucun prérequis technique. Formation accessible à tous les niveaux.',
      TRUE
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- SESSIONS (2 sessions planifiées, 1 terminée)
  -- ============================================================
  INSERT INTO sessions (id, training_id, entity_id, title, start_date, end_date, location, mode, status, max_participants, trainer_id, notes)
  VALUES
    (
      v_session_1,
      v_training_1,
      v_entity_mr,
      'Excel Avancé - Groupe Lyon Mars 2026',
      '2026-03-10 09:00:00+01',
      '2026-03-11 17:00:00+01',
      'Centre de Formation Lyon 2 - Salle Informatique A',
      'presentiel',
      'upcoming',
      12,
      v_trainer_1,
      'Session confirmée. 8 inscrits à ce jour. Salle équipée de 12 postes informatiques avec Excel 2021.'
    ),
    (
      v_session_2,
      v_training_2,
      v_entity_mr,
      'Management - Promotion Hiver 2026',
      '2026-04-07 09:00:00+02',
      '2026-04-09 17:00:00+02',
      'Hôtel Mercure Lyon Centre - Salle Confluence',
      'presentiel',
      'upcoming',
      10,
      v_trainer_2,
      'Session inter-entreprises. Places encore disponibles. Déjeuner inclus.'
    ),
    (
      v_session_3,
      v_training_3,
      v_entity_mr,
      'Cybersécurité - Technika Solutions Janvier 2026',
      '2026-01-15 09:00:00+01',
      '2026-01-15 17:00:00+01',
      'Technika Solutions - Salle de réunion principale',
      'presentiel',
      'upcoming',
      20,
      v_trainer_1,
      'Session intra-entreprise pour Technika Solutions. 18 participants prévus.'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- APPRENANTS
  -- ============================================================
  INSERT INTO learners (id, entity_id, client_id, first_name, last_name, email, phone, job_title, created_at)
  VALUES
    (v_learner_1, v_entity_mr, v_client_1, 'Thomas',   'Bernard',  't.bernard@technika-solutions.fr',  '04 72 00 55 66', 'Analyste Données',        '2026-02-03 10:00:00+01'),
    (v_learner_2, v_entity_mr, v_client_1, 'Julie',    'Martin',   'j.martin@technika-solutions.fr',   '04 72 00 77 88', 'Chargée de projet',       '2026-02-10 14:30:00+01'),
    (v_learner_3, v_entity_mr, v_client_2, 'Nicolas',  'Perrin',   'n.perrin@btphorizon.fr',           '05 56 00 90 12', 'Chef de chantier',        '2026-02-15 09:00:00+01'),
    (v_learner_4, v_entity_mr, v_client_2, 'Cécile',   'Dubois',   'c.dubois@btphorizon.fr',           '05 56 00 34 56', 'Conductrice de travaux',  '2026-02-20 11:15:00+01')
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- INSCRIPTIONS AUX SESSIONS
  -- ============================================================
  INSERT INTO enrollments (session_id, learner_id, client_id, status, completion_rate)
  VALUES
    -- Session Excel Mars 2026
    (v_session_1, v_learner_1, v_client_1, 'confirmed',  0),
    (v_session_1, v_learner_2, v_client_1, 'confirmed',  0),
    -- Session Management Avril 2026
    (v_session_2, v_learner_3, v_client_2, 'registered', 0),
    -- Session Cybersécurité (à venir)
    (v_session_3, v_learner_1, v_client_1, 'confirmed',  0),
    (v_session_3, v_learner_2, v_client_1, 'confirmed',  0)
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- QUESTIONNAIRES
  -- ============================================================
  INSERT INTO questionnaires (id, entity_id, title, description, type, is_active)
  VALUES
    (
      v_questionnaire_1,
      v_entity_mr,
      'Questionnaire de satisfaction - Formation standard',
      'Questionnaire envoyé à tous les apprenants à la fin de chaque session de formation.',
      'satisfaction',
      TRUE
    ),
    (
      v_questionnaire_2,
      v_entity_mr,
      'Evaluation des acquis - Pré / Post formation',
      'Questionnaire d''évaluation des connaissances avant et après la formation pour mesurer la progression.',
      'evaluation',
      TRUE
    )
  ON CONFLICT DO NOTHING;

  -- Questions du questionnaire de satisfaction
  INSERT INTO questions (questionnaire_id, text, type, options, order_index, is_required)
  VALUES
    (v_questionnaire_1, 'Comment évaluez-vous la qualité globale de la formation ?',
     'rating', NULL, 1, TRUE),
    (v_questionnaire_1, 'Le formateur était-il pédagogue et disponible pour répondre aux questions ?',
     'rating', NULL, 2, TRUE),
    (v_questionnaire_1, 'Le contenu de la formation correspondait-il à vos attentes ?',
     'rating', NULL, 3, TRUE),
    (v_questionnaire_1, 'Recommanderiez-vous cette formation à un collègue ?',
     'yes_no', NULL, 4, TRUE),
    (v_questionnaire_1, 'Quels points pourraient être améliorés dans cette formation ?',
     'text', NULL, 5, FALSE),
    (v_questionnaire_1, 'Quel est votre niveau de satisfaction général ?',
     'multiple_choice',
     '["Très satisfait(e)", "Satisfait(e)", "Peu satisfait(e)", "Pas satisfait(e)"]',
     6, TRUE)
  ON CONFLICT DO NOTHING;

  -- Réponse exemple (session terminée)
  INSERT INTO questionnaire_responses (questionnaire_id, session_id, learner_id, responses, submitted_at)
  VALUES
    (
      v_questionnaire_1,
      v_session_3,
      v_learner_1,
      '{
        "q1": 5,
        "q2": 4,
        "q3": 5,
        "q4": true,
        "q5": "Les exercices pratiques étaient très bien. Peut-être un peu plus de temps sur les macros VBA.",
        "q6": "Très satisfait(e)"
      }',
      '2026-01-15 17:30:00+01'
    ),
    (
      v_questionnaire_1,
      v_session_3,
      v_learner_2,
      '{
        "q1": 4,
        "q2": 5,
        "q3": 4,
        "q4": true,
        "q5": "Formation très complète. Le formateur est excellent.",
        "q6": "Très satisfait(e)"
      }',
      '2026-01-15 17:45:00+01'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- MODELES D'EMAILS
  -- ============================================================
  INSERT INTO email_templates (id, entity_id, name, subject, body, type, variables)
  VALUES
    (
      v_email_tpl_1,
      v_entity_mr,
      'Confirmation d''inscription à une session',
      'Confirmation de votre inscription - {{session_title}}',
      E'Bonjour {{first_name}} {{last_name}},\n\nNous avons bien enregistré votre inscription à la formation suivante :\n\n- Formation : {{training_title}}\n- Session : {{session_title}}\n- Dates : {{session_dates}}\n- Lieu : {{session_location}}\n- Formateur : {{trainer_name}}\n\nVeuillez vous présenter 10 minutes avant le début de la formation avec une pièce d''identité.\n\nEn cas d''empêchement, merci de nous prévenir au plus tôt à l''adresse : contact@mr-formation.fr\n\nCordialement,\nL''équipe MR FORMATION\nTél : 04 XX XX XX XX\ncontact@mr-formation.fr',
      'confirmation',
      '["first_name", "last_name", "session_title", "training_title", "session_dates", "session_location", "trainer_name"]'
    ),
    (
      v_email_tpl_2,
      v_entity_mr,
      'Rappel J-7 avant la session',
      'Rappel - Votre formation {{training_title}} commence dans 7 jours',
      E'Bonjour {{first_name}},\n\nVotre formation approche ! Voici un rappel des informations pratiques :\n\n- Formation : {{training_title}}\n- Date de début : {{start_date}}\n- Lieu : {{session_location}}\n- Formateur : {{trainer_name}}\n\nPensez à apporter :\n- Une pièce d''identité\n- De quoi prendre des notes\n\nNous vous souhaitons une excellente formation.\n\nCordialement,\nL''équipe MR FORMATION',
      'reminder',
      '["first_name", "training_title", "start_date", "session_location", "trainer_name"]'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- CRM - PROSPECTS
  -- ============================================================
  INSERT INTO crm_prospects (id, entity_id, company_name, siret, contact_name, email, phone, status, source, notes)
  VALUES
    (
      v_prospect_1,
      v_entity_mr,
      'Industrie Métallurgique Rhône',
      '45123678900034',
      'Gérard Morin',
      'g.morin@imrhone.fr',
      '04 78 99 11 22',
      'qualified',
      'Appel entrant',
      'Besoin de formations habilitations électriques pour 25 techniciens. Budget annuel ~15 000€. Décision en mars 2026.'
    ),
    (
      v_prospect_2,
      v_entity_mr,
      'Cabinet Comptable Fiduciaire Loire',
      '31456789000012',
      'Martine Chevalier',
      'm.chevalier@fiduciaire-loire.fr',
      '04 77 22 33 44',
      'contacted',
      'Salon RH Paris 2025',
      'Rencontre au salon RH. Intéressés par les formations Excel et PowerBI. Relance prévue le 25/02/2026.'
    ),
    (
      v_prospect_3,
      v_entity_mr,
      'LogiTrans Frères et Associés',
      '56234890100023',
      'Patrick Renaud',
      'p.renaud@logitrans.fr',
      '06 70 80 90 11',
      'proposal',
      'Recommandation client',
      'Devis envoyé le 10/02/2026 pour 3 sessions de formation gestes et postures (45 salariés). En attente de retour.'
    ),
    (
      v_prospect_4,
      v_entity_mr,
      'Ecole Privée Saint-Nicolas',
      '19269001400028',
      'Marie-Christine Blanc',
      'mc.blanc@ecole-saintnicolas.fr',
      '04 73 11 22 33',
      'new',
      'Site web',
      'Formulaire de contact reçu le 18/02/2026. Besoin de formations management pour directeurs de site.'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- CRM - TACHES
  -- ============================================================
  INSERT INTO crm_tasks (entity_id, title, description, status, priority, due_date, prospect_id)
  VALUES
    (
      v_entity_mr,
      'Envoyer le devis à Industrie Métallurgique Rhône',
      'Préparer et envoyer le devis pour 25 habilitations électriques B1V-BR-BC. Inclure les dates disponibles en avril-mai 2026.',
      'pending',
      'high',
      '2026-02-28',
      v_prospect_1
    ),
    (
      v_entity_mr,
      'Relancer Cabinet Fiduciaire Loire',
      'Relance téléphonique pour qualifier le besoin Excel/PowerBI. Proposer une démo ou une formation découverte.',
      'pending',
      'medium',
      '2026-02-25',
      v_prospect_2
    ),
    (
      v_entity_mr,
      'Suivre le devis LogiTrans - Réponse attendue',
      'Relancer Patrick Renaud si pas de réponse au devis d''ici le 17/02. Le devis expire le 15/03/2026.',
      'in_progress',
      'high',
      '2026-02-24',
      v_prospect_3
    ),
    (
      v_entity_mr,
      'Contacter Ecole Saint-Nicolas - Prise de RDV',
      'Appeler Marie-Christine Blanc pour qualifier le besoin et fixer un rendez-vous de présentation.',
      'pending',
      'medium',
      '2026-02-22',
      v_prospect_4
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- CRM - DEVIS
  -- ============================================================
  INSERT INTO crm_quotes (entity_id, reference, prospect_id, amount, status, valid_until, notes)
  VALUES
    (
      v_entity_mr,
      'DEV-2026-0012',
      v_prospect_3,
      4350.00,
      'sent',
      '2026-03-15',
      'Devis pour 3 sessions de formation Gestes et Postures - 45 salariés répartis en 3 groupes de 15. Prix unitaire 290€/personne.'
    ),
    (
      v_entity_mr,
      'DEV-2026-0013',
      v_prospect_1,
      NULL,
      'draft',
      '2026-03-31',
      'Devis en cours de préparation pour 25 habilitations électriques. En attente du programme détaillé.'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- QUALITY SCORES (données importées du fichier Excel)
  -- ============================================================
  INSERT INTO quality_scores (entity_id, formation, year, month, eval_preformation, eval_pendant, eval_postformation, auto_eval_pre, auto_eval_post, satisfaction_chaud, satisfaction_froid, quest_formateurs, quest_financeurs, quest_managers, quest_entreprises, autres_quest)
  VALUES
    (v_entity_mr, 'THÉRAPIES NON MÉDICAMENTEUSES (Dupliqué)', 2026, '2026-01', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Ethique et décision dans les soins', 2026, '2026-02', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'THÉRAPIES NON MÉDICAMENTEUSES', 2026, '2026-03', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Circuit du Médicament', 2026, '2026-04', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Violence et troubles psychiatriques chez la personne âgée', 2026, '2026-05', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Le Toucher Relationnel', 2026, '2026-06', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Recommandations des bonnes pratiques professionnelles en EHPAD', 2026, '2026-07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'THÉRAPIES NON MÉDICAMENTEUSES', 2026, '2026-08', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'GEM RCN en EHPAD', 2026, '2026-09', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Circuit du Médicament', 2026, '2026-10', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'RGPD et DPO en EHPAD', 2026, '2026-11', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'La pair-aidance en EHPAD', 2026, '2026-12', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Circuit du Médicament', 2026, '2026-01', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'La fin de vie en établissement et les modalités d''information des autres résidents', 2026, '2026-02', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Gestion de la relation avec les proches aidants en SSIAD', 2026, '2026-03', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Initiation aux méthodes HACCP', 2026, '2026-04', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'La fin de vie en établissement et les modalités d''information des autres résidents', 2026, '2026-05', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Gestion du stress', 2026, '2026-06', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Gestion de l''accueil téléphonique et physique en EHPAD', 2026, '2026-07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'L''acte transfusionnel', 2026, '2026-08', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'La communication avec les familles des patients', 2026, '2026-09', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Gestion des troubles du comportement', 2026, '2026-10', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'TROUBLES DU COMPORTEMENTS', 2026, '2026-11', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Techniques de soins non médicamenteuse', 2026, '2026-12', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Initiation aux méthodes HACCP', 2026, '2026-01', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Communication bienveillante entre professionnels', 2026, '2026-02', NULL, NULL, NULL, 65.83, NULL, 91.07, 52.36, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Optimiser et structurer les processus IA dans un organisme de formation', 2026, '2026-03', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'L''ACCOMPAGNEMENT SPECIFIQUE DES PERSONNES VIEILLISSANTES A PATHOLOGIES PSYCHIATRIQUES ET CONDUITES ADDICTIVES', 2026, '2026-04', NULL, NULL, NULL, 31.07, 69.82, 98.00, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Intelligence Artificielle Opérationnelle : transformer son métier avec les IA génératives', 2026, '2026-05', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Anxiété, angoisse : répondre aux demandes de réassurance en Ehpad', 2026, '2026-06', NULL, NULL, NULL, 64.36, 92.00, 97.64, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Appliquer la méthode Montessori en Ehpad : autonomie, respect et stimulation des résidents', 2026, '2026-07', NULL, NULL, NULL, NULL, NULL, 96.22, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Gérer avec sérénité les relations avec les locataires … pas si sereins ! (LIVIA)', 2025, '2025-08', NULL, NULL, NULL, 53.47, 63.81, 100.00, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Digitalisation de la prospection et création d''un site vitrine', 2025, '2025-09', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Vocabulaire technique du bâtiment', 2025, '2025-10', NULL, NULL, NULL, 57.74, 82.14, 86.29, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'THÉRAPIES NON MÉDICAMENTEUSES', 2025, '2025-11', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Gérer avec sérénité les relations avec les locataires … pas si sereins ! (LIVIA)', 2025, '2025-12', NULL, NULL, NULL, 72.59, 85.54, 97.75, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Éthique et Fin de Vie', 2025, '2025-01', NULL, NULL, NULL, 57.28, 92.10, 97.33, NULL, 100.00, NULL, NULL, 29.00, NULL),
    (v_entity_mr, 'LA BIENTRAITANCE AUTOURS DU REPAS', 2025, '2025-02', NULL, NULL, NULL, 69.17, 95.56, 98.00, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Développer sa posture de manager', 2025, '2025-03', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Gestes et postures (Manutention)', 2025, '2025-04', NULL, NULL, NULL, 66.83, 92.22, 95.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Les fondamentaux pour devenir manager de proximité', 2025, '2025-05', NULL, NULL, NULL, 49.72, 81.67, 93.60, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'THÉRAPIES NON MÉDICAMENTEUSES', 2025, '2025-06', NULL, NULL, NULL, 55.61, 83.27, 100.00, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Les charges récupérables', 2025, '2025-07', NULL, NULL, NULL, 49.67, 73.50, 87.20, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Soins palliatifs : Accompagnement en fin de vie', 2025, '2025-08', NULL, NULL, NULL, 67.50, 97.86, 100.00, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'MANAGERS – PRÉVENTION DES RISQUES PSYCHO-SOCIAUX', 2025, '2025-09', NULL, NULL, NULL, 56.67, 80.63, 73.50, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'SNOEZELEN , un espace sensoriel', 2025, '2025-10', NULL, NULL, NULL, 12.41, 82.29, 94.00, NULL, 90.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Vaincre la vacance et gagner en performance', 2025, '2025-11', NULL, NULL, NULL, 77.74, 87.78, 57.20, NULL, 80.00, NULL, NULL, 38.00, NULL),
    (v_entity_mr, 'Vaincre la vacance et gagner en performance', 2025, '2025-12', NULL, NULL, NULL, 53.98, 63.06, 73.14, NULL, 100.00, NULL, NULL, 43.00, NULL),
    (v_entity_mr, 'GESTION DES CONFLITS', 2025, '2025-01', NULL, NULL, NULL, 64.05, 78.66, 87.20, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Coaching chargé d''affaires ETT', 2025, '2025-02', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Gestions des appels téléphoniques', 2025, '2025-03', NULL, NULL, NULL, 73.55, 86.27, 91.45, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Les lésions cérébrales acquises chez l''adulte', 2025, '2025-04', NULL, NULL, NULL, 41.25, 70.63, 72.95, NULL, 90.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'DONNER DES CLES AUX METIERS DE PROXIMITE POUR ABORDER LE QUOTIDIEN AVEC SERENITE', 2025, '2025-05', NULL, NULL, NULL, 82.86, 88.21, 98.00, NULL, 100.00, NULL, NULL, 80.00, NULL),
    (v_entity_mr, 'Etat des lieux d''entree', 2025, '2025-06', NULL, NULL, NULL, 69.93, 84.21, 87.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Simulateur de vieillissement', 2025, '2025-07', NULL, NULL, NULL, 52.50, 86.43, 96.86, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'MANAGEMENT VISUEL', 2025, '2025-08', NULL, NULL, NULL, 42.19, 77.97, 94.00, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Initiation aux méthodes HACCP', 2025, '2025-09', NULL, NULL, NULL, 39.63, 83.33, 87.11, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Le Toucher Relationnel', 2025, '2025-10', NULL, NULL, NULL, 58.64, 89.74, 97.82, NULL, 80.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'MANAGEMENT VISUEL', 2025, '2025-11', NULL, NULL, NULL, 57.32, 88.75, 93.00, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Comprendre et optimiser son parcours en SSIAD', 2025, '2025-12', NULL, NULL, NULL, 75.20, 88.00, 99.20, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'MANAGERS – PRÉVENTION DES RISQUES PSYCHO-SOCIAUX', 2025, '2025-01', NULL, NULL, NULL, 61.88, 90.42, 93.00, NULL, 80.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Coaching responsable d''agence ETT', 2025, '2025-02', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'L''ACCOMPAGNEMENT SPECIFIQUE DES PERSONNES VIEILLISSANTES A PATHOLOGIES PSYCHIATRIQUES ET CONDUITES ADDICTIVES', 2025, '2025-03', NULL, NULL, NULL, 38.65, 60.36, 95.00, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'RÉTROCOMMISSION PARRAINAGE', 2025, '2025-04', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Coaching Responsable administratif et paie ETT', 2025, '2025-05', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'DONNER DES CLES AUX METIERS DE PROXIMITE POUR ABORDER LE QUOTIDIEN AVEC SERENITE', 2025, '2025-06', NULL, NULL, NULL, 84.90, 90.82, 95.00, 75.56, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Prévention du Burnout chez les professionnels de santé', 2025, '2025-07', NULL, NULL, NULL, 55.43, 87.14, 97.71, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'MANAGERS – PRÉVENTION DES RISQUES PSYCHO-SOCIAUX', 2025, '2025-08', NULL, NULL, NULL, 69.31, 91.25, 93.00, NULL, 90.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Contrôle de la glycémie par l''aide-soignant(e)', 2025, '2025-09', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Gestion de crise en EHPAD  - Plan Bleu', 2025, '2025-10', NULL, NULL, NULL, 65.00, 90.00, 90.00, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'FAIRE FACE À LA PRESSION PROFESSIONNELLE', 2025, '2025-11', NULL, NULL, NULL, 72.56, 94.86, 88.75, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Accompagnement des personnes en situation de  handicap au sport', 2025, '2025-12', NULL, NULL, NULL, NULL, NULL, 94.00, NULL, 52.50, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Soins des pieds en EHPAD', 2025, '2025-01', NULL, NULL, NULL, NULL, 98.13, 99.11, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'DONNER DES CLES AUX METIERS DE PROXIMITE POUR ABORDER LE QUOTIDIEN AVEC SERENITE', 2025, '2025-02', NULL, NULL, NULL, 78.57, 87.32, 97.11, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Optimisez votre communication managériale', 2025, '2025-03', NULL, NULL, NULL, 72.75, 74.20, 87.00, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Accompagnement à la gestion d''une entreprise de travail temporaire', 2025, '2025-04', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'FAIRE FACE À LA PRESSION PROFESSIONNELLE', 2025, '2025-05', NULL, NULL, NULL, 56.20, 89.80, 93.78, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Prévenir et gérer les ruptures dans le parcours de soins', 2025, '2025-06', NULL, NULL, NULL, 54.50, 80.91, 91.92, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Communication non violente', 2025, '2025-07', NULL, NULL, NULL, 68.17, 90.00, 90.37, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'L''acte transfusionnel', 2025, '2025-08', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'LA TOILETTE BIENVEILLANTE ET SIMULATEUR DE VIEILLISSEMENT', 2025, '2025-09', NULL, NULL, NULL, 77.50, 87.71, 99.34, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'LA BIENTRAITANCE', 2025, '2025-10', NULL, NULL, NULL, 62.38, 89.50, 96.00, NULL, 100.00, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Maîtriser la gestion administrative dans une Entreprise de Travail Temporaire', 2025, '2025-11', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'LA TOILETTE ÉVALUATIVE', 2025, '2025-12', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Optimisez votre communication managériale', 2025, '2025-01', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'La place des familles et des aidants dans la relation de soins', 2025, '2025-02', NULL, NULL, NULL, NULL, NULL, 99.20, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Intégrer l''IA dans votre quotidien professionnel', 2025, '2025-03', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Accompagnement des personnes en situation de  handicap au sport', 2025, '2025-04', NULL, NULL, NULL, NULL, NULL, 96.33, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'METHODE DE RELAXATION : YOGA ET SOPHROLOGIE', 2025, '2025-05', NULL, NULL, NULL, NULL, NULL, 96.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Soins palliatifs : Accompagnement en fin de vie', 2025, '2025-06', NULL, NULL, NULL, NULL, NULL, 99.64, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Création de CV et lettre de motivation', 2025, '2025-07', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'RÉUSSIR L''INTÉGRATION D''UN SALARIÉ', 2025, '2025-08', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'LA BIENTRAITANCE', 2025, '2025-09', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Accompagnement à la gestion d''une entreprise de travail temporaire', 2025, '2025-10', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Gestes et postures (Manutention)', 2025, '2025-11', NULL, NULL, NULL, NULL, NULL, 99.50, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Communiquer avec le patient et sa famille', 2025, '2025-12', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Renforcer la cohésion d''équipe', 2025, '2025-01', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Gestes et postures (Manutention)', 2025, '2025-02', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Renforcer la cohésion d''équipe', 2025, '2025-03', NULL, NULL, NULL, NULL, NULL, 99.45, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'MISE À DISPOSITION DE PERSONNEL', 2025, '2025-04', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Douleur chez la personne âgée', 2025, '2025-05', NULL, NULL, NULL, NULL, NULL, 100.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (v_entity_mr, 'Accompagner les Managers de Proximité dans leurs missions auprès de leur équipe', 2025, '2025-06', NULL, NULL, NULL, NULL, NULL, 99.60, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT DO NOTHING;


  -- ============================================================
  -- FIN DU SCRIPT
  -- ============================================================
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'Seed data inserted successfully!';
  RAISE NOTICE '  - 4 clients (2 MR FORMATION, 2 C3V FORMATION)';
  RAISE NOTICE '  - 6 contacts client';
  RAISE NOTICE '  - 3 formateurs (2 MR FORMATION, 1 C3V FORMATION)';
  RAISE NOTICE '  - 14 compétences formateurs';
  RAISE NOTICE '  - 3 formations au catalogue';
  RAISE NOTICE '  - 3 sessions (2 a venir, 1 terminee)';
  RAISE NOTICE '  - 4 apprenants';
  RAISE NOTICE '  - 5 inscriptions';
  RAISE NOTICE '  - 2 questionnaires + 6 questions + 2 reponses';
  RAISE NOTICE '  - 2 modeles d''email';
  RAISE NOTICE '  - 4 prospects CRM';
  RAISE NOTICE '  - 4 taches CRM';
  RAISE NOTICE '  - 2 devis CRM';
  RAISE NOTICE '  - 102 quality scores (71 pour 2025, 31 pour 2026)';
  RAISE NOTICE '====================================================';

END $$;
