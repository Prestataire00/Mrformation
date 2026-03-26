-- ============================================================
-- Migration: BPF Auto-Calculation
-- Ajoute les colonnes nécessaires pour le calcul automatique
-- du Bilan Pédagogique et Financier (BPF)
-- ============================================================

-- ── 1. Colonne bpf_category sur clients ──────────────────────
-- Catégorise le client/payeur pour la Section C du BPF

ALTER TABLE clients ADD COLUMN IF NOT EXISTS bpf_category TEXT
  DEFAULT 'entreprise_privee'
  CHECK (bpf_category IN (
    'entreprise_privee',          -- Ligne 1 : entreprises
    'pouvoir_public_agents',      -- Ligne 3 : publics formant leurs agents
    'instances_europeennes',      -- Ligne 4
    'etat',                       -- Ligne 5
    'conseil_regional',           -- Ligne 6
    'pole_emploi',                -- Ligne 7
    'autres_publics',             -- Ligne 8
    'individuel',                 -- Ligne 9 : personnes à titre individuel
    'organisme_formation',        -- Ligne 10 : autre organisme de formation
    'autre'                       -- Ligne 11 : autres produits
  ));

-- ── 2. Colonnes BPF sur programs ─────────────────────────────

ALTER TABLE programs ADD COLUMN IF NOT EXISTS price DECIMAL(10,2);
ALTER TABLE programs ADD COLUMN IF NOT EXISTS tva_rate DECIMAL(5,2) DEFAULT 20.00;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS duration_hours DECIMAL(5,2);
ALTER TABLE programs ADD COLUMN IF NOT EXISTS nsf_code TEXT;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS nsf_label TEXT;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS is_apprenticeship BOOLEAN DEFAULT FALSE;

ALTER TABLE programs ADD COLUMN IF NOT EXISTS bpf_objective TEXT
  CHECK (bpf_objective IN (
    'rncp_6_8',
    'rncp_5',
    'rncp_4',
    'rncp_3',
    'rncp_2',
    'rncp_cqp',
    'certification_rs',
    'cqp_non_enregistre',
    'autre_pro',
    'bilan_competences',
    'vae'
  ));

ALTER TABLE programs ADD COLUMN IF NOT EXISTS bpf_funding_type TEXT
  CHECK (bpf_funding_type IN (
    'entreprise_privee',
    'apprentissage',
    'professionnalisation',
    'reconversion_alternance',
    'conge_transition',
    'cpf',
    'dispositif_chomeurs',
    'non_salaries',
    'plan_developpement',
    'pouvoir_public_agents',
    'instances_europeennes',
    'etat',
    'conseil_regional',
    'pole_emploi',
    'autres_publics',
    'individuel',
    'organisme_formation',
    'autre'
  ));

-- ── 3. Colonnes BPF sur trainings ────────────────────────────

ALTER TABLE trainings ADD COLUMN IF NOT EXISTS bpf_objective TEXT
  CHECK (bpf_objective IN (
    'rncp_6_8',
    'rncp_5',
    'rncp_4',
    'rncp_3',
    'rncp_2',
    'rncp_cqp',
    'certification_rs',
    'cqp_non_enregistre',
    'autre_pro',
    'bilan_competences',
    'vae'
  ));

ALTER TABLE trainings ADD COLUMN IF NOT EXISTS bpf_funding_type TEXT
  CHECK (bpf_funding_type IN (
    'entreprise_privee',
    'apprentissage',
    'professionnalisation',
    'reconversion_alternance',
    'conge_transition',
    'cpf',
    'dispositif_chomeurs',
    'non_salaries',
    'plan_developpement',
    'pouvoir_public_agents',
    'instances_europeennes',
    'etat',
    'conseil_regional',
    'pole_emploi',
    'autres_publics',
    'individuel',
    'organisme_formation',
    'autre'
  ));

-- ── 4. Colonnes BPF sur crm_quotes ──────────────────────────

ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS bpf_funding_type TEXT
  CHECK (bpf_funding_type IN (
    'entreprise_privee',
    'apprentissage',
    'professionnalisation',
    'reconversion_alternance',
    'conge_transition',
    'cpf',
    'dispositif_chomeurs',
    'non_salaries',
    'plan_developpement',
    'pouvoir_public_agents',
    'instances_europeennes',
    'etat',
    'conseil_regional',
    'pole_emploi',
    'autres_publics',
    'individuel',
    'organisme_formation',
    'autre'
  ));

ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS training_id UUID REFERENCES trainings(id) ON DELETE SET NULL;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL;

-- ── 5. Taux horaire par session sur formation_trainers ───────

ALTER TABLE formation_trainers ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2);

-- ── 6. Backfill des données existantes ───────────────────────

UPDATE clients SET bpf_category = 'entreprise_privee' WHERE bpf_category IS NULL;
UPDATE trainings SET bpf_objective = 'autre_pro' WHERE bpf_objective IS NULL;

-- Copier le taux horaire global du formateur comme valeur initiale
UPDATE formation_trainers ft
  SET hourly_rate = t.hourly_rate
  FROM trainers t
  WHERE ft.trainer_id = t.id
    AND ft.hourly_rate IS NULL
    AND t.hourly_rate IS NOT NULL;
