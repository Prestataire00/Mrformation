-- Ajouter un champ montant structuré sur les prospects
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS amount DECIMAL(12,2) DEFAULT NULL;

-- Migrer les montants existants depuis le champ notes (regex extraction)
UPDATE crm_prospects
SET amount = NULLIF(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      (REGEXP_MATCH(notes, 'Montant HT[^:]*:\s*([\d\s.,]+)'))[1],
      '\s', '', 'g'
    ),
    ',', '.', 'g'
  ),
  ''
)::DECIMAL(12,2)
WHERE notes ~ 'Montant HT' AND amount IS NULL;
