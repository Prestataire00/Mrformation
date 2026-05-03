-- ============================================================
-- Migration : Pièces jointes dynamiques sur email_history
-- ============================================================
-- Ajoute une colonne `attachments` JSONB qui stocke des descripteurs
-- de pièces jointes à générer/joindre au moment de l'envoi par le worker.
--
-- Format attendu : tableau d'objets descripteurs.
--   [
--     {"type":"convocation","payload":{"session_id":"...","learner_id":"..."}},
--     {"type":"programme","payload":{"session_id":"..."}},
--     {"type":"file_url","filename":"contrat.pdf","url":"https://..."}
--   ]
--
-- Le worker `/api/emails/process-scheduled` parcourt ce tableau,
-- résout chaque descripteur via `pdf-generator.generatePdfFromHtml()`
-- ou en téléchargeant l'URL Storage, puis attache le base64 au mail Resend.
--
-- Pourquoi des descripteurs au lieu du base64 direct ?
--   - Évite de stocker des MB de PDF dans la DB (1 PDF = ~100 KB)
--   - Permet de regénérer si template changé entre enqueue et envoi
--   - Idempotent : retry n'envoie pas plusieurs fois le même PDF stocké
-- ============================================================

ALTER TABLE email_history
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Index optionnel pour filtrer les emails avec pièces jointes (debug)
CREATE INDEX IF NOT EXISTS idx_email_history_has_attachments
  ON email_history((jsonb_array_length(attachments) > 0))
  WHERE jsonb_array_length(attachments) > 0;

-- ============================================================
-- Vérification :
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'email_history' AND column_name = 'attachments';
-- ============================================================
