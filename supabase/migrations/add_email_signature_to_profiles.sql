-- Migration: Ajouter le champ email_signature dans profiles
-- Permet aux commerciaux/admins de définir une signature personnalisée
-- qui sera automatiquement injectée dans les emails envoyés.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_signature TEXT DEFAULT NULL;

COMMENT ON COLUMN profiles.email_signature IS 'Signature HTML du profil, injectée dans les emails via la variable {{signature_commercial}}';
