-- ============================================================
-- Story em-a-4 — Fix RLS crm_automation_rules (HOTFIX P0)
-- ============================================================
--
-- Auteur : Wissam (proxy Loris VICHOT) + workflow BMAD multi-agents
-- Date   : 2026-05-28
-- Source : bmad_output/planning-artifacts/cadrage-module-emails.md §3.6
--          + prd-emails.md FR-EML-16 → 19
--          + architecture-module-emails.md CD-EML-3 (hotfix indépendant)
--          + epics-emails.md Story em-a-4
--
-- ============================================================
-- VULNÉRABILITÉ CORRIGÉE
-- ============================================================
-- Avant ce fix, la table `crm_automation_rules` a une policy RLS
-- `crm_automation_rules_admin` avec `USING (true)` — anti-pattern
-- allow_all. Tout user authentifié (admin, trainer, client, learner)
-- peut lire/écrire les règles d'automation de TOUTES les entités.
--
-- Le `config` JSONB peut contenir `template_id` + `recipient_list`
-- pour les rules de type `action_type='send_email'` (ajouté par
-- extend_automation_system.sql). Conséquence directe : fuite
-- cross-entité possible des templates email choisis et des listes
-- de destinataires.
--
-- BLOQUANT P0 pour donner accès à `/admin/emails` à Loris ou à
-- un client autonome dans une future itération.
--
-- ============================================================
-- AUDIT CALLERS PRÉALABLE
-- ============================================================
-- Audit effectué via `grep -rn crm_automation_rules src/` :
--
--  - src/app/api/crm/automations/route.ts (GET, PATCH)
--    * GET : filter `.eq("entity_id", activeEntityId)` après role check
--    * PATCH : utilise service_role (bypass RLS) + check role super_admin
--    → AUCUNE dépendance au comportement allow_all.
--
--  - src/app/api/crm/automations/run/route.ts (POST cron)
--    * Filter `.eq("entity_id", entityId)` après role check
--    → AUCUNE dépendance au comportement allow_all.
--
-- Tous les callers sont déjà entity-scoped applicatif. Le fix
-- DURCIT la sécurité (défense en profondeur) sans casser de
-- fonctionnalité existante.
--
-- ============================================================
-- HELPERS UTILISÉS
-- ============================================================
-- `public.user_role()` — SECURITY DEFINER STABLE, retourne le rôle
--   du user courant depuis `profiles` (cf. HOTFIX_auth_helpers.sql)
--
-- `public.user_entity_id()` — SECURITY DEFINER STABLE, retourne
--   l'entity_id du user courant depuis `profiles`
--
-- ============================================================
-- MIGRATION
-- ============================================================

-- 1. DROP de l'ancienne policy allow_all
DROP POLICY IF EXISTS "crm_automation_rules_admin" ON crm_automation_rules;

-- 2. CREATE de la nouvelle policy entity-scoped granular
CREATE POLICY "crm_automation_rules_admin_entity" ON crm_automation_rules
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND entity_id = user_entity_id()
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND entity_id = user_entity_id()
  );

-- ============================================================
-- VALIDATION POST-MIGRATION
-- ============================================================
-- Exécuter après le DEPLOY pour vérification visuelle :
--
--   SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_clause
--   FROM pg_policy
--   WHERE polrelid = 'crm_automation_rules'::regclass;
--
-- Résultat attendu : 1 ligne `crm_automation_rules_admin_entity`
-- avec `using_clause` mentionnant user_role() + user_entity_id().
--
-- Aucune ligne `crm_automation_rules_admin` ne doit subsister.
--
-- ============================================================
-- ROLLBACK (à utiliser en cas d'incident — NON recommandé,
-- réintroduit la vulnérabilité allow_all)
-- ============================================================
-- DROP POLICY IF EXISTS "crm_automation_rules_admin_entity" ON crm_automation_rules;
-- CREATE POLICY "crm_automation_rules_admin" ON crm_automation_rules
--   FOR ALL TO authenticated
--   USING (true);
