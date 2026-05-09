-- ============================================================
-- Migration PR 14 : Format référence FAC-YY-NNNN + TVA 20% par défaut
-- Date : 2026-05-09
-- ============================================================
-- Changements :
--  1. Format référence facture : FAC-2026-0042 → FAC-26-0042 (2-digit année)
--     ⚠️ Recalcule la `reference` pour TOUTES les factures existantes (GENERATED column).
--     Si des PDFs ont déjà été imprimés au format 4-digit, il y aura discordance papier↔DB.
--  2. tva_exempt par défaut FALSE (TVA 20% appliquée par défaut sur nouvelles entités).
--     Les entités existantes conservent leur valeur actuelle (UPDATE non fait).
-- ============================================================

-- 1. Recréer la colonne reference avec format YY (2 digits)
-- On ne peut pas modifier une GENERATED column, il faut la drop + recreate.
ALTER TABLE formation_invoices DROP COLUMN IF EXISTS reference;

ALTER TABLE formation_invoices
ADD COLUMN reference TEXT GENERATED ALWAYS AS (
  prefix || '-' || LPAD((fiscal_year % 100)::TEXT, 2, '0')
         || '-' || LPAD(global_number::TEXT, 4, '0')
) STORED;

-- 2. Changer le DEFAULT de tva_exempt sur entities
-- Conforme à la pratique actuelle des OF assujettis à la TVA (taux 20%).
-- Les entités déjà créées avec tva_exempt=TRUE gardent leur valeur ; un admin peut
-- la changer dans /admin/settings/organization si l'entité a opté pour l'exonération
-- (formation pro : exonération possible — art. 261-4-4° du CGI).
ALTER TABLE entities ALTER COLUMN tva_exempt SET DEFAULT FALSE;
