-- ============================================================
-- Migration : email_history → vraie queue robuste
-- ============================================================
-- Ajoute les colonnes manquantes pour transformer email_history en
-- queue résiliente avec retry exponential backoff :
--   - retry_count : nombre de tentatives effectuées
--   - max_retries : limite avant abandon (défaut 5)
--   - next_retry_at : prochain essai (NULL = à envoyer immédiatement)
--   - last_attempt_at : dernier essai (debug + monitoring)
--   - scheduled_for : envoi programmé futur (NULL = immédiat)
--
-- Compatibilité : tous les call sites existants continuent de fonctionner
-- (les nouvelles colonnes ont des defaults sains).
-- ============================================================

ALTER TABLE email_history
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE email_history
  ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 5;

ALTER TABLE email_history
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

ALTER TABLE email_history
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

ALTER TABLE email_history
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

-- Étendre le check status pour ajouter 'failed_permanent' (max_retries dépassé)
ALTER TABLE email_history DROP CONSTRAINT IF EXISTS email_history_status_check;
ALTER TABLE email_history ADD CONSTRAINT email_history_status_check
  CHECK (status IN ('sent', 'failed', 'pending', 'processing', 'failed_permanent'));

-- Index pour le worker : récupérer rapidement les emails à traiter
-- (status pending + scheduled_for atteint OU next_retry_at atteint)
CREATE INDEX IF NOT EXISTS idx_email_history_queue
  ON email_history(status, COALESCE(next_retry_at, scheduled_for, sent_at))
  WHERE status = 'pending';

-- Index pour les stats / dashboard de monitoring de la queue
CREATE INDEX IF NOT EXISTS idx_email_history_status_entity
  ON email_history(entity_id, status, sent_at DESC);

-- ============================================================
-- Vérification :
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'email_history'
--     AND column_name IN ('retry_count','max_retries','next_retry_at',
--                         'last_attempt_at','scheduled_for');
-- ============================================================
