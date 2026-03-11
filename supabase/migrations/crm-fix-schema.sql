-- Migration: Fix CRM schema - add created_by to crm_tasks
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
