# Packs d'automatisation — Lot 4 (Timeline formation + réappliquer) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher et piloter le snapshot d'automatisation d'une formation (activer/désactiver des étapes, appliquer/réappliquer/changer de pack) depuis son onglet Automatisation.

**Architecture:** 2 routes API sous `/api/formations/[id]/automation-steps` (le `[id]` = session_id) : GET+PATCH (lecture + toggle `is_enabled`) et `apply-pack` (POST → `instantiatePackForSession`). UI ajoutée dans `TabAutomation.tsx` : barre pack + timeline des `session_automation_steps` avec Switch par étape. Le sélecteur de pack réutilise `GET /api/automation-packs` (Lot 2).

**Tech Stack:** Next.js 14, Supabase, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-01-automation-formation-timeline-design.md`

---

## Pré-requis vérifiés

- `TabAutomation.tsx` : client component (`createClient` client-side), utilise `Tabs`, `Switch`, `TRIGGER_LABELS` (map de libellés FR déjà présente dans le fichier), `AutomationTimeline`, props `{ formation: Session, onRefresh }`. `formation.id` = session_id.
- Service Lot 1 : `instantiatePackForSession(supabase, packId, sessionId)` (`src/lib/automation/instantiate-pack.ts`) → `{ ok:true, count } | { ok:false, error }`.
- Route pattern : `requireRole(["super_admin","admin"])` + `resolveActiveEntityId(auth.profile)` (`@/lib/crm/active-entity`) + `sanitizeDbError` (`@/lib/api-error`). Params `[id]` synchrones `{ params: { id: string } }`.
- Table `session_automation_steps` (Lot 1) : `id, session_id, source_pack_id, order_index, trigger_type, days_offset, recipient_type, document_type, template_id, condition_subcontracted, send_email, name, description, is_enabled`. `sessions.automation_pack_id` (Lot 3).
- `GET /api/automation-packs` (Lot 2) renvoie `{ packs }` de l'entité.
- Barrières : `npx tsc --noEmit` + `npx vitest run`.

## File Structure

| Fichier | Action |
|---|---|
| `src/app/api/formations/[id]/automation-steps/route.ts` | Créer : GET (steps de la session) + PATCH (toggle is_enabled d'une étape). |
| `src/app/api/formations/[id]/automation-steps/apply-pack/route.ts` | Créer : POST (maj `sessions.automation_pack_id` + `instantiatePackForSession`). |
| `src/app/(dashboard)/admin/formations/[id]/_components/FormationAutomationTimeline.tsx` | Créer : composant timeline snapshot (barre pack + liste d'étapes + Switch). |
| `src/app/(dashboard)/admin/formations/[id]/_components/TabAutomation.tsx` | Modifier : monter `FormationAutomationTimeline` en tête (au-dessus de l'existant). |

---

## Task 1 : API — lecture + toggle des étapes de la session

**Files:**
- Create: `src/app/api/formations/[id]/automation-steps/route.ts`

- [ ] **Step 1 : implémenter GET + PATCH**

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

type Ctx = { params: { id: string } };

// Vérifie que la session appartient à l'entité active. Renvoie l'entity_id ou null.
async function sessionInEntity(auth: Awaited<ReturnType<typeof requireRole>>, sessionId: string, entityId: string) {
  if (auth.error) return false;
  const { data } = await auth.supabase
    .from("sessions").select("id").eq("id", sessionId).eq("entity_id", entityId).maybeSingle();
  return !!data;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    if (!(await sessionInEntity(auth, params.id, entityId))) {
      return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });
    }
    const { data: session } = await auth.supabase
      .from("sessions").select("automation_pack_id").eq("id", params.id).maybeSingle();
    const { data: steps, error } = await auth.supabase
      .from("session_automation_steps").select("*").eq("session_id", params.id).order("order_index");
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "automation-steps GET") }, { status: 500 });
    return NextResponse.json({ steps: steps ?? [], automation_pack_id: session?.automation_pack_id ?? null });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "automation-steps GET") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    if (!(await sessionInEntity(auth, params.id, entityId))) {
      return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });
    }
    const body = await request.json();
    const stepId = typeof body?.step_id === "string" ? body.step_id : null;
    const isEnabled = typeof body?.is_enabled === "boolean" ? body.is_enabled : null;
    if (!stepId || isEnabled === null) {
      return NextResponse.json({ error: "step_id et is_enabled requis" }, { status: 400 });
    }
    const { error } = await auth.supabase
      .from("session_automation_steps")
      .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
      .eq("id", stepId).eq("session_id", params.id); // double filtre : étape DE cette session
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "automation-steps PATCH") }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "automation-steps PATCH") }, { status: 500 });
  }
}
```

> Aligne `Ctx`/params sur la forme réelle des autres routes `[id]` du repo (synchrone confirmé). Vérifie le typage de `sessionInEntity` (le narrow de `auth.error` peut nécessiter d'extraire `auth.supabase` après le guard du caller — si TS râle, passe `auth.supabase` en argument au lieu de `auth`).

- [ ] **Step 2 : tsc** → PASS. **Step 3 : commit** — `feat(automation): API lecture + toggle des étapes d'automatisation d'une formation`

---

## Task 2 : API — appliquer / réappliquer / changer de pack

**Files:**
- Create: `src/app/api/formations/[id]/automation-steps/apply-pack/route.ts`

- [ ] **Step 1 : implémenter POST**

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { instantiatePackForSession } from "@/lib/automation/instantiate-pack";

type Ctx = { params: { id: string } };

export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const body = await request.json();
    const packId = typeof body?.pack_id === "string" ? body.pack_id : null;
    if (!packId) return NextResponse.json({ error: "pack_id requis" }, { status: 400 });

    // La session doit appartenir à l'entité active.
    const { data: session } = await auth.supabase
      .from("sessions").select("id").eq("id", params.id).eq("entity_id", entityId).maybeSingle();
    if (!session) return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });

    // Le pack doit appartenir à la même entité (instantiatePackForSession le revérifie aussi).
    const { data: pack } = await auth.supabase
      .from("automation_packs").select("id").eq("id", packId).eq("entity_id", entityId).maybeSingle();
    if (!pack) return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });

    // 1) mémorise le pack choisi sur la session
    const { error: upErr } = await auth.supabase
      .from("sessions").update({ automation_pack_id: packId }).eq("id", params.id);
    if (upErr) return NextResponse.json({ error: sanitizeDbError(upErr, "apply-pack update") }, { status: 500 });

    // 2) (ré)instancie le snapshot
    const snap = await instantiatePackForSession(auth.supabase, packId, params.id);
    if (!snap.ok) return NextResponse.json({ error: snap.error }, { status: 500 });
    return NextResponse.json({ ok: true, count: snap.count });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "apply-pack POST") }, { status: 500 });
  }
}
```

- [ ] **Step 2 : tsc** → PASS. **Step 3 : commit** — `feat(automation): API appliquer/réappliquer/changer le pack d'une formation`

---

## Task 3 : UI — composant timeline snapshot + montage dans TabAutomation

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/FormationAutomationTimeline.tsx`
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabAutomation.tsx`

- [ ] **Step 1 : composant `FormationAutomationTimeline`** — client component, props `{ sessionId: string; onRefresh?: () => void }` :
  - state : `steps` (typé), `packId` (string|null), `packs` (liste), `loading`, `applying`.
  - `useEffect` : `GET /api/formations/${sessionId}/automation-steps` → `steps` + `automation_pack_id` ; `GET /api/automation-packs` → `packs`.
  - **Barre pack** : un `Select` des `packs` (valeur = `packId` courant) + bouton **« Appliquer »** → confirmation via `Dialog` shadcn (texte : « Ceci remplace la timeline actuelle par le pack (les activations/désactivations locales seront perdues). ») → `POST /api/formations/${sessionId}/automation-steps/apply-pack { pack_id }` → toast + refetch (+ `onRefresh?.()`). Libellé du bouton : « Appliquer un pack » si `steps.length === 0`, sinon « Réappliquer / changer ».
  - **Liste des étapes** (si `steps.length > 0`) : par étape, afficher `name || document_type`, le libellé du déclencheur (réutilise une map locale `TRIGGER_LABELS` — copie celle de `TabAutomation.tsx`), l'offset (`J-${days_offset}` / `J+${days_offset}` selon trigger), le destinataire, et un **`Switch`** lié à `is_enabled` → `PATCH { step_id, is_enabled }` → toast + maj optimiste locale.
  - **Empty state** si aucun snapshot : message « Aucun parcours appliqué à cette formation » + la barre pack pour en appliquer un.
  - try/catch + toast partout ; pas de type `any`.

- [ ] **Step 2 : monter dans `TabAutomation`** — en tête du rendu de `TabAutomation.tsx` (au-dessus des `Tabs` existants), insère :

```tsx
      <FormationAutomationTimeline sessionId={formation.id} onRefresh={onRefresh} />
```

et l'import :

```tsx
import { FormationAutomationTimeline } from "./FormationAutomationTimeline";
```

Ne retire RIEN de l'existant (les règles d'entité legacy + overrides + historique restent affichés en dessous — cohabitation). Le nouveau bloc pack passe en premier.

- [ ] **Step 3 : tsc + vitest** → PASS. **Step 4 : commit** — `feat(automation): timeline du pack dans l'onglet formation (toggle + réappliquer)`

---

## Task 4 : Vérification globale

- [ ] **Step 1 : tsc** — `npx tsc --noEmit` → PASS.
- [ ] **Step 2 : vitest** — `npx vitest run` → PASS.
- [ ] **Step 3 : test manuel** (`npm run dev`, C3V) :
  - [ ] Formation SANS pack → bloc « Aucun parcours appliqué » + sélecteur ; « Appliquer un pack » → la timeline apparaît, `sessions.automation_pack_id` renseigné, `session_automation_steps` peuplé.
  - [ ] Toggle d'une étape → `is_enabled` persiste (revérifier après refresh).
  - [ ] « Réappliquer / changer » (confirmation) → snapshot régénéré ; changer de pack met à jour la timeline et `automation_pack_id`.
  - [ ] Une formation legacy sans snapshot montre toujours l'affichage règles-d'entité en dessous (pas de régression).
- [ ] **Step 4 : pas de commit** (validation).

---

## Self-Review (effectué)

- **Couverture spec :** GET/PATCH steps (T1) ; apply/réappliquer/changer (T2) ; UI timeline + toggles + barre pack + empty state (T3) ; cohabitation legacy (T3, on n'enlève rien) ; confirmation réappliquer (T3). Critères → T4. ✅
- **Placeholders :** code complet pour les 2 routes ; le composant UI est spécifié par props/état/handlers/JSX-clés (volume non transcrit intégralement mais déterminé), avec réutilisation explicite de `TRIGGER_LABELS`, `GET /api/automation-packs`, `instantiatePackForSession`.
- **Cohérence des types :** routes utilisent `session_automation_steps` (colonnes Lot 1) ; `apply-pack` appelle `instantiatePackForSession(auth.supabase, packId, sessionId)` (signature Lot 1 : `{ok,count}|{ok:false,error}`) ; `automation_pack_id` (Lot 3) mis à jour avec le snapshot.
