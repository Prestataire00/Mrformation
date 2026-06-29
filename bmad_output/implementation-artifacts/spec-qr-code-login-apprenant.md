---
title: 'QR code apprenant → login direct (entité pré-remplie, sans choix d''organisme)'
type: 'bugfix'
created: '2026-06-28'
status: 'done'
baseline_commit: 'a4a9491e'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/bmad_output/implementation-artifacts/spec-connexion-unique-redirection.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le QR code de la convocation encode `/login` (sans entité). Un apprenant **sans email** se connecte par identifiant → la page login lui demande de **choisir son organisme** (sélecteur inline requis pour résoudre l'identifiant). C'est le « choisissez un organisme » subi. La dérivation middleware (connexion unifiée) ne couvre que l'utilisateur *déjà authentifié*, pas ce login par identifiant.

**Approach:** Encoder l'**entité de l'apprenant** dans le QR : `/login?entity=<slug>`. La page login lit déjà `?entity=` et **pré-remplit** le sélecteur d'organisme → plus de choix manuel. `generateLoginQrDataUrl` reçoit un `entitySlug` optionnel ; chaque appelant passe le slug de l'entité courante (`entities.slug`, déjà fourni par `loadEntitySettings`). Repli `/login` inchangé si pas de slug.

## Boundaries & Constraints

**Always:**
- `generateLoginQrDataUrl(entitySlug?: string)` : si `entitySlug` fourni → `${base}/login?entity=${encodeURIComponent(entitySlug)}` ; sinon `${base}/login` (comportement actuel).
- Le slug vient de l'entité réelle de l'apprenant/convocation (`entities.slug` via `loadEntitySettings` ou un `select` ciblé), pas d'une valeur en dur (sauf le mock).
- `entity_id` filtré sur toute requête Supabase. Pas de `any`. Service dédié conservé.

**Ask First:**
- Pas de migration SQL (lecture seule sur `entities`).

**Never:**
- Ne pas transformer le QR en magic link (toujours la page login classique, l'apprenant saisit identifiant + mot de passe).
- Ne pas casser le login par email (aucun organisme requis) ni le login par identifiant (sélecteur conservé, juste pré-rempli).
- Ne pas modifier la page login (`?entity=` est déjà géré) ni le middleware ni la dérivation d'entité.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| QR convocation (apprenant entité X) | génération avec `entity.slug = "mr-formation"` | QR encode `/login?entity=mr-formation` | si slug absent → `/login` (repli) |
| Scan, apprenant sans email | arrive sur `/login?entity=mr-formation` | sélecteur d'organisme **pré-rempli** sur son entité ; il saisit identifiant + mdp, aucun choix manuel | — |
| Scan, apprenant avec email | `/login?entity=…` | login par email direct (le slug est ignoré pour l'email) | — |
| Slug inconnu / vide | `entitySlug` vide/null | `/login` simple (pas de `?entity=` vide) | repli silencieux |
| Mock convocation | route mock | slug par défaut cohérent (ex. entité du mock) | — |

</frozen-after-approval>

## Code Map

- `src/lib/services/login-qr-code.ts` -- `generateLoginQrDataUrl(entitySlug?: string)` : ajouter le paramètre, construire `/login?entity=<slug>` si présent (sinon `/login`). Mettre à jour le commentaire (le QR n'est plus « URL fixe »).
- `src/app/api/documents/generate-convocations-batch/route.ts` (~l.140) -- passer `entity?.slug` (entité déjà chargée via `loadEntitySettings` ~l.130).
- `src/app/api/documents/send-convocations-batch-email/route.ts` (~l.125) -- passer le slug de l'entité courante (charger `entities.slug` si pas déjà dispo).
- `src/lib/services/batch-email-handler.ts` (~l.461) -- passer le slug de l'entité de la session (résoudre depuis `sessionId`/`entity_id` ; le QR n'est plus identique pour tous si entités différentes — ici un batch = une entité).
- `src/app/api/documents/generate-convocation-mock/route.ts` (~l.145) -- passer un slug par défaut cohérent (entité du mock).
- `src/app/(auth)/login/page.tsx` -- RÉFÉRENCE seulement : lit `searchParams.get("entity")` (l.40) et pré-remplit `entitySlug`. Aucune modification.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/services/login-qr-code.ts` -- ajouter `entitySlug?` et l'encoder dans l'URL (repli `/login`) -- cœur du fix.
- [x] `src/app/api/documents/generate-convocations-batch/route.ts` + `send-convocations-batch-email/route.ts` + `src/lib/services/batch-email-handler.ts` -- passer le slug de l'entité réelle aux appels -- QR pré-scopé par entité.
- [x] `src/app/api/documents/generate-convocation-mock/route.ts` -- passer un slug par défaut -- cohérence mock.
- [x] `src/lib/__tests__/login-qr-code.test.ts` (ou test programme existant) -- vérifier l'URL encodée avec slug (`/login?entity=...`) et sans slug (`/login`) -- filet anti-régression.

**Acceptance Criteria:**
- Given une convocation d'un apprenant de l'entité « mr-formation », when le QR est généré, then il encode `…/login?entity=mr-formation`.
- Given un apprenant sans email qui scanne ce QR, when il arrive sur la page login, then le sélecteur d'organisme est déjà positionné sur son entité et il n'a aucun organisme à choisir manuellement.
- Given une génération sans slug (repli), when le QR est produit, then l'URL reste `…/login` (aucune régression).
- Given toute génération de QR/convocation, when elle s'exécute, then `entity_id` reste filtré et aucune migration SQL n'est introduite.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur
- `npx vitest run src/lib/__tests__/login-qr-code.test.ts` -- expected: verts
- `grep -rn "generateLoginQrDataUrl(" src | grep -v "entitySlug\|export"` -- expected: plus aucun appel sans argument d'entité (hors repli volontaire)

**Manual checks:**
- Générer une convocation → décoder le QR → l'URL contient `?entity=<slug de l'entité>`.
- Scanner (ou ouvrir l'URL) en tant qu'apprenant sans email → sélecteur d'organisme pré-rempli, pas de choix manuel.

## Suggested Review Order

- Cœur du fix : URL `/login?entity=<slug>` (repli `/login`), garde sur slug vide.
  [`login-qr-code.ts:35`](../../src/lib/services/login-qr-code.ts#L35)
- Appelants passant `entity?.slug ?? undefined` (mock : défaut `mr-formation`).
  [`generate-convocations-batch/route.ts:142`](../../src/app/api/documents/generate-convocations-batch/route.ts#L142)
  [`send-convocations-batch-email/route.ts:128`](../../src/app/api/documents/send-convocations-batch-email/route.ts#L128)
  [`batch-email-handler.ts:463`](../../src/lib/services/batch-email-handler.ts#L463)
- Test : URL avec/sans slug + encodage.
  [`login-qr-code.test.ts`](../../src/lib/__tests__/login-qr-code.test.ts)

Référence (non modifié) : la page login lit déjà `?entity=` et pré-remplit le sélecteur ([`login/page.tsx:40`](../../src/app/%28auth%29/login/page.tsx#L40)).
