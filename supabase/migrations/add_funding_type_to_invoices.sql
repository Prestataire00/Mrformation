-- ============================================================
-- Migration : ajout funding_type sur formation_invoices
-- ============================================================
-- Demande client : sélectionner la source de financement au moment de la
-- facturation (et plus uniquement sur le training/programme). Permet d'avoir
-- le type de financement réel lié à chaque facture, indépendamment de la
-- catégorisation BPF du training d'origine.
--
-- Ex : un même training "Excel avancé" peut générer 3 factures avec 3
-- financements différents :
--   - facture 1 → entreprise_privee (plan dev)
--   - facture 2 → cpf
--   - facture 3 → pole_emploi
-- Avant : impossible à distinguer (un seul type sur le training).
--
-- Le BPF doit alors agréger par funding_type de l'INVOICE, pas du training.
-- ============================================================

ALTER TABLE formation_invoices
  ADD COLUMN IF NOT EXISTS funding_type TEXT;

-- Pas de CHECK strict ici (la liste BpfFundingType peut évoluer côté code).
-- Validation côté API + frontend Select.

CREATE INDEX IF NOT EXISTS idx_formation_invoices_funding
  ON formation_invoices(entity_id, funding_type)
  WHERE funding_type IS NOT NULL;
