-- ============================================================
-- Migration : Fix RLS critiques (P0 - fuite cross-tenant)
-- ============================================================
-- Audit a révélé 3 tables avec policy `USING (true)` permettant
-- à n'importe quel utilisateur authentifié (toutes entités confondues)
-- de lire/écrire ces données :
--   - client_documents     (documents commerciaux clients)
--   - client_comments      (commentaires internes clients)
--   - bpf_financial_data   (données financières BPF)
--
-- ⚠️ DÉCOUVERTE LIVE : ~45 tables ont une policy `allow_all USING(true)`
-- qui annule TOUTE la sécurité multi-tenant. Cette migration ne corrige
-- QUE les 3 tables initialement identifiées comme P0. Une migration
-- séparée doit traiter toutes les autres (cf. cleanup_allow_all_*.sql à venir).
--
-- Note : on utilise `user_role()` / `user_entity_id()` sans préfixe `auth.`
-- pour rester cohérent avec les 26 policies existantes en prod (résolution
-- via search_path → trouve `public.user_role()`).
-- ============================================================

-- 1. client_documents
-- ============================================================
-- Pas de colonne entity_id directe → on filtre via clients.client_id
-- Pattern identique à `contacts_admin_all` (schema.sql ligne 585+)

DROP POLICY IF EXISTS "allow_all" ON client_documents;
DROP POLICY IF EXISTS "client_documents_admin_all" ON client_documents;
DROP POLICY IF EXISTS "client_documents_trainer_read" ON client_documents;
DROP POLICY IF EXISTS "client_documents_client_read_own" ON client_documents;

CREATE POLICY "client_documents_admin_all" ON client_documents
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
  );

CREATE POLICY "client_documents_trainer_read" ON client_documents
  FOR SELECT TO authenticated
  USING (
    user_role() = 'trainer'
    AND client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
  );

CREATE POLICY "client_documents_client_read_own" ON client_documents
  FOR SELECT TO authenticated
  USING (
    user_role() = 'client'
    AND client_id IN (SELECT client_id FROM learners WHERE profile_id = auth.uid())
  );

-- 2. client_comments
-- ============================================================
-- Commentaires internes : admin/super_admin only.
-- Trainer/client/learner ne doivent PAS voir les commentaires internes.

DROP POLICY IF EXISTS "allow_all" ON client_comments;
DROP POLICY IF EXISTS "client_comments_admin_all" ON client_comments;

CREATE POLICY "client_comments_admin_all" ON client_comments
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
    AND author_id = auth.uid()
  );

-- 3. bpf_financial_data
-- ============================================================
-- Données financières sensibles : entity_id présent → filtre direct.
-- Admin/super_admin de l'entité uniquement.

DROP POLICY IF EXISTS "allow_all" ON bpf_financial_data;
DROP POLICY IF EXISTS "bpf_financial_data_admin_all" ON bpf_financial_data;

CREATE POLICY "bpf_financial_data_admin_all" ON bpf_financial_data
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND entity_id = user_entity_id()
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND entity_id = user_entity_id()
  );

-- ============================================================
-- Vérification (à exécuter manuellement après migration) :
--   SELECT tablename, policyname, qual
--   FROM pg_policies
--   WHERE tablename IN ('client_documents', 'client_comments', 'bpf_financial_data')
--   ORDER BY tablename, policyname;
-- ============================================================
