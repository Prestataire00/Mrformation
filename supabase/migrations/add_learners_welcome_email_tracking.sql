-- Tracking de l'envoi de l'email de bienvenue apprenant
ALTER TABLE learners
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;
