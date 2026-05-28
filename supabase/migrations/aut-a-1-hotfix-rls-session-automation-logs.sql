-- ─────────────────────────────────────────────────────────────────────────
-- Story aut-a-1 — HOTFIX RLS session_automation_logs INSERT (B7)
-- ─────────────────────────────────────────────────────────────────────────
--
-- Problème : la policy INSERT actuelle "session_auto_logs_insert" utilise
-- `WITH CHECK (true)` → tout utilisateur authentifié peut insérer un log
-- d'audit arbitraire (pollution Qualiopi audit, bypass cross-entity).
--
-- Identifié dans docs/deep-dive-automatisations.md §8 (Sécurité) et tracé
-- comme bug B7 dans bmad_output/planning-artifacts/cadrage-module-automatisations.md
--
-- Audit callers (2026-05-28) :
-- ✅ src/app/api/formations/automation-rules/run-cron/route.ts:110
--    → utilise createServiceClient() (service_role) → contourne RLS, safe
-- ✅ src/app/(dashboard)/admin/formations/[id]/_components/TabAutomation.tsx:104
--    → SELECT seulement (lecture historique), pas d'INSERT
-- ✅ src/lib/automation/compute-events.ts:198,246
--    → SELECT seulement (pure function pour timeline), pas d'INSERT
--
-- Aucun caller ne fait d'INSERT depuis un contexte non-admin → durcissement
-- de la policy n'a pas d'impact fonctionnel attendu.
--
-- Helpers RLS existants (cf. supabase/schema.sql:505-513) :
-- - auth.user_role() RETURNS TEXT : rôle du user courant via profiles
-- - auth.user_entity_id() RETURNS UUID : entité du user courant via profiles
--
-- ─────────────────────────────────────────────────────────────────────────

-- Drop ancienne policy permissive
DROP POLICY IF EXISTS "session_auto_logs_insert" ON session_automation_logs;

-- Recréer policy stricte : service_role OU admin entity-scoped via session
CREATE POLICY "session_auto_logs_insert_strict" ON session_automation_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Cas 1 : cron / fonction Netlify scheduled qui utilise service_role
    -- (auth.role() retourne 'service_role' dans ce contexte)
    auth.role() = 'service_role'
    OR
    -- Cas 2 : admin de l'entité propriétaire de la session
    (
      auth.user_role() IN ('admin', 'super_admin')
      AND session_id IN (
        SELECT id FROM sessions WHERE entity_id = auth.user_entity_id()
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (commenté — à exécuter manuellement si rollback nécessaire)
-- ─────────────────────────────────────────────────────────────────────────
--
-- DROP POLICY IF EXISTS "session_auto_logs_insert_strict" ON session_automation_logs;
-- CREATE POLICY "session_auto_logs_insert" ON session_automation_logs
--   FOR INSERT TO authenticated
--   WITH CHECK (true);
--
-- ⚠️ ATTENTION : le rollback restaure le bug B7 (allow-all). À éviter.
