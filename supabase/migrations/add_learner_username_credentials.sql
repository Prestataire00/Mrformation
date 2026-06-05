-- Pédagogie V2 Epic 2.5 — Auto-création apprenants sans email
-- ============================================================
-- Ajoute learners.username (UNIQUE per entity_id) avec auto-génération via
-- trigger BEFORE INSERT/UPDATE. Pattern slug `prenom.nom` + suffix `-N` en
-- cas de collision, protégé par advisory lock PG pour les races cross-transaction.
--
-- Le helper TS src/lib/utils/slugify-name.ts DOIT rester équivalent à
-- public.slugify_name pour permettre la prévisualisation côté UI avant insert.
--
-- Spec : bmad_output/planning-artifacts/spec-restructuration-pedagogique-2026-06-04.md
-- Plan : docs/superpowers/plans/2026-06-04-pedagogie-v2-epic-2-5-auth-pdf.md
-- ============================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE learners
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS synthetic_email_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_must_change BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS temp_password_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS learners_username_per_entity_uidx
  ON learners (entity_id, lower(username))
  WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.slugify_name(input TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE v TEXT;
BEGIN
  v := lower(unaccent(coalesce(input, '')));
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := regexp_replace(v, '^-+|-+$', '', 'g');
  v := substring(v FROM 1 FOR 50);
  IF v = '' THEN v := 'apprenant'; END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_learners_autogen_username() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_base TEXT;
  v_candidate TEXT;
  v_suffix INT := 1;
  v_lock_key BIGINT;
BEGIN
  IF NEW.username IS NOT NULL AND NEW.username <> '' THEN
    RETURN NEW;
  END IF;
  v_base := public.slugify_name(NEW.first_name) || '.' || public.slugify_name(NEW.last_name);
  v_base := substring(v_base FROM 1 FOR 50);
  v_lock_key := hashtextextended(NEW.entity_id::text || ':' || v_base, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);
  v_candidate := v_base;
  WHILE EXISTS (
    SELECT 1 FROM learners
    WHERE entity_id = NEW.entity_id
      AND lower(username) = v_candidate
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1
  ) LOOP
    v_suffix := v_suffix + 1;
    IF v_suffix > 999 THEN
      RAISE EXCEPTION 'Cannot generate unique username for % % in entity %',
        NEW.first_name, NEW.last_name, NEW.entity_id;
    END IF;
    v_candidate := v_base || '-' || v_suffix::text;
  END LOOP;
  NEW.username := v_candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_learners_autogen_username ON learners;
CREATE TRIGGER tg_learners_autogen_username
  BEFORE INSERT OR UPDATE OF first_name, last_name ON learners
  FOR EACH ROW EXECUTE FUNCTION public.tg_learners_autogen_username();

COMMENT ON FUNCTION public.slugify_name IS
  'Pédagogie V2 Epic 2.5 — Slugify nom/prénom pour username (miroir TS src/lib/utils/slugify-name.ts).';
COMMENT ON FUNCTION public.tg_learners_autogen_username IS
  'Pédagogie V2 Epic 2.5 — auto-génère learners.username à partir de first_name/last_name si pas fourni. Advisory lock par entity_id+base pour éviter race condition cross-transactions.';
COMMENT ON COLUMN learners.username IS
  'Pédagogie V2 Epic 2.5 — identifiant de login unique par entity_id (auto via trigger). Lowercase. Pattern prenom.nom + suffix -N en cas de collision.';
COMMENT ON COLUMN learners.synthetic_email_used IS
  'Pédagogie V2 Epic 2.5 — TRUE si l''email du learner est un email synthétique de domaine .local (non-routable). Permet de filtrer les apprenants sans email réel et d''empêcher les envois.';
COMMENT ON COLUMN learners.password_must_change IS
  'Pédagogie V2 Epic 2.5 — TRUE tant que le learner n''a pas changé son temp_password à la 1re connexion.';
COMMENT ON COLUMN learners.first_login_at IS
  'Pédagogie V2 Epic 2.5 — Timestamp de la 1re connexion réussie.';
COMMENT ON COLUMN learners.temp_password_expires_at IS
  'Pédagogie V2 Epic 2.5 — Expiration du temp_password généré à la création (utilisé pour forcer regen périodique).';

-- =============================================================================
-- Pédagogie V2 Epic 2.5 — Résolution username → email pour login apprenant
-- =============================================================================
-- Fonction SECURITY DEFINER appelée par /api/auth/resolve-username (anon)
-- pour résoudre un username en email (réel ou synthétique) avant signInWithPassword.
-- Anti-énumération : retourne TOUJOURS un email bien formé (fallback synthétique
-- fabriqué si username inconnu) — signInWithPassword échouera ensuite avec le
-- message générique "Invalid credentials" au lieu de "Email not found".
-- =============================================================================
CREATE OR REPLACE FUNCTION public.resolve_learner_email_by_username(
  p_username TEXT,
  p_entity_slug TEXT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_email TEXT;
  v_entity_id UUID;
BEGIN
  -- 1. Résoudre entity_id depuis slug
  SELECT id INTO v_entity_id FROM entities WHERE slug = p_entity_slug LIMIT 1;
  IF v_entity_id IS NULL THEN
    -- entity inconnue : retourner email synthétique fabriqué pour anti-énumération
    RETURN lower(coalesce(p_username, '')) || '@learner.unknown.local';
  END IF;

  -- 2. Chercher l'apprenant par username dans cette entity
  SELECT email INTO v_email
  FROM learners
  WHERE entity_id = v_entity_id
    AND lower(username) = lower(coalesce(p_username, ''))
  LIMIT 1;

  IF v_email IS NULL THEN
    -- username inconnu : retourner email synthétique fabriqué pour anti-énumération
    RETURN lower(coalesce(p_username, '')) || '@learner.' || p_entity_slug || '.local';
  END IF;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_learner_email_by_username FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_learner_email_by_username TO anon, authenticated;

COMMENT ON FUNCTION public.resolve_learner_email_by_username IS
  'Pédagogie V2 Epic 2.5 — Résolution timing-safe username → email pour login apprenant. Retourne TOUJOURS un email bien formé (fallback synthétique fabriqué si username inconnu) pour anti-énumération.';
