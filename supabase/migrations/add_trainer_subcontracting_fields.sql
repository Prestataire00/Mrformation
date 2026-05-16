-- ============================================================
-- Migration : ajouts champs sous-traitance formateur
-- Story B-Convention Intervention (PR #52)
-- ============================================================
-- À jouer dans Supabase Dashboard > SQL Editor APRÈS le deploy du code.
-- Idempotent (IF NOT EXISTS) — réexécutable sans dommage.
--
-- Ajoute les champs nécessaires pour générer le contrat de sous-traitance
-- formateur (cf src/lib/templates/convention-intervention.ts) :
-- - trainers : adresse complète, identité légale (SIRET, NDA), extranet, signature
-- - formation_trainers : coût HT convenu (avant formation) pour ce contrat
-- ============================================================

ALTER TABLE trainers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS siret TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS nda TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS extranet_link TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- Coût HT convenu (avant formation) : c'est le montant qui apparaît à l'article 5
-- du contrat. Distinct de hourly_rate * hours_done qui sont des champs "effectifs"
-- post-formation. Le contrat est signé AVANT, donc on a besoin du montant agréé.
ALTER TABLE formation_trainers ADD COLUMN IF NOT EXISTS agreed_cost_ht DECIMAL(10, 2);

-- Commentaires pour clarifier le rôle
COMMENT ON COLUMN trainers.address IS 'Adresse postale (rue) du formateur — utilisée dans le contrat de sous-traitance';
COMMENT ON COLUMN trainers.siret IS 'SIRET formateur (si auto-entrepreneur ou société indépendante)';
COMMENT ON COLUMN trainers.nda IS 'Numéro Déclaration Activité du formateur (si NDA propre)';
COMMENT ON COLUMN trainers.extranet_link IS 'Lien vers le programme/contenu hébergé sur l''extranet du formateur';
COMMENT ON COLUMN trainers.signature_url IS 'URL Storage de la signature scannée du formateur';
COMMENT ON COLUMN formation_trainers.agreed_cost_ht IS 'Coût HT convenu lors de la signature du contrat de sous-traitance (article 5)';
