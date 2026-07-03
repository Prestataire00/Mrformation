---
title: "Bloc d'accès formateur (email + mot de passe + QR) sur la convention formateur"
type: 'feature'
created: '2026-07-04'
status: 'done'
baseline_commit: '559f60df71271a5c60b613d30d92d7e23b14ef08'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La convocation apprenant affiche un bloc « 🔐 Accès à votre espace » (URL + identifiant + mot de passe + QR) ; les conventions formateur (`convention-intervention`, `contrat-sous-traitance`) n'ont rien → le formateur reçoit son contrat sans ses accès de connexion.

**Approach:** Recopier ce bloc sur les 2 conventions formateur, avec **email** (pas d'identifiant synthétique). Mirror complet du modèle apprenant : persister `trainers.temp_password` (comme `learners.temp_password`) pour un mot de passe **stable et idempotent**, affiché sans jamais réinitialiser le login du formateur.

## Boundaries & Constraints

**Always:** `entity_id` strict ; zéro `any` ; login formateur = **email** ; réutiliser l'existant (`ensureTrainerAccount`, `resetTrainerPassword`, `generateLoginQrDataUrl` générique, et le pattern service_role de `generate-from-template/route.ts`) ; le mdp affiché vient de `trainers.temp_password` persisté ; migration séparée idempotente ; le bloc s'affiche sur les 2 templates convention (single **et** batch).

**Ask First:** —

**Never:** ne PAS réinitialiser le mot de passe du formateur en flux de génération normal (pas de `resetTrainerPassword` quand un compte actif existe déjà → casserait son login) ; ne pas toucher au bloc apprenant ni aux autres docs ; pas de nouveau builder QR ; hors scope : portail/espace formateur, envoi d'email, identifiant synthétique formateur.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Formateur sans compte | `trainer.profile_id` null | `ensureTrainerAccount` crée le compte + **persiste** `temp_password` ; bloc = email + ce mdp + QR | try/catch : doc généré, bloc sans mdp + note |
| Formateur avec temp_password | `trainer.temp_password` présent | bloc lit `temp_password` directement (aucun appel de reset) ; email + mdp + QR | — |
| Compte legacy sans temp_password | `profile_id` présent, `temp_password` null | pas de reset ; bloc = URL + email + QR + note « mot de passe via Mot de passe oublié » | — |
| Batch multi-formateurs | session, N formateurs | 1 PDF/formateur, chacun avec le bloc du **bon** formateur (credentials + QR propres) | fail-soft par formateur |
| Doc non-convention | tout autre doc_type | inchangé (aucune variable formateur rendue) | — |

</frozen-after-approval>

## Code Map

- `supabase/migrations/add_trainer_temp_password.sql` -- **créer** : `ALTER TABLE trainers ADD COLUMN IF NOT EXISTS temp_password TEXT` (miroir `learners.temp_password`). Idempotent
- `src/lib/services/trainer-account.ts` -- **persister** `trainers.temp_password` dans `ensureTrainerAccount` (status `created`) ET `resetTrainerPassword` (garde le mdp affichable synchro avec l'auth)
- `src/lib/utils/resolve-variables.ts` -- `ResolveContext` += `trainerCredentials?: { email: string; password: string }` ; nouvelles variables `{{email_formateur_connexion}}`, `{{mot_de_passe_formateur}}`, `{{qr_code_connexion_formateur}}` (ce dernier lit le `loginQrCodeDataUrl` générique existant) + alias `[%...%]` ; réutiliser `{{url_connexion}}`
- `src/lib/templates/convention-intervention.ts` -- ajouter le bloc « Accès à votre espace formateur » (miroir de `convocation-apprenant.ts` L172-196, email au lieu d'identifiant)
- `src/lib/templates/contrat-sous-traitance.ts` -- idem
- `src/app/api/documents/generate-convention-intervention/route.ts` -- instancier `createServiceClient()` ; remplir `ctx.trainerCredentials` + `ctx.loginQrCodeDataUrl` (via `generateLoginQrDataUrl(entity.slug)`) avant `resolveDocumentVariables`
- `src/app/api/documents/generate-conventions-intervention-batch/route.ts` -- idem, **par formateur** dans la boucle
- `src/app/api/documents/generate-contrat-sous-traitance/route.ts` -- idem
- `src/lib/templates/__tests__/snapshots.test.ts` (+ `.snap`) -- fixture `FIXED_TRAINER_CREDENTIALS` + brancher `trainerCredentials`/QR dans le ctx du test convention-intervention ; ajouter un test+snapshot `contrat-sous-traitance` ; régénérer (`vitest -u`) et revoir

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/add_trainer_temp_password.sql` -- colonne `temp_password TEXT` sur `trainers`, idempotente -- stockage mdp stable
- [x] `src/lib/services/trainer-account.ts` -- écrire `temp_password` sur `trainers` à la création (`ensureTrainerAccount`) et au reset (`resetTrainerPassword`) -- garder le mdp affichable synchro
- [x] `src/lib/utils/resolve-variables.ts` -- `trainerCredentials` dans `ResolveContext` + 3 variables/alias formateur (email, mdp, QR) ; réemploi `{{url_connexion}}` + `loginQrCodeDataUrl`. Résolution défensive (valeurs vides → note « mot de passe oublié » plutôt que placeholder brut)
- [x] `src/lib/templates/convention-intervention.ts` + `contrat-sous-traitance.ts` -- bloc « Accès à votre espace formateur » (email + mdp + QR)
- [x] `src/app/api/documents/generate-convention-intervention/route.ts` + `.../generate-conventions-intervention-batch/route.ts` + `.../generate-contrat-sous-traitance/route.ts` -- service_role + credentials/QR formateur dans le ctx (par formateur en batch), logique idempotente de la matrice I/O
- [x] `src/lib/templates/__tests__/snapshots.test.ts` -- fixture + ctx formateur ; snapshots régénérés et revus (aucune balise `[%...%]` résiduelle)

**Acceptance Criteria:**
- Given un formateur sans compte, when je génère sa convention, then son compte est créé, `trainers.temp_password` est rempli, et le PDF affiche URL + email + ce mot de passe + QR.
- Given un formateur avec `temp_password`, when je régénère sa convention, then le même mot de passe est affiché et son login n'est **pas** réinitialisé.
- Given un batch de N formateurs, when je génère, then chaque PDF porte les accès du bon formateur.
- Given je suis admin C3V, when je génère, then compte/lecture restent isolés par `entity_id`.

## Design Notes

Logique idempotente du mot de passe (route, avant `resolveDocumentVariables`) :
```
if (trainer.temp_password) cred = { email, password: trainer.temp_password };      // stable
else if (!trainer.profile_id) {                                                     // pas de compte
  const r = await ensureTrainerAccount(serviceClient, { trainer, entitySlug });     // crée + persiste
  if (r.status === "created" && r.password) cred = { email: r.email, password: r.password };
}                                                                                    // sinon legacy → email+QR+note
```
Le QR réutilise `loginQrCodeDataUrl` (générique `/login?entity=slug`, sans pré-remplissage) — le formateur se connecte par email. `{{qr_code_connexion_formateur}}` et `{{qr_code_connexion}}` lisent le même champ (pas de collision : une convention n'a pas de QR apprenant).

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur
- `npx vitest run` -- expected: vert (snapshots convention régénérés et revus : bloc présent, valeurs fixes, pas de `[%...%]`)

**Manual checks:**
- Migration jouée. Générer une convention-intervention **et** un contrat-sous-traitance : bloc « Accès à votre espace formateur » avec email + mdp + QR ; scanner le QR → `/login`. Régénérer → même mdp (pas de reset). Batch multi-formateurs → bon accès par PDF. Compte C3V (entity strict).

## Suggested Review Order

**Persistance du mot de passe (schéma + service)** — l'entrée principale

- Logique idempotente : credentials affichés SEULEMENT pour un email réel, jamais de reset en génération (patch revue).
  [`trainer-account.ts:191`](../../src/lib/services/trainer-account.ts#L191)
- Colonne miroir de `learners.temp_password`, idempotente.
  [`add_trainer_temp_password.sql:20`](../../supabase/migrations/add_trainer_temp_password.sql#L20)
- Persistance du mdp à la création (L122) + au reset avec capture d'erreur (L159).
  [`trainer-account.ts:159`](../../src/lib/services/trainer-account.ts#L159)

**Variables & rendu du bloc**

- `ResolveContext.trainerCredentials` + 3 variables (email guardé synthétique, mdp, QR réutilisé).
  [`resolve-variables.ts:945`](../../src/lib/utils/resolve-variables.ts#L945)
- Bloc HTML « Accès à votre espace formateur » (Email, pas Identifiant), miroir apprenant.
  [`convention-intervention.ts:145`](../../src/lib/templates/convention-intervention.ts#L145)
- Idem pour le contrat de sous-traitance.
  [`contrat-sous-traitance.ts:211`](../../src/lib/templates/contrat-sous-traitance.ts#L211)

**Câblage des routes (service_role + credentials par formateur)**

- Batch : résolution PAR formateur dans la boucle.
  [`generate-conventions-intervention-batch/route.ts:169`](../../src/app/api/documents/generate-conventions-intervention-batch/route.ts#L169)
- Single convention-intervention (L138), single contrat (L114), envoi email batch — 4e route nécessaire (L144).
  [`send-conventions-intervention-batch-email/route.ts:144`](../../src/app/api/documents/send-conventions-intervention-batch-email/route.ts#L144)

**Tests (périphérique)**

- Fixtures + snapshots formateur, régression « aucune balise `[%...%]` résiduelle ».
  [`snapshots.test.ts:200`](../../src/lib/templates/__tests__/snapshots.test.ts#L200)
