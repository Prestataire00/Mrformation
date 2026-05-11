-- ============================================================
-- Migration PR 14b : Coordonnées bancaires + mention pénalités sur entities
-- Date : 2026-05-11
-- ============================================================
-- Ajoute les champs nécessaires au redesign PDF facture :
--  1. Coordonnées bancaires (RIB) : affichées sur les factures pour permettre
--     au destinataire de régler. Bloque la génération PDF si IBAN non renseigné.
--  2. Mention pénalités de retard : texte légal L.441-6 stocké en DB pour
--     permettre à l'admin de personnaliser sans toucher au code. Pré-rempli
--     avec la formulation standard utilisée par MR FORMATION.
-- ============================================================

-- 1. Coordonnées bancaires (nullable — saisis dans /admin/settings/organization)
ALTER TABLE entities ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS bank_iban TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS bank_bic TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS bank_beneficiary TEXT;

-- 2. Mention pénalités de retard (article L.441-6 Code de Commerce)
-- Default = formulation standard. Personnalisable par entité.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS invoice_penalty_text TEXT
  DEFAULT 'Conformément à l''article L. 441-6 du Code de Commerce, les pénalités de retard seront calculées à partir de 3 fois le taux d''intérêt légal en vigueur ainsi qu''une indemnité de 40€ seront dues à défaut de règlement le jour suivant la date de paiement figurant sur la facture.';

-- 3. Backfill : appliquer le default aux entités existantes qui ont NULL
UPDATE entities
SET invoice_penalty_text = 'Conformément à l''article L. 441-6 du Code de Commerce, les pénalités de retard seront calculées à partir de 3 fois le taux d''intérêt légal en vigueur ainsi qu''une indemnité de 40€ seront dues à défaut de règlement le jour suivant la date de paiement figurant sur la facture.'
WHERE invoice_penalty_text IS NULL;
