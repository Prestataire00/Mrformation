-- ============================================================
-- Story em-a-5 — Vue SQL email_template_usage (usage tracking)
-- ============================================================
--
-- Auteur : Wissam (proxy Loris VICHOT) + workflow BMAD multi-agents
-- Date   : 2026-05-28
-- Source : bmad_output/planning-artifacts/cadrage-module-emails.md §4.3
--          + prd-emails.md FR-EML-51 → 53 + §9.2 Data Model
--          + architecture-module-emails.md ID-EML-1 (vue simple)
--          + epics-emails.md Story em-a-5
--
-- ============================================================
-- OBJECTIF
-- ============================================================
-- Créer une vue SQL agrégeant l'utilisation de chaque template
-- email par les automation rules (formation + CRM) pour permettre
-- au UI de em-c-2 / em-c-3 d'afficher :
--   - Badge "⚠️ Utilisé par N automations" sur chaque card
--   - Warning bloquant avant archive d'un template utilisé
--   - Modal de confirmation avant édition d'un template critique
--
-- Sans cette vue, l'admin (Loris ou futur client autonome) peut
-- modifier/supprimer un template sans réaliser qu'il casse 3
-- automations actives.
--
-- ============================================================
-- DÉCISION ARCHITECTURE (ID-EML-1)
-- ============================================================
-- Pourquoi une vue simple et pas une materialized view ?
--   - Volumes actuels : ~50 templates × ~30 rules max par entité
--     → ~1500 lignes max agrégées, calculable en < 50ms à chaque
--     query (pas de besoin de cache pré-calculé)
--   - Materialized view nécessiterait REFRESH on commit + complexité
--     transactionnelle non justifiée
--   - Si volumes explosent (>10K lignes), migrer en materialized
--     view sera trivial (changer CREATE VIEW → CREATE MATERIALIZED
--     VIEW + ajouter REFRESH)
--
-- Trigger pour reconsidérer (DD-EML-4) : si NFR-EML-PERF-2 (tab
-- Modèles < 800ms P95) dépasse régulièrement.
--
-- ============================================================
-- DÉPENDANCES
-- ============================================================
-- - em-a-1 (schéma étendu) : email_templates a la colonne is_active
--   utilisée potentiellement plus tard pour filter (pas dans la
--   vue actuelle qui se limite à comptage par template_id)
-- - em-a-4 (fix RLS crm_automation_rules) : la vue lit cette table,
--   donc les RLS sous-jacentes doivent être propres pour éviter
--   les fuites cross-entité au moment du SELECT depuis le UI
--
-- ============================================================
-- RLS (hérite des tables sous-jacentes)
-- ============================================================
-- Une vue PostgreSQL standard exécute avec les permissions du caller
-- (pas SECURITY DEFINER). Les RLS de formation_automation_rules et
-- crm_automation_rules s'appliquent naturellement → un user de
-- l'entité A ne verra que ses propres rules dans la vue.
--
-- Pas besoin d'ajouter de policy sur la vue elle-même : les sous-
-- jacentes filtrent déjà.
--
-- ============================================================
-- MIGRATION
-- ============================================================

CREATE OR REPLACE VIEW email_template_usage AS
SELECT
  template_id,
  entity_id,
  COUNT(*) AS usage_count,
  array_agg(
    jsonb_build_object(
      'source', source,
      'rule_id', rule_id,
      'name', name,
      'trigger_type', trigger_type
    )
    ORDER BY source, name
  ) AS usages
FROM (
  -- ── formation_automation_rules ──
  SELECT
    'formation_automation_rules'::text AS source,
    far.id AS rule_id,
    far.template_id,
    far.entity_id,
    far.name,
    far.trigger_type
  FROM formation_automation_rules far
  WHERE far.is_enabled = TRUE
    AND far.template_id IS NOT NULL

  UNION ALL

  -- ── crm_automation_rules (template_id stocké dans config JSONB) ──
  SELECT
    'crm_automation_rules'::text AS source,
    car.id AS rule_id,
    (car.config->>'template_id')::uuid AS template_id,
    car.entity_id,
    car.name,
    car.trigger_type
  FROM crm_automation_rules car
  WHERE car.is_enabled = TRUE
    AND car.config ? 'template_id'
    AND car.config->>'template_id' IS NOT NULL
) AS u
WHERE template_id IS NOT NULL
GROUP BY template_id, entity_id;

COMMENT ON VIEW email_template_usage IS
'Story em-a-5 : agrège l''utilisation des templates email par les automation rules (formation + CRM). Utilisée par /admin/emails pour afficher le badge "Utilisé par N automations" et bloquer l''archive d''un template critique. Hérite RLS des tables sous-jacentes.';

-- ============================================================
-- VALIDATION POST-MIGRATION
-- ============================================================
--
-- a) Vue créée et requêtable :
--    SELECT count(*) FROM email_template_usage;
--    → Pas d'erreur, retourne 0+
--
-- b) Test fonctionnel (depuis l'UI admin) :
--    SELECT * FROM email_template_usage
--    WHERE entity_id = '<your_entity_id>'
--    LIMIT 5;
--    → Doit retourner les templates utilisés par des rules actives
--
-- c) RLS check : un user de l'entité A ne voit que ses rules :
--    SET ROLE authenticated;
--    SET request.jwt.claim.sub = '<user_entity_A>';
--    SELECT entity_id, COUNT(*) FROM email_template_usage GROUP BY entity_id;
--    → Doit retourner UNIQUEMENT l'entity_id de A
--
-- ============================================================
-- ROLLBACK
-- ============================================================
--
-- DROP VIEW IF EXISTS email_template_usage;
