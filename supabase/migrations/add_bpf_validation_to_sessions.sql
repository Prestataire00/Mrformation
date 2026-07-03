-- ─── BPF : validation par formation (session) ──────────────────────
-- Onglet BPF du détail formation : l'admin peut "valider" une session
-- pour le BPF une fois que tous ses trous de données sont corrigés.
-- Stocke qui a validé et quand (traçabilité / audit).
--
-- Idempotent : rejouable sans risque (ADD COLUMN IF NOT EXISTS).

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS bpf_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bpf_validated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
