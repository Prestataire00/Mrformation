# Sous-chantier Émargement — Volets B+C + 2 obs résiduelles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clore les Volets B (type safety) + C (robustesse) de TabEmargements + résoudre les 2 observations résiduelles cross-tenant identifiées dans l'audit Volet A.

**Architecture:**
1. Typer 2× `as unknown as` Supabase joins via interfaces locales + `.returns<T>()`.
2. Aligner 3× `onRefresh()` fire-and-forget sur le pattern `await` existant.
3. Gate le panneau debug verbose par `NODE_ENV !== "production"`.
4. Durcir `/api/signatures` POST : exiger bodySignerId + bodySignerType si role admin (refus 400).
5. Appliquer le pattern ownership check (rodé en Volet A) à 2 routes supplémentaires : `/api/emargement/post-session-eval` POST et `/api/emargement/slots` GET.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Vitest (baseline 539 tests), Supabase service_role + validation applicative, helper `resolveActiveEntityId` existant.

**Branche cible** : `feat/emargement-volet-bc-securite` (depuis `main` à `f0fb68e`).

**Source spec** : [docs/superpowers/specs/2026-05-26-emargement-volet-bc-securite-design.md](../specs/2026-05-26-emargement-volet-bc-securite-design.md)

---

## File Structure

**Modified** :
- `src/app/api/emargement/live-status/route.ts` — 2 interfaces + `.returns<T[]>()` × 2 (Task 1)
- `src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx` — `await onRefresh()` × 3 (Task 2)
- `src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx` — 1 guard JSX `process.env.NODE_ENV` (Task 3)
- `src/app/api/signatures/route.ts` — durcir admin branch (Task 4)
- `src/app/api/emargement/post-session-eval/route.ts` — ownership check (Task 5)
- `src/app/api/emargement/slots/route.ts` — ownership check sur GET (Task 6)

**Pas touchés** :
- Aucun nouveau test Vitest (modifications défensives/structurelles, baseline 539 maintenu)
- Aucune nouvelle migration SQL
- Aucune nouvelle route API

---

## Task 0: Baseline + branche + grep recap

**Files:** Aucun

- [ ] **Step 1: Vérifier état initial (tests verts, TS clean)**

Run: `git status`
Expected: `On branch main, ...` (les untracked files .claude/skills/* sont pré-existants, OK)

Run: `git log -1 --oneline`
Expected: `499ddf0 docs(spec): Sous-chantier 2 Émargement Volets B+C + 2 obs résiduelles` (ou un commit ultérieur si d'autres docs ont été ajoutés)

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Test Files|Tests "`
Expected: `Tests  539 passed (539)` (48 fichiers)

Run: `npx tsc --noEmit 2>&1 | head -3`
Expected: aucune sortie

- [ ] **Step 2: Créer la branche depuis main**

```bash
git checkout -b feat/emargement-volet-bc-securite
```

Expected: `Switched to a new branch 'feat/emargement-volet-bc-securite'`

- [ ] **Step 3: Grep recap des items à fixer**

Run: `grep -n "as unknown as" src/app/api/emargement/live-status/route.ts`
Expected: 2 lignes (67 et 83)

Run: `grep -nE "^\s+onRefresh\(\);" 'src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx'`
Expected: 3 lignes (88, 128, 149) — sans await

Run: `grep -n "qrSlotTokens.debug && (" 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'`
Expected: 1 ligne (1096)

Run: `grep -n "bodySignerType || \"learner\"" src/app/api/signatures/route.ts`
Expected: 1 ligne (77) — le fallback silencieux à corriger

Run: `grep -n "resolveActiveEntityId" src/app/api/emargement/post-session-eval/route.ts src/app/api/emargement/slots/route.ts`
Expected:
- `slots/route.ts:5` (import existant)
- `slots/route.ts` plusieurs occurrences (utilisé dans POST, à appliquer aussi à GET)
- `post-session-eval/route.ts` : AUCUNE occurrence (à ajouter)

Tous les items sont confirmés en place ; on peut commencer.

---

## Task 1: Livrable 1 — Typer `live-status/route.ts` (Volet B)

**Files:**
- Modify: `src/app/api/emargement/live-status/route.ts:60-91`

- [ ] **Step 1: Lire le contexte actuel**

Run: `sed -n '60,91p' src/app/api/emargement/live-status/route.ts`

Tu dois voir 2 blocs avec `as unknown as` aux lignes 67 et 83.

- [ ] **Step 2: Ajouter 2 interfaces locales en haut du fichier (après l'interface `PersonStatus`)**

Trouver le bloc `interface PersonStatus { ... }` (lignes 29-36). Ajouter juste après (avant `export async function GET`) :

```ts
interface EnrollmentWithLearner {
  learner: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;
}

interface FormationTrainerWithTrainer {
  trainer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;
}
```

- [ ] **Step 3: Typer la query `enrollments` avec `.returns<T[]>()`**

Trouver le bloc :
```ts
  // 2. Apprenants enrolled
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("learner:learners(id, first_name, last_name, email)")
    .eq("session_id", sessionId)
    .neq("status", "cancelled");
```

Le remplacer par :
```ts
  // 2. Apprenants enrolled
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("learner:learners(id, first_name, last_name, email)")
    .eq("session_id", sessionId)
    .neq("status", "cancelled")
    .returns<EnrollmentWithLearner[]>();
```

- [ ] **Step 4: Retirer le cast `as unknown as` sur learners**

Trouver le bloc :
```ts
  const learners: PersonStatus[] = ((enrollments ?? []) as unknown as Array<{ learner: { id: string; first_name: string; last_name: string; email: string | null } | null }>)
    .filter((e) => e.learner)
    .map((e) => ({
      id: e.learner!.id,
      first_name: e.learner!.first_name,
      last_name: e.learner!.last_name,
      email: e.learner!.email,
      signed: false,
    }));
```

Le remplacer par :
```ts
  const learners: PersonStatus[] = (enrollments ?? [])
    .filter((e) => e.learner)
    .map((e) => ({
      id: e.learner!.id,
      first_name: e.learner!.first_name,
      last_name: e.learner!.last_name,
      email: e.learner!.email,
      signed: false,
    }));
```

- [ ] **Step 5: Typer la query `formationTrainers` avec `.returns<T[]>()`**

Trouver :
```ts
  // 3. Formateurs
  const { data: formationTrainers } = await supabase
    .from("formation_trainers")
    .select("trainer:trainers(id, first_name, last_name, email)")
    .eq("session_id", sessionId);
```

Remplacer par :
```ts
  // 3. Formateurs
  const { data: formationTrainers } = await supabase
    .from("formation_trainers")
    .select("trainer:trainers(id, first_name, last_name, email)")
    .eq("session_id", sessionId)
    .returns<FormationTrainerWithTrainer[]>();
```

- [ ] **Step 6: Retirer le cast `as unknown as` sur trainers**

Trouver :
```ts
  const trainers: PersonStatus[] = ((formationTrainers ?? []) as unknown as Array<{ trainer: { id: string; first_name: string; last_name: string; email: string | null } | null }>)
    .filter((ft) => ft.trainer)
    .map((ft) => ({
      id: ft.trainer!.id,
      first_name: ft.trainer!.first_name,
      last_name: ft.trainer!.last_name,
      email: ft.trainer!.email,
      signed: false,
    }));
```

Remplacer par :
```ts
  const trainers: PersonStatus[] = (formationTrainers ?? [])
    .filter((ft) => ft.trainer)
    .map((ft) => ({
      id: ft.trainer!.id,
      first_name: ft.trainer!.first_name,
      last_name: ft.trainer!.last_name,
      email: ft.trainer!.email,
      signed: false,
    }));
```

- [ ] **Step 7: Vérifier 0 `as unknown as` dans le fichier**

Run: `grep -n "as unknown as" src/app/api/emargement/live-status/route.ts`
Expected: aucune sortie

- [ ] **Step 8: Vérifier TypeScript clean**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

- [ ] **Step 9: Vérifier Vitest vert**

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Test Files|Tests "`
Expected: `Tests  539 passed (539)`

- [ ] **Step 10: Commit**

```bash
git add src/app/api/emargement/live-status/route.ts
git commit -m "refactor(emargement): typer live-status/route.ts via .returns<T[]>()

Remplace 2× 'as unknown as' par :
- 2 interfaces locales : EnrollmentWithLearner + FormationTrainerWithTrainer
- Pattern Supabase .returns<T[]>() pour typer le retour directement
- Cast double retiré sur learners (ligne 67) et trainers (ligne 83)

Volet B (type safety). Aligne sur la règle CLAUDE.md 'jamais de any'.
Si la query change à l'avenir, tsc capture l'incompatibilité.

Refs: docs/superpowers/specs/2026-05-26-emargement-volet-bc-securite-design.md § 4.1"
```

---

## Task 2: Livrable 2 — Await `onRefresh()` × 3 (Volet C)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx:88, 128, 149`

- [ ] **Step 1: Lire les 3 sites fire-and-forget**

Run: `grep -nB2 "^\s\s\s\s\s\sonRefresh();" 'src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx'`

Tu dois voir 3 contextes : handleAdd (~88), handleAutoDetect (~128), handleUpdateStatus (~149).

- [ ] **Step 2: Modifier `handleAdd` (ligne 88)**

Trouver le bloc dans `handleAdd` :
```ts
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Absence ajoutée" });
      resetForm();
      setShowAdd(false);
      onRefresh();
    }
```

Le remplacer par :
```ts
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Absence ajoutée" });
      resetForm();
      setShowAdd(false);
      await onRefresh();
    }
```

- [ ] **Step 3: Modifier `handleAutoDetect` (ligne 128)**

Trouver le bloc dans `handleAutoDetect` :
```ts
      toast({
        title: "Détection terminée",
        description: `${data.created} nouvelle${data.created !== 1 ? "s" : ""} absence${data.created !== 1 ? "s" : ""} créée${data.created !== 1 ? "s" : ""}, ${data.skipped} déjà existante${data.skipped !== 1 ? "s" : ""} ignorée${data.skipped !== 1 ? "s" : ""}`,
      });
      onRefresh();
```

Le remplacer par :
```ts
      toast({
        title: "Détection terminée",
        description: `${data.created} nouvelle${data.created !== 1 ? "s" : ""} absence${data.created !== 1 ? "s" : ""} créée${data.created !== 1 ? "s" : ""}, ${data.skipped} déjà existante${data.skipped !== 1 ? "s" : ""} ignorée${data.skipped !== 1 ? "s" : ""}`,
      });
      await onRefresh();
```

- [ ] **Step 4: Modifier `handleUpdateStatus` (ligne 149)**

Trouver le bloc complet `handleUpdateStatus` :
```ts
  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from("formation_absences")
      .update({ status: newStatus })
      .eq("id", id);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      onRefresh();
    }
  };
```

Le remplacer par :
```ts
  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from("formation_absences")
      .update({ status: newStatus })
      .eq("id", id);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      await onRefresh();
    }
  };
```

- [ ] **Step 5: Vérifier 0 `onRefresh()` non-awaité dans TabAbsences**

Run: `grep -nE "^\s+onRefresh\(\);" 'src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx'`
Expected: aucune sortie (tous les `onRefresh()` sont précédés de `await`)

Run: `grep -n "await onRefresh()" 'src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx'`
Expected: 4 lignes (handleDelete:98 préexistant + 3 nouveaux : handleAdd:88, handleAutoDetect:128, handleUpdateStatus:149)

- [ ] **Step 6: Vérifier TypeScript clean + Vitest vert**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Tests "`
Expected: `Tests  539 passed (539)`

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx'
git commit -m "fix(emargement): await 3× onRefresh() dans TabAbsences (Volet C)

Sites fire-and-forget alignés sur le pattern de handleDelete (await).
- handleAdd (ligne 88) : await après insert formation_absences
- handleAutoDetect (ligne 128) : await après /api/sessions/[id]/auto-absences
- handleUpdateStatus (ligne 149) : await après update status

Évite la race condition : la fonction handler termine avant que le
refresh ait fini, l'UI pouvait afficher l'ancien état pendant un instant.

Refs: docs/superpowers/specs/2026-05-26-emargement-volet-bc-securite-design.md § 4.2"
```

---

## Task 3: Livrable 3 — Gate debug panel par NODE_ENV (Volet C)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx:1096`

- [ ] **Step 1: Lire le contexte JSX existant**

Run: `sed -n '1094,1130p' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'`

Tu dois voir le bloc `{qrSlotTokens.debug && (...)}` qui ouvre à la ligne 1096.

- [ ] **Step 2: Ajouter la condition NODE_ENV**

Trouver la ligne :
```tsx
                  {qrSlotTokens.debug && (
```

La remplacer par :
```tsx
                  {process.env.NODE_ENV !== "production" && qrSlotTokens.debug && (
```

**Note** : c'est un changement d'UNE ligne. La condition ajoutée est évaluée à la compile : Next.js inlinera `process.env.NODE_ENV` au build, donc en prod le bloc sera totalement éliminé (dead code elimination).

- [ ] **Step 3: Vérifier la modification**

Run: `grep -n 'process.env.NODE_ENV !== "production" && qrSlotTokens.debug && (' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'`
Expected: 1 ligne (1096)

Run: `grep -nE '^\s+\{qrSlotTokens\.debug && \(' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'`
Expected: aucune sortie (l'ancienne forme a disparu)

- [ ] **Step 4: Vérifier TypeScript clean + Vitest vert**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Tests "`
Expected: `Tests  539 passed (539)`

- [ ] **Step 5: Vérifier l'effet du gate sur un build prod (smoke check optionnel)**

Run: `npm run build 2>&1 | tail -5`
Expected: `✓ Compiled successfully`

(Pour confirmer visuellement plus tard que le panneau est invisible en prod, le smoke check de Task 8 inclut un `npm run start` local.)

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'
git commit -m "fix(emargement): gate debug panel par NODE_ENV !== production (Volet C)

Le panneau debug verbose du Dialog QR codes exposait en prod :
- session_id, profile.entity_id
- comptes SQL (slots, enrollments, trainers)
- erreurs SQL et INSERT (avec messages, codes, hints)
- traces d'itération sur l'INSERT signing_tokens

Désormais gated par process.env.NODE_ENV !== 'production'.
Next.js inline cette condition au build : en prod le bloc est
totalement éliminé du bundle JS client (dead code elimination).

Refs: docs/superpowers/specs/2026-05-26-emargement-volet-bc-securite-design.md § 4.3"
```

---

## Task 4: Livrable 4 — Refuser admin sans bodySignerId + bodySignerType (Volet C)

**Files:**
- Modify: `src/app/api/signatures/route.ts:75-117`

- [ ] **Step 1: Lire le contexte actuel**

Run: `sed -n '66,118p' src/app/api/signatures/route.ts`

Tu dois voir :
- Le bloc `else if (["admin", "super_admin"].includes(role))` (lignes 75-77)
- Le `effectiveSignerId` fallback (lignes 114-117)

- [ ] **Step 2: Remplacer la branche admin pour exiger bodySignerId + bodySignerType**

Trouver le bloc :
```ts
    } else if (["admin", "super_admin"].includes(role)) {
      // Admin can sign on behalf — use signer_type from body
      signerType = bodySignerType || "learner";
    } else {
      return NextResponse.json({ error: "Rôle non autorisé" }, { status: 403 });
    }
```

Le remplacer par :
```ts
    } else if (["admin", "super_admin"].includes(role)) {
      // Admin signe pour quelqu'un d'autre : DOIT fournir bodySignerId + bodySignerType
      // explicitement (pas de fallback silencieux vers admin's userId/'learner' qui
      // créerait des signatures orphelines incohérentes — voir spec § 4.4).
      if (!bodySignerId || !bodySignerType) {
        return NextResponse.json(
          { error: "Pour signer en tant qu'administrateur, signer_id et signer_type sont obligatoires." },
          { status: 400 },
        );
      }
      if (bodySignerType !== "learner" && bodySignerType !== "trainer") {
        return NextResponse.json(
          { error: "signer_type doit être 'learner' ou 'trainer'." },
          { status: 400 },
        );
      }
      signerType = bodySignerType;
    } else {
      return NextResponse.json({ error: "Rôle non autorisé" }, { status: 403 });
    }
```

- [ ] **Step 3: Simplifier `effectiveSignerId`**

Trouver le bloc :
```ts
    // Admin can sign on behalf of a specific person
    const effectiveSignerId = (["admin", "super_admin"].includes(role) && bodySignerId)
      ? bodySignerId
      : userId;
```

Le remplacer par :
```ts
    // bodySignerId est garanti non-null pour les admin (validé plus haut).
    // Pour learner/trainer, on utilise userId (ils signent pour eux-mêmes).
    const effectiveSignerId = ["admin", "super_admin"].includes(role) ? bodySignerId : userId;
```

- [ ] **Step 4: Vérifier TypeScript clean**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

**Note** : `bodySignerId` provient de `await request.json()` donc son type est `unknown` (ou `any` selon parsing). Le ternaire fonctionne car TS infère via la chaîne logique. Si tsc se plaint, c'est probablement un narrowing manquant — escalation possible.

- [ ] **Step 5: Vérifier 0 régression Vitest**

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Tests "`
Expected: `Tests  539 passed (539)`

- [ ] **Step 6: Confirmer compat des 4 call-sites client**

Run: `grep -rn 'fetch("/api/signatures"' src 2>/dev/null`
Expected: 4 lignes :
- `TabEmargements.tsx:336` (handleAdminSign — envoie signer_id + signer_type ✓)
- `TabEmargements.tsx:441` (handleBulkSign — envoie signer_id + signer_type ✓)
- `learner/sessions/[id]/sign/page.tsx:160` (role = learner → server set signerType, pas de body champs requis ✓)
- `trainer/sessions/[id]/sign/page.tsx:202` (role = trainer → idem ✓)

Aucune régression UI possible.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/signatures/route.ts
git commit -m "fix(emargement): /api/signatures POST refuse admin sans bodySignerId+bodySignerType (Volet C)

Avant : si admin POST sans bodySignerType → fallback silencieux à
'learner'. Sans bodySignerId → fallback silencieux à admin's userId.
Résultat : ligne signatures avec signer_type=learner, signer_id=<admin_uuid>
incohérente (orpheline).

Maintenant : refus 400 explicite si admin sans les 2 champs, plus
validation bodySignerType ∈ {learner, trainer} (aligné CHECK constraint
schema). effectiveSignerId simplifié (bodySignerId garanti non-null
après la garde).

Les 4 call-sites client connus envoient déjà les bons champs
(TabEmargements handleAdminSign + handleBulkSign pour admin,
learner/trainer sign pages n'en ont pas besoin). Zéro régression UI.

Refs: docs/superpowers/specs/2026-05-26-emargement-volet-bc-securite-design.md § 4.4"
```

---

## Task 5: Livrable 5 — Ownership check `/api/emargement/post-session-eval` POST (obs A.1)

**Files:**
- Modify: `src/app/api/emargement/post-session-eval/route.ts`

- [ ] **Step 1: Lire le handler POST actuel**

Run: `sed -n '1,35p' src/app/api/emargement/post-session-eval/route.ts`

Tu dois voir l'import block + la fonction `createServiceClient` + le début de `POST`.

- [ ] **Step 2: Ajouter l'import `resolveActiveEntityId`**

Trouver le bloc d'imports en haut :
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
```

Ajouter après le dernier import :
```ts
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
```

- [ ] **Step 3: Ajouter le bloc ownership check après `session_id` validation**

Trouver le bloc :
```ts
    if (!session_id) {
      return NextResponse.json({ error: "session_id requis" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 1. Check if session has an auto_eval_post assignment
```

Le remplacer par :
```ts
    if (!session_id) {
      return NextResponse.json({ error: "session_id requis" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Ownership check : refuser cross-entity (pattern Volet A — résout obs A.1
    // documentée dans docs/audits/2026-05-26-emargement-entity-id-audit.md).
    // Sans ce check, un admin entité A pouvait spam les apprenants d'une
    // session entité B via cette route.
    const { data: sessionCheck, error: sessionCheckError } = await supabase
      .from("sessions")
      .select("entity_id")
      .eq("id", session_id)
      .single();

    if (sessionCheckError || !sessionCheck) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    const activeEntityId = resolveActiveEntityId(auth.profile);
    if (sessionCheck.entity_id !== activeEntityId) {
      return NextResponse.json(
        { error: "Accès non autorisé à cette session" },
        { status: 403 },
      );
    }

    // 1. Check if session has an auto_eval_post assignment
```

- [ ] **Step 4: Vérifier TypeScript clean + Vitest vert**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Tests "`
Expected: `Tests  539 passed (539)`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/emargement/post-session-eval/route.ts
git commit -m "fix(emargement): ownership check /api/emargement/post-session-eval POST (obs A.1)

Avant : la route acceptait un session_id sans vérifier que la session
appartient à l'entité de l'utilisateur. Un admin entité A pouvait
spam les apprenants d'une session entité B via cette route (envoi
d'emails cross-entity, sans écriture DB cross-entity).

Maintenant : pattern ownership check identique aux fixes Volet A
(commits 57c75bf, 47e3457, 24050f9) — query session.entity_id,
compare via resolveActiveEntityId (lit le cookie pour super_admin),
refus 403 si mismatch, 404 si session introuvable.

Résout obs A.1 du doc d'audit Volet A.

Refs: docs/superpowers/specs/2026-05-26-emargement-volet-bc-securite-design.md § 4.5"
```

---

## Task 6: Livrable 6 — Ownership check `/api/emargement/slots` GET (obs A.2)

**Files:**
- Modify: `src/app/api/emargement/slots/route.ts:17-37`

- [ ] **Step 1: Lire le handler GET actuel**

Run: `sed -n '17,40p' src/app/api/emargement/slots/route.ts`

Tu dois voir le début du handler GET, juste après les imports. L'import `resolveActiveEntityId` est déjà présent (ligne 5, ajouté pour le handler POST en Volet A — commit `24050f9`).

- [ ] **Step 2: Ajouter le bloc ownership check après la validation `sessionId`**

Trouver le bloc :
```ts
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id requis" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch time slots for this session
```

Le remplacer par :
```ts
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id requis" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Ownership check : refuser cross-entity (pattern Volet A — résout obs A.2
  // documentée dans docs/audits/2026-05-26-emargement-entity-id-audit.md).
  // Sans ce check, un admin entité A pouvait lire les tokens et learner_ids
  // d'une session entité B (info disclosure cross-entity, lecture seule).
  const { data: sessionCheck, error: sessionCheckError } = await supabase
    .from("sessions")
    .select("entity_id")
    .eq("id", sessionId)
    .single();

  if (sessionCheckError || !sessionCheck) {
    return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
  }

  const activeEntityId = resolveActiveEntityId(auth.profile);
  if (sessionCheck.entity_id !== activeEntityId) {
    return NextResponse.json(
      { error: "Accès non autorisé à cette session" },
      { status: 403 },
    );
  }

  // Fetch time slots for this session
```

- [ ] **Step 3: Vérifier TypeScript clean + Vitest vert**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Tests "`
Expected: `Tests  539 passed (539)`

- [ ] **Step 4: Mettre à jour le doc d'audit (marquer obs A.1 et A.2 comme résolues)**

Run: `grep -n "OBSERVATION" docs/audits/2026-05-26-emargement-entity-id-audit.md`
Note les numéros de ligne des 2 observations.

Modifier `docs/audits/2026-05-26-emargement-entity-id-audit.md` :
- Pour OBSERVATION 1 (`/api/emargement/post-session-eval`) : ajouter en début de section : `**Status : ✅ RÉSOLU le 2026-05-26 dans le Sous-chantier 2 (commit ownership check post-session-eval).**`
- Pour OBSERVATION 2 (`/api/emargement/slots` GET) : ajouter en début de section : `**Status : ✅ RÉSOLU le 2026-05-26 dans le Sous-chantier 2 (commit ownership check slots GET).**`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/emargement/slots/route.ts docs/audits/2026-05-26-emargement-entity-id-audit.md
git commit -m "fix(emargement): ownership check /api/emargement/slots GET (obs A.2)

Avant : le handler GET utilisait createServiceClient() (bypass RLS) et
acceptait un session_id sans vérifier ownership. Un admin entité A
pouvait lire les tokens + learner_ids d'une session entité B (info
disclosure cross-entity, lecture seule).

Maintenant : même pattern que les fixes Volet A (le handler POST a
déjà reçu ce fix en commit 47e3457 — maintenant fait sur GET aussi).
Import resolveActiveEntityId déjà présent.

Doc d'audit mis à jour : obs A.1 et A.2 marquées RÉSOLUES.

Refs: docs/superpowers/specs/2026-05-26-emargement-volet-bc-securite-design.md § 4.6"
```

---

## Task 7: Vérification finale

**Files:** Aucun (vérifications uniquement)

- [ ] **Step 1: Suite Vitest complète verte**

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files  48 passed (48)` / `Tests  539 passed (539)`

- [ ] **Step 2: TypeScript strict clean**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: aucune sortie

- [ ] **Step 3: Next.js build success**

Run: `npm run build 2>&1 | grep -E "Compiled|error|Error" | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Récap des commits du sous-chantier**

Run: `git log --oneline 499ddf0..HEAD`
Expected : 6 commits, un par Task :
```
<sha> fix(emargement): ownership check /api/emargement/slots GET (obs A.2)
<sha> fix(emargement): ownership check /api/emargement/post-session-eval POST (obs A.1)
<sha> fix(emargement): /api/signatures POST refuse admin sans bodySignerId+bodySignerType (Volet C)
<sha> fix(emargement): gate debug panel par NODE_ENV !== production (Volet C)
<sha> fix(emargement): await 3× onRefresh() dans TabAbsences (Volet C)
<sha> refactor(emargement): typer live-status/route.ts via .returns<T[]>()
```

(L'ordre exact dépend de l'ordre d'exécution des Tasks. Le hash de base `499ddf0` peut différer si d'autres commits docs ont été ajoutés à main entre temps — utilise `git log --oneline main..HEAD` à la place dans ce cas.)

- [ ] **Step 5: Grep final de vérification**

Run: `grep -rn "as unknown as" src/app/api/emargement/live-status/route.ts`
Expected: aucune sortie

Run: `grep -nE "^\s+onRefresh\(\);" 'src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx'`
Expected: aucune sortie

Run: `grep -n 'process.env.NODE_ENV !== "production" && qrSlotTokens.debug' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'`
Expected: 1 ligne (1096)

Run: `grep -n "resolveActiveEntityId" src/app/api/emargement/post-session-eval/route.ts`
Expected: 2 lignes (import + usage)

---

## Task 8: STOP — smoke check léger par Wissam (~15 min)

**Files:** Aucun (procédure manuelle)

> ⚠️ **Le subagent S'ARRÊTE ICI.** Le controller (Claude) présente la procédure ci-dessous à Wissam et attend la décision Go/No-go. Task 9 ne se déclenche **qu'après** le Go.

### Checklist de smoke check

**A. Admin sign-on-behalf marche encore**

1. Se connecter en admin
2. Ouvrir une session avec ≥ 1 non-signataire
3. Cliquer sur une icône "Signer pour X" d'un apprenant non-signé
4. ☐ Le Dialog "Sign on behalf" s'ouvre, canvas SignaturePad visible
5. Dessiner + cliquer Confirmer
6. ☐ Toast de succès, signature visible dans la liste

**B. Admin bulk-sign marche encore (Volet A pas régressé)**

1. Toujours sur la même session, ≥ 2 non-signataires sur un slot
2. Cliquer "Marquer les présents en masse"
3. ☐ Dialog 2 étapes : confirm → sign
4. Dessiner sa signature → Confirmer
5. ☐ Toast de succès, toutes les signatures appliquées

**C. Debug panel invisible en prod (build local)**

Run :
```bash
npm run build
npm run start
```

Puis dans le navigateur :
1. Aller sur une formation Émargement → cliquer pour ouvrir le Dialog QR codes
2. Sur une session SANS apprenants/formateurs (empty state)
3. ☐ Le bloc debug NE doit PAS apparaître (pas de "session_id : ..." visible)

**D. TabAbsences add absence rafraîchit la liste**

1. Aller sur l'onglet Émargement → section Absences
2. Cliquer "Ajouter une absence"
3. Sélectionner un apprenant + date + raison
4. ☐ Toast "Absence ajoutée"
5. ☐ La liste se rafraîchit IMMÉDIATEMENT (la nouvelle absence apparaît sans avoir à recharger la page)

**E. curl `/api/signatures` POST admin sans bodySignerId → 400**

Cette vérification nécessite l'authentification admin (cookie de session). Le plus simple est de faire un test en dev :

1. Se connecter en admin via le navigateur
2. Récupérer le cookie de session dans DevTools (Application → Cookies → `sb-...-auth-token`)
3. Lancer curl avec ce cookie :
```bash
curl -X POST http://localhost:3000/api/signatures \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-...-auth-token=<value>" \
  -d '{"session_id": "<existing-session-uuid>", "signature_data": "<svg></svg>"}'
```
4. ☐ Réponse 400 avec message "Pour signer en tant qu'administrateur, signer_id et signer_type sont obligatoires."

**Alternative simple** : skip ce test si trop laborieux à setup. Le code review du subagent reviewer + le grep de Task 7 suffisent à valider ce changement.

### Décision

Présenter à Wissam :
- ✅ **Go** : passer à Task 9 (finishing-a-development-branch, merge + push prod)
- ❌ **No-go** : noter le finding, fix, re-tester

---

## Task 9: Après Go — finishing-a-development-branch

**Files:** Aucun (orchestration git)

- [ ] **Step 1: Invoker finishing-a-development-branch**

Annoncer : "I'm using the finishing-a-development-branch skill to complete this work."

Utiliser superpowers:finishing-a-development-branch :
1. Verify tests : `npx vitest run` → 539 passed
2. Determine base : main (depuis `f0fb68e`)
3. Pattern habituel des chantiers précédents : **merge local sur main + push prod**
4. Cleanup branch `feat/emargement-volet-bc-securite`

- [ ] **Step 2: Confirmer le push prod**

Run: `git log --oneline origin/main..HEAD` (après push)
Expected: liste vide (tout est pushé)

Run: `git log --oneline -5`
Expected: les commits du sous-chantier + le merge commit sont en tête de `main`.

---

## Résumé du sous-chantier

| Volet | Livrable | Estimation | Task |
|-------|----------|------------|------|
| **B** | Typer live-status route | 30 min | Task 1 |
| **C** | Await onRefresh × 3 | 15 min | Task 2 |
| **C** | Gate debug panel | 30 min | Task 3 |
| **C** | Refuser admin sans bodySignerId/Type | 1h | Task 4 |
| **Obs A.1** | Ownership check post-session-eval | 1h | Task 5 |
| **Obs A.2** | Ownership check slots GET | 1h | Task 6 |
| **Vérif** | Tests + tsc + build + smoke check | 1h | Task 7 + 8 |
| **Total** | | **~5-6h** | 10 tasks |

**Critères d'acceptance** (cf. spec § 6) : tous validés avant Task 9.

**Risque prod** : faible (pas de migration SQL, pas de changement UI critique, pattern ownership check rodé, refus 400 aligné avec call-sites client).

**Score qualité TabEmargements** : 7/10 → **8/10** (parité TabConventionDocs post-solidification, objectif atteint).
