-- Recherche prospects assouplie (fuzzy + accents) — quick-dev 2026-06-27
--
-- Active la recherche tolérante aux accents (unaccent) et aux fautes de frappe
-- (pg_trgm) sur les prospects CRM. Expose une fonction RPC qui renvoie les ids
-- correspondants, ordonnés par pertinence. Le code applicatif fait ensuite
-- .in("id", ids) en conservant son filtre entity_id / pagination / count.
--
-- À exécuter dans Supabase Dashboard (SQL editor) AVANT de déployer le code.
--
-- NB Supabase : les extensions sont installées dans le schéma `extensions`.
-- On force donc `search_path = extensions, public` (script + fonctions) pour
-- résoudre unaccent / la dictionnaire `unaccent` / l'opérateur `%` / similarity
-- / gin_trgm_ops sans avoir à tout qualifier.

-- Résolution des objets d'extension pendant ce script (CREATE INDEX, etc.)
SET search_path = public, extensions;

-- 1) Extensions (idempotent ; sur Supabase elles vivent dans le schéma extensions)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2) Wrapper IMMUTABLE d'unaccent (unaccent() est STABLE → non indexable tel quel).
--    search_path figé → résout la fonction + la dictionnaire `unaccent` du schéma
--    extensions, et rend le wrapper déterministe (donc indexable).
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
  SET search_path = extensions, public, pg_temp
AS $$
  SELECT unaccent('unaccent', $1)
$$;

-- 3) Index GIN trigram (accent/casse-insensibles) pour accélérer le fuzzy
CREATE INDEX IF NOT EXISTS idx_crm_prospects_company_trgm
  ON crm_prospects USING gin (immutable_unaccent(lower(company_name)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_crm_prospects_contact_trgm
  ON crm_prospects USING gin (immutable_unaccent(lower(coalesce(contact_name, ''))) gin_trgm_ops);

-- 4) Fonction de recherche : renvoie les ids des prospects correspondants.
--    Match = similarité trigram (tolère les fautes) OU substring ILIKE
--    (insensibles aux accents/casse) sur company_name/contact_name/email/naf_code.
--    Filtrée par entity_id. SECURITY INVOKER (RLS du caller respectée). Tri par
--    pertinence. p_limit borne le nombre d'ids (liste : défaut 1000 ; export :
--    valeur élevée passée par l'appelant). search_path figé pour `%`/similarity.
CREATE OR REPLACE FUNCTION search_crm_prospect_ids(
  p_entity_id uuid,
  p_query text,
  p_limit integer DEFAULT 1000
)
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SET search_path = extensions, public, pg_temp
AS $$
  SELECT p.id
  FROM crm_prospects p
  WHERE p.entity_id = p_entity_id
    AND coalesce(btrim(p_query), '') <> ''
    AND (
         immutable_unaccent(lower(p.company_name)) % immutable_unaccent(lower(p_query))
      OR immutable_unaccent(lower(coalesce(p.contact_name, ''))) % immutable_unaccent(lower(p_query))
      OR immutable_unaccent(lower(p.company_name)) ILIKE '%' || immutable_unaccent(lower(p_query)) || '%'
      OR immutable_unaccent(lower(coalesce(p.contact_name, ''))) ILIKE '%' || immutable_unaccent(lower(p_query)) || '%'
      OR lower(coalesce(p.email, '')) ILIKE '%' || lower(p_query) || '%'
      OR lower(coalesce(p.naf_code, '')) ILIKE '%' || lower(p_query) || '%'
    )
  ORDER BY similarity(immutable_unaccent(lower(p.company_name)), immutable_unaccent(lower(p_query))) DESC
  LIMIT greatest(p_limit, 1)
$$;

GRANT EXECUTE ON FUNCTION search_crm_prospect_ids(uuid, text, integer) TO authenticated;
