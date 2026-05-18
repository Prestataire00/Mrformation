-- ============================================================
-- Migration : retrait du doc_type "contrat_sous_traitance"
-- ============================================================
-- Contexte (2026-05-18) : le type contrat_sous_traitance était un doublon
-- strict de convention_intervention dans le code (même template HTML, même
-- footer, même ownerType "trainer", source de confusion utilisateur).
--
-- Décision Wissam : suppression du type. Confirmé : aucun document existant
-- en prod n'utilise ce doc_type (SELECT count(*) = 0 vérifié avant migration).
-- Pas de migration de rows nécessaire.
--
-- Côté code : références retirées dans le commit du même jour (registry,
-- types, UI, API, services, tests). Cette migration retire la valeur du
-- CHECK constraint sur formation_convention_documents.doc_type.
--
-- Idempotent : DROP + CREATE.
--
-- À EXÉCUTER DANS LE SUPABASE DASHBOARD SQL EDITOR APRÈS le déploiement
-- du code (sinon les anciens builds peuvent encore tenter d'insérer le type
-- et ça passera, mais la query SELECT côté nouveau code ne s'en soucie pas).
-- ============================================================

-- Sécurité : vérification préalable (doit retourner 0)
SELECT
  count(*) AS rows_with_contrat_sous_traitance,
  count(*) FILTER (WHERE is_signed) AS rows_signed,
  count(*) FILTER (WHERE is_sent) AS rows_sent
FROM formation_convention_documents
WHERE doc_type = 'contrat_sous_traitance';

-- Si la query ci-dessus retourne 0 partout → safe à dérouler.
-- Sinon → décider quoi faire des rows (migrer vers convention_intervention
-- ou les supprimer) AVANT de toucher au CHECK.

-- ============================================================
-- Reconstruction du CHECK sans contrat_sous_traitance
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
    'convention_entreprise', 'convention_intervention',
    'custom'
  ));

-- Vérification post-migration :
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'formation_convention_documents_doc_type_check';
-- Doit afficher la nouvelle liste SANS 'contrat_sous_traitance'.
