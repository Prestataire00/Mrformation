-- ============================================================
-- Migration : Ajout colonne contact_email sur crm_tasks
-- ============================================================
-- Lors de l'import Sellsy, on perd l'info `EMAIL CLIENT / PROSPECT / FOURNISSEUR`
-- présente dans le CSV des tâches. Cette colonne permet de la conserver au niveau
-- de la tâche, ce qui est utile :
--   1. Pour afficher l'email de contact directement sur la fiche tâche
--      (sans navigation vers le prospect lié).
--   2. Pour back-fill l'email des prospects qui n'en ont pas en base
--      mais dont une de leurs tâches contient un email (cf. SQL d'enrichissement).
--
-- Idempotente : ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Vérification :
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'crm_tasks' AND column_name = 'contact_email') AS contact_email_column_present;
