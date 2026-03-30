ALTER TABLE email_history ADD COLUMN IF NOT EXISTS sent_via TEXT DEFAULT 'resend' CHECK (sent_via IN ('resend', 'gmail'));
