-- supabase/migrations/update_invoice_reference_no_padding.sql
-- ============================================================
-- Migration : format de référence facture sur la base Excel (sans padding du numéro)
-- Date : 2026-06-18
-- ============================================================
-- Le client veut que la nomenclature suive les numéros d'origine Excel : « FAC-26-25 »
-- (année 2 chiffres, numéro NON paddé). L'ancien format paddait le numéro sur 4 chiffres
-- (« FAC-26-0025 »). On redéfinit la colonne générée `reference`.
--
-- Impact historique : les imports (prefix='LORIS') voient leur `reference` recalculée mais
-- s'affichent via `external_reference` (helper invoiceDisplayRef) → invisible à l'écran.
-- L'index unique idx_invoices_global_numbering porte sur global_number, pas sur reference.
-- ============================================================

ALTER TABLE formation_invoices DROP COLUMN IF EXISTS reference;

ALTER TABLE formation_invoices
ADD COLUMN reference TEXT GENERATED ALWAYS AS (
  prefix || '-' || LPAD((fiscal_year % 100)::TEXT, 2, '0') || '-' || global_number::TEXT
) STORED;
