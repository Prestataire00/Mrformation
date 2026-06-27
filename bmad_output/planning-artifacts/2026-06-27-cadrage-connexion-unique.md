# Cadrage — Connexion unique auto-redirigée (refonte de l'identification)

**Analyste :** Mary 📊 · **Date :** 2026-06-27 · **Type :** Évolution (englobe un bug) · **Destiné à :** Quick Dev

---

## 1. La réponse (en une phrase)

> **Remplacer le choix d'organisme pré-login par un formulaire de connexion unique ; après authentification, l'entité et le tableau de bord sont dérivés automatiquement de `profiles.entity_id` + `profiles.role`.** Le choix d'organisme manuel ne subsiste que pour le `super_admin` (switch post-login, déjà existant).

C'est une **simplification** alignée sur ce que le backend impose déjà, pas une refonte risquée.

## 2. Problème

- Parcours legacy (hérité d'Adrien) : `LandingPage` (2 boutons MR/C3V) → `select-role` → `login?entity=slug`. L'utilisateur **choisit son organisme** avant même de s'authentifier.
- **Bug QR apprenant** : le QR encode `/login` sans slug ([login-qr-code.ts:26](../../src/lib/services/login-qr-code.ts#L26)) → l'apprenant s'authentifie « hors organisme » → le middleware le force vers `/select-entity` ([middleware.ts:150](../../src/middleware.ts#L150)) = le retour arrière subi.

## 3. Constats techniques (preuves)

| Fait | Source | Implication |
|------|--------|-------------|
| `profiles.entity_id` est **1:1** (entité unique/utilisateur) | schema.sql:32 | L'entité est déterministe pour 99 % des comptes |
| Le backend **force déjà** `profile.entity_id` pour tous les rôles sauf super_admin | effective-entity.ts:18 | Le picker pré-login est **cosmétique** ; la vraie entité = le profil |
| **Aucune auto-inscription** (pas de page `register`) | `src/app/(auth)/` | Le cas « entity_id NULL » ne survient pas pour les end-users |
| Les comptes sont créés par l'admin **avec entity_id**, à la main **OU en lot** | create-access:126, batch-create-credentials:152 | À la 1re connexion, `entity_id` est **déjà rempli** |
| `learners.entity_id` est **NOT NULL** ; `create-access` refuse un apprenant sans entité (500) | schema.sql, create-access:69 | Même un apprenant **auto-créé** a une entité → le profil en hérite |
| super_admin / commercial peuvent switcher | switch-entity, active-entity.ts | Le cross-entité a déjà son mécanisme (post-login) |

➡️ **Le verrou supposé (« comment connaître l'organisme avant login ? ») n'existe pas** : on le connaît **après** login, via le profil.

## 4. Décisions de cadrage (3 cas-limites tranchés)

1. **Première connexion / `entity_id` NULL** → **Non bloquant.** Tous les comptes réels ont `entity_id` (créés par admin). Garde-fou : si `entity_id` est NULL (cas résiduel super_admin/admin auto-provisionné), router vers `/select-entity` en repli. *Aucun parcours de choix d'organisme pour les end-users.*
2. **super_admin / commercial (cross-entité)** → Login **sans** choix d'organisme ; atterrissage sur leur `entity_id` courant (profil) ; le **switcher post-login existant est conservé** (`/select-entity` + `EntityContext`). Aucune régression CRM cross-entité.
3. **Branding** → **Login générique** (objectif client : « une seule interface »). Le branding par entité s'applique **après** authentification (le dashboard lit l'entité du profil). Pas de détection par domaine email (fragile) en v1.

## 5. Périmètre

**Inclus :**
- Formulaire de login unique (email + mot de passe), **sans** paramètre `?entity` requis.
- Post-auth : lire `profile.entity_id` → poser le cookie d'entité → rediriger par `profile.role` (logique déjà présente dans `page.tsx`/middleware, à simplifier).
- Retirer le parcours legacy de **choix d'organisme** : `LandingPage` (boutons MR/C3V) et `select-role` → un utilisateur non authentifié arrive directement sur le login unique.
- **Bug QR : réglé automatiquement** — le QR pointe `/login`, l'apprenant s'authentifie, l'app le route via son profil. Aucun slug à injecter. (Vérifier que `/login` sans `?entity` ne casse plus le branding.)

**Exclus (Ask First / hors v1) :**
- Détection d'entité par domaine email ou préfixe d'identifiant.
- Suppression de `/select-entity` (on le **garde** comme cible du switch super_admin + repli NULL).
- Modèle multi-entité par utilisateur (rester 1:1).
- Refonte du provisioning des comptes.

## 6. Risques & sécurité

- ✅ **Plus sûr** : l'utilisateur ne « choisit » plus un organisme — l'entité est **dérivée serveur** du profil. Supprime la divergence cookie/profil que `effective-entity.ts` doit déjà corriger.
- ⚠️ **À vérifier** : tous les points qui lisaient `?entity` (login page, liens, redirections) doivent gérer son absence sans erreur. Vérifier le middleware `publicPaths` et la pose du cookie quand `entity_id` vient du profil et non de l'URL.
- ⚠️ **Email unique** : non-risque confirmé (auth Supabase globale → 1 email = 1 compte = 1 entité).

## 7. Critères d'acceptation (haut niveau)

- Un apprenant scanne le QR → arrive sur le login unique → se connecte → atterrit **directement** sur son espace, **sans** écran de choix d'organisme.
- Un admin MR et un admin C3V se connectent via la **même** page → chacun atterrit dans son entité.
- Un super_admin se connecte → atterrit sur son entité courante → peut **toujours** switcher.
- Aucune régression RLS / cross-entité CRM.
- Les pages `LandingPage` / `select-role` ne sont plus dans le parcours nominal.

## 8. Prochaine étape

**Quick Dev** (`bmad-quick-dev`) sur ce cadrage. Périmètre estimé **modéré** : login page, `page.tsx`/middleware (redirection), retrait LandingPage/select-role, vérif QR. Le bug QR est inclus sans code dédié.
