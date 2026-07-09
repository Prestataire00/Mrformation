-- ============================================================
-- Seed du modèle d'email "batch_devis" (envoi de devis SANS e-signature)
-- ============================================================
-- Contexte : la clé `batch_devis` est utilisée par le dialog d'envoi simple de
-- devis (admin/crm/quotes) mais n'a jamais été seedée par em-a-3 → l'envoi
-- tombait toujours sur un sujet/corps codés en dur. Ce seed fournit un modèle
-- par défaut ÉDITABLE (via admin/emails) et sélectionnable dans le dialog.
--
-- type='devis' → regroupé sous « Commercial » dans admin/emails et capté par le
-- sélecteur de modèle du dialog (type='devis' OU key ∈ {quote_sign_request,
-- batch_devis}).
--
-- NB : batch_devis n'est PAS ajouté à REQUIRED_KEYS (email-template-resolver.ts)
-- car il n'est consommé par aucun cron — uniquement par l'UI. L'ajouter
-- exposerait assertSeedComplete à un faux "ok=false" côté crons.
--
-- Idempotent : n'insère que pour les entités qui n'ont pas déjà la clé.
-- ============================================================

INSERT INTO email_templates (
  entity_id, name, subject, body, type, variables,
  key, category, is_active, recipient_type, trigger_config
)
SELECT
  e.id,
  'Devis — envoi par email',
  'Votre devis {{reference}} — {{entite}}',
  E'Bonjour {{destinataire}},\n\nVeuillez trouver ci-joint notre devis {{reference}} d''un montant de {{montant}}.\n\nNous restons à votre disposition pour toute question ou adaptation de notre offre.\n\nCordialement,\nL''équipe {{entite}}',
  'devis',
  '["reference","montant","destinataire","entite"]'::jsonb,
  'batch_devis',
  'transactional',
  TRUE,
  'client',
  jsonb_build_object('seed_version', '2026-07-09-batch-devis')
FROM entities e
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates et
  WHERE et.entity_id = e.id AND et.key = 'batch_devis'
);
