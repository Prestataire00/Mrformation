-- ============================================================
-- Migration : Flag send_email sur formation_automation_rules
-- ============================================================
-- SPEC spec-p1-auto-attribution-sans-email.
--
-- Découple l'attribution automatique des questionnaires de l'envoi d'email.
-- Le moteur (executeRuleForSession) crée toujours l'assignment ; il n'envoie
-- l'email QUE si send_email <> false. Les 3 questionnaires de la phase active
-- (positionnement, auto-évaluation, satisfaction chaud) restent répondables
-- DANS l'espace apprenant, sans email (retour client P1).
--
-- Les autres règles (convocation, satisfaction à froid J+30, etc.) gardent
-- l'email (send_email = true par défaut → aucune régression).
--
-- 100 % IDEMPOTENT (ADD COLUMN IF NOT EXISTS + UPDATE conditionnel).
-- À exécuter manuellement dans Supabase Dashboard SQL Editor.
-- ============================================================

ALTER TABLE formation_automation_rules
  ADD COLUMN IF NOT EXISTS send_email BOOLEAN DEFAULT true;

-- Désactiver l'email pour les 3 questionnaires actifs (toutes entités).
-- in-app only. Réversible côté admin (le flag est éditable).
UPDATE formation_automation_rules
  SET send_email = false
  WHERE document_type IN (
    'questionnaire_positionnement',
    'questionnaire_autoevaluation',
    'questionnaire_satisfaction'
  )
  AND send_email IS DISTINCT FROM false;

-- ============================================================
-- Vérification :
--   SELECT e.slug, r.document_type, r.send_email
--     FROM formation_automation_rules r JOIN entities e ON e.id = r.entity_id
--     WHERE r.document_type LIKE 'questionnaire_%' ORDER BY e.slug, r.document_type;
-- ============================================================
