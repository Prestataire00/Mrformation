-- supabase/migrations/invoice_numbering_continue_excel.sql
-- ============================================================
-- Migration : la création de facture continue la séquence Excel
-- Date : 2026-06-18
-- ============================================================
-- Les factures historiques (prefix='LORIS') portent leur vrai numéro Excel dans
-- external_reference (« FAC-26-24 »). Une nouvelle facture prefix='FAC' repartait à 1
-- car le MAX(global_number) ne regardait que les lignes prefix='FAC' (inexistantes).
--
-- Fix : sous le même advisory lock, on seede le prochain numéro depuis GREATEST(
--   max(global_number des factures app du même tuple),
--   max(N réel parsé depuis external_reference « FAC-YY-N » de l'année) -- uniquement prefix='FAC'
-- ) + 1. Les 66 imports « N/A » (external_reference NULL/non conforme) ne matchent pas → ignorés.
-- Les avoirs (prefix='AV') gardent leur propre séquence (pas de seeding Excel).
-- ============================================================

CREATE OR REPLACE FUNCTION create_invoice_with_atomic_number(
  p_entity_id UUID,
  p_session_id UUID,
  p_recipient_type TEXT,
  p_recipient_id UUID,
  p_recipient_name TEXT,
  p_amount NUMERIC,
  p_prefix TEXT,
  p_fiscal_year INTEGER,
  p_due_date DATE,
  p_notes TEXT,
  p_is_avoir BOOLEAN,
  p_parent_invoice_id UUID,
  p_external_reference TEXT,
  p_recipient_siret TEXT,
  p_recipient_address TEXT
) RETURNS formation_invoices AS $$
DECLARE
  v_lock_key BIGINT;
  v_max_app INTEGER;
  v_max_excel INTEGER;
  v_next INTEGER;
  v_yy TEXT;
  v_result formation_invoices;
BEGIN
  -- Advisory lock par tuple (entity_id, fiscal_year, prefix) — sérialise READ+INSERT.
  v_lock_key := hashtextextended(p_entity_id::TEXT || ':' || p_fiscal_year::TEXT || ':' || p_prefix, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_yy := LPAD((p_fiscal_year % 100)::TEXT, 2, '0');

  -- 1) max des factures déjà créées dans l'app pour ce tuple
  SELECT COALESCE(MAX(global_number), 0) INTO v_max_app
  FROM formation_invoices
  WHERE entity_id = p_entity_id
    AND fiscal_year = p_fiscal_year
    AND prefix = p_prefix;

  -- 2) max des numéros Excel importés « FAC-YY-N » de l'année (uniquement pour le préfixe FAC)
  v_max_excel := 0;
  IF p_prefix = 'FAC' THEN
    SELECT COALESCE(MAX(
      (substring(external_reference FROM '^FAC-' || v_yy || '-([0-9]+)$'))::INTEGER
    ), 0) INTO v_max_excel
    FROM formation_invoices
    WHERE entity_id = p_entity_id
      AND fiscal_year = p_fiscal_year
      AND external_reference ~ ('^FAC-' || v_yy || '-[0-9]+$');
  END IF;

  v_next := GREATEST(v_max_app, v_max_excel) + 1;

  -- INSERT atomique dans la même transaction que le lock
  INSERT INTO formation_invoices (
    entity_id, session_id, recipient_type, recipient_id, recipient_name,
    amount, prefix, number, global_number, fiscal_year, due_date, notes,
    is_avoir, parent_invoice_id, external_reference, recipient_siret, recipient_address
  ) VALUES (
    p_entity_id, p_session_id, p_recipient_type, p_recipient_id, p_recipient_name,
    COALESCE(p_amount, 0), p_prefix, v_next, v_next, p_fiscal_year, p_due_date, p_notes,
    p_is_avoir, p_parent_invoice_id, p_external_reference, p_recipient_siret, p_recipient_address
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_invoice_with_atomic_number(
  UUID, UUID, TEXT, UUID, TEXT, NUMERIC, TEXT, INTEGER, DATE, TEXT,
  BOOLEAN, UUID, TEXT, TEXT, TEXT
) TO authenticated, service_role;
