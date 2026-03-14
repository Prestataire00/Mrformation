-- ============================================================
-- Migration: Créer la table quality_scores + insérer les données
-- Exécuter ce script dans le SQL Editor de Supabase Dashboard
-- ============================================================

-- 1. Créer la table
CREATE TABLE IF NOT EXISTS quality_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  formation TEXT NOT NULL,
  year INTEGER NOT NULL,
  month TEXT,
  eval_preformation NUMERIC(7,2),
  eval_pendant NUMERIC(7,2),
  eval_postformation NUMERIC(7,2),
  auto_eval_pre NUMERIC(7,2),
  auto_eval_post NUMERIC(7,2),
  satisfaction_chaud NUMERIC(7,2),
  satisfaction_froid NUMERIC(7,2),
  quest_financeurs NUMERIC(7,2),
  quest_formateurs NUMERIC(7,2),
  quest_managers NUMERIC(7,2),
  quest_entreprises NUMERIC(7,2),
  autres_quest NUMERIC(7,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Insérer les données depuis le fichier Excel
DO $$
DECLARE
  v_entity_mr UUID;
BEGIN
  SELECT id INTO v_entity_mr FROM entities WHERE slug = 'mr-formation' LIMIT 1;

  IF v_entity_mr IS NULL THEN
    RAISE EXCEPTION 'Entité MR FORMATION introuvable.';
  END IF;

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

  RAISE NOTICE 'quality_scores: 102 rows inserted (71 for 2025, 31 for 2026)';
END $$;

-- 3. Enable RLS
ALTER TABLE quality_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quality_scores_read_all" ON quality_scores
  FOR SELECT USING (true);

CREATE POLICY "quality_scores_admin_write" ON quality_scores
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
