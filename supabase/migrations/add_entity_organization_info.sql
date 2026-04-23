-- Infos organisme complètes pour templates de documents
-- Permet à Loris de gérer SIRET, NDA, tampon, signature depuis l'UI

ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS siret TEXT,
  ADD COLUMN IF NOT EXISTS nda TEXT,
  ADD COLUMN IF NOT EXISTS ape_code TEXT,
  ADD COLUMN IF NOT EXISTS legal_form TEXT,
  ADD COLUMN IF NOT EXISTS capital TEXT,
  ADD COLUMN IF NOT EXISTS rcs TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS president_name TEXT,
  ADD COLUMN IF NOT EXISTS president_title TEXT,
  ADD COLUMN IF NOT EXISTS stamp_url TEXT,
  ADD COLUMN IF NOT EXISTS signature_url TEXT,
  ADD COLUMN IF NOT EXISTS signature_text TEXT;

-- Pré-remplir MR FORMATION
UPDATE entities SET
  siret = COALESCE(siret, '91311329600036'),
  nda = COALESCE(nda, '93132013113'),
  address = COALESCE(address, '24/26 Boulevard Gay Lussac'),
  postal_code = COALESCE(postal_code, '13014'),
  city = COALESCE(city, 'Marseille'),
  region = COALESCE(region, 'PACA'),
  email = COALESCE(email, 'contact@mrformation.fr'),
  phone = COALESCE(phone, '0750461245'),
  website = COALESCE(website, 'http://www.mrformation.fr'),
  president_name = COALESCE(president_name, 'Marc VICHOT'),
  president_title = COALESCE(president_title, 'Gérant')
WHERE LOWER(name) LIKE '%mr formation%' OR LOWER(name) LIKE '%mr%formation%';

-- Pré-remplir C3V FORMATION
UPDATE entities SET
  address = COALESCE(address, '24/26 Boulevard Gay Lussac'),
  postal_code = COALESCE(postal_code, '13014'),
  city = COALESCE(city, 'Marseille'),
  region = COALESCE(region, 'PACA'),
  email = COALESCE(email, 'contact@c3vformation.fr'),
  phone = COALESCE(phone, '0750461245'),
  website = COALESCE(website, 'http://www.c3vformation.fr'),
  president_name = COALESCE(president_name, 'Marc VICHOT'),
  president_title = COALESCE(president_title, 'Gérant')
WHERE LOWER(name) LIKE '%c3v%';
