-- Add 'dormant' to crm_prospects status CHECK constraint
-- The UI kanban already uses 'dormant' but the DB constraint blocks it
ALTER TABLE crm_prospects DROP CONSTRAINT IF EXISTS crm_prospects_status_check;
ALTER TABLE crm_prospects ADD CONSTRAINT crm_prospects_status_check
  CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'dormant'));
