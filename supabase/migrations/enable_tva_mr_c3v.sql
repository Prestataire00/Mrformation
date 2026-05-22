-- ============================================================
-- Activation de la TVA (20%) sur MR FORMATION et C3V FORMATION
-- Date : 2026-05-22
-- ============================================================
-- Les colonnes entities.tva_exempt et entities.tva_rate existent deja
-- (cf. add_invoice_auto_fields.sql). MR et C3V ont ete creees avec
-- tva_exempt = TRUE -> leurs factures affichaient « TVA non applicable ».
--
-- Ce script les passe a tva_exempt = FALSE : la TVA au taux tva_rate
-- (20 %) est desormais appliquee sur les factures (Total HT / TVA /
-- Total TTC), aussi bien dans le dialogue de creation que sur le PDF.
-- Aucun changement de schema, aucun changement de code requis : la
-- logique TVA existe deja et est pilotee par ces deux colonnes.
--
-- A executer une fois dans le Dashboard Supabase (SQL Editor).
-- Note : l'exoneration TVA des organismes de formation reste possible
-- (art. 261-4-4° du CGI) ; ici les deux entites sont assujetties, par
-- decision metier. Ce reglage est aussi modifiable depuis
-- /admin/settings/organization (section « TVA »).
-- ============================================================

UPDATE entities
SET tva_exempt = false,
    tva_rate   = 20
WHERE slug IN ('mr-formation', 'c3v-formation');
