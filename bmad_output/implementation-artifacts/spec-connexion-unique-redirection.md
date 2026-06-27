---
title: "Connexion unique auto-redirigée : suppression du choix d'organisme pré-login"
type: 'feature'
created: '2026-06-27'
status: 'done'
baseline_commit: '150f7f7f215891c6b819ea08ed695593654980a3'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/bmad_output/planning-artifacts/2026-06-27-cadrage-connexion-unique.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'identification impose un parcours legacy de choix d'organisme avant l'auth : `LandingPage` (boutons MR/C3V) → `select-role` → `login?entity=slug`. Inutile : `profiles.entity_id` est 1:1 et le backend force déjà l'entité du profil. Le QR apprenant pointe `/login` sans slug → le middleware force `/select-entity` (retour arrière subi).

**Approach:** Une **seule page de login générique**. L'entité active est **dérivée de `profiles.entity_id` après authentification** (cookie posé par le middleware/login), et la redirection se fait par `profiles.role`. Le seul besoin d'entité *avant* auth est le login par **identifiant** (apprenant sans email, RPC scopée entité) → couvert par un **sélecteur d'organisme inline** sur la même page (apparaît pour le login par identifiant ; pré-rempli si `?entity=` présent). Le choix d'organisme manuel ne subsiste que pour le `super_admin` (switch post-login existant). Le bug QR est réglé par cette dérivation (plus de `/select-entity` forcé).

## Boundaries & Constraints

**Always:** Le rôle reste lu côté serveur depuis la DB (jamais le cookie) pour l'autorisation. L'entité active dérive de `profiles.entity_id` (réutiliser la logique de `shouldForceProfileEntity`). `super_admin` non forcé (garde son switch). Login par email = aucun organisme requis. Login par identifiant (sans `@`) = entité requise via le sélecteur inline. Pas de `any`. RLS et cross-entité CRM inchangés.

**Ask First:** Toute modification de la RPC `resolve_learner_email_by_username` ou du modèle 1:1 user↔entité. Toute suppression de `/select-entity` (on le conserve).

**Never:** Ne pas casser le login par identifiant (Pédagogie V2). Ne pas rendre l'organisme obligatoire pour le login par email. Ne pas toucher au `force change password` / `first_login` du middleware. Ne pas modifier l'URL du QR (hors périmètre — le bug est réglé par la dérivation). Pas de détection d'entité par domaine email. Pas de migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Login par email | email + mdp, aucun organisme choisi | Auth → entité dérivée du profil → cookie posé → redirection par rôle | mdp KO → message générique anti-énumération |
| Login par identifiant | username (sans `@`) + mdp | Sélecteur d'organisme inline requis → résolution username→email (RPC) → auth → redirection | organisme non choisi → message « choisissez votre organisme » ; mauvais organisme → échec login générique |
| QR/lien apprenant | scan → `/login` (sans `?entity`) | Page login générique ; email → auto ; identifiant → sélecteur inline. **Aucun retour arrière forcé** | — |
| Utilisateur authentifié sans cookie entité | cookie `entity_id` absent, `profile.entity_id` présent | Middleware **dérive** l'entité du profil, pose le cookie, laisse passer (plus de `/select-entity` forcé) | `profile.entity_id` NULL → repli `/select-entity` |
| super_admin | login générique | Atterrit sur son entité courante (profil) ; switch post-login conservé | — |
| Non authentifié sur `/` ou route privée | pas de session | Redirigé vers `/login` (plus de LandingPage) | API → 401 JSON (inchangé) |

</frozen-after-approval>

## Code Map

- `src/app/(auth)/login/page.tsx` -- formulaire ; ajouter le sélecteur d'organisme inline (username), poser le cookie depuis `profile.entity_id` post-auth, retirer la logique `select-role` (roleKey/mismatch), branding générique, corriger le back-link.
- `src/middleware.ts:146-164` -- remplacer le `redirect('/select-entity')` sur cookie manquant par une **dérivation** depuis `profile.entity_id` (fetch role+entity_id en une fois, poser le cookie, continuer ; `/select-entity` seulement si NULL). L.65 : rediriger le non-authentifié vers `/login`. L.56 : retirer `/select-role` des publicPaths.
- `src/app/page.tsx` -- non-auth → `redirect('/login')` (retirer `<LandingPage>`) ; auth → fetch role+`entity_id`, router par rôle, `/select-entity` seulement si cookie ET profil sans entité.
- `src/lib/auth/effective-entity.ts:13` -- `shouldForceProfileEntity` ; en extraire/réutiliser une décision pure « quelle entité active » testable.
- `src/lib/crm/active-entity.ts` -- réf. : super_admin = cookie, commercial = profil (inchangé, ne pas casser).
- `src/components/LandingPage.tsx` + `src/app/(auth)/select-role/page.tsx` -- **supprimer** (retirés du parcours nominal).
- `src/app/(auth)/select-entity/page.tsx` -- **conservé** (switch super_admin + repli).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/auth/effective-entity.ts` -- ajouter `resolveActiveEntity(role, profileEntityId, cookieEntityId): { entityId: string | null; needsSelection: boolean }` (pure) : super_admin → cookie ?? profil ; autres → profil (ignore cookie divergent) ; `needsSelection=true` seulement si aucune entité résoluble. Réutiliser `shouldForceProfileEntity`. -- source unique testable.
- [x] `src/middleware.ts` -- fetch `role, entity_id` du profil en une requête ; si cookie `entity_id` manquant/divergent et entité résoluble → `response.cookies.set('entity_id', ...)` et continuer ; `/select-entity` uniquement si `needsSelection`. Non-auth (l.60-66) → `/login`. Retirer `/select-role` des publicPaths. -- cœur de la dérivation + entrée unique.
- [x] `src/app/page.tsx` -- non-auth → `redirect('/login')` ; auth → router par rôle avec entité résolue (pas de `/select-entity` si `profile.entity_id` présent). -- supprime LandingPage du flux.
- [x] `src/app/(auth)/login/page.tsx` -- sélecteur d'organisme inline (2 entités, pré-rempli depuis `?entity=`), requis seulement si identifiant sans `@` ; post-auth : lire `profile.role` + `entity_id`, poser cookies `user_role` et `entity_id` (depuis le profil), rediriger `/` ; retirer la logique select-role ; branding générique ; back-link → `/login` (ou retiré). -- la page unique.
- [x] Supprimer `src/components/LandingPage.tsx` et `src/app/(auth)/select-role/page.tsx`. -- nettoyage legacy.
- [x] `src/lib/__tests__/connexion-unique-entity-resolution.test.ts` -- tester `resolveActiveEntity` (email user → profil ; cookie divergent non-super_admin → profil ; super_admin → cookie puis profil ; entité NULL → needsSelection ; super_admin sans rien → needsSelection). -- couvre la matrice.

**Acceptance Criteria:**
- Given un apprenant avec email, when il se connecte sur la page unique (sans choisir d'organisme), then il atterrit directement sur son espace via `profile.entity_id` + `role`.
- Given un apprenant sans email, when il saisit son identifiant, then un sélecteur d'organisme inline apparaît et permet la résolution ; aucun écran de choix séparé ni retour arrière.
- Given un utilisateur authentifié sans cookie d'entité mais avec `profile.entity_id`, when il navigue, then le middleware pose le cookie et le laisse passer (pas de `/select-entity`).
- Given un super_admin, when il se connecte, then il atterrit sur son entité et peut toujours switcher.
- Given un visiteur non authentifié, when il ouvre `/`, then il voit la page de login unique (plus la LandingPage MR/C3V).

## Design Notes

Séparation clé : l'`entitySlug` du sélecteur inline sert **uniquement** à la résolution username→email **avant** auth ; le cookie d'entité, lui, vient **toujours** de `profile.entity_id` **après** auth. Un mauvais organisme au sélecteur → la RPC renvoie un email synthétique → `signInWithPassword` échoue proprement (anti-énumération préservée). Le middleware reste la source de vérité : rôle lu en DB, entité dérivée du profil.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur
- `npx vitest run src/lib/__tests__/connexion-unique-entity-resolution.test.ts` -- expected: verts
- `npx vitest run src/lib/__tests__/` -- expected: pas de régression auth/middleware

**Manual checks:**
- Login email (admin MR, admin C3V, apprenant) → bon espace, sans choix d'organisme. Login identifiant → sélecteur inline. Scan QR → page login, pas de retour arrière. super_admin → switch OK. Non-auth sur `/` → page login.

## Suggested Review Order

**Le cœur : dérivation de l'entité (pur)**

- Helper unique : super_admin → cookie ?? profil ; rôles scopés → profil ; needsSelection si non résoluble
  [`effective-entity.ts:35`](../../src/lib/auth/effective-entity.ts#L35)

**Sécurité serveur (middleware)**

- Lecture profil (rôle + entity_id) en une fois, dérivation de l'entité, RBAC (rôle toujours lu en DB)
  [`middleware.ts:168`](../../src/middleware.ts#L168)

- Garde-fou (revue) : cookie posé UNIQUEMENT s'il est absent (évite le flicker du switch commercial)
  [`middleware.ts:177`](../../src/middleware.ts#L177)

**Routage SSR**

- Racine : non-auth → /login ; auth → rôle ; default → /login (anti-boucle, revue)
  [`page.tsx:14`](../../src/app/page.tsx#L14)

- Layout dashboard aligné sur resolveActiveEntity (plus de /select-entity forcé sur cookie absent — revue)
  [`layout.tsx:43`](../../src/app/(dashboard)/layout.tsx#L43)

**Page de login unique**

- Sélecteur d'organisme inline (login par identifiant uniquement) + cookie depuis le profil + branding générique
  [`login/page.tsx:281`](../../src/app/(auth)/login/page.tsx#L281)

**Tests**

- resolveActiveEntity : tous les rôles, cookie divergent ignoré, repli needsSelection
  [`connexion-unique-entity-resolution.test.ts:9`](../../src/lib/__tests__/connexion-unique-entity-resolution.test.ts#L9)
