-- ============================================================
-- Pédagogie V2 Epic 2 — Story E2-S01
-- Migration : ajoute la colonne `payload JSONB` à learner_bulk_import_jobs
--
-- Pourquoi : la Background Function `learners-bulk-create-background.mts`
-- ne reçoit qu'un `jobId` dans son body HTTP. Pour pouvoir traiter le batch
-- en async, elle doit pouvoir charger la liste des apprenants depuis la DB
-- (sinon ils sont uniquement en RAM côté route /start et perdus au moment
-- du dispatch fire-and-forget).
--
-- Structure attendue du payload :
--   { "learners": [ { "firstName": "...", "lastName": "...",
--                     "email": "..." | null, "clientId": "uuid" | null } ] }
--
-- Sécurité :
--  - Le payload ne contient PAS de mots de passe (les credentials sont
--    générés par createLearnerWithCredentials côté BG function et restent
--    en RAM jusqu'au PDF).
--  - Le payload est purgé optionnellement après "completed" (TODO Epic 2.x
--    purge automatique via cron).
--
-- Migration idempotente : ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE learner_bulk_import_jobs
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Note : pas d'index sur payload (uniquement lu par la BG function via id),
-- mais on commente la colonne pour traçabilité.
COMMENT ON COLUMN learner_bulk_import_jobs.payload IS
  'Payload du bulk import (learners[]). Stocké pour permettre à la Background Function de traiter le batch sans dépendre de la RAM de la route /start. Aucun mot de passe ne doit jamais y être stocké.';

-- ============================================================
-- Vérification post-exécution :
--   \d+ learner_bulk_import_jobs
-- Attendu : colonne `payload jsonb NOT NULL DEFAULT '{}'::jsonb` présente.
-- ============================================================
