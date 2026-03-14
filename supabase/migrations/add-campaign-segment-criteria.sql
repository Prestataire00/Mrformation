-- Add segment_criteria JSONB column to crm_campaigns for advanced segmentation
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS segment_criteria JSONB DEFAULT NULL;
