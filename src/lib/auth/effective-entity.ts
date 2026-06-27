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

/**
 * Détermine l'entité active à utiliser (connexion unique auto-redirigée).
 *
 * - `super_admin` : peut être cross-entité → le cookie fait foi (choix de switch),
 *   avec repli sur l'entité du profil. `needsSelection` seulement si aucune des deux.
 * - autres rôles : l'entité est TOUJOURS celle du profil (la RLS y est liée) ;
 *   un cookie divergent est ignoré. `needsSelection` seulement si le profil n'a
 *   pas d'entité (cas résiduel — tous les end-users en ont une).
 *
 * Retourne `entityId` = l'entité à appliquer (et à poser en cookie si différente),
 * et `needsSelection` = true si l'on doit router vers `/select-entity`.
 */
export function resolveActiveEntity(
  role: string | null | undefined,
  profileEntityId: string | null | undefined,
  cookieEntityId: string | null | undefined,
): { entityId: string | null; needsSelection: boolean } {
  if (role === "super_admin") {
    const entityId = cookieEntityId || profileEntityId || null;
    return { entityId, needsSelection: !entityId };
  }
  // Rôles scopés : l'entité du profil prime, le cookie divergent est ignoré.
  if (profileEntityId) {
    return { entityId: profileEntityId, needsSelection: false };
  }
  return { entityId: null, needsSelection: true };
}
