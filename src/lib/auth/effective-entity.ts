/**
 * Détermine si l'entité active doit être forcée à celle du profil utilisateur.
 *
 * Contexte : le tunnel pré-login (choix organisme → rôle → login) pose un cookie
 * `entity_id` qui peut pointer une entité à laquelle l'utilisateur n'appartient
 * pas. Pour un rôle NON super_admin, la RLS lie tout à `profiles.entity_id` : si
 * le cookie diverge, l'utilisateur voit un espace vide et ne peut rien créer
 * (« new row violates row-level security policy »).
 *
 * Un super_admin peut légitimement basculer d'entité (cf `/api/auth/switch-entity`,
 * qui met à jour `profiles.entity_id` via service_role) → on ne force jamais pour lui.
 */
export function shouldForceProfileEntity(
  role: string | null | undefined,
  profileEntityId: string | null | undefined,
  cookieEntityId: string | null | undefined,
): boolean {
  if (role === "super_admin") return false;
  if (!profileEntityId) return false;
  return profileEntityId !== cookieEntityId;
}
