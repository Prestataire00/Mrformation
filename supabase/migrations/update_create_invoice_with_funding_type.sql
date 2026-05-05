-- ============================================================
-- Migration : update create_invoice_with_atomic_number pour accepter funding_type
-- ============================================================
-- À jouer APRÈS add_funding_type_to_invoices.sql.
-- Recrée la fonction RPC avec un nouveau paramètre p_funding_type.
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
  p_recipient_address TEXT,
  p_funding_type TEXT DEFAULT NULL
) RETURNS formation_invoices AS $$
DECLARE
  v_lock_key BIGINT;
  v_next INTEGER;
  v_result formation_invoices;
BEGIN
  v_lock_key := hashtextextended(p_entity_id::TEXT || ':' || p_fiscal_year::TEXT || ':' || p_prefix, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(global_number), 0) + 1 INTO v_next
  FROM formation_invoices
  WHERE entity_id = p_entity_id
    AND fiscal_year = p_fiscal_year
    AND prefix = p_prefix;

  INSERT INTO formation_invoices (
    entity_id, session_id, recipient_type, recipient_id, recipient_name,
    amount, prefix, number, global_number, fiscal_year, due_date, notes,
    is_avoir, parent_invoice_id, external_reference, recipient_siret, recipient_address,
    funding_type
  ) VALUES (
    p_entity_id, p_session_id, p_recipient_type, p_recipient_id, p_recipient_name,
    COALESCE(p_amount, 0), p_prefix, v_next, v_next, p_fiscal_year, p_due_date, p_notes,
    p_is_avoir, p_parent_invoice_id, p_external_reference, p_recipient_siret, p_recipient_address,
    p_funding_type
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_invoice_with_atomic_number(
  UUID, UUID, TEXT, UUID, TEXT, NUMERIC, TEXT, INTEGER, DATE, TEXT,
  BOOLEAN, UUID, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;
