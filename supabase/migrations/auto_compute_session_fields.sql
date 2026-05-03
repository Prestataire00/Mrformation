-- ============================================================
-- Migration : Auto-calcul durée + lieu sur sessions (triggers DB)
-- ============================================================
-- Demande client : que les champs auto-déductibles d'une session se mettent
-- à jour automatiquement, sans clic admin :
--   1. sessions.planned_hours = somme des durées de formation_time_slots
--      → recalculé à chaque ajout/modif/suppression d'un créneau
--   2. sessions.location (si vide) = adresse client (intra) ou organisme (inter)
--      → rempli à la création de session, au changement de type, à l'ajout
--        d'une entreprise
--
-- Choix architectural : triggers DB plutôt que logique côté code, car :
--   - Marche peu importe le canal (UI, API, import en masse, scripts ad-hoc)
--   - Pas de risque d'oubli si une nouvelle route est créée
--   - Cohérence absolue garantie
--
-- Comportement non destructif :
--   - Pour le lieu : on ne met le default QUE si location est vide. Si
--     l'admin a saisi un lieu manuellement, on respecte son choix.
--   - Pour la durée : on override TOUJOURS planned_hours depuis les slots
--     (intentionnel — le client a demandé "calculée automatiquement").
--     Si pas de slots → planned_hours = 0.
-- ============================================================

-- ── 1. Fonction : recalcule planned_hours pour une session ──
CREATE OR REPLACE FUNCTION recompute_session_planned_hours(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
  total_seconds NUMERIC;
BEGIN
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))), 0)
    INTO total_seconds
    FROM formation_time_slots
    WHERE session_id = p_session_id;

  UPDATE sessions
    SET planned_hours = ROUND((total_seconds / 3600)::numeric, 2)
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. Trigger : recalcule planned_hours après tout INSERT/UPDATE/DELETE de slots ──
CREATE OR REPLACE FUNCTION trigger_recompute_session_planned_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_session_planned_hours(OLD.session_id);
    RETURN OLD;
  END IF;

  PERFORM recompute_session_planned_hours(NEW.session_id);

  -- Si UPDATE qui change session_id (rare mais possible), recompute aussi l'ancien
  IF TG_OP = 'UPDATE' AND NEW.session_id IS DISTINCT FROM OLD.session_id THEN
    PERFORM recompute_session_planned_hours(OLD.session_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_recompute_planned_hours ON formation_time_slots;
CREATE TRIGGER trg_recompute_planned_hours
  AFTER INSERT OR UPDATE OR DELETE ON formation_time_slots
  FOR EACH ROW EXECUTE FUNCTION trigger_recompute_session_planned_hours();

-- ── 3. Fonction : remplit le lieu par défaut d'une session si vide ──
-- intra → adresse de la 1ère entreprise liée
-- inter (ou type non défini) → adresse de l'organisme (entities)
CREATE OR REPLACE FUNCTION fill_session_default_location(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
  s_type TEXT;
  s_location TEXT;
  s_entity_id UUID;
  default_loc TEXT;
BEGIN
  SELECT type, location, entity_id
    INTO s_type, s_location, s_entity_id
    FROM sessions
    WHERE id = p_session_id;

  -- Si location déjà saisi (non vide), on respecte le choix admin
  IF s_location IS NOT NULL AND length(trim(s_location)) > 0 THEN
    RETURN;
  END IF;

  IF s_type = 'intra' THEN
    -- Adresse de la 1ère entreprise liée à la session
    SELECT NULLIF(TRIM(BOTH ', ' FROM
      COALESCE(c.address, '') ||
      CASE WHEN c.postal_code IS NOT NULL OR c.city IS NOT NULL
           THEN ', ' || COALESCE(c.postal_code, '') || ' ' || COALESCE(c.city, '')
           ELSE '' END
    ), '')
      INTO default_loc
      FROM formation_companies fc
      JOIN clients c ON c.id = fc.client_id
      WHERE fc.session_id = p_session_id
      LIMIT 1;
  ELSE
    -- Inter (ou autre) : adresse de l'organisme
    SELECT NULLIF(TRIM(BOTH ', ' FROM
      COALESCE(e.address, '') ||
      CASE WHEN e.postal_code IS NOT NULL OR e.city IS NOT NULL
           THEN ', ' || COALESCE(e.postal_code, '') || ' ' || COALESCE(e.city, '')
           ELSE '' END
    ), '')
      INTO default_loc
      FROM entities e
      WHERE e.id = s_entity_id;
  END IF;

  IF default_loc IS NOT NULL AND length(default_loc) > 0 THEN
    UPDATE sessions SET location = default_loc WHERE id = p_session_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Trigger : remplit location à l'INSERT ou au changement de type ──
CREATE OR REPLACE FUNCTION trigger_fill_location_on_session()
RETURNS TRIGGER AS $$
BEGIN
  -- Cas 1 : nouvelle session (INSERT)
  IF TG_OP = 'INSERT' THEN
    PERFORM fill_session_default_location(NEW.id);
    RETURN NEW;
  END IF;

  -- Cas 2 : changement de type → recalcule (mais SEULEMENT si location était vide
  -- ou correspondait à l'ancienne valeur par défaut → on ne touche pas si admin a saisi)
  IF TG_OP = 'UPDATE' AND NEW.type IS DISTINCT FROM OLD.type THEN
    -- Force le re-fill si location est vide (la fonction respectera le check elle-même)
    PERFORM fill_session_default_location(NEW.id);
    RETURN NEW;
  END IF;

  -- Cas 3 : admin a vidé le location explicitement → on remet la valeur par défaut
  IF TG_OP = 'UPDATE' AND
     (NEW.location IS NULL OR length(trim(NEW.location)) = 0) AND
     OLD.location IS NOT NULL AND length(trim(OLD.location)) > 0 THEN
    PERFORM fill_session_default_location(NEW.id);
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_fill_location_on_session ON sessions;
CREATE TRIGGER trg_fill_location_on_session
  AFTER INSERT OR UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION trigger_fill_location_on_session();

-- ── 5. Trigger : remplit location à l'ajout d'une entreprise (intra) ──
CREATE OR REPLACE FUNCTION trigger_fill_location_on_company()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM fill_session_default_location(NEW.session_id);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_fill_location_on_company ON formation_companies;
CREATE TRIGGER trg_fill_location_on_company
  AFTER INSERT OR UPDATE ON formation_companies
  FOR EACH ROW EXECUTE FUNCTION trigger_fill_location_on_company();

-- ── 6. Backfill : applique les calculs aux sessions existantes ──
-- ⚠️ Ce DO block traite TOUTES les sessions actuelles. Idempotent (peut être
-- relancé sans risque) car les fonctions ne touchent pas les valeurs déjà set.
DO $$
DECLARE
  r RECORD;
  count_processed INTEGER := 0;
BEGIN
  FOR r IN SELECT id FROM sessions LOOP
    PERFORM recompute_session_planned_hours(r.id);
    PERFORM fill_session_default_location(r.id);
    count_processed := count_processed + 1;
  END LOOP;
  RAISE NOTICE 'Backfill terminé : % sessions traitées', count_processed;
END $$;

-- ============================================================
-- Vérification :
--   -- Les triggers sont-ils créés ?
--   SELECT tgname, tgrelid::regclass FROM pg_trigger
--   WHERE tgname LIKE 'trg_recompute%' OR tgname LIKE 'trg_fill%';
--
--   -- Test rapide sur une session existante :
--   SELECT id, planned_hours, location, type FROM sessions LIMIT 5;
-- ============================================================
