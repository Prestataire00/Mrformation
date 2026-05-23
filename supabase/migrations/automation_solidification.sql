-- ============================================================
-- Solidification automatisations — 2026-05-22
-- Retrait de la colonne orpheline document_types : ajoutée par
-- extend_automation_system.sql, aucun .select() de BDD ne lit
-- cette colonne (tout utilise document_type au singulier).
-- NB : la chaîne "document_types" apparaît aussi dans
-- /api/automation/options et RuleWizard comme clé JSON du picker
-- d'UI — sans lien avec cette colonne BDD.
-- A executer dans le Dashboard Supabase (SQL Editor).
-- Avant : vérifier que la colonne est vide en prod (aucun code
-- n'y écrit, mais par prudence) :
--   SELECT COUNT(*) FROM formation_automation_rules
--   WHERE document_types IS NOT NULL AND document_types <> '{}';
-- ============================================================

ALTER TABLE formation_automation_rules
  DROP COLUMN IF EXISTS document_types;
