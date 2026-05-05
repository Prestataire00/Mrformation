-- ============================================================
-- HOTFIX : ajout de planning_semaine + autres types manquants à la
-- CHECK constraint sur formation_convention_documents.doc_type
-- ============================================================
-- Bug client : INSERT échoue avec code 23514 "violates check constraint
-- formation_convention_documents_doc_type_check" lors de l'auto-attribution
-- des docs (TabConventionDocs initializeDefaultDocs) → onglet Documents
-- > Détail reste en spinner permanent + 0 Documents.
--
-- Cause : DEFAULT_COMPANY_DOCS dans le code inclut "planning_semaine",
-- mais la CHECK constraint d'origine (add-convention-tab.sql) ne le liste
-- pas. Tous les INSERT échouent silencieusement (RLS pas en cause, c'est
-- juste la CHECK constraint).
--
-- Fix : DROP + CREATE de la constraint avec la liste complète à jour.
-- ============================================================

ALTER TABLE formation_convention_documents
  DROP CONSTRAINT IF EXISTS formation_convention_documents_doc_type_check;

ALTER TABLE formation_convention_documents
  ADD CONSTRAINT formation_convention_documents_doc_type_check
  CHECK (doc_type IN (
    'convocation', 'certificat_realisation', 'attestation_assiduite',
    'feuille_emargement', 'feuille_emargement_collectif',
    'micro_certificat', 'planning_semaine',
    'cgv', 'politique_confidentialite', 'reglement_interieur', 'programme_formation',
    'convention_entreprise', 'convention_intervention', 'contrat_sous_traitance',
    'custom'
  ));

-- ============================================================
-- Vérification :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'formation_convention_documents_doc_type_check';
-- (doit afficher la liste avec planning_semaine inclus)
-- ============================================================
