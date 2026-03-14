-- Add linked_training_id to crm_prospects for connecting a prospect to a training
ALTER TABLE crm_prospects
  ADD COLUMN IF NOT EXISTS linked_training_id UUID REFERENCES trainings(id) ON DELETE SET NULL;
