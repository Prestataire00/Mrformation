-- ============================================================
-- Migration : Templates de relances éditables + activation
-- Date : 2026-04-06
-- ============================================================

-- Table de configuration des relances par entité
CREATE TABLE IF NOT EXISTS reminder_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  reminder_key TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  days_delay INTEGER NOT NULL DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, reminder_key)
);

ALTER TABLE reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminder_settings_entity_isolation"
ON reminder_settings FOR ALL
USING (entity_id IN (
  SELECT entity_id FROM profiles WHERE id = auth.uid()
));

-- Seed des 7 paramètres de relance pour chaque entité
INSERT INTO reminder_settings (entity_id, reminder_key, is_enabled, days_delay)
SELECT e.id, t.key, TRUE, t.delay
FROM entities e
CROSS JOIN (VALUES
  ('reminder_invoice_first',  7),
  ('reminder_invoice_second', 21),
  ('reminder_invoice_final',  45),
  ('reminder_quote_first',    3),
  ('reminder_quote_second',   7),
  ('reminder_quote_final',    14),
  ('reminder_opco',           7)
) AS t(key, delay)
ON CONFLICT (entity_id, reminder_key) DO NOTHING;

-- Seed des 7 templates email par défaut pour chaque entité
-- (contenu vide = utiliser le texte hardcodé par défaut)
INSERT INTO email_templates (entity_id, name, subject, body, type)
SELECT e.id, t.name, t.subject, t.body, t.type
FROM entities e
CROSS JOIN (VALUES
  ('Relance facture — Rappel courtois',
   'Rappel de paiement — Facture {{reference}}',
   'Bonjour,

Nous vous informons que la facture {{reference}} d''un montant de {{montant}} relative à la formation "{{formation}}" est arrivée à échéance le {{date_echeance}}.

Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.

Cordialement,
L''équipe formation',
   'reminder_invoice_first'),

  ('Relance facture — Rappel ferme',
   'Deuxième rappel — Facture {{reference}} impayée',
   'Bonjour,

Malgré notre précédent rappel, la facture {{reference}} d''un montant de {{montant}} relative à la formation "{{formation}}" reste impayée.

Échéance initiale : {{date_echeance}}

Nous vous prions de régulariser cette situation dans un délai de 7 jours.

Cordialement,
L''équipe formation',
   'reminder_invoice_second'),

  ('Relance facture — Mise en demeure',
   'Mise en demeure — Facture {{reference}}',
   'Bonjour,

La présente vaut mise en demeure.

La facture {{reference}} d''un montant de {{montant}} relative à la formation "{{formation}}" reste impayée malgré nos précédents rappels.

Échéance initiale : {{date_echeance}}

Sans règlement sous 8 jours, nous serons contraints d''engager des procédures de recouvrement. Des pénalités de retard de 40€ seront également appliquées conformément à la réglementation.

Cordialement,
L''équipe formation',
   'reminder_invoice_final'),

  ('Relance devis — Suivi',
   'Suite à notre proposition {{reference}}',
   'Bonjour,

Avez-vous eu le temps de consulter notre proposition {{reference}} ?

Nous restons à votre disposition pour toute question ou adaptation de notre offre.

Cordialement,
L''équipe formation',
   'reminder_quote_first'),

  ('Relance devis — Relance',
   'Relance — Proposition {{reference}}',
   'Bonjour,

Nous revenons vers vous concernant notre proposition {{reference}}.

Nous restons à disposition pour adapter notre offre à vos besoins. N''hésitez pas à nous contacter.

Cordialement,
L''équipe formation',
   'reminder_quote_second'),

  ('Relance devis — Dernière chance',
   'Dernière relance — Proposition {{reference}}',
   'Bonjour,

Notre proposition {{reference}} arrive à expiration le {{date_echeance}}.

Souhaitez-vous donner suite ? Nous serions ravis de finaliser ce projet avec vous.

Cordialement,
L''équipe formation',
   'reminder_quote_final'),

  ('Rappel OPCO — Dépôt non effectué',
   'Rappel : demande OPCO à déposer — {{formation}}',
   'Bonjour,

La demande de prise en charge OPCO "{{entreprise}}" pour la formation "{{formation}}" n''a pas encore été déposée.

La formation commence le {{date_echeance}}.

Pensez à déposer la demande rapidement.

Cordialement,
L''équipe formation',
   'reminder_opco')
) AS t(name, subject, body, type)
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates et
  WHERE et.entity_id = e.id AND et.type = t.type
);
