-- ============================================================
-- Fix RLS : lecture des signatures par le formateur via formation_trainers
--
-- Bug : la policy `signatures_trainer_read` résolvait les sessions du formateur
-- par `JOIN trainers t ON t.id = sessions.trainer_id`. Or `sessions.trainer_id`
-- est quasi toujours NULL (l'assignation se fait via `formation_trainers`, lien
-- canonique de tout l'espace formateur). Conséquence : un formateur ne pouvait
-- PAS lire les signatures (présence apprenant + ses propres émargements) de sa
-- session via le client navigateur → « Suivi des apprenants » à 0/100 malgré des
-- QR signés. (Confirmé en prod : session Maçon trainer_id=NULL, Houari lié via
-- formation_trainers uniquement.)
--
-- Correctif : résoudre les sessions du formateur via `formation_trainers`, et
-- couvrir TOUTES les signatures de ses sessions (apprenant + formateur). On
-- n'utilise que `auth.uid()` (pas de helper user_role/entity, ambigus public/auth).
-- ============================================================

DROP POLICY IF EXISTS "signatures_trainer_read" ON signatures;

CREATE POLICY "signatures_trainer_read" ON signatures
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT ft.session_id
      FROM formation_trainers ft
      JOIN trainers t ON t.id = ft.trainer_id
      WHERE t.profile_id = auth.uid()
    )
  );

-- Vérif : un formateur (auth.uid() = profiles.id) doit lire les signatures des
-- sessions où il est dans formation_trainers, quel que soit sessions.trainer_id.
