-- Migration: Add CRM access flag for sales reps (trainers with CRM access)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_crm_access BOOLEAN DEFAULT FALSE;

-- RLS policies for CRM tables: allow users with has_crm_access to see their own assigned records

-- Prospects: sales reps see only their assigned prospects
CREATE POLICY "CRM sales reps read own prospects" ON crm_prospects
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND has_crm_access = TRUE)
  );

CREATE POLICY "CRM sales reps update own prospects" ON crm_prospects
  FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND has_crm_access = TRUE)
  );

-- Tasks: sales reps see only their assigned tasks
CREATE POLICY "CRM sales reps read own tasks" ON crm_tasks
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND has_crm_access = TRUE)
  );

CREATE POLICY "CRM sales reps update own tasks" ON crm_tasks
  FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND has_crm_access = TRUE)
  );

CREATE POLICY "CRM sales reps insert tasks" ON crm_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND has_crm_access = TRUE)
  );

-- Quotes: sales reps see only their created quotes
CREATE POLICY "CRM sales reps read own quotes" ON crm_quotes
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND has_crm_access = TRUE)
  );

CREATE POLICY "CRM sales reps update own quotes" ON crm_quotes
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND has_crm_access = TRUE)
  );
