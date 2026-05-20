-- ============================================================
-- Re-liaison des tâches CRM orphelines (prospect_id NULL)
-- ============================================================
-- Opération PONCTUELLE. Le diagnostic a montré :
--   - 1906 tâches reliées, rattachement FIABLE (759/759 cohérentes par
--     email, 0 divergente) — on n'y touche pas ;
--   - 68 tâches non reliées (prospect_id NULL) — cible de ce script.
--
-- Stratégie : rattacher une tâche orpheline à un prospect quand son
-- `contact_email` identifie UN SEUL prospect de la même entité. Les tâches
-- sans contact_email, ou dont l'email matche 0 ou >1 prospect, restent
-- orphelines (à traiter manuellement dans l'UI).
--
-- ⚠️ ORDRE : lancer ce script APRÈS 04b_complete_prospects.sql. La
-- complétion des emails prospects augmente le nombre de correspondances
-- possibles ici.
--
-- Idempotent (ne touche que les tâches encore prospect_id IS NULL) et
-- transactionnel.
--
-- Le SQL Editor n'affiche que le dernier résultat : lance les sections
-- une par une (sélection + Run).
-- ============================================================


-- ── SECTION A — PREVIEW (read-only) : tâches qui SERONT re-liées ──────────
SELECT t.id AS task_id, t.title, t.contact_email,
       p.company_name AS futur_prospect, p.sellsy_id
FROM crm_tasks t
JOIN crm_prospects p
  ON p.entity_id = t.entity_id
 AND lower(p.email) = lower(t.contact_email)
WHERE t.prospect_id IS NULL
  AND t.contact_email IS NOT NULL
  AND (SELECT COUNT(*) FROM crm_prospects p2
       WHERE p2.entity_id = t.entity_id
         AND lower(p2.email) = lower(t.contact_email)) = 1
ORDER BY t.created_at DESC;


-- ── SECTION B — UPDATE transactionnel ────────────────────────────────────
-- Ne relie que si l'email identifie EXACTEMENT un prospect (garde-fou
-- COUNT(*) = 1 → pas de rattachement ambigu).
BEGIN;

UPDATE crm_tasks t
SET prospect_id = (
      SELECT p.id FROM crm_prospects p
      WHERE p.entity_id = t.entity_id
        AND lower(p.email) = lower(t.contact_email)
      LIMIT 1
    ),
    updated_at = NOW()
WHERE t.prospect_id IS NULL
  AND t.contact_email IS NOT NULL
  AND (SELECT COUNT(*) FROM crm_prospects p
       WHERE p.entity_id = t.entity_id
         AND lower(p.email) = lower(t.contact_email)) = 1;

COMMIT;


-- ── SECTION C — Bilan : tâches encore orphelines après re-liaison ─────────
SELECT
  e.slug AS entite,
  COUNT(*)                                                  AS taches_total,
  COUNT(*) FILTER (WHERE t.prospect_id IS NULL)              AS encore_orphelines,
  COUNT(*) FILTER (WHERE t.prospect_id IS NULL
                     AND t.contact_email IS NULL)            AS orphelines_sans_email
FROM crm_tasks t
JOIN entities e ON e.id = t.entity_id
GROUP BY e.slug
ORDER BY e.slug;
