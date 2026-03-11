-- Fix: Ensure trainers and trainer_competencies are accessible
-- This re-adds permissive policies that were dropped by rls-granular.sql
-- Run this in the Supabase SQL editor if you see "Impossible de charger les formateurs"

-- Trainers: add fallback permissive policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'trainers' AND policyname = 'trainers_authenticated_access'
  ) THEN
    EXECUTE 'CREATE POLICY "trainers_authenticated_access" ON trainers FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- Trainer competencies: add fallback permissive policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'trainer_competencies' AND policyname = 'trainer_competencies_authenticated_access'
  ) THEN
    EXECUTE 'CREATE POLICY "trainer_competencies_authenticated_access" ON trainer_competencies FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;
