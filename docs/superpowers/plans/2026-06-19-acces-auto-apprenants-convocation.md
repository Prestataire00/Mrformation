# Accès apprenants automatiques + identifiants sur la convocation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À l'ajout d'un apprenant à une session, créer automatiquement son accès plateforme ; et faire afficher sur la convocation l'identifiant (username), le mot de passe et le QR au lieu des placeholders.

**Architecture:** On réutilise l'existant. (1) `ResumeLearners` appelle la route testée `/api/admin/create-access` après chaque inscription (idempotent : 409 = déjà fait = OK ; gère l'email synthétique ; persiste username + temp_password). (2) La convocation a déjà la variable `{{identifiant_apprenant}}` (= `learners.username`) et `{{mot_de_passe_apprenant}}` (= `learnerCredentials.tempPassword`, peuplé par `ensureLearnerAccount` au moment de la génération) ; il manque juste l'alias `[%Identifiant apprenant%]`, le branchement de la ligne « Identifiant » du template, et le pré-remplissage du QR.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Supabase (service_role), Vitest.

**Référence spec:** `docs/superpowers/specs/2026-06-19-acces-auto-apprenants-convocation-design.md`

**Faits vérifiés (prod / code) :**
- `documents.doc_type` des convocations = `"convocation"` → la condition `payload.doc_type === "convocation"` de `generate-from-template` matche déjà.
- Chemin de génération prod (`systemTemplate`, `generate-from-template/route.ts:308+`) : `learnerData = ...from("learners").select("*")...` (ligne 313) → inclut déjà `username` ET `temp_password`. Donc `data.learner.username` est disponible pour `{{identifiant_apprenant}}`.
- `/api/admin/create-access` gère l'email synthétique (apprenants sans email), persiste `temp_password` + `password_must_change`, renvoie 409 si le compte existe déjà.
- Le résolveur définit déjà `{{identifiant_apprenant}}` (`resolve-variables.ts:282`) = `learner.username` (fallback email). Il **manque l'alias** `[%Identifiant apprenant%]`.

---

## File Structure

**Modifier :**
- `src/lib/utils/resolve-variables.ts` — ajouter l'alias `"Identifiant apprenant"`.
- `src/lib/templates/convocation-apprenant.ts` — ligne « Identifiant » → `[%Identifiant apprenant%]`.
- `src/app/api/documents/generate-from-template/route.ts` — QR pré-rempli avec le username.
- `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeLearners.tsx` — appel auto à `/api/admin/create-access` après inscription.

**Test :**
- `src/lib/utils/__tests__/resolve-variables-identifiant.test.ts` (créé).

Aucune migration SQL.

---

## Task 1: Alias `[%Identifiant apprenant%]` dans le résolveur

**Files:**
- Modify: `src/lib/utils/resolve-variables.ts`
- Test: `src/lib/utils/__tests__/resolve-variables-identifiant.test.ts`

- [ ] **Step 1: Écrire le test (échoue car alias manquant)**

Create `src/lib/utils/__tests__/resolve-variables-identifiant.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveDocumentVariables, type ResolveContext } from "@/lib/utils/resolve-variables";

const baseCtx = (overrides: Partial<ResolveContext>): ResolveContext =>
  ({ learner: { username: "jdupont", email: "j@ex.com" }, ...overrides } as unknown as ResolveContext);

describe("résolution [%Identifiant apprenant%]", () => {
  it("remplace [%Identifiant apprenant%] par le username de l'apprenant", () => {
    const html = "Identifiant : [%Identifiant apprenant%]";
    const out = resolveDocumentVariables(html, baseCtx({}));
    expect(out).toContain("jdupont");
    expect(out).not.toContain("[%Identifiant apprenant%]");
  });

  it("fallback sur l'email si pas de username", () => {
    const html = "Identifiant : [%Identifiant apprenant%]";
    const out = resolveDocumentVariables(html, baseCtx({ learner: { email: "fallback@ex.com" } as never }));
    expect(out).toContain("fallback@ex.com");
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npx vitest run src/lib/utils/__tests__/resolve-variables-identifiant.test.ts`
Expected: FAIL — la sortie contient encore `[%Identifiant apprenant%]` (alias non mappé, donc non remplacé).

- [ ] **Step 3: Ajouter l'alias**

Dans `src/lib/utils/resolve-variables.ts`, dans l'objet `ALIAS_TO_VARIABLE_KEY` (vers la ligne 1521, à côté de `"Email de l'apprenant": "{{email_apprenant}}",`), ajouter :

```ts
  "Identifiant apprenant": "{{identifiant_apprenant}}",
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `npx vitest run src/lib/utils/__tests__/resolve-variables-identifiant.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/resolve-variables.ts src/lib/utils/__tests__/resolve-variables-identifiant.test.ts
git commit -m "feat(convocation): alias [%Identifiant apprenant%] (= username)"
```

---

## Task 2: Convocation — ligne « Identifiant » = username

**Files:**
- Modify: `src/lib/templates/convocation-apprenant.ts`

- [ ] **Step 1: Remplacer l'email par l'identifiant sur la ligne Identifiant**

Dans `src/lib/templates/convocation-apprenant.ts`, repérer (vers la ligne 182-183) :

```html
            <td style="padding: 1px 6px; font-weight: 700;">Identifiant :</td>
            <td style="padding: 1px 6px;">[%Email de l'apprenant%]</td>
```

Remplacer la 2ᵉ ligne par :

```html
            <td style="padding: 1px 6px;">[%Identifiant apprenant%]</td>
```

(Le mot de passe `[%Mot de passe apprenant%]` et le QR `[%QR code connexion%]` restent inchangés.)

- [ ] **Step 2: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "convocation-apprenant" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/templates/convocation-apprenant.ts
git commit -m "feat(convocation): identifiant = username au lieu de l'email"
```

---

## Task 3: Convocation — mot de passe persisté + QR pré-rempli

**Files:**
- Modify: `src/app/api/documents/generate-from-template/route.ts`

- [ ] **Step 0: Alimenter `learnerCredentials` depuis le mot de passe PERSISTÉ (garde-fou anti-placeholder)**

Repérer le bloc credentials (vers les lignes 383-389) :

```ts
        let learnerCredentials: { email: string; tempPassword: string } | null = null;
        if (payload.doc_type === "convocation" && learnerData?.id) {
          try {
            learnerCredentials = await ensureLearnerAccount(serviceClient, learnerData.id);
          } catch (err) {
            console.warn("[generate-from-template] ensureLearnerAccount failed:", err);
          }
        }
```

Le remplacer par (utilise d'abord `username`/`temp_password` déjà persistés — cas créé à l'ajout, y compris email synthétique ; sinon crée le compte via `ensureLearnerAccount` pour les apprenants à email réel sans compte) :

```ts
        let learnerCredentials: { email: string; tempPassword: string } | null = null;
        if (payload.doc_type === "convocation" && learnerData?.id) {
          const persisted = learnerData as unknown as { email?: string | null; temp_password?: string | null; profile_id?: string | null };
          if (persisted.profile_id && persisted.temp_password) {
            // Compte déjà créé (à l'ajout de l'apprenant) → on lit le mot de passe persisté.
            learnerCredentials = { email: persisted.email ?? "", tempPassword: persisted.temp_password };
          } else {
            // Garde-fou : pas encore de compte (données anciennes) → création à la volée.
            try {
              learnerCredentials = await ensureLearnerAccount(serviceClient, learnerData.id);
            } catch (err) {
              console.warn("[generate-from-template] ensureLearnerAccount failed:", err);
            }
          }
        }
```

- [ ] **Step 1: Pré-remplir le QR avec le username de l'apprenant**

Dans `src/app/api/documents/generate-from-template/route.ts`, repérer le bloc QR (vers les lignes 522-525) :

```ts
        let loginQrCodeDataUrl: string | undefined;
        if (payload.doc_type === "convocation") {
          const qr = await generateLoginQrDataUrl();
          if (qr) loginQrCodeDataUrl = qr;
        }
```

Le remplacer par (QR qui pré-remplit l'identifiant ; `learnerData` = `select("*")` ligne 313, contient `username` ; `entity` est l'entité déjà chargée pour le contexte) :

```ts
        let loginQrCodeDataUrl: string | undefined;
        if (payload.doc_type === "convocation") {
          const username = (learnerData as unknown as { username?: string } | null)?.username;
          if (username) {
            loginQrCodeDataUrl = await buildLoginQrCodeDataUrl(username, entity?.slug);
          } else {
            const qr = await generateLoginQrDataUrl();
            if (qr) loginQrCodeDataUrl = qr;
          }
        }
```

- [ ] **Step 2: Ajouter l'import de `buildLoginQrCodeDataUrl`**

En tête du fichier, à côté de `import { generateLoginQrDataUrl } from "@/lib/services/login-qr-code";` (ligne 24), ajouter :

```ts
import { buildLoginQrCodeDataUrl } from "@/lib/services/credentials-qr";
```

- [ ] **Step 3: Vérifier que `entity` est disponible dans cette portée**

Run: `grep -nE "const entity|loadEntitySettings|entity\\.slug|entity\\?" "src/app/api/documents/generate-from-template/route.ts" | head`
Expected: une variable `entity` (objet entité avec `slug`) est construite avant le bloc QR. Si le nom diffère (ex. `entityData`), utiliser ce nom dans l'appel `buildLoginQrCodeDataUrl(username, <entity>.slug)`. Si aucune entité n'est en portée, passer `undefined` comme 2ᵉ argument : `buildLoginQrCodeDataUrl(username)`.

- [ ] **Step 4: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "generate-from-template" || echo "OK"`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/documents/generate-from-template/route.ts"
git commit -m "feat(convocation): QR de connexion pré-rempli avec l'identifiant"
```

---

## Task 4: Création auto des accès à l'ajout d'un apprenant

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeLearners.tsx`

- [ ] **Step 1: Ajouter un helper d'ensure-access (idempotent) dans le composant**

Lire d'abord les handlers `handleAdd` (vers ligne 105) et `handleCreateLearner` (vers ligne 155) pour repérer, dans chacun, l'endroit APRÈS le succès de l'inscription et AVANT le refetch/toast de succès. Repérer aussi la variable de l'id apprenant : mode A = `selectedLearnerId` ; mode B = `result.learner.id` (retour de `createLearnerAndEnroll`).

Ajouter, dans le composant (au-dessus de `handleAdd`), ce helper :

```ts
  // Crée automatiquement l'accès plateforme de l'apprenant (idempotent).
  // 409 = compte déjà existant → considéré comme un succès. Non bloquant :
  // l'inscription reste acquise même si la création d'accès échoue.
  async function ensureLearnerAccess(learnerId: string): Promise<void> {
    try {
      const res = await fetch("/api/admin/create-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "learner", entity_type: "learner", entity_type_id: learnerId }),
      });
      if (!res.ok && res.status !== 409) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: "Accès non créé",
          description: data.error || "L'apprenant est inscrit, mais son accès n'a pas pu être créé automatiquement.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Accès non créé",
        description: "L'apprenant est inscrit, mais son accès n'a pas pu être créé automatiquement.",
        variant: "destructive",
      });
    }
  }
```

- [ ] **Step 2: Appeler le helper dans `handleAdd` (mode apprenant existant)**

Dans `handleAdd`, juste après le succès de `enrollLearner(...)` (et avant/à la place de l'ancien `pingOnEnrollment`/refetch), ajouter :

```ts
      await ensureLearnerAccess(selectedLearnerId);
```

(Conserver l'appel `pingOnEnrollment` et le refetch existants ; insérer cette ligne avant eux.)

- [ ] **Step 3: Appeler le helper dans `handleCreateLearner` (mode nouvel apprenant)**

Dans `handleCreateLearner`, juste après le succès de `createLearnerAndEnroll(...)` (la variable de résultat expose l'apprenant créé — utiliser son id, ex. `result.learner.id`), ajouter :

```ts
      await ensureLearnerAccess(result.learner.id);
```

(Adapter `result.learner.id` au nom réel renvoyé par `createLearnerAndEnroll` — vérifier la signature dans `src/lib/services/enrollments.ts`. Conserver `pingOnEnrollment` + refetch existants.)

- [ ] **Step 4: Vérifier le typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "ResumeLearners" || echo "OK"`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeLearners.tsx"
git commit -m "feat(formation): créer l'accès apprenant automatiquement à l'ajout"
```

---

## Task 5: Vérification finale

**Files:** aucun

- [ ] **Step 1: Suite de tests complète**

Run: `npx vitest run`
Expected: tous verts, dont `resolve-variables-identifiant.test.ts`.

- [ ] **Step 2: Typecheck global**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `0`.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/acces-auto-apprenants-convocation
gh pr create --base main --title "feat: accès apprenants auto à l'ajout + identifiants sur la convocation" --body "Voir docs/superpowers/specs/2026-06-19-acces-auto-apprenants-convocation-design.md. À l'ajout d'un apprenant, création auto de l'accès (idempotent, email synthétique géré). Convocation : identifiant = username, mot de passe et QR pré-remplis. Aucune migration."
```

---

## Notes de vérification manuelle (post-déploiement)

Le projet n'a pas de harness de test pour les routes/UI ; après deploy preview, vérifier :
1. Ajouter un apprenant (existant) à une session → la fiche apprenant doit montrer un compte créé (badge « a un compte » / pas de bouton « créer accès »).
2. Ajouter un nouvel apprenant **sans email** → compte créé avec email synthétique + username.
3. Régénérer la convocation de cet apprenant → la ligne « Identifiant » montre le **username** (pas un placeholder), « Mot de passe » montre le mot de passe réel, le QR pré-remplit l'identifiant.
4. Apprenant déjà doté d'un compte → ré-ajout/relance ne casse rien (409 silencieux).
