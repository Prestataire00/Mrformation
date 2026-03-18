-- ============================================================
-- Migration: Ajout des rôles super_admin et commercial
-- super_admin = Organisme de formation (peut tout faire, supprimer admins)
-- commercial = Accès CRM uniquement (prospects, devis, tâches, campagnes)
-- ============================================================

-- 1. Modifier le CHECK constraint sur profiles.role
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'commercial', 'trainer', 'client', 'learner'));

-- 2. RLS : autoriser super_admin partout où admin est autorisé
-- Les policies existantes utilisent role = 'admin', il faut les mettre à jour
-- pour accepter aussi 'super_admin' et 'commercial' (sur les tables CRM)

-- Mettre à jour la fonction d'aide pour vérifier les rôles admin-like
CREATE OR REPLACE FUNCTION is_admin_role() RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT role IN ('super_admin', 'admin')
    FROM profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Fonction pour vérifier l'accès CRM (admin + commercial)
CREATE OR REPLACE FUNCTION has_crm_access() RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT role IN ('super_admin', 'admin', 'commercial') OR has_crm_access = true
    FROM profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
