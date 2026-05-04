-- ============================================================
-- MIGRATION MASTER : Sécuriser RLS e-learning + autres tables encore
-- en allow_all USING(true) avant le go-live prod.
-- Date : 2026-05-04
-- ============================================================
-- À appliquer dans Supabase Dashboard → SQL Editor en UNE SEULE EXÉCUTION.
-- Le fichier est idempotent (CREATE OR REPLACE / DROP IF EXISTS).
--
-- Couvre :
--   1. Garantit existence des helpers public.user_role() / public.user_entity_id()
--   2. Phase 2A — divers
--   3. Phase 2B Lot 1 — e-learning (12 tables, le plus critique)
--   4. Phase 2B Lots 2+4
--   5. Phase 2B Lots 3+5
--
-- VÉRIFICATION POST-APPLICATION :
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname='public' AND qual='true';
-- → devrait retourner UNIQUEMENT des tables tolérables (entities,
--   learner_access_tokens, signing_tokens, pappers_cache, training_domains)
-- ============================================================

-- ── 0. HELPERS (idempotents) ────────────────────────────────
-- Les migrations cleanup utilisent user_role() et user_entity_id() en
-- public schema. On garantit leur existence avant tout DROP/CREATE policy.

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.user_entity_id()
RETURNS UUID AS $$
  SELECT entity_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_entity_id() TO authenticated, anon;

-- ── 1-5. APPLIQUER LES MIGRATIONS CLEANUP ───────────────────
-- Plutôt que dupliquer le contenu (~1000 lignes), on indique l'ordre.
-- Si la prod a déjà exécuté certaines, c'est idempotent (DROP IF EXISTS).
--
-- ORDRE D'APPLICATION (à exécuter manuellement après ce script) :
--   1. supabase/migrations/cleanup_allow_all_phase2a.sql
--   2. supabase/migrations/cleanup_allow_all_phase2b_lot1_elearning.sql
--   3. supabase/migrations/cleanup_allow_all_phase2b_lots24.sql
--   4. supabase/migrations/cleanup_allow_all_phase2b_lots35.sql
--   5. supabase/migrations/cleanup_allow_all_profiles.sql

-- Ce script seul (sans les 5 fichiers ci-dessus) ne fait QUE garantir
-- les helpers. C'est utile en cas de doute ou si seules certaines migrations
-- ont déjà été appliquées.
