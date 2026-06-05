-- Pédagogie V2 Epic 2.5 — Backfill usernames pour les apprenants existants
-- ============================================================
-- Déclenche le trigger tg_learners_autogen_username via un UPDATE no-op
-- sur les apprenants qui n'ont pas encore de username.
--
-- Idempotent : peut être ré-exécuté plusieurs fois sans dommage (le trigger
-- skip si username déjà set).
-- ============================================================

UPDATE learners
SET first_name = first_name
WHERE username IS NULL OR username = '';
