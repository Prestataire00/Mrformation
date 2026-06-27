-- Story 4.1 — Couleurs libres sur les créneaux de planning
-- Ajoute une colonne `color` (hex, optionnelle) sur formation_time_slots.
--
-- Choix par créneau (cf. cadrage 2026-06-27). Valeur issue d'une palette
-- restreinte côté UI (src/lib/utils/slot-colors.ts), NULL = pas de couleur.
--
-- Pas de changement RLS : formation_time_slots n'a pas de colonne entity_id
-- (isolation via session_id → sessions.entity_id) ; les policies existantes
-- couvrent déjà cette nouvelle colonne.
--
-- À exécuter dans Supabase Dashboard (SQL editor).

ALTER TABLE formation_time_slots
  ADD COLUMN IF NOT EXISTS color text;

COMMENT ON COLUMN formation_time_slots.color IS
  'Couleur de fond du créneau dans le planning (hex, palette restreinte UI). NULL = aucune couleur.';
