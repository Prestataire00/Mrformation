-- ============================================================
-- Migration h-22 : ajout des 23 documents secondaires au CHECK constraint
-- ============================================================
-- Story : bmad_output/implementation-artifacts/h-22-documents-secondaires-attribuables-loris.md
-- Brainstorming : bmad_output/brainstorming/brainstorming-session-2026-05-19-0914.md
--
-- Contexte (2026-05-19) : src/lib/templates/ contient 37 fichiers HTML dont
-- 13 sont branchés au registry SYSTEM_TEMPLATES_BY_DOC_TYPE (les officiels
-- Qualiopi) et 23 sont "fantômes" — le code des templates existe mais ils
-- ne sont pas attribuables aux sessions de formation. La story h-22 les
-- branche au registry + UI ; cette migration étend la CHECK constraint
-- sur formation_convention_documents.doc_type pour autoriser les INSERT.
--
-- Idempotent : DROP + CREATE.
-- À EXÉCUTER DANS LE SUPABASE DASHBOARD SQL EDITOR APRÈS le déploiement
-- du code (sinon les nouveaux INSERT échoueront en violation du CHECK).
-- ============================================================

-- Pre-check (sécurité) : doit retourner 0 sur la première colonne (aucun
-- doc_type existant ne devrait être hors de la liste actuelle).
SELECT
  count(*) AS rows_with_unknown_doc_type,
  array_agg(DISTINCT doc_type) FILTER (
    WHERE doc_type NOT IN (
      'convocation', 'certificat_realisation', 'attestation_assiduite',
      'feuille_emargement', 'feuille_emargement_collectif',
      'micro_certificat', 'planning_semaine',
      'cgv', 'politique_confidentialite', 'reglement_interieur', 'programme_formation',
      'convention_entreprise', 'convention_intervention',
      'custom'
    )
  ) AS unknown_doc_types
FROM formation_convention_documents;

-- ============================================================
-- Reconstruction du CHECK avec les 13 officiels + 23 secondaires + custom
-- ============================================================

ALTER TABLE formation_convention_documents
  DROP CONSTRAINT IF EXISTS formation_convention_documents_doc_type_check;

ALTER TABLE formation_convention_documents
  ADD CONSTRAINT formation_convention_documents_doc_type_check
  CHECK (doc_type IN (
    -- 13 officiels existants
    'convocation', 'certificat_realisation', 'attestation_assiduite',
    'feuille_emargement', 'feuille_emargement_collectif',
    'micro_certificat', 'planning_semaine',
    'cgv', 'politique_confidentialite', 'reglement_interieur', 'programme_formation',
    'convention_entreprise', 'convention_intervention',
    -- 23 nouveaux secondaires h-22
    'avis_hab_elec_generique', 'avis_hab_elec_b0_bf_bs', 'avis_hab_elec_b1v_b2v_br',
    'avis_hab_elec_bf_hf', 'avis_hab_elec_bt_ht', 'avis_hab_elec_bt',
    'avis_hab_elec_h0_b0', 'avis_hab_elec_h0_b0_bf_hf_bs', 'avis_hab_elec_h0_b0_initial',
    'attestation_aipr', 'attestation_competences', 'attestation_abandon_formation',
    'certificat_travail_hauteur', 'certificat_diplome',
    'autorisation_image', 'decharge_responsabilite', 'lettre_decharge_responsabilite',
    'charte_formateur', 'contrat_engagement_stagiaire',
    'bilan_poe', 'reponses_evaluations', 'reponses_satisfaction_session', 'resultats_evaluations',
    -- custom (upload PDF/DOCX libre)
    'custom'
  ));

-- ============================================================
-- Vérification post-migration
-- ============================================================
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'formation_convention_documents_doc_type_check';
-- Doit afficher la nouvelle liste avec les 23 nouveaux types secondaires.
