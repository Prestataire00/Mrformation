-- ============================================================
-- Migration : Modalité par créneau (multimodal Qualiopi)
-- ============================================================

ALTER TABLE formation_time_slots ADD COLUMN IF NOT EXISTS delivery_mode TEXT
  DEFAULT 'presentiel'
  CHECK (delivery_mode IN ('presentiel', 'distanciel_sync', 'distanciel_async', 'mixte'));

ALTER TABLE formation_time_slots ADD COLUMN IF NOT EXISTS meeting_url TEXT;
ALTER TABLE formation_time_slots ADD COLUMN IF NOT EXISTS location_override TEXT;
