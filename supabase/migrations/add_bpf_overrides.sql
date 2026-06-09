-- Migration: Ajoute colonne overrides JSONB sur bpf_financial_data
-- Permet à l'admin d'overrider manuellement les valeurs BPF calculées
-- sans modifier les données sources (apprenants, formations, devis).

ALTER TABLE bpf_financial_data ADD COLUMN IF NOT EXISTS overrides JSONB DEFAULT '{}';
