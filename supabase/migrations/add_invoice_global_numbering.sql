-- ============================================================
-- Migration : Numérotation séquentielle globale des factures
-- Remplace la numérotation par session par une numérotation
-- séquentielle par (entity_id, fiscal_year, prefix)
-- Date : 2026-04-06
-- ============================================================

-- 1. Nouvelles colonnes
ALTER TABLE formation_invoices
ADD COLUMN IF NOT EXISTS global_number INTEGER;

ALTER TABLE formation_invoices
ADD COLUMN IF NOT EXISTS fiscal_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW());

-- 2. Remplir global_number pour les factures existantes
-- (basé sur l'ordre de création, par entité/année/prefix)
WITH numbered AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY entity_id, EXTRACT(YEAR FROM created_at), prefix
      ORDER BY created_at ASC
    ) AS new_global_number,
    EXTRACT(YEAR FROM created_at) AS year
  FROM formation_invoices
  WHERE global_number IS NULL
)
UPDATE formation_invoices fi
SET global_number = n.new_global_number,
    fiscal_year = n.year
FROM numbered n
WHERE fi.id = n.id;

-- 3. Rendre global_number NOT NULL après remplissage
ALTER TABLE formation_invoices
ALTER COLUMN global_number SET NOT NULL;

-- 4. Recalculer la colonne reference (drop + recreate generated column)
-- Note : on ne peut pas modifier une colonne GENERATED, il faut la recréer
ALTER TABLE formation_invoices DROP COLUMN IF EXISTS reference;

ALTER TABLE formation_invoices
ADD COLUMN reference TEXT GENERATED ALWAYS AS (
  prefix || '-' || fiscal_year::TEXT || '-' || LPAD(global_number::TEXT, 4, '0')
) STORED;

-- 5. Index pour garantir l'unicité et les lookups rapides
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_global_numbering
ON formation_invoices(entity_id, fiscal_year, prefix, global_number);

-- 6. Fonction SQL pour obtenir le prochain numéro
CREATE OR REPLACE FUNCTION next_invoice_number(
  p_entity_id UUID,
  p_fiscal_year INTEGER,
  p_prefix TEXT
) RETURNS INTEGER AS $$
  SELECT COALESCE(
    MAX(global_number), 0
  ) + 1
  FROM formation_invoices
  WHERE entity_id = p_entity_id
    AND fiscal_year = p_fiscal_year
    AND prefix = p_prefix;
$$ LANGUAGE SQL STABLE;
