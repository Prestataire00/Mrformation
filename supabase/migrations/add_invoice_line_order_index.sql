-- ============================================================
-- Migration : colonne d'ordre sur formation_invoice_lines
-- Date : 2026-05-21 — code review Facturation (BLOCKER B1)
-- ============================================================
-- Bug : le code lit/écrit une colonne d'ordre des lignes de facture qui
-- n'existait pas dans la table :
--   - TabFinances.buildPdfDataWithLines : .order("position")
--   - TabFinances.handleEditInvoice    : .order("order_index")
--   - PATCH /api/formations/[id]/invoices : INSERT { order_index }
-- → les 2 SELECT renvoyaient une erreur 400 (lignes chargées undefined →
--   détail PDF perdu) et l'INSERT du PATCH échouait sur colonne inconnue
--   (édition de lignes de facture cassée).
--
-- Fix : on ajoute la colonne `order_index`. Le code applicatif est aligné
-- sur ce nom unique (`position` retiré côté TabFinances). Les lignes déjà
-- en base prennent 0 par défaut (ordre d'insertion conservé de fait).
-- ============================================================

ALTER TABLE formation_invoice_lines
  ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

-- Vérification : doit lister la colonne order_index
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'formation_invoice_lines'
ORDER BY ordinal_position;
