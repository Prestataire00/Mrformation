-- ============================================================
-- Migration h-23 : fonction SQL fn_convert_prospect_to_client
-- ============================================================
-- Story : bmad_output/implementation-artifacts/h-23-crm-prospects-hotfixes.md
-- Date : 2026-05-19 (v2 — code review BMad 2026-05-19, 4 BLOCKERS sécurité corrigés)
--
-- Pourquoi : la conversion prospect → client était précédemment
-- faite en 3 appels Supabase client-side dans `[id]/page.tsx`,
-- sans transaction, sans validation, sans détection doublon.
-- h-23 task 2 refactor en route API qui appelle cette fonction SQL
-- en RPC pour garantir l'atomicité native PostgreSQL.
--
-- Corrections code review h-23 v2 (2026-05-19) :
--   B1 — `SET search_path = public, pg_temp` (privilege escalation CVE pattern)
--   B2 — Verifie `auth.uid()` → entity_id du caller vs entity_id du prospect
--        (sinon n'importe quel authenticated user peut convertir un prospect
--        d'une autre entite via RPC direct)
--   B3 — LOWER() = LOWER() au lieu de ILIKE (wildcard injection sur '%'/'_')
--   B4 — Re-check `converted_client_id` apres lock FOR UPDATE
--        (anti race double-click)
--   P2 — Message d'erreur doublon aligne sur la spec
--
-- À EXÉCUTER MANUELLEMENT dans Supabase Dashboard SQL Editor.
-- Idempotente : CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_convert_prospect_to_client(
  p_prospect_id UUID
) RETURNS TABLE(client_id UUID, contact_id UUID, existing_client_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prospect RECORD;
  v_client_id UUID;
  v_contact_id UUID;
  v_first_name TEXT;
  v_last_name TEXT;
  v_existing_client_id UUID;
  v_caller_uid UUID;
  v_caller_entity_id UUID;
  v_caller_role TEXT;
BEGIN
  -- ── B2 : verifier l'identite + entity_id du caller ───────────────────
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT entity_id, role INTO v_caller_entity_id, v_caller_role
  FROM profiles
  WHERE id = v_caller_uid;

  IF v_caller_entity_id IS NULL THEN
    RAISE EXCEPTION 'Profil utilisateur introuvable'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── 1) Charger le prospect avec lock FOR UPDATE ──────────────────────
  SELECT * INTO v_prospect FROM crm_prospects
  WHERE id = p_prospect_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prospect introuvable (id=%)', p_prospect_id
      USING ERRCODE = 'P0001';
  END IF;

  -- B2 — entity_id du prospect doit matcher celui du caller, SAUF super_admin
  IF v_caller_role != 'super_admin'
     AND v_prospect.entity_id IS DISTINCT FROM v_caller_entity_id THEN
    -- On retourne P0001 (introuvable) pas P0001_FORBIDDEN pour ne pas leaker
    -- d'info sur l'existence du prospect dans une autre entite.
    RAISE EXCEPTION 'Prospect introuvable (id=%)', p_prospect_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ── B4 : prospect deja converti ? Short-circuit immediat ─────────────
  IF v_prospect.converted_client_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ce prospect a déjà été converti en client'
      USING ERRCODE = 'P0003',
            HINT = v_prospect.converted_client_id::text;
  END IF;

  -- ── 2) Validation : company_name requis non vide ─────────────────────
  IF v_prospect.company_name IS NULL
     OR length(trim(v_prospect.company_name)) = 0 THEN
    RAISE EXCEPTION 'Nom de société requis pour la conversion'
      USING ERRCODE = 'P0002';
  END IF;

  -- ── 3) B3 : detection doublon par LOWER() egalite (pas ILIKE wildcard) ─
  --    Match si company_name normalise identique OU SIRET identique.
  SELECT id INTO v_existing_client_id
  FROM clients
  WHERE entity_id = v_prospect.entity_id
    AND (
      LOWER(TRIM(company_name)) = LOWER(TRIM(v_prospect.company_name))
      OR (v_prospect.siret IS NOT NULL
          AND length(trim(v_prospect.siret)) > 0
          AND siret IS NOT NULL
          AND siret = v_prospect.siret)
    )
  LIMIT 1;

  IF v_existing_client_id IS NOT NULL THEN
    -- P2 : message aligne sur la spec AC-2c
    RAISE EXCEPTION 'Un client existe déjà avec ce nom / SIRET (id=%)', v_existing_client_id
      USING ERRCODE = 'P0003',
            HINT = v_existing_client_id::text;
  END IF;

  -- ── 4) INSERT client ─────────────────────────────────────────────────
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

  -- ── 5) INSERT contact si contact_name ────────────────────────────────
  IF v_prospect.contact_name IS NOT NULL
     AND length(trim(v_prospect.contact_name)) > 0 THEN

    v_first_name := split_part(trim(v_prospect.contact_name), ' ', 1);
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

  -- ── 6) UPDATE prospect → won + lien client ───────────────────────────
  UPDATE crm_prospects
  SET converted_client_id = v_client_id,
      status = 'won',
      updated_at = NOW()
  WHERE id = p_prospect_id;

  RETURN QUERY SELECT v_client_id, v_contact_id, NULL::UUID;
END;
$$;

-- Autoriser l'appel par les utilisateurs authentifiés.
-- La defense en profondeur est INTRA-fonction maintenant (auth.uid() +
-- entity_id check), donc plus de risque cross-tenant via RPC direct.
GRANT EXECUTE ON FUNCTION public.fn_convert_prospect_to_client(UUID) TO authenticated;

-- ============================================================
-- Test post-migration (lecture seule)
-- ============================================================
-- SELECT proname, pronargs, prorettype::regtype,
--        prosecdef AS is_security_definer,
--        proconfig AS config
-- FROM pg_proc
-- WHERE proname = 'fn_convert_prospect_to_client';
--
-- Attendu : proconfig contient '{search_path=public, pg_temp}'
-- ============================================================
