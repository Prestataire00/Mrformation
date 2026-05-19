-- ============================================================
-- Migration h-23 : fonction SQL fn_convert_prospect_to_client
-- ============================================================
-- Story : bmad_output/implementation-artifacts/h-23-crm-prospects-hotfixes.md
-- Date : 2026-05-19
--
-- Pourquoi : la conversion prospect → client était précédemment
-- faite en 3 appels Supabase client-side dans `[id]/page.tsx`
-- handler `handleConvertToClient`, sans transaction, sans validation,
-- sans détection doublon. h-23 task 2 refactor en route API qui
-- appelle cette fonction SQL en RPC pour garantir l'atomicité
-- native PostgreSQL.
--
-- À EXÉCUTER MANUELLEMENT dans Supabase Dashboard SQL Editor
-- après merge du code (sinon la route POST renverra 500 avec
-- error.code='42883' = function does not exist).
--
-- Idempotente : CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_convert_prospect_to_client(
  p_prospect_id UUID
) RETURNS TABLE(client_id UUID, contact_id UUID, existing_client_id UUID) AS $$
DECLARE
  v_prospect RECORD;
  v_client_id UUID;
  v_contact_id UUID;
  v_first_name TEXT;
  v_last_name TEXT;
  v_existing_client_id UUID;
BEGIN
  -- 1) Charger le prospect avec lock FOR UPDATE (anti-race condition)
  SELECT * INTO v_prospect FROM crm_prospects
  WHERE id = p_prospect_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prospect introuvable (id=%)', p_prospect_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2) Validation : company_name requis non vide
  IF v_prospect.company_name IS NULL
     OR length(trim(v_prospect.company_name)) = 0 THEN
    RAISE EXCEPTION 'Nom de société requis pour la conversion'
      USING ERRCODE = 'P0002';
  END IF;

  -- 3) Détection doublon (h-23 Q2 résolu : ILIKE case-insensitive)
  --    Match si company_name identique (insensible casse)
  --    OU si SIRET identique (quand le SIRET du prospect est renseigné).
  SELECT id INTO v_existing_client_id
  FROM clients
  WHERE entity_id = v_prospect.entity_id
    AND (
      company_name ILIKE v_prospect.company_name
      OR (v_prospect.siret IS NOT NULL
          AND siret IS NOT NULL
          AND siret = v_prospect.siret)
    )
  LIMIT 1;

  IF v_existing_client_id IS NOT NULL THEN
    RAISE EXCEPTION 'Doublon : client existe déjà (id=%)', v_existing_client_id
      USING ERRCODE = 'P0003',
            HINT = v_existing_client_id::text;
  END IF;

  -- 4) INSERT client (toutes les colonnes transférables)
  INSERT INTO clients (
    entity_id, company_name, siret, email, phone,
    address, city, postal_code, naf_code,
    notes, status
  ) VALUES (
    v_prospect.entity_id,
    v_prospect.company_name,
    NULLIF(trim(v_prospect.siret), ''),
    NULLIF(trim(v_prospect.email), ''),
    NULLIF(trim(v_prospect.phone), ''),
    NULLIF(trim(v_prospect.address), ''),
    NULLIF(trim(v_prospect.city), ''),
    NULLIF(trim(v_prospect.postal_code), ''),
    NULLIF(trim(v_prospect.naf_code), ''),
    NULLIF(trim(v_prospect.notes), ''),
    'active'
  ) RETURNING id INTO v_client_id;

  -- 5) INSERT contact si contact_name renseigné
  IF v_prospect.contact_name IS NOT NULL
     AND length(trim(v_prospect.contact_name)) > 0 THEN

    v_first_name := split_part(trim(v_prospect.contact_name), ' ', 1);
    -- Reste après le premier mot, ou repli sur le premier mot si pas d'espace
    IF position(' ' IN trim(v_prospect.contact_name)) > 0 THEN
      v_last_name := trim(substring(
        trim(v_prospect.contact_name)
        FROM position(' ' IN trim(v_prospect.contact_name)) + 1
      ));
    ELSE
      v_last_name := v_first_name;
    END IF;

    INSERT INTO contacts (
      client_id, first_name, last_name, email, phone, is_primary
    ) VALUES (
      v_client_id,
      v_first_name,
      COALESCE(NULLIF(v_last_name, ''), v_first_name),
      NULLIF(trim(v_prospect.email), ''),
      NULLIF(trim(v_prospect.phone), ''),
      TRUE
    ) RETURNING id INTO v_contact_id;
  END IF;

  -- 6) UPDATE prospect → won + lien client
  UPDATE crm_prospects
  SET converted_client_id = v_client_id,
      status = 'won',
      updated_at = NOW()
  WHERE id = p_prospect_id;

  -- Retour
  RETURN QUERY SELECT v_client_id, v_contact_id, NULL::UUID;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Autoriser l'appel par les utilisateurs authentifiés (rôle authenticated).
-- La sécurité métier (entity_id + role admin) est validée côté route Next.js
-- via requireRole avant le RPC.
GRANT EXECUTE ON FUNCTION public.fn_convert_prospect_to_client(UUID) TO authenticated;

-- ============================================================
-- Test rapide post-migration (à exécuter manuellement, lecture seule)
-- ============================================================
-- SELECT proname, pronargs, prorettype::regtype
-- FROM pg_proc
-- WHERE proname = 'fn_convert_prospect_to_client';
--
-- Attendu : 1 ligne avec proname='fn_convert_prospect_to_client', pronargs=1
-- ============================================================
