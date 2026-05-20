# Design — Entité active des routes CRM pour les super_admin

**Date :** 2026-05-20
**Module :** API CRM (`src/app/api/crm/`)

## Contexte & problème

Un `super_admin` est cross-entité : son `profiles.entity_id` pointe une
entité (ex. C3V) alors qu'il pilote une autre entité (ex. MR) via le
sélecteur d'entité. Les routes API CRM de **liste** (GET) et de
**création** (POST) scopent par `profile.entity_id` → un super_admin voit
et crée dans l'entité de son profil, jamais dans l'entité sélectionnée.

Les routes de mutation par id (PATCH/DELETE) ont déjà été corrigées
(PR #144, #145). Ce chantier traite les GET/POST restants.

## Objectif

Faire que les routes CRM utilisent **l'entité sélectionnée** quand
l'appelant est super_admin, sans rien changer pour les autres rôles.

## Composant 1 — Helper `resolveActiveEntityId`

Nouveau fichier `src/lib/crm/active-entity.ts` :

```ts
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
```

## Composant 2 — Application aux 11 fichiers de route

Après récupération du `profile`, calculer une fois
`const activeEntityId = resolveActiveEntityId(profile)` et l'utiliser
partout où `profile.entity_id` sert à **scoper une liste, assigner une
création ou filtrer un calcul**. Fichiers :

| Fichier | Méthodes concernées |
|---|---|
| `tasks/route.ts` | GET, POST |
| `prospects/route.ts` | GET, POST |
| `quotes/route.ts` | GET, POST |
| `suivi/route.ts` | GET, POST (DELETE déjà corrigé) |
| `automations/route.ts` | GET (PATCH déjà corrigé) |
| `tags/route.ts` | GET, POST (DELETE déjà corrigé) |
| `segment-count/route.ts` | POST |
| `automations/run/route.ts` | POST |
| `notifications/daily-digest/route.ts` | branche mode utilisateur |
| `notifications/weekly-summary/route.ts` | branche mode utilisateur |
| `notifications/generate/route.ts` | branche mode utilisateur |

**Intouché :** la branche *mode cron* des routes notifications (qui prend
déjà `body.entity_id`) ; les contrôles d'autorisation et de rôle ; les
routes de mutation par id déjà corrigées.

## Garanties anti-régression

1. **Non-super_admin (admin, commercial, trainer)** : le helper renvoie
   `profile.entity_id` — valeur identique à l'actuelle. Comportement
   strictement inchangé pour la quasi-totalité des utilisateurs.
2. **Repli gracieux** : super_admin sans cookie valide → `profile.entity_id`
   → comportement actuel. Seul change le cas super_admin + cookie valide,
   qui est précisément le correctif voulu.
3. **Mode cron notifications** : non modifié.
4. **Aucune nouvelle faille** : un non-super_admin ne peut pas escalader
   (cookie ignoré pour lui) ; un super_admin a déjà l'accès cross-entité
   par design.

## Test

Test unitaire Vitest de `resolveActiveEntityId` (`cookies()` de
`next/headers` mocké) — 4 cas :
- super_admin + cookie UUID valide → renvoie le cookie ;
- super_admin sans cookie → renvoie `profile.entity_id` ;
- super_admin + cookie non-UUID → renvoie `profile.entity_id` ;
- rôle non super_admin + cookie présent → renvoie `profile.entity_id`.

## Vérification

- `tsc --noEmit` : OK.
- Suite de tests : 396 + nouveau test du helper, tous verts.
- Revue occurrence par occurrence (le plan d'implémentation liste chaque
  changement exact, route par route).
- Commits petits et séparés.

## Périmètre

- **Inclus :** helper + les 11 fichiers de route ci-dessus.
- **Exclus :** mode cron des notifications ; toute modification client ;
  refactor des `getAuthenticatedUser` dupliqués (hors sujet).
