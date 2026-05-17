# Design : Fix magic link convocation (callback Supabase SSR manquant)

**Date** : 2026-05-17
**Auteur** : Wissam + Claude (brainstorming session)
**Statut** : approved
**Story** : Bug — le magic link de convocation redirige vers `/login` au lieu de `/learner`

## Contexte / Problème

Quand un apprenant clique le magic link reçu dans son email de convocation à la formation, il atterrit sur la page `/login` au lieu d'arriver directement dans son espace apprenant `/learner`. Comportement attendu : auto-login transparent.

### Diagnostic (audit du code)

Le flow actuel :
1. User clic magic link → `/access/{token}` (route publique, OK)
2. La page valide le token, crée l'auth user Supabase + profile si nécessaire (OK)
3. La page appelle `supabase.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: "${APP_URL}/learner" } })`
4. Redirige vers l'URL Supabase verify
5. Supabase vérifie l'OTP côté `supabase.co`, génère un code OAuth, redirige vers `${APP_URL}/learner?code=XXX`
6. **L'app n'a AUCUN handler** pour `code` : `/learner` est juste la page React du dashboard, elle ne traite pas le query param
7. Le middleware vérifie la session côté app — **inexistante** car la session a été créée côté `supabase.co`, pas côté app
8. Middleware redirige (vers `/login` ou `/`) → user voit la page de connexion

**Root cause** : il manque la route callback Supabase qui appelle `exchangeCodeForSession(code)` pour échanger le code OAuth contre une session cookie côté app. C'est le pattern standard `@supabase/ssr` pour Next.js mais il n'a jamais été implémenté.

Vérifié par grep : `exchangeCodeForSession` n'est utilisé **nulle part** dans le projet. Aucune route `/api/auth/callback` ni `/auth/confirm` n'existe.

## Comportement attendu après fix

Flow corrigé :
1. User clic magic link → `/access/{token}` (inchangé)
2. Page valide token, crée auth user + profile (inchangé)
3. `generateLink` avec `redirectTo: "${APP_URL}/api/auth/callback?next=/learner"` (changé)
4. Redirige vers Supabase verify
5. Supabase vérifie OTP, redirige vers `${APP_URL}/api/auth/callback?code=XXX&next=/learner`
6. Notre nouveau handler appelle `exchangeCodeForSession(code)` → pose les cookies SSR sur le domaine app
7. Redirige vers `/learner`
8. Middleware voit la session active → autorise l'accès
9. L'apprenant arrive sur son espace, connecté

## Architecture du fix

### Composant 1 — Route callback Supabase SSR

Fichier : `src/app/api/auth/callback/route.ts` (nouveau)

Handler GET qui :
- Récupère `code` et `next` depuis les query params
- Valide que `next` est un path interne (anti open-redirect)
- Appelle `supabase.auth.exchangeCodeForSession(code)` (le client SSR pose automatiquement les cookies via `cookies()` Next.js)
- Si succès : redirige vers `next` (par défaut `/learner`)
- Si erreur : redirige vers `/login?error=auth_callback_failed`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/learner";

  // Sécurité : "next" doit être un path interne (anti open-redirect)
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/learner";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchange failed:", error.message);
    return NextResponse.redirect(
      new URL("/login?error=auth_callback_failed", origin),
    );
  }

  return NextResponse.redirect(new URL(safeNext, origin));
}
```

### Composant 2 — Modification `/access/[token]/page.tsx`

Fichier : `src/app/access/[token]/page.tsx`

Changer la ligne 176 :
```typescript
options: { redirectTo: `${APP_URL}/learner` },
```
en :
```typescript
options: { redirectTo: `${APP_URL}/api/auth/callback?next=/learner` },
```

Et adapter le fix localhost (lignes 182-186) :
```typescript
if (actionLink.includes("localhost")) {
  actionLink = actionLink.replace(
    /redirect_to=http%3A%2F%2Flocalhost[^&]*/,
    `redirect_to=${encodeURIComponent(`${APP_URL}/api/auth/callback?next=/learner`)}`,
  );
}
```

### Composant 3 — Middleware (vérification, pas de modification)

Le middleware `src/middleware.ts:41` exempte déjà `/api/auth` de l'auth required (publicPaths whitelist). Donc `/api/auth/callback` sera automatiquement public — pas de modification nécessaire.

**Vérification** : confirmer que `publicPaths.some(p => "/api/auth/callback".startsWith(p))` retourne `true`. Avec `/api/auth` dans la liste, c'est OK.

## Tests

### Tests automatisés
**Aucun nouveau test à ajouter**. Mocker le flow Supabase SSR auth est lourd (cookies, exchange, redirect) et apporte peu de valeur vs test manuel. Cohérent avec les autres routes API du projet.

### Tests manuels (Wissam post-deploy)

1. **Hard refresh** prod (`Cmd+Shift+R`)
2. Régénérer une convocation pour un apprenant test (`Test documents` par exemple) — soit via TabConventionDocs > Convocation > Envoyer, soit via QR code généré dans la feuille d'émargement
3. Récupérer le magic link (clic sur QR code, ou cliquer le lien dans l'email reçu)
4. **Le user doit atterrir directement sur `/learner`** avec son nom dans le header, sans passer par `/login`
5. Vérifier que la session est active : refresh page → reste connecté
6. Logout et re-clic magic link → re-login transparent

### Edge cases

- **Code OAuth expiré** (Supabase TTL ~ 5 min entre génération et exchange) : `exchangeCodeForSession` retourne error → redirect `/login?error=auth_callback_failed` (toast frontend si besoin, hors scope MVP)
- **Code déjà utilisé** : même chemin que ci-dessus (Supabase OTP est one-shot)
- **Open redirect via `?next=//evil.com/`** : la validation `startsWith("/") && !startsWith("//")` bloque
- **User déjà connecté** : `exchangeCodeForSession` override la session existante (comportement Supabase standard, OK)
- **`createClient()` du `@/lib/supabase/server`** : à vérifier qu'il pose bien les cookies via `cookies()` Next.js (pattern standard `@supabase/ssr`)
- **Localhost dev** : le fix `redirect_to=http%3A%2F%2Flocalhost...` ligne 182-186 doit aussi pointer vers le callback

## Hors scope

- **Tests automatisés du flow Supabase auth** : nécessite mocking lourd, hors scope MVP. Validation = test manuel post-deploy.
- **UI page `/login` qui affiche le toast d'erreur** `?error=auth_callback_failed` : déjà géré probablement par la page login existante (à vérifier rapidement). Si pas le cas, hors scope (l'utilisateur se logge manuellement).
- **Migration des autres flows magic link** (émargement QR, signature documents) : ces flows utilisent un autre token système (`/api/emargement/sign` etc.) qui n'a pas le même problème (pas de session Supabase à créer, juste validation token + signature one-shot). Pas concerné par ce fix.
- **Refresh token / persistent session** : hors scope, comportement Supabase standard.

## Risques

- **Modification du flow auth en prod** : impact direct user-facing. Mitigation = test manuel rigoureux après deploy.
- **Cookie domain / SameSite** : `@supabase/ssr` gère normalement les cookies correctement. Si bug : ajuster la config dans `createClient()`.
- **`createClient()` `@/lib/supabase/server`** : vérifier qu'il supporte bien le write des cookies (certains clients SSR sont read-only). Si KO, utiliser le pattern client direct dans le callback.
- **Convocations déjà envoyées** : les anciens emails contiennent l'ancien URL (`${APP_URL}/access/{token}`). Comme `/access/[token]` est modifié pour utiliser le nouveau callback, ils marcheront automatiquement après deploy (la page régénère le magic link à chaque visite via `generateLink`).

## Definition of Done

- [ ] `src/app/api/auth/callback/route.ts` créé (~30 lignes)
- [ ] `src/app/access/[token]/page.tsx` : `redirectTo` change vers `/api/auth/callback?next=/learner` (2 endroits : ligne 176 + regex localhost ligne 185)
- [ ] Vérification middleware : `/api/auth/callback` est public (déjà OK via `/api/auth` whitelist)
- [ ] Typecheck `npx tsc --noEmit` clean
- [ ] Suite Vitest 395+ tests passent
- [ ] PR créée + mergée
- [ ] Wissam : test manuel post-deploy avec un apprenant test → atterrissage direct sur `/learner` sans passer par `/login`
