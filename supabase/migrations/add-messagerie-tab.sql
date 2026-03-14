-- ============================================================
-- Migration: Onglet 7 (Messagerie) — champs contexte formation sur email_history
-- ============================================================

-- 1. Ajouter session_id pour filtrer les emails par formation
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;

-- 2. Ajouter recipient_type pour catégoriser le destinataire
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS recipient_type TEXT CHECK (recipient_type IN ('learner', 'trainer', 'client', 'financier', 'manager'));

-- 3. Ajouter recipient_id pour lier au destinataire spécifique
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS recipient_id UUID;

-- 4. Index pour filtrage par formation
CREATE INDEX IF NOT EXISTS idx_email_history_session ON email_history(session_id);
CREATE INDEX IF NOT EXISTS idx_email_history_session_type ON email_history(session_id, recipient_type);
