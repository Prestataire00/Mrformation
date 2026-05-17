# Design : Remplacer magic link convocation par URL + identifiants

**Date** : 2026-05-17
**Auteur** : Wissam + Claude (post-mortem 2 PRs magic link infructueuses)
**Statut** : approved
**Story** : Donner aux apprenants un accès à leur espace via URL + email + mot de passe dans la convocation, en remplacement du magic link qui ne fonctionne pas en prod.

## Contexte / Historique

2 PRs (#124 route handler, #125 page client implicit flow) ont tenté d'auto-loginer l'apprenant via un magic link Supabase à la réception de la convocation. Les 2 ont échoué en prod (callback flow Supabase imprévisible vs config projet).

**Décision** : abandonner le magic link convocation et bascule sur un flow d'auth standard — envoyer URL + email + mot de passe temporaire directement dans le PDF de convocation. L'apprenant se connecte normalement via la page de login.

**Bénéfices** :
- Plus de surface d'attaque magic link Supabase (URLs cryptiques avec tokens, flows expérimentaux)
- UX prévisible : l'apprenant sait toujours comment se reconnecter (URL + credentials)
- Moins de code à maintenir (-2 pages, -1 helper, -1 table column si on drop `learner_access_tokens.purpose='access'`)
- Pas de dépendance au flow PKCE vs implicit Supabase

## Comportement attendu

1. Admin crée un nouvel apprenant (form, import, API)
2. Backend auto-crée un compte Supabase auth pour cet apprenant + génère un mot de passe temporaire
3. `learners.profile_id` est rempli, `learners.temp_password` stocke le password en clair (pour réutilisation cohérente dans toutes les futures convocations)
4. Admin génère une convocation pour cet apprenant (PDF)
5. Le PDF affiche dans un bloc dédié :
   - URL de connexion (`https://mrformationcrm.netlify.app/login`)
   - Email de l'apprenant
   - Mot de passe temporaire (en clair)
6. Apprenant reçoit le PDF par email, se connecte → arrive sur `/learner`
7. (Optionnel) Apprenant change son mot de passe via "Mot de passe oublié" — `temp_password` reste l'ancien, mais une note dans le template précise "Si vous avez modifié votre mot de passe, utilisez le nouveau"

### Cas apprenant existant sans `profile_id`

Quand un admin génère une convocation pour un apprenant existant qui n'a pas de compte Supabase (cas des apprenants créés avant ce fix) :
- Backend appelle `ensureLearnerAccount` qui crée le compte + génère password à la volée
- Le PDF contient les credentials générés
- Idempotent : appels suivants retournent le même password (pour cohérence cross-convocations)

## Architecture

### Composant 1 — Migration SQL

Fichier : `supabase/migrations/add_learner_temp_password.sql` (nouveau)

```sql
-- Stocke le mot de passe temporaire en clair pour permettre l'inclusion
-- dans les convocations (sinon impossible de l'afficher car Supabase auth
-- ne le stocke qu'en hash bcrypt). Idempotent : généré 1 fois à la
-- création du compte apprenant, réutilisé dans toutes les convocations
-- futures pour cohérence (pas de password différent par convocation).
--
-- ⚠ RGPD : password en clair en DB = sub-optimal. Documenté comme dette
-- technique. Future rotation à prévoir (story dédiée).

ALTER TABLE learners ADD COLUMN IF NOT EXISTS temp_password TEXT;

-- Pas d'index nécessaire (champ jamais utilisé en filtre/jointure)
-- Pas de contrainte (peut être NULL pour apprenants sans compte)
```

### Composant 2 — Helper `ensureLearnerAccount`

Fichier : `src/lib/services/learner-account.ts` (nouveau)

Responsabilité : idempotent, crée ou récupère les credentials d'un apprenant.

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";

/**
 * Génère un mot de passe temporaire 12 chars alphanumeric, sans caractères
 * ambigus (pas de O/0/I/l) pour faciliter le copier-coller depuis le PDF.
 */
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length: 12 }, () => chars[crypto.randomInt(0, chars.length)]).join("");
}

export type LearnerCredentials = {
  email: string;
  tempPassword: string;
};

/**
 * Crée ou récupère le compte Supabase d'un apprenant + son mot de passe.
 * Idempotent : si déjà créé, retourne le password existant pour cohérence
 * entre toutes les convocations futures du même apprenant.
 *
 * Requis : supabase doit être un service role client (pour auth.admin.*).
 *
 * Retourne null si l'apprenant n'a pas d'email (cas edge, skip silencieux).
 */
export async function ensureLearnerAccount(
  supabase: SupabaseClient,
  learnerId: string,
): Promise<LearnerCredentials | null> {
  const { data: learner } = await supabase
    .from("learners")
    .select("id, email, first_name, last_name, profile_id, temp_password, entity_id")
    .eq("id", learnerId)
    .single();

  if (!learner?.email) return null;

  // Idempotent : si tout est déjà setup → réutiliser
  if (learner.profile_id && learner.temp_password) {
    return { email: learner.email, tempPassword: learner.temp_password };
  }

  const password = generateTempPassword();
  let authUserId = learner.profile_id;

  if (!authUserId) {
    // Cas 1 : apprenant sans profile_id. Check si un auth user existe déjà avec cet email
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === learner.email.toLowerCase(),
    );

    if (existingUser) {
      authUserId = existingUser.id;
      // Update le password de l'auth user existant
      await supabase.auth.admin.updateUserById(authUserId, { password });
    } else {
      // Créer un nouveau auth user avec le password
      const { data: newUser, error } = await supabase.auth.admin.createUser({
        email: learner.email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: learner.first_name,
          last_name: learner.last_name,
          role: "learner",
        },
      });
      if (error || !newUser.user) {
        console.error("[learner-account] createUser failed:", error);
        return null;
      }
      authUserId = newUser.user.id;
    }

    // Upsert le profile (le trigger Supabase peut déjà l'avoir créé via createUser)
    await supabase.from("profiles").upsert({
      id: authUserId,
      first_name: learner.first_name,
      last_name: learner.last_name,
      role: "learner",
      entity_id: learner.entity_id,
    });
  } else {
    // Cas 2 : profile_id existant mais pas de temp_password (apprenant créé avant ce fix)
    // → juste regénérer un password et l'updater côté Supabase
    await supabase.auth.admin.updateUserById(authUserId, { password });
  }

  // Persiste profile_id + temp_password en clair sur learners
  await supabase
    .from("learners")
    .update({ profile_id: authUserId, temp_password: password })
    .eq("id", learnerId);

  return { email: learner.email, tempPassword: password };
}
```

### Composant 3 — Hook création apprenant

Fichier : `src/app/api/learners/route.ts` (modification POST)

Après l'INSERT d'un nouvel apprenant, appeler `ensureLearnerAccount(supabase, newLearnerId)`. Si erreur, log mais ne pas faire échouer la création (degraded mode acceptable).

```typescript
// Après le supabase.from("learners").insert(...).select().single()
import { ensureLearnerAccount } from "@/lib/services/learner-account";

// ...
const { data: newLearner } = await supabase.from("learners").insert(...).select().single();

if (newLearner?.id) {
  try {
    await ensureLearnerAccount(serviceClient, newLearner.id);
  } catch (err) {
    console.error("[learners POST] ensureLearnerAccount failed:", err);
    // Continue : l'apprenant est créé même si le compte auth échoue.
    // La 1ère convocation re-tentera (idempotent).
  }
}
```

**Note** : `ensureLearnerAccount` a besoin d'un **service role client** (pour `auth.admin.*`). Le pattern `createServiceClient()` existe inline dans plusieurs fichiers (ex: `src/lib/services/batch-email-handler.ts:25-32`, `src/app/api/emargement/sign/route.ts:7-14`). Pour ce fix, on **réutilise le même pattern inline** dans les call sites (création apprenant + génération convocation) — pas de helper partagé créé (cohérent avec le pattern actuel du projet, plus simple à comprendre).

### Composant 4 — Hook génération convocation

Fichier : `src/app/api/documents/generate-from-template/route.ts` (modification)

Dans la branche `payload.doc_type === "convocation"`, appeler `ensureLearnerAccount` avant de construire le `ResolveContext`. Injecter les credentials dans le context pour que le resolver puisse les exposer aux variables `[%URL de connexion%]`, `[%Mot de passe apprenant%]`.

```typescript
// Avant ligne ~320 où getOrCreateConvocationMagicLink est actuellement appelé
import { ensureLearnerAccount } from "@/lib/services/learner-account";

let learnerCredentials: { email: string; tempPassword: string } | null = null;
if (payload.doc_type === "convocation" && learnerData?.id) {
  try {
    learnerCredentials = await ensureLearnerAccount(serviceClient, learnerData.id);
  } catch (err) {
    console.error("[generate-from-template] ensureLearnerAccount failed:", err);
  }
}

// Dans le ResolveContext :
const ctx: ResolveContext = {
  // ... existant
  learnerCredentials,
};
```

### Composant 5 — Resolver variables

Fichier : `src/lib/utils/resolve-variables.ts` (modification)

Ajouter dans `ResolveContext` :
```typescript
learnerCredentials?: { email: string; tempPassword: string };
```

Ajouter dans les variables resolved :
```typescript
"{{url_connexion}}": process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/login` : "[URL de connexion]",
"{{mot_de_passe_apprenant}}": data.learnerCredentials?.tempPassword || "[Mot de passe apprenant]",
```

Ajouter dans `ALIAS_TO_VARIABLE_KEY` :
```typescript
"URL de connexion": "{{url_connexion}}",
"Mot de passe apprenant": "{{mot_de_passe_apprenant}}",
```

Ajouter dans `VARIABLE_KEYS` :
```typescript
"{{url_connexion}}",
"{{mot_de_passe_apprenant}}",
```

### Composant 6 — Template convocation

Fichier : `src/lib/templates/convocation-apprenant.ts` (modification)

Remplacer le placeholder `[%QR Code de l'extranet de l'apprenant%]` (qui n'a plus de sens) par un bloc credentials :

```html
<div class="login-credentials" style="border: 2px solid #2563EB; padding: 16px; margin: 20px 0; border-radius: 8px; background: #f0f7ff;">
  <h3 style="margin: 0 0 12px; color: #1e3a8a; font-size: 13pt;">🔐 Accès à votre espace formation</h3>
  <p style="margin: 0 0 12px;">Connectez-vous à votre espace personnel avec vos identifiants :</p>
  <table style="width: 100%; margin: 8px 0; border-collapse: collapse;">
    <tr>
      <td style="padding: 4px 8px; font-weight: 700; width: 30%;">URL :</td>
      <td style="padding: 4px 8px;">[%URL de connexion%]</td>
    </tr>
    <tr>
      <td style="padding: 4px 8px; font-weight: 700;">Email :</td>
      <td style="padding: 4px 8px;">[%Email apprenant%]</td>
    </tr>
    <tr>
      <td style="padding: 4px 8px; font-weight: 700;">Mot de passe :</td>
      <td style="padding: 4px 8px; font-family: monospace; background: #fff; border: 1px dashed #cbd5e1; border-radius: 4px;">[%Mot de passe apprenant%]</td>
    </tr>
  </table>
  <p style="font-size: 9pt; color: #6b7280; margin-top: 12px; margin-bottom: 0;">
    💡 Astuce : vous pouvez modifier votre mot de passe à tout moment depuis la page de connexion via "Mot de passe oublié". Si vous avez déjà modifié votre mot de passe, utilisez le nouveau.
  </p>
</div>
```

### Composant 7 — Cleanup

Drop tout le système magic link convocation (sera fait en dernière task) :

- `src/app/access/[token]/page.tsx` (page magic link consommée par le QR code convocation, plus utilisée)
- `src/app/auth/callback/page.tsx` (page client implicit flow, plus utilisée)
- `src/lib/services/convocation-magic-link.ts` (helper `getOrCreateConvocationMagicLink`)
- Dans `/api/documents/generate-from-template/route.ts` : retirer l'appel à `getOrCreateConvocationMagicLink` + le code de génération du QR data URL (`extranetQrDataUrl`)

À conserver (utilisé par d'autres flows) :
- Table `learner_access_tokens` (utilisée par `purpose='questionnaire'`, `'document'`, `'emargement'`)
- Route `/api/emargement/sign` (autre système, indépendant)
- L'espace `/learner/*` (l'apprenant se connecte normalement via `/login`)

## Tests

### Tests automatisés
**Aucun nouveau test à ajouter**. Mocker `supabase.auth.admin.*` est lourd et apporte peu de valeur vs test manuel. Cohérent avec le reste des flows auth du projet.

### Tests manuels (Wissam post-deploy)

1. **Migration SQL exécutée** : `add_learner_temp_password.sql` runné dans Supabase Dashboard
2. **Création nouvel apprenant** : créer un apprenant test (form admin) → vérifier en DB que `learners.profile_id` ET `learners.temp_password` sont remplis
3. **Génération convocation** : générer la convocation pour ce nouvel apprenant → vérifier que le PDF contient le bloc "🔐 Accès à votre espace formation" avec URL + Email + Mot de passe
4. **Login apprenant** : se déconnecter du compte admin → aller sur `/login` → entrer email + password du PDF → redirige vers `/learner` avec le nom de l'apprenant
5. **Apprenant existant sans compte** : prendre un apprenant créé AVANT ce fix (sans `profile_id`) → générer convocation → vérifier que le compte est créé à la volée + password généré + inclus dans PDF
6. **Idempotence** : régénérer la convocation pour le même apprenant → même password dans le nouveau PDF (cohérence)
7. **Cleanup magic link** : tenter d'accéder à l'ancien URL `/access/{ancien_token}` → 404 (page supprimée). Pareil pour `/auth/callback`.
8. **Régression émargement QR** : générer une feuille d'émargement collective → cliquer le QR code → page d'émargement fonctionne normalement (autre système non impacté)

## Edge cases

- **Email apprenant invalide / vide** : `ensureLearnerAccount` retourne `null` → le template affiche les fallback `[Email apprenant]` / `[Mot de passe apprenant]` → user voit clairement qu'il manque des infos, peut éditer l'apprenant
- **Email apprenant déjà utilisé par un autre Supabase user** : `listUsers()` détecte → réutilise l'auth user existant + update son password (override). Edge case rare mais géré.
- **Création apprenant échoue côté Supabase auth** : log error, n'empêche pas la création apprenant en DB. La 1ère convocation re-tentera (idempotent).
- **Apprenant qui modifie son password via "Mot de passe oublié"** : Supabase update le hash, `learners.temp_password` reste l'ancien. UX : note explicite dans le template "Si vous avez modifié votre mot de passe, utilisez le nouveau". Acceptable.
- **`NEXT_PUBLIC_APP_URL` non défini** : variable resolver retourne fallback `[URL de connexion]`. L'admin doit configurer cette env var (probablement déjà fait pour les autres usages PDF).

## Hors scope

- **Migration batch des apprenants existants** : pas de script de migration upfront. Les apprenants existants sans `profile_id` voient leur compte créé lazy à leur prochaine convocation. Plus safe (pas de génération de comptes inutiles pour des apprenants jamais re-convoqués).
- **Rotation automatique du `temp_password`** : pour MVP, le password reste valide indéfiniment (jusqu'à reset par l'apprenant via "mot de passe oublié"). Future story dédiée si Loris demande.
- **RGPD compliance audit complet** sur le stockage password en clair : documenté comme dette technique. À évaluer dans une story sécurité dédiée plus tard.
- **UI pour l'admin de voir/regénérer le password** : pas dans le scope MVP. L'admin peut juste régénérer la convocation pour avoir le password sous les yeux.
- **Email de bienvenue séparé** : pas d'envoi automatique d'un email "Bienvenue, voici vos identifiants" à la création de l'apprenant. Les credentials arrivent dans la convocation (suffit).

## Risques

- **Stockage password en clair en DB** : risque RGPD limité (DB Supabase chiffrée at rest), mais accès admin DB voit le password. Mitigation : documenté en commentaire de la migration, future rotation à prévoir.
- **`auth.admin.listUsers()` peut être lent sur gros volumes** : OK pour MVP (< 100 apprenants), à optimiser si on monte à plusieurs milliers (alors utiliser `auth.admin.getUserById(email)` ou similaire).
- **Drop de l'ancien système magic link** : si un email convocation déjà envoyé contient un ancien magic link `/access/{token}`, ce lien ne marchera plus après cleanup. Mitigation : Loris re-génère et renvoie la convocation après le deploy si nécessaire. Acceptable car le magic link était de toute façon cassé en prod.
- **Re-création accidentelle d'un compte** : si un apprenant a déjà un compte avec le même email (créé par lui-même hors flow), `ensureLearnerAccount` override son password. Mitigation : edge case rare (apprenant n'a pas raison de créer compte hors flow), géré explicitement dans la fonction.

## Definition of Done

- [ ] Migration SQL `add_learner_temp_password.sql` créée + exécutée manuellement en prod par Wissam
- [ ] Helper `src/lib/services/learner-account.ts` créé avec `ensureLearnerAccount` + `generateTempPassword`
- [ ] Hook création apprenant `POST /api/learners` : appelle `ensureLearnerAccount` après INSERT
- [ ] Hook génération convocation : `ensureLearnerAccount` appelé pour `doc_type=convocation`, credentials injectés dans ResolveContext
- [ ] Resolver variables : `{{url_connexion}}` + `{{mot_de_passe_apprenant}}` ajoutés (avec alias + VARIABLE_KEYS)
- [ ] Template `convocation-apprenant.ts` : bloc credentials remplace le QR code
- [ ] Cleanup magic link : suppression `/access/[token]`, `/auth/callback`, `convocation-magic-link.ts`, code QR dans la route
- [ ] Typecheck `npx tsc --noEmit` clean
- [ ] Suite Vitest 395+ tests passent
- [ ] PR créée + mergée
- [ ] Wissam : test manuel post-deploy des 8 cas du test plan
