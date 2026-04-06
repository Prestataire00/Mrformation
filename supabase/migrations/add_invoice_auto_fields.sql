-- ============================================================
-- Migration : Champs pour génération automatique de factures
-- Date : 2026-04-06
-- ============================================================

-- 1. Flag sur formation_invoices pour tracer les factures auto-générées
ALTER TABLE formation_invoices
ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT FALSE;

-- 2. Flag sur sessions pour éviter les doublons de génération
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS invoice_generated BOOLEAN DEFAULT FALSE;

-- 3. Champs entité pour les factures (mentions légales)
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS siret TEXT;

ALTER TABLE entities
ADD COLUMN IF NOT EXISTS nda TEXT;

ALTER TABLE entities
ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE entities
ADD COLUMN IF NOT EXISTS postal_code TEXT;

ALTER TABLE entities
ADD COLUMN IF NOT EXISTS city TEXT;

ALTER TABLE entities
ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE entities
ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE entities
ADD COLUMN IF NOT EXISTS tva_exempt BOOLEAN DEFAULT TRUE;

ALTER TABLE entities
ADD COLUMN IF NOT EXISTS tva_rate DECIMAL(5,2) DEFAULT 20.00;

ALTER TABLE entities
ADD COLUMN IF NOT EXISTS invoice_footer_text TEXT;

-- 4. Remplir les données pour MR FORMATION (si entité existe)
UPDATE entities
SET siret = '91311329600036',
    nda = '93132013113',
    address = '24/26 Boulevard Gay Lussac',
    postal_code = '13014',
    city = 'Marseille',
    phone = '0750461245',
    email = 'contact@mrformation.fr',
    tva_exempt = TRUE,
    invoice_footer_text = 'TVA non applicable, article 261-4-4° du CGI. Organisme de formation enregistré sous le numéro 93132013113 auprès du préfet de région PACA.'
WHERE name ILIKE '%mr formation%'
AND siret IS NULL;
