-- ============================================================
-- Ajout trainers.temp_password — credentials convention formateur
-- ============================================================
-- Miroir de learners.temp_password (add_learner_temp_password.sql).
-- Stocke le mot de passe temporaire en clair pour permettre l'inclusion
-- dans les PDFs de convention formateur (bloc « 🔐 Accès à votre espace
-- formateur »). Supabase ne stocke que le hash bcrypt côté auth.users,
-- impossible de retrouver le password en clair autrement.
--
-- Pattern idempotent : password généré 1 fois (à la 1ère génération de
-- convention, via ensureTrainerAccount), réutilisé dans toutes les
-- conventions futures du même formateur (cohérence — un seul password à
-- mémoriser, et surtout on ne réinitialise JAMAIS le login d'un formateur
-- au compte actif en flux de génération normal).
--
-- ⚠ RGPD : password en clair en DB = sub-optimal, dette technique assumée
-- (identique au choix fait pour learners.temp_password).
-- ============================================================

ALTER TABLE trainers ADD COLUMN IF NOT EXISTS temp_password TEXT;

-- Pas d'index (champ jamais utilisé en filtre/jointure)
-- Pas de contrainte NOT NULL (reste null pour les formateurs sans compte Supabase)
