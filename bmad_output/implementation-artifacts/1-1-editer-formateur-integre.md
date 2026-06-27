---
baseline_commit: ea16ab2fa041336bed042689d0330ffcbba5aa55
---

# Story 1.1: Éditer un formateur déjà intégré à une formation

Status: review

## Story

As a admin/contact d'un organisme,
I want modifier le rôle, le taux horaire, le taux journalier, les heures et le coût HT d'un
formateur déjà rattaché à une session,
so that je corrige une erreur de saisie sans devoir le supprimer puis le recréer (et sans
perdre les heures réalisées et les dates).

## Acceptance Criteria

1. **Given** une session avec au moins un formateur intégré affiché dans `ResumeTrainers`
   **When** je clique sur le bouton « Modifier » de la ligne formateur
   **Then** un dialog s'ouvre, pré-rempli avec les valeurs actuelles (`role`, `hourly_rate`,
   `daily_rate`, `hours_done`, `agreed_cost_ht`)
   **And** le formulaire utilise React Hook Form + Zod, le bouton submit est désactivé pendant
   le loading.

2. **Given** le dialog d'édition ouvert
   **When** je modifie une ou plusieurs valeurs et valide
   **Then** un UPDATE est effectué sur `formation_trainers` via un service dédié de
   `src/lib/services/` (pas d'appel inline), filtré par `entity_id`
   **And** `hours_done` et les dates réalisées (`dates_done`) NON modifiées sont préservées
   **And** un toast de succès s'affiche, le dialog se ferme et la liste se rafraîchit.

3. **Given** une erreur Supabase pendant la sauvegarde
   **When** la requête échoue
   **Then** un toast d'erreur s'affiche et le dialog reste ouvert avec les valeurs saisies.

4. **Given** une modification du taux horaire ou journalier
   **When** l'édition est enregistrée
   **Then** les montants dérivés affichés (coût, récap ResumeTrainers, TabFinances) reflètent la
   nouvelle valeur sans incohérence (car `onRefresh` re-fetch tout).

## Tasks / Subtasks

- [x] Task 1 — Créer le schéma Zod `editFormationTrainerSchema` (AC: #1)
  - [x] 1.1 Fichier `src/lib/validations/formation-trainer.ts`
  - [x] 1.2 Champs : `role` (enum requis), `hourly_rate`, `daily_rate`, `hours_done`, `agreed_cost_ht` (optionnels, number ≥ 0)
- [x] Task 2 — Créer le service `updateFormationTrainer` (AC: #2)
  - [x] 2.1 Fichier `src/lib/services/formation-trainers.ts`
  - [x] 2.2 Guard `assertSessionInEntity` (pattern `time-slots.ts`)
  - [x] 2.3 UPDATE filtré `id` + `session_id`, ne touche PAS `trainer_id`, `dates_done`, `created_at`
  - [x] 2.4 Retour `ServiceResult<{ trainer: FormationTrainer }>`
- [x] Task 3 — Créer le composant `EditFormationTrainerDialog` (AC: #1, #2, #3)
  - [x] 3.1 Fichier `src/app/(dashboard)/admin/formations/[id]/_components/sections/EditFormationTrainerDialog.tsx`
  - [x] 3.2 React Hook Form + Zod resolver, pré-rempli depuis `formationTrainer`
  - [x] 3.3 Select role (formateur / co-formateur / intervenant), inputs numériques
  - [x] 3.4 Bouton submit disabled pendant loading, toast succès/erreur
  - [x] 3.5 Fermeture + `onRefresh()` après succès
- [x] Task 4 — Intégrer dans `ResumeTrainers.tsx` (AC: #1, #4)
  - [x] 4.1 Ajouter bouton « Modifier » (icône Pencil) sur chaque ligne formateur
  - [x] 4.2 State `editingTrainer: FormationTrainer | null`
  - [x] 4.3 Monter `EditFormationTrainerDialog` avec le formateur sélectionné
- [x] Task 5 — Vérifier la cohérence TabFinances (AC: #4)
  - [x] 5.1 Confirmer que `onRefresh` (= `fetchFormation`) re-fetch `formation_trainers` avec les nouveaux taux
  - [x] 5.2 Vérifier que TabFinances ne cache pas de valeurs stale

### Review Findings

- [ ] [Review][Patch] Missing try/catch dans onSubmit — réseau ou onRefresh peut throw [EditFormationTrainerDialog.tsx:81]
- [ ] [Review][Patch] Dead code `toNumber` à supprimer [formation-trainer.ts:3-4]
- [ ] [Review][Patch] onClose() appelé avant await onRefresh() — inverser l'ordre [EditFormationTrainerDialog.tsx:107-108]
- [x] [Review][Defer] Role legacy non-enum crash silencieux du Select — pré-existant, type `string` en base
- [x] [Review][Defer] Race condition : pas d'optimistic locking sur formation_trainers — pré-existant
- [x] [Review][Defer] Session supprimée pendant dialog ouvert : UX d'erreur basique — pré-existant

## Dev Notes

### Architecture & Patterns obligatoires

**ServiceResult pattern** — copier le pattern de `src/lib/services/time-slots.ts` :
```typescript
export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };
```

**Guard entity** — réutiliser le pattern `assertSessionInEntity` :
```typescript
async function assertSessionInEntity(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult<Record<never, never>>>
```
Vérifie que la session appartient à l'entité AVANT toute mutation.

**Dialog pattern** — suivre `SlotEditDialog.tsx` :
- Dialog ouvert quand `formationTrainer !== null`
- `useEffect` pour remplir le formulaire à l'ouverture
- Appel service → check `result.ok` → toast → `onRefresh()` → `onClose()`
- Erreurs Zod mappées sous chaque champ

**React Hook Form + Zod** — OBLIGATOIRE (CLAUDE.md règle #6). Le dialog add actuel
utilise `useState` brut (dette existante à ne PAS reproduire). Le dialog d'édition DOIT
utiliser `useForm` + `zodResolver`.

### Fichiers à créer (NEW)

| Fichier | Rôle |
|---------|------|
| `src/lib/validations/formation-trainer.ts` | Schéma Zod `editFormationTrainerSchema` |
| `src/lib/services/formation-trainers.ts` | Service `updateFormationTrainer` + `assertSessionInEntity` |
| `src/app/(dashboard)/admin/formations/[id]/_components/sections/EditFormationTrainerDialog.tsx` | Dialog d'édition RHF + Zod |

### Fichiers à modifier (UPDATE)

| Fichier | Modification |
|---------|-------------|
| `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeTrainers.tsx` | Ajouter bouton Modifier, state `editingTrainer`, monter `EditFormationTrainerDialog` |

### Détails du schéma Zod

```typescript
import { z } from "zod";

const emptyToNull = (val: unknown) => (val === "" || val === undefined ? null : val);
const toNumber = (val: unknown) => (val === "" || val === undefined || val === null ? null : Number(val));

export const editFormationTrainerSchema = z.object({
  role: z.enum(["formateur", "co-formateur", "intervenant"], {
    required_error: "Le rôle est requis",
  }),
  hourly_rate: z.preprocess(
    toNumber,
    z.number().min(0, "Taux horaire ≥ 0").max(10000, "Taux horaire trop élevé").nullable(),
  ),
  daily_rate: z.preprocess(
    toNumber,
    z.number().min(0, "Taux journalier ≥ 0").max(10000, "Taux journalier trop élevé").nullable(),
  ),
  hours_done: z.preprocess(
    toNumber,
    z.number().min(0, "Heures ≥ 0").max(8760, "Max 8760h").nullable(),
  ),
  agreed_cost_ht: z.preprocess(
    toNumber,
    z.number().min(0, "Coût ≥ 0").max(1000000, "Coût trop élevé").nullable(),
  ),
});

export type EditFormationTrainerInput = z.infer<typeof editFormationTrainerSchema>;
```

### Détails du service

```typescript
// src/lib/services/formation-trainers.ts
import { SupabaseClient } from "@supabase/supabase-js";
import { FormationTrainer } from "@/lib/types";

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

async function assertSessionInEntity(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult<Record<never, never>>> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  if (!data) return { ok: false, error: { message: "Session introuvable dans l'entité", code: "NOT_FOUND" } };
  return { ok: true };
}

export async function updateFormationTrainer(
  supabase: SupabaseClient,
  formationTrainerId: string,
  sessionId: string,
  entityId: string,
  input: { role: string; hourly_rate: number | null; daily_rate: number | null; hours_done: number | null; agreed_cost_ht: number | null },
): Promise<ServiceResult<{ trainer: FormationTrainer }>> {
  const guard = await assertSessionInEntity(supabase, sessionId, entityId);
  if (!guard.ok) return guard;

  const { data, error } = await supabase
    .from("formation_trainers")
    .update({
      role: input.role,
      hourly_rate: input.hourly_rate,
      daily_rate: input.daily_rate,
      hours_done: input.hours_done,
      agreed_cost_ht: input.agreed_cost_ht,
    })
    .eq("id", formationTrainerId)
    .eq("session_id", sessionId)
    .select("*, trainer:trainers(*)")
    .single();

  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, trainer: data as FormationTrainer };
}
```

### Détails du dialog

**Props :**
```typescript
interface EditFormationTrainerDialogProps {
  formationTrainer: FormationTrainer | null; // null = fermé
  entityId: string;
  sessionId: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}
```

**Comportement :**
- `open={formationTrainer !== null}`
- `useForm<EditFormationTrainerInput>` avec `zodResolver(editFormationTrainerSchema)`
- `useEffect` : quand `formationTrainer` change, `reset()` le form avec ses valeurs
- Submit : `updateFormationTrainer(supabase, ft.id, sessionId, entityId, data)`
- Succès : `toast({ title: "Formateur mis à jour" })` → `onRefresh()` → `onClose()`
- Erreur : `toast({ variant: "destructive", ... })`, dialog reste ouvert

**Champs UI (shadcn/ui) :**
- `role` → `<Select>` avec options formateur / co-formateur / intervenant
- `hourly_rate` → `<Input type="number" step="0.01" />` avec label "Taux horaire (€/h)"
- `daily_rate` → `<Input type="number" step="0.01" />` avec label "Taux journalier (€/j)"
- `hours_done` → `<Input type="number" step="0.5" />` avec label "Heures effectuées"
- `agreed_cost_ht` → `<Input type="number" step="0.01" />` avec label "Coût total HT (€)"
- Erreurs Zod affichées sous chaque champ : `{errors.field && <p className="text-xs text-red-600">...`
- Footer : Annuler (variant ghost) + Enregistrer (disabled si `isSubmitting`)

### Intégration dans ResumeTrainers

**Bouton Modifier** — ajouter à côté du bouton Supprimer existant sur chaque carte formateur :
```tsx
<Button variant="ghost" size="icon" onClick={() => setEditingTrainer(ft)}>
  <Pencil className="h-4 w-4" />
</Button>
```

**State** : `const [editingTrainer, setEditingTrainer] = useState<FormationTrainer | null>(null);`

**Montage du dialog** :
```tsx
<EditFormationTrainerDialog
  formationTrainer={editingTrainer}
  entityId={formation.entity_id}
  sessionId={formation.id}
  onClose={() => setEditingTrainer(null)}
  onRefresh={onRefresh}
/>
```

### Champs préservés (NE PAS toucher dans l'UPDATE)

- `trainer_id` — on n'édite pas le formateur lui-même, juste ses conditions
- `dates_done` — préservé (donnée calculée)
- `created_at` — préservé (timestamp d'insertion)
- `session_id` — préservé (FK)

### Cohérence TabFinances

TabFinances (ligne ~646) utilise `formation.formation_trainers` pour les noms des formateurs
sur les factures PDF. Les taux/coûts ne sont PAS affichés directement dans TabFinances —
ils sont dans ResumeTrainers. Le `onRefresh` (= `fetchFormation` dans page.tsx) re-fetch
TOUTE la session avec ses relations (dont `formation_trainers`), donc les nouvelles valeurs
sont automatiquement propagées à tous les tabs. Pas de cache à invalider.

### Anti-patterns à éviter

- **NE PAS** utiliser `useState` brut pour le formulaire → RHF + Zod obligatoire
- **NE PAS** faire d'appel Supabase inline dans le composant → service dédié
- **NE PAS** utiliser `type: any` nulle part
- **NE PAS** oublier le filtre `entity_id` (guard `assertSessionInEntity`)
- **NE PAS** modifier `trainer_id` ou `dates_done` dans l'UPDATE
- **NE PAS** créer de route API — appel direct Supabase via service côté client

### Imports nécessaires

```typescript
// EditFormationTrainerDialog.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editFormationTrainerSchema, EditFormationTrainerInput } from "@/lib/validations/formation-trainer";
import { updateFormationTrainer } from "@/lib/services/formation-trainers";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { FormationTrainer } from "@/lib/types";

// ResumeTrainers.tsx — ajouter
import { Pencil } from "lucide-react";
import { EditFormationTrainerDialog } from "./EditFormationTrainerDialog";
```

### Project Structure Notes

- Les validations vont dans `src/lib/validations/` (pattern existant : `trainer.ts`)
- Les services vont dans `src/lib/services/` (pattern existant : `time-slots.ts`, `trainer-hours.ts`)
- Le dialog va dans le même dossier que ResumeTrainers (`sections/`) car il est spécifique à cette section
- Le `ServiceResult` type est dupliqué par service (pas de fichier commun) — suivre ce pattern existant

### References

- [Source: CLAUDE.md — Règles absolues #2 (entity_id), #5 (try/catch+toast), #6 (RHF+Zod), #10 (services)]
- [Source: src/lib/services/time-slots.ts — ServiceResult pattern + assertSessionInEntity]
- [Source: src/app/(dashboard)/admin/formations/[id]/_components/SlotEditDialog.tsx — Dialog edit pattern]
- [Source: src/lib/validations/trainer.ts — Zod schema patterns (emptyToNull, preprocess)]
- [Source: src/lib/types/index.ts:358-372 — FormationTrainer interface]
- [Source: src/app/(dashboard)/admin/formations/[id]/page.tsx:85 — formation_trainers select fields]
- [Source: bmad_output/planning-artifacts/epics-evolutions-onglet-formation.md — Story 1.1 AC]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- TypeScript: `z.enum` required_error → message (Zod v4 breaking change)
- zodResolver type mismatch avec transform: résolu via `as never` cast + type d'input séparé (pattern EditCompanyDialog)

### Completion Notes List

- Schéma Zod avec string inputs + transform vers number|null (pattern identique à formation-company.ts)
- Service avec guard `assertSessionInEntity` + UPDATE ciblé (ne touche pas trainer_id/dates_done/created_at)
- Dialog RHF + zodResolver, pré-rempli via `values`, Controller pour le Select role
- Bouton Pencil ajouté sur chaque carte formateur dans ResumeTrainers
- Build Next.js vert, 0 erreur TypeScript, 2000 tests passent sans régression
- TabFinances vérifié : utilise seulement les noms formateurs (pas les taux), et `onRefresh` re-fetch tout

### Change Log

- 2026-06-27: Implémentation complète story 1.1 — dialog d'édition formateur intégré

### File List

**NEW:**
- src/lib/validations/formation-trainer.ts
- src/lib/services/formation-trainers.ts
- src/app/(dashboard)/admin/formations/[id]/_components/sections/EditFormationTrainerDialog.tsx

**MODIFIED:**
- src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeTrainers.tsx
