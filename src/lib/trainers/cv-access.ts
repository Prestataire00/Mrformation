/**
 * Autorisation de gestion (upload/remplacement) du CV d'un formateur.
 *
 * - super_admin : toute fiche
 * - admin : fiche de sa propre entité
 * - trainer : UNIQUEMENT sa propre fiche (`trainer.profile_id === auth.uid()`) —
 *   anti-IDOR : un formateur ne peut pas gérer le CV d'un autre.
 *
 * Fonction pure → testable et partagée entre les routes CV (POST upload, GET url).
 */
export interface CvAccessProfile {
  role: string;
  entity_id: string | null;
}

export interface CvAccessTrainer {
  entity_id: string | null;
  profile_id: string | null;
}

export function canManageTrainerCv(
  profile: CvAccessProfile,
  trainer: CvAccessTrainer,
  userId: string,
): boolean {
  if (profile.role === "super_admin") return true;
  if (profile.role === "admin") return trainer.entity_id === profile.entity_id;
  if (profile.role === "trainer") return trainer.profile_id === userId;
  return false;
}
