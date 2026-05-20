import { cookies } from "next/headers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Entité "active" d'une requête API CRM.
 * - super_admin : entité sélectionnée (cookie `entity_id`), car cross-entité.
 * - autres rôles : profile.entity_id. Le cookie n'est PAS digne de confiance
 *   pour eux (non httpOnly, modifiable côté client) → ignoré.
 * Repli : super_admin sans cookie / cookie non-UUID → profile.entity_id.
 */
export function resolveActiveEntityId(
  profile: { role: string; entity_id: string },
): string {
  if (profile.role === "super_admin") {
    const cookieEntity = cookies().get("entity_id")?.value;
    if (cookieEntity && UUID_RE.test(cookieEntity)) return cookieEntity;
  }
  return profile.entity_id;
}
