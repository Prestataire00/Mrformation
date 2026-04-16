-- ============================================================
-- Migration : Ajouter NDA (numéro déclaration d'activité) aux formateurs
-- ============================================================

ALTER TABLE trainers ADD COLUMN IF NOT EXISTS nda TEXT;
