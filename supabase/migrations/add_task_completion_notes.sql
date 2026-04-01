-- Ajout champs de complétion sur les tâches
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS completion_notes TEXT;
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Ajouter task_completed au type d'action commerciale si la contrainte existe
ALTER TABLE crm_commercial_actions DROP CONSTRAINT IF EXISTS crm_commercial_actions_action_type_check;
