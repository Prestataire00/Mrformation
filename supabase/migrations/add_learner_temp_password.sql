-- ============================================================
-- Ajout learners.temp_password — credentials convocation
-- ============================================================
-- Stocke le mot de passe temporaire en clair pour permettre l'inclusion
-- dans les PDFs de convocation (Supabase ne stocke que le hash bcrypt
-- côté auth.users, impossible de retrouver le password en clair).
--
-- Pattern idempotent : password généré 1 fois (à la 1ère convocation),
-- réutilisé dans toutes les convocations futures du même apprenant
-- (cohérence — un seul password à mémoriser).
--
-- ⚠ RGPD : password en clair en DB = sub-optimal. Documenté comme dette
-- technique dans la spec
-- (docs/superpowers/specs/2026-05-17-convocation-credentials-design.md).
-- Future story dédiée pour rotation/nettoyage périodique.
-- ============================================================

ALTER TABLE learners ADD COLUMN IF NOT EXISTS temp_password TEXT;

-- Pas d'index (champ jamais utilisé en filtre/jointure)
-- Pas de contrainte NOT NULL (peut rester null pour apprenants sans compte Supabase)
