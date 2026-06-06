-- Migration: Ajoute les colonnes BPF à la table entities
-- Pour Section A (identification organisme) et Section H (dirigeant)

ALTER TABLE entities ADD COLUMN IF NOT EXISTS siret TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS naf_code TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS nda_number TEXT; -- numéro déclaration activité
ALTER TABLE entities ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS legal_representative TEXT; -- dirigeant (Section H)

-- Pré-remplir pour MR FORMATION
UPDATE entities SET
  siret = '91311329600036',
  naf_code = '8559A',
  nda_number = '93132013113',
  address = '24/26 Boulevard Gay Lussac 13014 Marseille',
  phone = '0750461245',
  email = 'contact@mrformation.fr',
  legal_representative = 'Mohamed REBIAI'
WHERE slug = 'mr-formation';
