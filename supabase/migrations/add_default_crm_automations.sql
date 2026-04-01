-- ============================================================
-- Migration: Insérer les règles d'automatisation CRM par défaut
-- Relance prospect inactif + Alerte devis expirant
-- Idempotent : ne duplique pas si déjà présent
-- ============================================================

-- Relance prospect inactif (30 jours sans action commerciale)
INSERT INTO crm_automation_rules (entity_id, name, description, trigger_type, action_type, is_enabled, config)
SELECT e.id, 'Relance prospect inactif', 'Créer une tâche de relance si aucune action depuis 30 jours', 'prospect_inactive_30d', 'create_task', true, '{"days": 30}'::jsonb
FROM entities e
WHERE NOT EXISTS (SELECT 1 FROM crm_automation_rules WHERE entity_id = e.id AND trigger_type = 'prospect_inactive_30d');

-- Alerte devis expirant (3 jours avant expiration)
INSERT INTO crm_automation_rules (entity_id, name, description, trigger_type, action_type, is_enabled, config)
SELECT e.id, 'Alerte devis expirant', 'Créer une tâche quand un devis expire dans 3 jours', 'quote_expiring_3d', 'create_task', true, '{"days_before": 3}'::jsonb
FROM entities e
WHERE NOT EXISTS (SELECT 1 FROM crm_automation_rules WHERE entity_id = e.id AND trigger_type = 'quote_expiring_3d');
