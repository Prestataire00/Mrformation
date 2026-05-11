-- ============================================================
-- Migration PR 18 : Numérotation devis atomique (anti race-condition)
-- Date : 2026-05-11
-- ============================================================
-- Bug audit Vague 1 : crm_quotes utilise SELECT MAX(quote_number) + INSERT
-- non atomique côté client → 2 admins simultanés peuvent obtenir le même
-- numéro DEV-{year}-{N} → INSERT 2 échoue (23505 sur INDEX UNIQUE existant)
-- ou pire, trou dans la séquence (non-conformité comptable).
--
-- Pattern identique à create_invoice_with_atomic_number (PR 14) :
-- advisory_xact_lock par (entity_id, fiscal_year) pour sérialiser SELECT MAX
-- pendant la même transaction que l'INSERT.
--
-- Approche choisie : fonction `next_quote_number_atomic` qui retourne MAX+1
-- sous lock. Le code applicatif appelle la RPC puis INSERT avec le numéro
-- retourné. L'INDEX UNIQUE existant (entity_id, fiscal_year, quote_number)
-- reste filet de sécurité ultime — si retry nécessaire, le client le gère.
-- ============================================================

CREATE OR REPLACE FUNCTION next_quote_number_atomic(
  p_entity_id UUID,
  p_fiscal_year INTEGER
) RETURNS INTEGER AS $$
DECLARE
  v_lock_key BIGINT;
  v_next INTEGER;
BEGIN
  -- Advisory lock par tuple (entity_id, fiscal_year). Tenu jusqu'à la fin
  -- de la transaction PG. Sérialise les concurrents sur CE tuple uniquement.
  v_lock_key := hashtextextended(p_entity_id::TEXT || ':quote:' || p_fiscal_year::TEXT, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Lecture MAX(quote_number)+1 sous lock → stable jusqu'à la fin de tx
  SELECT COALESCE(MAX(quote_number), 0) + 1 INTO v_next
  FROM crm_quotes
  WHERE entity_id = p_entity_id
    AND fiscal_year = p_fiscal_year;

  RETURN v_next;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION next_quote_number_atomic(UUID, INTEGER) TO authenticated, service_role;
