import { cookies } from "next/headers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Entité "active" d'une requête API CRM.
 * - super_admin : entité sélectionnée via le cookie `entity_id`. Sûr, car la
 *   RLS super_admin n'est pas filtrée par entité.
 * - commercial : cross-entité lui aussi, mais piloté par `profile.entity_id`
 *   que `/api/auth/switch-entity` garde synchronisé avec l'entité choisie.
 *   On NE lit PAS le cookie pour lui : la RLS commercial filtre par
 *   `public.user_entity_id()` (= profile.entity_id) — s'aligner dessus évite
 *   tout rejet RLS si le cookie devançait le profil pendant une bascule.
 * - autres rôles : profile.entity_id (cookie ignoré — non fiable côté client).
 * Repli : pas de cookie / cookie non-UUID → profile.entity_id.
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
