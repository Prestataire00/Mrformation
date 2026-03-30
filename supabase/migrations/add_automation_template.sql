ALTER TABLE formation_automation_rules ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL;
ALTER TABLE formation_automation_rules ADD COLUMN IF NOT EXISTS recipient_type TEXT DEFAULT 'learners' CHECK (recipient_type IN ('learners', 'trainers', 'all'));
ALTER TABLE formation_automation_rules ADD COLUMN IF NOT EXISTS name TEXT;
