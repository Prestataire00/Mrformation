# Packs d'automatisation — Lot 2 (Éditeur de packs) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD complet des packs d'automatisation et de leurs étapes (timeline) via l'UI `/admin/automation` + page éditeur dédiée.

**Architecture:** Routes API REST sous `/api/automation-packs` (rôle admin, filtre entité via `resolveActiveEntityId`), un schéma Zod partagé pour valider les étapes, une section liste dans `/admin/automation` (remplace `QuickStartPacks`), et une page éditeur `/admin/automation/packs/[id]`.

**Tech Stack:** Next.js 14 (App Router, route handlers), Supabase, Zod, React Hook Form, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-01-automation-packs-editor-design.md`

---

## Pré-requis vérifiés

- Pattern route : `const auth = await requireRole(["super_admin","admin"]); if (auth.error) return auth.error;` → `auth.supabase`, `auth.profile`. Erreurs via `sanitizeDbError`/`sanitizeError` (`@/lib/api-error`). Réf : `src/app/api/formations/automation-rules/route.ts`.
- Entité active (support super_admin) : `resolveActiveEntityId(auth.profile)` — déjà utilisé dans `src/app/api/formations/[id]/invoices/route.ts`. À utiliser partout ici (PAS `auth.profile.entity_id` brut).
- Tables Lot 1 : `automation_packs(id, entity_id, name, description, icon, color, is_default)`, `automation_pack_steps(id, pack_id, order_index, trigger_type, days_offset, recipient_type, document_type, template_id, condition_subcontracted, send_email, name, description)`, `sessions.automation_pack_id` (Lot 3).
- UI actuelle : `src/app/(dashboard)/admin/automation/page.tsx:308` rend `<QuickStartPacks .../>` (à remplacer). Clone de référence pour un dialog d'édition de règle : `EditRuleDialog.tsx` (même dossier composants automation).
- Triggers valides (énum) : `session_start_minus_days`, `session_end_plus_days`, `on_session_creation`, `on_session_completion`, `on_enrollment`, `on_signature_complete`, `opco_deposit_reminder`, `invoice_overdue`, `questionnaire_reminder`, `certificate_ready`.
- Barrières : `npx tsc --noEmit` + `npx vitest run`.

## File Structure

| Fichier | Action |
|---|---|
| `src/lib/validations/automation-pack.ts` | Créer : schémas Zod `packMetaSchema`, `packStepSchema`, `packStepsSchema`. |
| `src/lib/validations/__tests__/automation-pack.test.ts` | Créer : tests des schémas (TDD). |
| `src/app/api/automation-packs/route.ts` | Créer : GET (liste) + POST (create). |
| `src/app/api/automation-packs/[id]/route.ts` | Créer : GET (pack+étapes) + PATCH (méta + is_default) + DELETE (garde usage). |
| `src/app/api/automation-packs/[id]/steps/route.ts` | Créer : PUT (remplace les étapes). |
| `src/app/api/automation-packs/[id]/duplicate/route.ts` | Créer : POST (clone pack+étapes). |
| `src/components/automation/PacksManager.tsx` | Créer : section liste des packs (remplace QuickStartPacks dans la page). |
| `src/app/(dashboard)/admin/automation/page.tsx` | Modifier : remplacer `<QuickStartPacks/>` par `<PacksManager/>`. |
| `src/app/(dashboard)/admin/automation/packs/[id]/page.tsx` | Créer : page éditeur (méta + timeline d'étapes). |

---

## Task 1 : Schéma Zod des packs/étapes (TDD)

**Files:**
- Create: `src/lib/validations/automation-pack.ts`
- Test: `src/lib/validations/__tests__/automation-pack.test.ts`

- [ ] **Step 1 : test (échoue)**

```ts
import { describe, it, expect } from "vitest";
import { packMetaSchema, packStepSchema, packStepsSchema } from "../automation-pack";

describe("automation-pack schemas", () => {
  it("packMetaSchema : nom requis", () => {
    expect(packMetaSchema.safeParse({ name: "" }).success).toBe(false);
    expect(packMetaSchema.safeParse({ name: "Mon pack", is_default: true }).success).toBe(true);
  });
  it("packStepSchema : trigger connu + offset >= 0 + doc OU template", () => {
    expect(packStepSchema.safeParse({ trigger_type: "inconnu", document_type: "convocation" }).success).toBe(false);
    expect(packStepSchema.safeParse({ trigger_type: "session_start_minus_days", days_offset: -1, document_type: "convocation" }).success).toBe(false);
    expect(packStepSchema.safeParse({ trigger_type: "on_enrollment", recipient_type: "learners" }).success).toBe(false); // ni doc ni template
    expect(packStepSchema.safeParse({ trigger_type: "session_start_minus_days", days_offset: 5, recipient_type: "learners", document_type: "convocation" }).success).toBe(true);
  });
  it("packStepsSchema : tableau d'étapes", () => {
    expect(packStepsSchema.safeParse([{ trigger_type: "on_enrollment", document_type: "convocation" }]).success).toBe(true);
  });
});
```

- [ ] **Step 2 : run → FAIL** — Run: `npx vitest run src/lib/validations/__tests__/automation-pack.test.ts` → FAIL (module absent).

- [ ] **Step 3 : implémenter**

```ts
import { z } from "zod";

export const TRIGGER_TYPES = [
  "session_start_minus_days", "session_end_plus_days", "on_session_creation",
  "on_session_completion", "on_enrollment", "on_signature_complete",
  "opco_deposit_reminder", "invoice_overdue", "questionnaire_reminder", "certificate_ready",
] as const;

export const RECIPIENT_TYPES = ["learners", "trainers", "companies", "all"] as const;

export const packMetaSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(120),
  description: z.string().max(2000).optional().nullable(),
  icon: z.string().max(16).optional().nullable(),
  color: z.string().max(32).optional().nullable(),
  is_default: z.boolean().optional().default(false),
});

export const packStepSchema = z.object({
  trigger_type: z.enum(TRIGGER_TYPES),
  days_offset: z.number().int().min(0).max(3650).optional().default(0),
  recipient_type: z.enum(RECIPIENT_TYPES).optional().nullable(),
  document_type: z.string().max(80).optional().nullable(),
  template_id: z.string().uuid().optional().nullable(),
  condition_subcontracted: z.boolean().optional().nullable(),
  send_email: z.boolean().optional().default(true),
  name: z.string().max(160).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
}).refine(
  (s) => (s.document_type && s.document_type.length > 0) || !!s.template_id,
  { message: "Chaque étape doit avoir un document ou un template email", path: ["document_type"] },
);

export const packStepsSchema = z.array(packStepSchema);

export type PackMetaInput = z.infer<typeof packMetaSchema>;
export type PackStepInput = z.infer<typeof packStepSchema>;
```

- [ ] **Step 4 : run → PASS** — Run: `npx vitest run src/lib/validations/__tests__/automation-pack.test.ts` → PASS.
- [ ] **Step 5 : commit**

```bash
git add src/lib/validations/automation-pack.ts src/lib/validations/__tests__/automation-pack.test.ts
git commit -m "feat(automation): schémas Zod packs + étapes"
```

---

## Task 2 : API liste + création (`/api/automation-packs`)

**Files:**
- Create: `src/app/api/automation-packs/route.ts`

- [ ] **Step 1 : implémenter GET + POST**

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { resolveActiveEntityId } from "@/lib/auth/resolve-active-entity";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { packMetaSchema } from "@/lib/validations/automation-pack";

export async function GET() {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const { data, error } = await auth.supabase
      .from("automation_packs")
      .select("*, automation_pack_steps(count)")
      .eq("entity_id", entityId)
      .order("name");
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "packs GET") }, { status: 500 });
    return NextResponse.json({ packs: data ?? [] });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "packs GET") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const parsed = packMetaSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { data, error } = await auth.supabase
      .from("automation_packs")
      .insert({ ...parsed.data, entity_id: entityId })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "packs POST") }, { status: 500 });
    return NextResponse.json({ id: data.id });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "packs POST") }, { status: 500 });
  }
}
```

> Vérifie le chemin réel de `resolveActiveEntityId` (grep `export .*resolveActiveEntityId`) et ajuste l'import. Vérifie que `select("*, automation_pack_steps(count)")` fonctionne (embedding count PostgREST) ; sinon fais un simple `select("*")` et compte les étapes côté UI via un 2ᵉ fetch.

- [ ] **Step 2 : tsc** — Run: `npx tsc --noEmit` → PASS.
- [ ] **Step 3 : commit** — `git add src/app/api/automation-packs/route.ts && git commit -m "feat(automation): API liste + création de packs"`

---

## Task 3 : API pack unitaire (`/api/automation-packs/[id]` : GET/PATCH/DELETE)

**Files:**
- Create: `src/app/api/automation-packs/[id]/route.ts`

- [ ] **Step 1 : implémenter**

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { resolveActiveEntityId } from "@/lib/auth/resolve-active-entity";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { packMetaSchema } from "@/lib/validations/automation-pack";

type Ctx = { params: { id: string } };

async function ownedPack(auth: Awaited<ReturnType<typeof requireRole>>, id: string, entityId: string) {
  // @ts-expect-error auth.supabase existe quand auth.error est absent
  return auth.supabase.from("automation_packs").select("id, entity_id").eq("id", id).eq("entity_id", entityId).maybeSingle();
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const { data: pack, error } = await auth.supabase
      .from("automation_packs").select("*").eq("id", params.id).eq("entity_id", entityId).maybeSingle();
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "pack GET") }, { status: 500 });
    if (!pack) return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });
    const { data: steps } = await auth.supabase
      .from("automation_pack_steps").select("*").eq("pack_id", params.id).order("order_index");
    return NextResponse.json({ pack, steps: steps ?? [] });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "pack GET") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const parsed = packMetaSchema.partial().safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { data: owned } = await ownedPack(auth, params.id, entityId);
    if (!owned) return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });
    // is_default unique par entité : si on promeut ce pack, retirer le flag des autres.
    if (parsed.data.is_default === true) {
      await auth.supabase.from("automation_packs").update({ is_default: false }).eq("entity_id", entityId).neq("id", params.id);
    }
    const { error } = await auth.supabase
      .from("automation_packs").update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", params.id).eq("entity_id", entityId);
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "pack PATCH") }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "pack PATCH") }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const { data: owned } = await ownedPack(auth, params.id, entityId);
    if (!owned) return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });
    // Garde : refuser si des formations référencent ce pack.
    const { count } = await auth.supabase
      .from("sessions").select("id", { count: "exact", head: true }).eq("automation_pack_id", params.id);
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: `Pack utilisé par ${count} formation(s) — suppression refusée.` }, { status: 409 });
    }
    const { error } = await auth.supabase.from("automation_packs").delete().eq("id", params.id).eq("entity_id", entityId);
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "pack DELETE") }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "pack DELETE") }, { status: 500 });
  }
}
```

> Ajuste le typage de `ownedPack`/`Ctx` selon la version Next du repo (params peut être async `Promise<{id}>` en Next 15 — vérifie la signature des autres routes `[id]` du repo, ex. `src/app/api/sessions/[id]/route.ts`, et aligne-toi dessus).

- [ ] **Step 2 : tsc** → PASS. **Step 3 : commit** — `feat(automation): API pack unitaire (get/patch/delete + gardes)`

---

## Task 4 : API remplacement des étapes + duplication

**Files:**
- Create: `src/app/api/automation-packs/[id]/steps/route.ts`
- Create: `src/app/api/automation-packs/[id]/duplicate/route.ts`

- [ ] **Step 1 : `steps/route.ts` (PUT remplace)**

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { resolveActiveEntityId } from "@/lib/auth/resolve-active-entity";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { packStepsSchema } from "@/lib/validations/automation-pack";

type Ctx = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const { data: owned } = await auth.supabase
      .from("automation_packs").select("id").eq("id", params.id).eq("entity_id", entityId).maybeSingle();
    if (!owned) return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });
    const parsed = packStepsSchema.safeParse((await request.json())?.steps);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    // Remplacement complet du gabarit — NE touche PAS session_automation_steps (snapshots figés).
    await auth.supabase.from("automation_pack_steps").delete().eq("pack_id", params.id);
    if (parsed.data.length > 0) {
      const rows = parsed.data.map((s, i) => ({
        pack_id: params.id, order_index: i,
        trigger_type: s.trigger_type, days_offset: s.days_offset ?? 0,
        recipient_type: s.recipient_type ?? null, document_type: s.document_type ?? null,
        template_id: s.template_id ?? null, condition_subcontracted: s.condition_subcontracted ?? null,
        send_email: s.send_email ?? true, name: s.name ?? null, description: s.description ?? null,
      }));
      const { error } = await auth.supabase.from("automation_pack_steps").insert(rows);
      if (error) return NextResponse.json({ error: sanitizeDbError(error, "steps PUT") }, { status: 500 });
    }
    return NextResponse.json({ ok: true, count: parsed.data.length });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "steps PUT") }, { status: 500 });
  }
}
```

- [ ] **Step 2 : `duplicate/route.ts` (POST clone)**

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { resolveActiveEntityId } from "@/lib/auth/resolve-active-entity";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

type Ctx = { params: { id: string } };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const { data: src } = await auth.supabase
      .from("automation_packs").select("*").eq("id", params.id).eq("entity_id", entityId).maybeSingle();
    if (!src) return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });
    const { data: created, error: cErr } = await auth.supabase.from("automation_packs").insert({
      entity_id: entityId, name: `${src.name} (copie)`, description: src.description,
      icon: src.icon, color: src.color, is_default: false,
    }).select("id").single();
    if (cErr) return NextResponse.json({ error: sanitizeDbError(cErr, "pack duplicate") }, { status: 500 });
    const { data: steps } = await auth.supabase
      .from("automation_pack_steps").select("*").eq("pack_id", params.id).order("order_index");
    if (steps && steps.length > 0) {
      const rows = steps.map((s) => ({
        pack_id: created.id, order_index: s.order_index, trigger_type: s.trigger_type,
        days_offset: s.days_offset, recipient_type: s.recipient_type, document_type: s.document_type,
        template_id: s.template_id, condition_subcontracted: s.condition_subcontracted,
        send_email: s.send_email, name: s.name, description: s.description,
      }));
      await auth.supabase.from("automation_pack_steps").insert(rows);
    }
    return NextResponse.json({ id: created.id });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "pack duplicate") }, { status: 500 });
  }
}
```

- [ ] **Step 3 : tsc** → PASS. **Step 4 : commit** — `feat(automation): API remplacement étapes + duplication pack`

---

## Task 5 : UI liste des packs (`PacksManager`) + branchement page

**Files:**
- Create: `src/components/automation/PacksManager.tsx`
- Modify: `src/app/(dashboard)/admin/automation/page.tsx`

- [ ] **Step 1 : composant `PacksManager`** — client component qui :
  - `useEffect` → `GET /api/automation-packs` → `packs` (state).
  - Rend une grille de cards (nom + icône + couleur + nb d'étapes `pack.automation_pack_steps?.[0]?.count ?? 0` + badge « défaut » si `is_default`).
  - Bouton **« Nouveau pack »** → `POST /api/automation-packs` `{ name: "Nouveau parcours" }` → `router.push('/admin/automation/packs/' + id)`.
  - Par card : **Éditer** (`router.push(.../packs/[id])`), **Dupliquer** (`POST .../duplicate` → refetch), **Définir par défaut** (`PATCH {is_default:true}` → refetch), **Supprimer** (confirmation via `Dialog` shadcn → `DELETE` ; si réponse 409, afficher le message d'erreur en toast, ne pas supprimer).
  - Chaque action : try/catch + toast + refetch. Pas de type `any`.
  - Clone le style de cards depuis l'existant (`QuickStartPacks.tsx` pour l'esthétique des packs).

- [ ] **Step 2 : brancher dans la page** — dans `src/app/(dashboard)/admin/automation/page.tsx`, remplacer l'import et l'usage :
  - retirer `import { QuickStartPacks } ...` et `<QuickStartPacks onActivated={fetchRules} existingRuleNames={existingRuleNames} />` (l.308).
  - ajouter `import { PacksManager } from "@/components/automation/PacksManager";` et `<PacksManager />` au même endroit (section « Mes parcours »).
  - Si `existingRuleNames`/imports deviennent inutilisés → les retirer pour garder `tsc` propre.

- [ ] **Step 3 : tsc + vitest** → PASS. **Step 4 : commit** — `feat(automation): UI liste/gestion des packs (remplace QuickStartPacks)`

---

## Task 6 : Page éditeur (`/admin/automation/packs/[id]`)

**Files:**
- Create: `src/app/(dashboard)/admin/automation/packs/[id]/page.tsx`

- [ ] **Step 1 : page éditeur** — client component :
  - `useEffect` → `GET /api/automation-packs/[id]` → `{ pack, steps }` en state (id via `useParams`).
  - **Bloc métadonnées** (React Hook Form + `packMetaSchema` via `@hookform/resolvers/zod`) : `name`, `description`, `icon` (input texte court / emoji), `color` (select ou input), `is_default` (Switch).
  - **Timeline d'étapes** : state `steps: PackStepInput[]`. Pour chaque étape, un bloc éditable :
    - `trigger_type` (Select des `TRIGGER_TYPES` avec libellés lisibles), `days_offset` (Input number, masqué si trigger événementiel — c-à-d ≠ `session_start_minus_days`/`session_end_plus_days`/`opco_deposit_reminder`/`invoice_overdue`), `recipient_type` (Select `RECIPIENT_TYPES`), `document_type` (Select des `ConventionDocType`; importer la liste depuis `src/lib/types` ou une constante), `condition_subcontracted` (Select Tous/Sous-traitée/Non → true/false/null), `name`, `description`.
    - Boutons par étape : **Supprimer**, **Monter**, **Descendre** (échange dans le tableau).
    - Bouton **« Ajouter une étape »** (pousse une étape par défaut `{ trigger_type: "session_start_minus_days", days_offset: 5, recipient_type: "learners", document_type: "convocation" }`).
  - **Enregistrer** : `PATCH /api/automation-packs/[id]` (méta) puis `PUT /api/automation-packs/[id]/steps` `{ steps }`. Valider `packStepsSchema` côté client avant envoi ; toasts ; sur succès `router.push('/admin/automation')`.
  - **Annuler** → retour liste.
  - Empty state si le pack n'a pas d'étapes.
  - Réutilise les Select/Input/Switch/Button shadcn ; clone les libellés de triggers depuis l'existant si présents (`EditRuleDialog.tsx`).

- [ ] **Step 2 : tsc + vitest** → PASS. **Step 3 : commit** — `feat(automation): page éditeur de pack (métadonnées + timeline d'étapes)`

---

## Task 7 : Vérification globale

- [ ] **Step 1 : tsc** — `npx tsc --noEmit` → PASS.
- [ ] **Step 2 : vitest** — `npx vitest run` → PASS.
- [ ] **Step 3 : test manuel** (`npm run dev`, entité C3V) :
  - [ ] `/admin/automation` : section « Mes parcours » liste les packs seedés (Qualiopi/OPCO/Sous-traitance).
  - [ ] « Nouveau pack » → éditeur → ajouter 2 étapes, réordonner, enregistrer → réouvrir : état conservé.
  - [ ] Dupliquer un pack → « … (copie) » apparaît avec les mêmes étapes.
  - [ ] Définir par défaut sur un pack → l'ancien défaut perd le badge.
  - [ ] Supprimer un pack **non utilisé** → OK ; un pack **utilisé** par une formation (créée au Lot 3) → refus avec message.
  - [ ] Éditer un pack ne modifie pas les `session_automation_steps` d'une formation déjà créée.
- [ ] **Step 4 : pas de commit** (validation).

---

## Self-Review (effectué)

- **Couverture spec :** routes CRUD + steps + duplicate (T2-T4) ; garde is_default (T3 PATCH) ; garde suppression via `sessions.automation_pack_id` (T3 DELETE) ; PUT steps ne touche pas `session_automation_steps` (T4, commentaire + delete ciblé `pack_id`) ; liste UI remplace QuickStartPacks (T5) ; éditeur page dédiée (T6). Zod (T1). ✅
- **Placeholders :** code complet pour Zod + 7 routes ; les 2 pages React sont spécifiées par composants/état/handlers/JSX-clés + fichiers de clone (volume JSX non transcrit intégralement mais entièrement déterminé). Consignes de vérification (signature `[id]` Next, chemin `resolveActiveEntityId`, embedding count) explicites.
- **Cohérence des types :** `packMetaSchema`/`packStepSchema`/`packStepsSchema` (T1) réutilisés par les routes (T2-T4) et l'éditeur (T6) ; `TRIGGER_TYPES`/`RECIPIENT_TYPES` exportés (T1) et consommés par les Select (T6).
