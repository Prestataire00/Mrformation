# Plan d'implémentation — Solidification TabResume

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Solidifier le sous-onglet Résumé (TabResume, 1ᵉʳ tab le plus utilisé) en corrigeant 3 critiques + 10 majeurs + dette ciblée, en construisant la feature « Envoyer visio par email », en retirant le stub « Historique », et en extrayant 2 services testables.

**Architecture:** Pas de migration SQL. Extension de `src/lib/services/sessions.ts` (4 nouvelles fonctions : `updateSessionField`, `duplicateSession`, `deleteSession`, `sendVisioLinkToLearners`). Nouveau service `src/lib/services/trainer-hours.ts` (extraction `getTrainerStats`). Nouvelle route API `/api/sessions/[id]/send-visio-link`. Types `Enrollment.individual_price` et `Client.email` étendus pour retirer les casts `as unknown as`. 10 sous-composants patchés ciblé (entity_id filter, await onRefresh, error.message, useEffect cancel-reset, retraits casts, Zod URL).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase, Vitest, shadcn/ui, Zod, email_queue (worker existant `/api/emails/process-scheduled`).

**Spec source:** [docs/superpowers/specs/2026-05-25-solidification-tab-resume-design.md](docs/superpowers/specs/2026-05-25-solidification-tab-resume-design.md)
**Deep-dive source:** [docs/deep-dive-tab-resume.md](docs/deep-dive-tab-resume.md)
**Acceptance criteria source:** Spec §5 (vérifiés en Tâche 14).

---

## Vue d'ensemble des fichiers

### Créés
| Fichier | Rôle |
|---|---|
| `src/lib/services/trainer-hours.ts` | `getTrainerStats(formation, trainerId)` extraite |
| `src/lib/services/__tests__/trainer-hours.test.ts` | 4 tests pour getTrainerStats |
| `src/app/api/sessions/[id]/send-visio-link/route.ts` | POST authentifié, délègue au service |

### Modifiés
| Fichier | Changement |
|---|---|
| `src/lib/types/index.ts` | `Enrollment.individual_price?` + `Client.email?` |
| `src/lib/services/sessions.ts` | + `updateSessionField` + `duplicateSession` + `deleteSession` + `sendVisioLinkToLearners` |
| `src/lib/services/__tests__/sessions.test.ts` | Tests pour les 4 nouvelles fonctions |
| `sections/ResumeDangerZone.tsx` | 1 seul DELETE via `deleteSession` (plus la boucle de 6 tables) |
| `sections/ResumeCompanies.tsx` | `entity_id` sur fetch contacts + retrait casts |
| `sections/ResumeLearners.tsx` | Retrait casts + visibility bulk send + await |
| `sections/ResumeDescription.tsx` | `updateSessionField` + useEffect cancel-reset + error.message + await |
| `sections/ResumeLocation.tsx` | `updateSessionField` + useEffect cancel-reset + error.message + await |
| `sections/ResumeManager.tsx` | `updateSessionField` + error.message + await |
| `sections/ResumeVisioLink.tsx` | Zod URL + bouton « Envoyer » fonctionnel + confirm dialog |
| `sections/ResumeActions.tsx` | `duplicateSession` via service + retrait Historique |
| `sections/ResumeFinanciers.tsx` | `.eq("session_id", ...)` sur update + await |
| `sections/ResumeTrainers.tsx` | `getTrainerStats` via service + await |

---

## Tâche 1 : Baseline + branche + types Session étendus

**Files:**
- Modify: `src/lib/types/index.ts`

- [ ] **Step 1 : Vérifier état initial (green baseline)**

Run:
```bash
git status
git branch --show-current
npx vitest run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -5
```
Expected: branche `main`, suite 461 tests verts, TypeScript clean.

- [ ] **Step 2 : Créer la branche**

```bash
git checkout main
git pull origin main 2>/dev/null || true
git checkout -b feat/tab-resume-solidification
```

- [ ] **Step 3 : Localiser les interfaces `Enrollment` et `Client`**

Run:
```bash
grep -n "^export interface Enrollment\b\|^export interface Client\b" src/lib/types/index.ts
```
Expected: 2 lignes. Noter les numéros de ligne.

- [ ] **Step 4 : Ajouter `individual_price` à `Enrollment`**

Dans l'interface `Enrollment` de `src/lib/types/index.ts`, ajouter (placement : après les autres champs nullable) :

```ts
  individual_price?: number | null;
```

- [ ] **Step 5 : Ajouter `email` à `Client`**

Dans l'interface `Client` de `src/lib/types/index.ts`, ajouter :

```ts
  email?: string | null;
```

- [ ] **Step 6 : Vérifier TypeScript clean**

Run:
```bash
npx tsc --noEmit 2>&1 | head -10
```
Expected: aucune erreur. Note : les casts `as unknown as { individual_price?: number }` et `as unknown as { email?: string }` dans ResumeLearners/ResumeCompanies restent en place pour l'instant (ils seront retirés en Tâche 8 et 7 respectivement) — c'est attendu.

- [ ] **Step 7 : Commit**

```bash
git add src/lib/types/
git commit -m "feat(types): Enrollment.individual_price + Client.email

Champs présents en BDD (migrations add_individual_pricing et schema clients)
mais absents des interfaces TS. Permet de retirer les casts as unknown as
{ individual_price } et { email } dans ResumeLearners et ResumeCompanies
(Tâches 7 et 8)."
```

---

## Tâche 2 : Service `sessions.ts` étendu (updateSessionField + duplicateSession + deleteSession) + tests

**Files:**
- Modify: `src/lib/services/sessions.ts`
- Modify: `src/lib/services/__tests__/sessions.test.ts`

- [ ] **Step 1 : Lire le fichier de service existant**

Read: `src/lib/services/sessions.ts` (173 lignes). Le fichier exporte déjà `ServiceResult<T>` type, `getSessionIdsByClient`, `linkSessionToCompany`, `createSessionWithOptionalCompany`, `resolveCatalogPrice`, `updateSession` (sans entity_id — c'est notre dette M1).

Note : la fonction `updateSession` existante reste en place (utilisée par `ResumePriceHours` qui est hors scope de patchage). Notre nouvelle `updateSessionField` requiert explicitement `entityId` et est utilisée par les nouveaux consumers.

- [ ] **Step 2 : Lire les tests existants**

Read: `src/lib/services/__tests__/sessions.test.ts` (existant) — observer le pattern de mock Supabase utilisé.

- [ ] **Step 3 : Écrire les tests (failing first)**

Ajouter au fichier `src/lib/services/__tests__/sessions.test.ts` (à la fin) :

```ts
import {
  updateSessionField,
  duplicateSession,
  deleteSession,
} from "@/lib/services/sessions";

describe("updateSessionField", () => {
  it("filtre par id ET entity_id", async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = [];
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(function (col: string, val: unknown) {
            eqCalls.push({ col, val });
            return Object.assign(this, {
              eq: vi.fn(function (col2: string, val2: unknown) {
                eqCalls.push({ col: col2, val: val2 });
                return Promise.resolve({ error: null });
              }),
            });
          }),
        })),
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await updateSessionField(supabase as any, "SESS-1", "ENT-A", { description: "x" });
    expect(res.ok).toBe(true);
    expect(eqCalls).toContainEqual({ col: "id", val: "SESS-1" });
    expect(eqCalls).toContainEqual({ col: "entity_id", val: "ENT-A" });
  });

  it("retourne { ok: false, error: { message } } sur erreur Supabase", async () => {
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: { message: "DB error", code: "42P01" } })),
          })),
        })),
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await updateSessionField(supabase as any, "SESS-1", "ENT-A", { description: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toBe("DB error");
      expect(res.error.code).toBe("42P01");
    }
  });
});

describe("duplicateSession", () => {
  it("copie les champs source + suffixe (copie) + status='upcoming'", async () => {
    const source = {
      training_id: "T1", entity_id: "ENT-A", title: "Formation X",
      start_date: "2026-01-01", end_date: "2026-01-31", location: "Paris",
      mode: "presentiel", max_participants: 10, notes: null, type: "intra",
      domain: null, description: "desc", total_price: 1000, planned_hours: 14,
      program_id: null,
    };
    let inserted: Record<string, unknown> = {};
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "sessions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({ data: source, error: null })),
            insert: vi.fn((payload: Record<string, unknown>) => {
              inserted = payload;
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn(async () => ({ data: { id: "NEW-ID" }, error: null })),
              };
            }),
          };
        }
        return {};
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await duplicateSession(supabase as any, "SESS-1", "ENT-A");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.newId).toBe("NEW-ID");
    }
    expect(inserted.title).toBe("Formation X (copie)");
    expect(inserted.status).toBe("upcoming");
    expect(inserted.training_id).toBe("T1");
    expect(inserted.total_price).toBe(1000);
  });

  it("retourne erreur si session introuvable", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({ data: null, error: null })),
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await duplicateSession(supabase as any, "SESS-UNKNOWN", "ENT-A");
    expect(res.ok).toBe(false);
  });
});

describe("deleteSession", () => {
  it("exécute un seul DELETE filtré par id + entity_id", async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = [];
    const supabase = {
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(function (col: string, val: unknown) {
            eqCalls.push({ col, val });
            return Object.assign(this, {
              eq: vi.fn(function (col2: string, val2: unknown) {
                eqCalls.push({ col: col2, val: val2 });
                return Promise.resolve({ error: null });
              }),
            });
          }),
        })),
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await deleteSession(supabase as any, "SESS-1", "ENT-A");
    expect(res.ok).toBe(true);
    expect(eqCalls).toContainEqual({ col: "id", val: "SESS-1" });
    expect(eqCalls).toContainEqual({ col: "entity_id", val: "ENT-A" });
  });
});
```

- [ ] **Step 4 : Vérifier que les tests échouent**

Run:
```bash
npx vitest run src/lib/services/__tests__/sessions.test.ts 2>&1 | tail -10
```
Expected: tests failing — fonctions pas encore exportées.

- [ ] **Step 5 : Ajouter les 3 fonctions au service**

À la fin de `src/lib/services/sessions.ts` (avant `}` final si module style, sinon en fin de fichier) :

```ts
/**
 * UPDATE atomique d'un ou plusieurs champs d'une session.
 * Filtre par id ET entity_id (défense en profondeur, AR20).
 *
 * Utilisé par les sous-composants Résumé pour éditer description/location/manager/visio_link.
 * Renvoie ServiceResult pour que le caller affiche error.message dans le toast.
 */
export async function updateSessionField(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
  patch: Record<string, unknown>,
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("sessions")
    .update(patch)
    .eq("id", sessionId)
    .eq("entity_id", entityId);
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true };
}

/**
 * Duplique une session : copie 14 champs métier, suffixe ` (copie)` au titre,
 * status = "upcoming". Refuse si la session source n'appartient pas à entityId.
 * Renvoie l'id de la nouvelle session pour redirection.
 */
export async function duplicateSession(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult<{ newId: string }>> {
  const { data: src, error: readErr } = await supabase
    .from("sessions")
    .select(
      "training_id, entity_id, title, start_date, end_date, location, mode, max_participants, notes, type, domain, description, total_price, planned_hours, program_id",
    )
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .single();
  if (readErr || !src) {
    return { ok: false, error: { message: readErr?.message ?? "Session introuvable" } };
  }

  const payload = { ...src, title: `${src.title} (copie)`, status: "upcoming" };
  const { data, error } = await supabase
    .from("sessions")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: { message: error?.message ?? "Échec duplication" } };
  }
  return { ok: true, newId: data.id };
}

/**
 * Supprime une session. PostgreSQL gère le cleanup automatique selon les FKs :
 *   ON DELETE CASCADE → row supprimée :
 *     formation_trainers, formation_companies, formation_financiers,
 *     formation_comments, formation_time_slots, enrollments,
 *     qualiopi_snapshots, formation_invoices, formation_invoice_lines,
 *     formation_evaluation/satisfaction/elearning_assignments
 *   ON DELETE SET NULL → row conservée, session_id passé à NULL :
 *     signatures, documents, formation_documents, email_history,
 *     qualiopi_mock_audits, qualiopi_proof_checks, questionnaire_responses,
 *     generated_documents
 *
 * Le comportement SET NULL est intentionnel (préserve historique). Identique
 * au comportement du code avant cette refacto (qui ne supprimait pas non plus
 * ces tables) — pas de régression, juste atomicité gagnée.
 */
export async function deleteSession(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .eq("entity_id", entityId);
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true };
}
```

- [ ] **Step 6 : Vérifier que les tests passent**

Run:
```bash
npx vitest run src/lib/services/__tests__/sessions.test.ts 2>&1 | tail -8
```
Expected: tous les tests verts (anciens + nouveaux, total ≥ 6).

- [ ] **Step 7 : Vérifier l'ensemble (pas de régression)**

Run:
```bash
npx vitest run 2>&1 | tail -6
npx tsc --noEmit 2>&1 | head -5
```
Expected: ≥ 466 tests verts, TypeScript clean.

- [ ] **Step 8 : Commit**

```bash
git add src/lib/services/sessions.ts src/lib/services/__tests__/sessions.test.ts
git commit -m "feat(sessions): updateSessionField + duplicateSession + deleteSession

Trois nouvelles fonctions ajoutées au service src/lib/services/sessions.ts :

- updateSessionField(supabase, id, entityId, patch) — UPDATE filtré par
  id + entity_id, retour ServiceResult avec error.message exact. Remplace
  les UPDATE inline sans entity_id dans ResumeDescription/Location/Manager/
  VisioLink/Actions (5+ violations CLAUDE.md, cf deep-dive M1).
- duplicateSession(supabase, id, entityId) — copie 14 champs + suffixe titre
  + status='upcoming'. Refuse si session pas dans entityId. Remplace la
  duplication inline de ResumeActions.
- deleteSession(supabase, id, entityId) — un seul DELETE qui profite des FKs
  ON DELETE CASCADE/SET NULL. Remplace la boucle DELETE de 6 sub-tables
  dans ResumeDangerZone (cf deep-dive B2).

Note dette : updateSession (ancienne, sans entity_id, utilisée par
ResumePriceHours) reste en place — chantier ultérieur."
```

---

## Tâche 3 : Service `trainer-hours.ts` + tests

**Files:**
- Create: `src/lib/services/trainer-hours.ts`
- Create: `src/lib/services/__tests__/trainer-hours.test.ts`

- [ ] **Step 1 : Écrire les tests (failing first)**

Créer `src/lib/services/__tests__/trainer-hours.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { getTrainerStats } from "@/lib/services/trainer-hours";
import type { Session } from "@/lib/types";

function makeFormation(overrides: Partial<Session> = {}): Session {
  return {
    formation_trainers: [],
    formation_time_slots: [],
    signatures: [],
    ...overrides,
  } as Session;
}

describe("getTrainerStats", () => {
  it("aucune signature → hours=0, dates=[], slotCount=0", () => {
    const formation = makeFormation({
      formation_time_slots: [
        { id: "ts1", start_time: "2026-01-01T09:00:00Z", end_time: "2026-01-01T12:00:00Z" } as never,
      ],
    });
    const stats = getTrainerStats(formation, "TRAINER-1");
    expect(stats.hours).toBe(0);
    expect(stats.dates).toEqual([]);
    expect(stats.slotCount).toBe(0);
  });

  it("1 signature trainer sur slot 3h → hours=3, slotCount=1, 1 date", () => {
    const formation = makeFormation({
      formation_time_slots: [
        { id: "ts1", start_time: "2026-01-01T09:00:00Z", end_time: "2026-01-01T12:00:00Z" } as never,
      ],
      signatures: [
        { signer_id: "TRAINER-1", signer_type: "trainer", time_slot_id: "ts1" } as never,
      ],
    });
    const stats = getTrainerStats(formation, "TRAINER-1");
    expect(stats.hours).toBe(3);
    expect(stats.slotCount).toBe(1);
    expect(stats.dates).toHaveLength(1);
  });

  it("signatures d'un autre trainer ignorées", () => {
    const formation = makeFormation({
      formation_time_slots: [
        { id: "ts1", start_time: "2026-01-01T09:00:00Z", end_time: "2026-01-01T12:00:00Z" } as never,
      ],
      signatures: [
        { signer_id: "TRAINER-OTHER", signer_type: "trainer", time_slot_id: "ts1" } as never,
      ],
    });
    const stats = getTrainerStats(formation, "TRAINER-1");
    expect(stats.hours).toBe(0);
    expect(stats.slotCount).toBe(0);
  });

  it("signatures non-trainer (learner) ignorées", () => {
    const formation = makeFormation({
      formation_time_slots: [
        { id: "ts1", start_time: "2026-01-01T09:00:00Z", end_time: "2026-01-01T12:00:00Z" } as never,
      ],
      signatures: [
        { signer_id: "TRAINER-1", signer_type: "learner", time_slot_id: "ts1" } as never,
      ],
    });
    const stats = getTrainerStats(formation, "TRAINER-1");
    expect(stats.hours).toBe(0);
  });

  it("plusieurs slots et signatures → hours additionnées, dates dédupliquées", () => {
    const formation = makeFormation({
      formation_time_slots: [
        { id: "ts1", start_time: "2026-01-01T09:00:00Z", end_time: "2026-01-01T12:00:00Z" } as never,
        { id: "ts2", start_time: "2026-01-01T14:00:00Z", end_time: "2026-01-01T17:00:00Z" } as never,
        { id: "ts3", start_time: "2026-01-02T09:00:00Z", end_time: "2026-01-02T11:30:00Z" } as never,
      ],
      signatures: [
        { signer_id: "TRAINER-1", signer_type: "trainer", time_slot_id: "ts1" } as never,
        { signer_id: "TRAINER-1", signer_type: "trainer", time_slot_id: "ts2" } as never,
        { signer_id: "TRAINER-1", signer_type: "trainer", time_slot_id: "ts3" } as never,
      ],
    });
    const stats = getTrainerStats(formation, "TRAINER-1");
    expect(stats.hours).toBe(8.5); // 3 + 3 + 2.5
    expect(stats.slotCount).toBe(3);
    expect(stats.dates).toHaveLength(2); // 01/01 + 02/01
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run:
```bash
npx vitest run src/lib/services/__tests__/trainer-hours.test.ts 2>&1 | tail -10
```
Expected: erreur d'import — la lib n'existe pas encore.

- [ ] **Step 3 : Créer la lib**

Créer `src/lib/services/trainer-hours.ts` :

```ts
/**
 * Calcule les heures réalisées d'un formateur sur une session en réconciliant
 * les signatures d'émargement (signer_type='trainer') avec les time_slots.
 *
 * Source de vérité unique remplaçant la fonction inline `getTrainerStats`
 * du composant ResumeTrainers (extraction pour testabilité).
 *
 * Pure — pas de Supabase, opère sur les relations déjà chargées de la session.
 */

import type { Session } from "@/lib/types";

export interface TrainerStats {
  /** Heures cumulées, arrondi à 0.1 près. */
  hours: number;
  /** Dates uniques (format JJ/MM/AAAA, fuseau Europe/Paris) où le trainer a signé. */
  dates: string[];
  /** Nombre de slots signés. */
  slotCount: number;
}

export function getTrainerStats(
  formation: Pick<Session, "formation_time_slots" | "signatures">,
  trainerId: string,
): TrainerStats {
  const signatures = formation.signatures ?? [];
  const timeSlots = formation.formation_time_slots ?? [];

  const signedSlotIds = signatures
    .filter((s) => s.signer_id === trainerId && s.signer_type === "trainer")
    .map((s) => s.time_slot_id);

  const signedSlots = timeSlots.filter((ts) => signedSlotIds.includes(ts.id));

  let totalHours = 0;
  const dates = new Set<string>();

  for (const slot of signedSlots) {
    const start = new Date(slot.start_time);
    const end = new Date(slot.end_time);
    totalHours += (end.getTime() - start.getTime()) / 3600000;
    dates.add(
      start.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Europe/Paris",
      }),
    );
  }

  return {
    hours: Math.round(totalHours * 10) / 10,
    dates: [...dates].sort(),
    slotCount: signedSlots.length,
  };
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run:
```bash
npx vitest run src/lib/services/__tests__/trainer-hours.test.ts 2>&1 | tail -6
```
Expected: 5 passed.

- [ ] **Step 5 : Suite complète + tsc**

Run:
```bash
npx vitest run 2>&1 | tail -6
npx tsc --noEmit 2>&1 | head -5
```
Expected: ≥ 471 tests verts, TypeScript clean.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/services/trainer-hours.ts src/lib/services/__tests__/trainer-hours.test.ts
git commit -m "feat(trainer-hours): extraction getTrainerStats en lib testable

Avant : fonction inline dans ResumeTrainers.tsx:46-68 (intestable sans monter
React, dépendant de l'état du composant).

Après : src/lib/services/trainer-hours.ts pure, prend en paramètre la session
et le trainerId. Reproduit le shape de retour exact (hours, dates, slotCount).
5 tests Vitest couvrent : 0 signature, signature partielle, autre trainer,
non-trainer (learner), multiples slots/dates.

Remplacement dans ResumeTrainers en Tâche 12."
```

---

## Tâche 4 : Service `sendVisioLinkToLearners` + tests

**Files:**
- Modify: `src/lib/services/sessions.ts`
- Modify: `src/lib/services/__tests__/sessions.test.ts`

- [ ] **Step 1 : Écrire les tests (failing first)**

Ajouter à la fin de `src/lib/services/__tests__/sessions.test.ts` :

```ts
import { sendVisioLinkToLearners } from "@/lib/services/sessions";

describe("sendVisioLinkToLearners", () => {
  it("refuse si visio_link absent", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({
          data: { id: "S1", title: "F", start_date: "2026-01-01", end_date: "2026-01-31", location: null, visio_link: null, entity_id: "ENT-A" },
          error: null,
        })),
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await sendVisioLinkToLearners(supabase as any, "S1", "ENT-A");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain("visio");
    }
  });

  it("refuse si session pas dans entityId", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({ data: null, error: null })),
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await sendVisioLinkToLearners(supabase as any, "S1", "ENT-A");
    expect(res.ok).toBe(false);
  });

  it("0 learners inscrits avec email → enqueued=0, skipped=0", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "sessions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({
              data: { id: "S1", title: "F", start_date: "2026-01-01", end_date: "2026-01-31", location: "Paris", visio_link: "https://meet.example.com/abc", entity_id: "ENT-A" },
              error: null,
            })),
          };
        }
        if (table === "enrollments") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn(() => Promise.resolve({ data: [], error: null })),
          };
        }
        return {};
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await sendVisioLinkToLearners(supabase as any, "S1", "ENT-A");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.enqueued).toBe(0);
      expect(res.skipped).toBe(0);
    }
  });

  it("learner sans email → skipped=1", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "sessions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({
              data: { id: "S1", title: "F", start_date: "2026-01-01", end_date: "2026-01-31", location: null, visio_link: "https://meet.example.com/abc", entity_id: "ENT-A" },
              error: null,
            })),
          };
        }
        if (table === "enrollments") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn(() => Promise.resolve({
              data: [{ learner: { id: "L1", email: null, first_name: "Jean", last_name: "Dupont" } }],
              error: null,
            })),
          };
        }
        if (table === "email_history") {
          // enqueueEmail s'appuie sur email_history. Pas atteint dans ce test.
          return { insert: vi.fn(() => Promise.resolve({ data: null, error: null })) };
        }
        return {};
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await sendVisioLinkToLearners(supabase as any, "S1", "ENT-A");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.enqueued).toBe(0);
      expect(res.skipped).toBe(1);
    }
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run:
```bash
npx vitest run src/lib/services/__tests__/sessions.test.ts 2>&1 | tail -10
```
Expected: tests failing — `sendVisioLinkToLearners` pas encore exportée.

- [ ] **Step 3 : Ajouter la fonction au service**

À la fin de `src/lib/services/sessions.ts`, ajouter (au-dessous de `deleteSession`) :

```ts
import { enqueueEmail } from "@/lib/services/email-queue";

/**
 * Envoie le lien visio à tous les apprenants inscrits (registered/confirmed)
 * d'une session via la queue email (asynchrone, retry inclus).
 *
 * Retourne { enqueued, skipped } : enqueued = emails ajoutés à email_history,
 * skipped = learners sans email ou échec d'enqueue.
 *
 * Pré-conditions :
 *  - La session existe et appartient à entityId (défense en profondeur)
 *  - La session a un visio_link non vide
 */
export async function sendVisioLinkToLearners(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult<{ enqueued: number; skipped: number }>> {
  // 1. Charger la session avec check entity_id + visio_link
  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .select("id, title, start_date, end_date, location, visio_link, entity_id")
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .single();
  if (sessErr || !session) {
    return { ok: false, error: { message: sessErr?.message ?? "Session introuvable" } };
  }
  if (!session.visio_link) {
    return { ok: false, error: { message: "Aucun lien visio configuré pour cette formation" } };
  }

  // 2. Charger les enrollments avec learner inscrit (status registered/confirmed)
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("learner:learners!enrollments_learner_id_fkey(id, email, first_name, last_name)")
    .eq("session_id", sessionId)
    .in("status", ["registered", "confirmed"]);

  let enqueued = 0;
  let skipped = 0;

  for (const e of enrollments ?? []) {
    const l = e.learner as unknown as {
      id: string;
      email: string | null;
      first_name: string;
      last_name: string;
    } | null;
    if (!l?.email) {
      skipped++;
      continue;
    }

    const subject = `Lien visio — ${session.title}`;
    const body = `Bonjour ${l.first_name},

Voici le lien pour rejoindre la formation "${session.title}" en visio :

${session.visio_link}

Dates : du ${session.start_date} au ${session.end_date}${session.location ? `
Lieu : ${session.location}` : ""}

À bientôt,
L'équipe de formation`;

    try {
      await enqueueEmail(supabase, {
        to: l.email,
        subject,
        body,
        entity_id: entityId,
        session_id: sessionId,
        recipient_type: "learner",
        recipient_id: l.id,
      });
      enqueued++;
    } catch {
      skipped++;
    }
  }

  return { ok: true, enqueued, skipped };
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run:
```bash
npx vitest run src/lib/services/__tests__/sessions.test.ts 2>&1 | tail -8
```
Expected: tous les tests verts (sessions + nouveaux 4 sendVisio).

- [ ] **Step 5 : Suite complète**

Run:
```bash
npx vitest run 2>&1 | tail -6
npx tsc --noEmit 2>&1 | head -5
```
Expected: ≥ 475 tests verts, TypeScript clean.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/services/sessions.ts src/lib/services/__tests__/sessions.test.ts
git commit -m "feat(sessions): sendVisioLinkToLearners — envoi async via email_queue

Service pour l'envoi du lien visio aux apprenants inscrits :
- Pré-conditions : session existante + appartenance entityId + visio_link non vide
- Itère sur enrollments (status registered/confirmed)
- Sujet/corps codés en dur avec variables (FR, simple, modifiable plus tard)
- Enqueue dans email_history via service email-queue existant (asynchrone,
  retry exponentiel géré par le worker /api/emails/process-scheduled)
- Retourne { enqueued, skipped }

Consumer : Tâche 5 ajoute la route POST /api/sessions/[id]/send-visio-link,
Tâche 13 connecte le bouton « Envoyer » dans ResumeVisioLink.

4 tests : visio_link absent, session pas dans entityId, 0 enrollments,
learner sans email."
```

---

## Tâche 5 : Route API `/api/sessions/[id]/send-visio-link`

**Files:**
- Create: `src/app/api/sessions/[id]/send-visio-link/route.ts`

- [ ] **Step 1 : Créer la route**

Créer `src/app/api/sessions/[id]/send-visio-link/route.ts` :

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { sendVisioLinkToLearners } from "@/lib/services/sessions";

const Params = z.object({ id: z.string().uuid() });

/**
 * POST /api/sessions/[id]/send-visio-link
 *
 * Déclenché par le bouton « Envoyer » du composant ResumeVisioLink.
 * Auth : admin / super_admin / trainer (cohérent avec les autres routes
 * d'écriture sur les sessions du module Formation).
 *
 * Délègue à src/lib/services/sessions.ts:sendVisioLinkToLearners qui
 * gère la logique métier (check entity_id, itération enrollments, enqueue).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["admin", "super_admin", "trainer"]);
  if (auth.error) return auth.error;

  const parsed = Params.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "session_id invalide" }, { status: 400 });
  }

  const result = await sendVisioLinkToLearners(
    auth.supabase,
    parsed.data.id,
    auth.profile.entity_id,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    enqueued: result.enqueued,
    skipped: result.skipped,
  });
}
```

- [ ] **Step 2 : Vérifier TypeScript clean + suite tests**

Run:
```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -6
```
Expected: TypeScript clean, suite ≥ 475 verts.

- [ ] **Step 3 : Commit**

```bash
git add src/app/api/sessions/
git commit -m "feat(api): POST /api/sessions/[id]/send-visio-link

Route déclenchée par le bouton « Envoyer le lien visio par email » dans
ResumeVisioLink (Tâche 13).

- Auth : requireRole(['admin','super_admin','trainer'])
- Body : params { id } validé Zod en UUID
- Délègue à src/lib/services/sessions.ts:sendVisioLinkToLearners
- Retour : { success, enqueued, skipped } ou { error } 400/500"
```

---

## Tâche 6 : Refactor `ResumeDangerZone` (1 seul DELETE via deleteSession)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeDangerZone.tsx`

- [ ] **Step 1 : Remplacer la cascade manuelle par deleteSession**

Read `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeDangerZone.tsx` (76 lignes) pour vérifier la structure actuelle, puis remplacer le bloc `handleDelete` (lignes ~26-49) par :

```ts
import { deleteSession } from "@/lib/services/sessions";

// ... (autres imports inchangés)

const handleDelete = async () => {
  setDeleting(true);
  const result = await deleteSession(supabase, formation.id, formation.entity_id);
  setDeleting(false);
  if (!result.ok) {
    toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    return;
  }
  toast({ title: "Formation supprimée" });
  router.push("/admin/sessions");
};
```

Supprimer :
- Le tableau `const tables = [...]`
- La boucle `for (const table of tables)`
- Le DELETE inline sur `sessions`
- Le try/catch (remplacé par le pattern result.ok)

- [ ] **Step 2 : Vérifier qu'il ne reste plus de DELETE inline**

Run:
```bash
grep -n "delete\(\)\|tables = " src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeDangerZone.tsx
```
Expected: 0 résultat.

- [ ] **Step 3 : Vérifier compilation + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -6
```
Expected: clean.

- [ ] **Step 4 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeDangerZone.tsx
git commit -m "fix(resume-danger): un seul DELETE via deleteSession (résout B2)

Avant : boucle DELETE sur 6 sub-tables hardcodées (formation_time_slots,
formation_trainers, formation_companies, formation_financiers,
formation_comments, enrollments) avant DELETE session. Risque de partial
deletion si une table échoue (pas de transaction). Liste incomplète
(oubliait formation_documents, signatures, qualiopi_*, email_history, etc.).

Après : un seul appel deleteSession(supabase, id, entityId). PostgreSQL
CASCADE supprime atomiquement les 11 tables marquées ON DELETE CASCADE.
Les tables SET NULL conservent leurs rows avec session_id=NULL (préservation
de l'historique — comportement intentionnel et identique au code précédent
qui ne les supprimait pas non plus)."
```

---

## Tâche 7 : Refactor `ResumeCompanies` (entity_id contacts + retrait casts)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeCompanies.tsx`

- [ ] **Step 1 : Ajouter entity_id sur le fetch contacts**

Dans `ResumeCompanies.tsx`, localiser le bloc `supabase.from("contacts")` (autour de la ligne 65) :

```ts
const { data: contactsData } = await supabase
  .from("contacts")
  .select("id, email, first_name, last_name, is_primary")
  .eq("client_id", clientId);
```

Le remplacer par :

```ts
const { data: contactsData } = await supabase
  .from("contacts")
  .select("id, email, first_name, last_name, is_primary")
  .eq("client_id", clientId)
  .eq("entity_id", formation.entity_id);
```

- [ ] **Step 2 : Retirer les casts `as unknown as { individual_price }`**

Localiser les casts (autour des lignes 82-84) :

```ts
const ip = (e as unknown as { individual_price?: number }).individual_price;
```

Maintenant que `Enrollment.individual_price?` existe (Tâche 1), remplacer par :

```ts
const ip = e.individual_price;
```

Idem pour toute autre occurrence du cast `as unknown as { individual_price }` dans le fichier.

- [ ] **Step 3 : Retirer les casts `as unknown as { email }`**

Localiser les casts (autour des lignes 117-118) :

```ts
if (!suggestedEmail && (client as unknown as { email?: string }).email) {
  suggestedEmail = (client as unknown as { email: string }).email;
}
```

Maintenant que `Client.email?` existe (Tâche 1), remplacer par :

```ts
if (!suggestedEmail && client.email) {
  suggestedEmail = client.email;
}
```

- [ ] **Step 4 : Vérifier qu'aucun cast résiduel**

Run:
```bash
grep -n "as unknown as" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeCompanies.tsx
```
Expected: 0 résultat sur les patterns `individual_price` et `email`. (D'autres casts inoffensifs peuvent rester.)

- [ ] **Step 5 : Vérifier tsc + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -6
```
Expected: clean.

- [ ] **Step 6 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeCompanies.tsx
git commit -m "fix(resume-companies): entity_id sur contacts + retrait casts (B1 + B3)

- B1 : fetch contacts filtré par entity_id (était client_id seulement). La
  table contacts a une colonne entity_id ; sur env RLS allow_all (constaté
  en prod), un client partagé entre entités aurait fait fuiter les contacts.
- B3 : retrait casts as unknown as { individual_price } et as unknown as
  { email } — les types Enrollment.individual_price et Client.email ont
  été ajoutés en Tâche 1."
```

---

## Tâche 8 : Refactor `ResumeLearners` (retrait casts + bulk send visibility + await)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeLearners.tsx`

- [ ] **Step 1 : Retirer les casts `as unknown as { individual_price }`**

Dans `ResumeLearners.tsx`, localiser les casts (autour des lignes 277-284) :

```ts
{(e as unknown as { individual_price?: number }).individual_price != null && (
  {((e as unknown as { individual_price: number }).individual_price).toLocaleString("fr-FR")} €
)}
```

Remplacer par :

```ts
{e.individual_price != null && (
  {e.individual_price.toLocaleString("fr-FR")} €
)}
```

Audit local :
```bash
grep -n "as unknown as { individual_price" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeLearners.tsx
```
Expected: 0 résultat.

- [ ] **Step 2 : Visibility bulk send-welcome**

Localiser le bloc `handleSendAccessToAll` (autour de la ligne 315) qui contient le `for` loop avec `} catch { /* skip */ }`. Le remplacer par :

```ts
const handleSendAccessToAll = async () => {
  setSending(true);
  let succeeded = 0;
  let failed = 0;
  for (const learner of learnersWithEmail) {
    try {
      const res = await fetch(`/api/learners/${learner.id}/send-welcome`, { method: "POST" });
      if (res.ok) succeeded++;
      else failed++;
    } catch {
      failed++;
    }
  }
  setSending(false);
  toast({
    title: `${succeeded} email(s) envoyé(s)`,
    description: failed > 0 ? `${failed} échec(s) — vérifiez les logs` : undefined,
    variant: failed > 0 ? "destructive" : "default",
  });
};
```

(Adapter aux noms réels de variables locales : `sending`, `learnersWithEmail` — vérifier dans le fichier.)

- [ ] **Step 3 : Audit transverse `onRefresh` sans await**

Localiser dans le fichier toutes les occurrences `onRefresh();` sans `await` (3 attendues d'après le deep-dive : ~lignes 131, 179, 329). Pour chacune, ajouter `await` :

```ts
// avant : onRefresh();
// après : await onRefresh();
```

Run après modification :
```bash
grep -nE "^\s+onRefresh\(\);" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeLearners.tsx
```
Expected: 0 résultat (toutes précédées de `await`).

- [ ] **Step 4 : Vérifier tsc + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -6
```
Expected: clean.

- [ ] **Step 5 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeLearners.tsx
git commit -m "fix(resume-learners): retrait casts + bulk send visibility + await onRefresh

- Retrait des casts as unknown as { individual_price } (Enrollment.individual_price
  désormais typé en Tâche 1).
- Bulk send-welcome : compteur succeeded/failed visible dans le toast final
  (au lieu du catch vide qui swallow les errors silencieusement, cf deep-dive M5).
- await onRefresh() ajouté aux 3 handlers (cf deep-dive M2)."
```

---

## Tâche 9 : Refactor `ResumeDescription` + `ResumeLocation` + `ResumeManager`

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeDescription.tsx`
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeLocation.tsx`
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeManager.tsx`

- [ ] **Step 1 : Refactor `ResumeDescription`**

Remplacer le contenu du composant `ResumeDescription` par :

```tsx
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { updateSessionField } from "@/lib/services/sessions";
import type { Session } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeDescription({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(formation.description || "");
  const [saving, setSaving] = useState(false);

  // Re-sync draft depuis la prop quand on n'édite pas (au mount, au cancel, après save).
  useEffect(() => {
    if (!editing) setDescription(formation.description || "");
  }, [formation.description, editing]);

  const handleSave = async () => {
    setSaving(true);
    const result = await updateSessionField(supabase, formation.id, formation.entity_id, { description });
    setSaving(false);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Description mise à jour" });
    setEditing(false);
    await onRefresh();
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Description</h3>
      {editing ? (
        <div className="space-y-3">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Description de la formation..."
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1" /> Enregistrer
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              <X className="h-4 w-4 mr-1" /> Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm whitespace-pre-wrap">
            {formation.description || "Aucune description"}
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditing(true)}>
            Modifier
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Refactor `ResumeLocation`**

Modifier `ResumeLocation.tsx` :

(a) Ajouter en tête : `import { updateSessionField } from "@/lib/services/sessions";`

(b) Ajouter le useEffect cancel-reset (après les `useState`) :
```ts
useEffect(() => {
  if (!editing) {
    setMode(formation.mode);
    setLocation(formation.location || "");
  }
}, [formation.mode, formation.location, editing]);
```

(c) Remplacer le bloc `handleSave` actuel par :
```ts
const handleSave = async () => {
  setSaving(true);
  const result = await updateSessionField(
    supabase, formation.id, formation.entity_id,
    { mode, location },
  );
  setSaving(false);
  if (!result.ok) {
    toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    return;
  }
  toast({ title: "Emplacement mis à jour" });
  setEditing(false);
  await onRefresh();
};
```

(d) Ajouter l'import de useEffect si absent : `import { useState, useEffect } from "react";`

- [ ] **Step 3 : Refactor `ResumeManager`**

Modifier `ResumeManager.tsx` :

(a) Ajouter en tête : `import { updateSessionField } from "@/lib/services/sessions";`

(b) Remplacer le bloc `handleSave` actuel par :
```ts
const handleSave = async () => {
  setSaving(true);
  const result = await updateSessionField(
    supabase, formation.id, formation.entity_id,
    { manager_id: selectedManager || null },
  );
  setSaving(false);
  if (!result.ok) {
    toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    return;
  }
  toast({ title: "Manager mis à jour" });
  await onRefresh();
};
```

- [ ] **Step 4 : Vérifier tsc + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -6
```
Expected: clean.

- [ ] **Step 5 : Vérifier qu'il ne reste plus de pattern incorrect**

Run :
```bash
grep -nE "update\(\{ description \}\)|update\(\{ mode, location \}\)|update\(\{ manager_id" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/Resume{Description,Location,Manager}.tsx
```
Expected: 0 résultat (les 3 fichiers utilisent désormais updateSessionField).

- [ ] **Step 6 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeDescription.tsx src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeLocation.tsx src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeManager.tsx
git commit -m "refactor(resume-editors): updateSessionField + cancel-reset drafts + visibility

Description, Location, Manager (3 sous-composants éditeurs simples) :
- handleSave passe par updateSessionField (filtre entity_id, M1 résolu)
- useEffect cancel-reset : draft re-synchronisé depuis la prop quand on
  n'édite pas (au cancel, le brouillon ne persiste plus)
- toast d'erreur avec error.message exact (M7 résolu)
- await onRefresh() (M2 résolu)"
```

---

## Tâche 10 : Refactor `ResumeVisioLink` (Zod URL + cancel-reset — pas encore le bouton « Envoyer »)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeVisioLink.tsx`

Note : la construction du bouton « Envoyer » fonctionnel arrive en Tâche 13. Cette tâche se concentre sur la persistance + validation Zod URL.

- [ ] **Step 1 : Refactor handleSave avec Zod URL + updateSessionField + cancel-reset**

Remplacer `ResumeVisioLink.tsx` par :

```tsx
"use client";

import { useState, useEffect } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { updateSessionField } from "@/lib/services/sessions";
import type { Session } from "@/lib/types";

const VisioUrlSchema = z.union([
  z.literal(""),
  z.string().url({ message: "URL invalide (https://meet.google.com/... ou https://zoom.us/...)" }),
]);

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeVisioLink({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [visioLink, setVisioLink] = useState(formation.visio_link || "");
  const [saving, setSaving] = useState(false);

  // Re-sync depuis la prop si elle change (pour le moment, formation.visio_link
  // est stable mais on garde le pattern pour cohérence avec les autres éditeurs).
  useEffect(() => {
    setVisioLink(formation.visio_link || "");
  }, [formation.visio_link]);

  const handleSave = async () => {
    const parsed = VisioUrlSchema.safeParse(visioLink);
    if (!parsed.success) {
      toast({
        title: "URL invalide",
        description: parsed.error.errors[0]?.message,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const result = await updateSessionField(
      supabase, formation.id, formation.entity_id,
      { visio_link: parsed.data || null },
    );
    setSaving(false);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Lien de visio mis à jour" });
    await onRefresh();
  };

  // Bouton « Envoyer » : rendu désactivé pour cette tâche.
  // Tâche 13 le rendra fonctionnel (confirm dialog + fetch route API).

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Lien de la Visio</h3>
      <p className="text-xs text-muted-foreground">
        Notez ici l&apos;URL de la salle virtuelle (Zoom, Google Meet...). Le lien sera visible dans le compte de l&apos;apprenant.
      </p>
      <div className="flex items-center gap-2">
        <Input
          value={visioLink}
          onChange={(e) => setVisioLink(e.target.value)}
          placeholder="https://meet.google.com/..."
          className="flex-1"
        />
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1" /> Ajouter / Modifier
        </Button>
        {formation.visio_link && (
          <Button size="sm" variant="outline" disabled title="Implémentation en Tâche 13">
            <Send className="h-4 w-4 mr-1" /> Envoyer
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier tsc + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -6
```
Expected: clean.

- [ ] **Step 3 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeVisioLink.tsx
git commit -m "refactor(resume-visio): Zod URL + updateSessionField + cancel-reset

- VisioUrlSchema (z.union vide ou url) valide l'URL avant l'update (M8 résolu)
- handleSave passe par updateSessionField (entity_id filter, M1)
- toast error avec parsed.error.errors[0].message ou result.error.message
- await onRefresh() (M2)
- Bouton « Envoyer » : disabled pour le moment, sera connecté en Tâche 13."
```

---

## Tâche 11 : Refactor `ResumeActions` (duplicateSession + retrait Historique + entity_id sur start)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeActions.tsx`

- [ ] **Step 1 : Refactor complet**

Remplacer `ResumeActions.tsx` par :

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Copy, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { duplicateSession, updateSessionField } from "@/lib/services/sessions";
import type { Session } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeActions({ formation, onRefresh }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();
  const [duplicating, setDuplicating] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [starting, setStarting] = useState(false);

  const handleDuplicate = async () => {
    setDuplicating(true);
    const result = await duplicateSession(supabase, formation.id, formation.entity_id);
    setDuplicating(false);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Formation dupliquée" });
    setConfirmDuplicate(false);
    router.push(`/admin/formations/${result.newId}`);
  };

  const handleStart = async () => {
    setStarting(true);
    const result = await updateSessionField(
      supabase, formation.id, formation.entity_id,
      { status: "in_progress" },
    );
    setStarting(false);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Formation démarrée" });
    await onRefresh();
  };

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {formation.status === "upcoming" && (
            <Button size="sm" onClick={handleStart} disabled={starting} className="bg-orange-400 hover:bg-orange-500 text-white">
              {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />} Commencer
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setConfirmDuplicate(true)}>
            <Copy className="h-4 w-4 mr-2" /> Dupliquer
          </Button>
        </div>
        {/* Bouton « Historique » retiré (deep-dive M3 : stub « Fonctionnalité à venir »). */}
      </div>

      <Dialog open={confirmDuplicate} onOpenChange={setConfirmDuplicate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Dupliquer cette formation ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Une copie de la formation sera créée avec le statut &quot;À venir&quot;.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDuplicate(false)}>Annuler</Button>
            <Button onClick={handleDuplicate} disabled={duplicating}>
              {duplicating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Dupliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2 : Vérifier que « Historique » a bien disparu + tests**

Run:
```bash
grep -n "Historique\|History" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeActions.tsx
```
Expected: 0 résultat (l'import `History` et le bouton sont retirés).

```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -6
```
Expected: clean.

- [ ] **Step 3 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeActions.tsx
git commit -m "refactor(resume-actions): duplicateSession service + retrait Historique

- handleDuplicate : passe par duplicateSession service (au lieu d'inline)
- handleStart : passe par updateSessionField (filtre entity_id)
- Retrait du bouton « Historique » qui était un stub « Fonctionnalité à
  venir » depuis le départ (deep-dive M3). Si la feature est demandée plus
  tard, elle sera construite à part.
- Import History de lucide-react retiré."
```

---

## Tâche 12 : Refactor `ResumeFinanciers` (.eq session_id + await onRefresh)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeFinanciers.tsx`

- [ ] **Step 1 : Ajouter `.eq("session_id", ...)` sur tous les UPDATE formation_financiers**

Localiser tous les `supabase.from("formation_financiers").update(...).eq("id", ...)` dans le fichier (probablement dans `updateStatus(id, status, extra)` autour de la ligne 147).

Pour chaque occurrence, ajouter `.eq("session_id", formation.id)` :

```ts
const { error } = await supabase
  .from("formation_financiers")
  .update({ status, updated_at: new Date().toISOString(), ...extra })
  .eq("id", id)
  .eq("session_id", formation.id);  // ← AJOUT (défense en profondeur, cohérent avec delete)
```

- [ ] **Step 2 : `await onRefresh()` dans tous les handlers**

Audit local :
```bash
grep -nE "^\s+onRefresh\(\);" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeFinanciers.tsx
```

Pour chaque résultat, ajouter `await` devant.

Re-run pour vérifier :
```bash
grep -nE "^\s+onRefresh\(\);" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeFinanciers.tsx
```
Expected: 0 résultat.

- [ ] **Step 3 : Vérifier tsc + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -6
```
Expected: clean.

- [ ] **Step 4 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeFinanciers.tsx
git commit -m "fix(resume-financiers): .eq(session_id) + await onRefresh (M10, M2)

- M10 : tous les UPDATE formation_financiers ajoutent .eq('session_id',
  formation.id) en complément de .eq('id', id). Défense en profondeur
  cohérente avec le pattern delete (lignes ~129 d'origine).
- M2 : await onRefresh() dans les 5 transitions OPCO."
```

---

## Tâche 13 : Refactor `ResumeTrainers` (getTrainerStats via service + await + suggestion IA error.message)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeTrainers.tsx`

- [ ] **Step 1 : Importer le service trainer-hours et supprimer la fonction inline**

Au début du fichier, ajouter :
```ts
import { getTrainerStats } from "@/lib/services/trainer-hours";
```

Supprimer la fonction inline `getTrainerStats(trainerId)` (autour des lignes 46-68 d'origine). Supprimer également les déclarations `const signatures = formation.signatures || [];` et `const timeSlots = formation.formation_time_slots || [];` (lignes 42-43 d'origine) — ces variables ne sont plus utilisées localement après extraction (la lib les lit directement depuis `formation`).

Si elles sont utilisées ailleurs dans le composant, les conserver. Vérifier avec :
```bash
grep -nE "(?<![a-zA-Z])(signatures|timeSlots)\b" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeTrainers.tsx
```
Si plus d'usage hors getTrainerStats → supprimer. Sinon → conserver.

- [ ] **Step 2 : Adapter les call sites**

Tous les appels `getTrainerStats(ft.trainer.id)` (autour de la ligne 154) deviennent `getTrainerStats(formation, ft.trainer.id)`. Audit local :
```bash
grep -n "getTrainerStats(" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeTrainers.tsx
```
Tous les call sites doivent avoir 2 arguments.

- [ ] **Step 3 : `await onRefresh()` dans tous les handlers**

```bash
grep -nE "^\s+onRefresh\(\);" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeTrainers.tsx
```
Ajouter `await` à chaque occurrence.

- [ ] **Step 4 : Améliorer le catch d'erreur sur le fetch suggestions IA**

Localiser le bloc `} catch { toast({...}); }` (autour des lignes 265-266) sur le fetch `/api/ai/match-trainer`. Le remplacer par :
```ts
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : "Erreur suggestions IA";
  toast({ title: "Erreur", description: message, variant: "destructive" });
}
```

- [ ] **Step 5 : Vérifier tsc + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -6
```
Expected: clean.

- [ ] **Step 6 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeTrainers.tsx
git commit -m "refactor(resume-trainers): getTrainerStats via service + await + visibility IA

- Extraction de getTrainerStats vers @/lib/services/trainer-hours (M11 résolu)
- await onRefresh() après insert/delete formation_trainers (M2)
- Catch fetch IA inclut error.message dans le toast (M7)"
```

---

## Tâche 14 : Bouton « Envoyer le lien visio par email » fonctionnel

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeVisioLink.tsx`

- [ ] **Step 1 : Compléter `ResumeVisioLink.tsx` avec le confirm dialog + handler**

Remplacer entièrement `ResumeVisioLink.tsx` (qui était partiellement implémenté en Tâche 10) par :

```tsx
"use client";

import { useState, useEffect } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Save, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { updateSessionField } from "@/lib/services/sessions";
import type { Session } from "@/lib/types";

const VisioUrlSchema = z.union([
  z.literal(""),
  z.string().url({ message: "URL invalide (https://meet.google.com/... ou https://zoom.us/...)" }),
]);

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeVisioLink({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [visioLink, setVisioLink] = useState(formation.visio_link || "");
  const [saving, setSaving] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setVisioLink(formation.visio_link || "");
  }, [formation.visio_link]);

  const handleSave = async () => {
    const parsed = VisioUrlSchema.safeParse(visioLink);
    if (!parsed.success) {
      toast({
        title: "URL invalide",
        description: parsed.error.errors[0]?.message,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const result = await updateSessionField(
      supabase, formation.id, formation.entity_id,
      { visio_link: parsed.data || null },
    );
    setSaving(false);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Lien de visio mis à jour" });
    await onRefresh();
  };

  const handleSendVisio = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/sessions/${formation.id}/send-visio-link`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      toast({
        title: `${data.enqueued} email(s) en file`,
        description: data.skipped > 0
          ? `${data.skipped} apprenant(s) sans email ignoré(s)`
          : undefined,
      });
      setConfirmSend(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Lien de la Visio</h3>
        <p className="text-xs text-muted-foreground">
          Notez ici l&apos;URL de la salle virtuelle (Zoom, Google Meet...). Le lien sera visible dans le compte de l&apos;apprenant.
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={visioLink}
            onChange={(e) => setVisioLink(e.target.value)}
            placeholder="https://meet.google.com/..."
            className="flex-1"
          />
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> Ajouter / Modifier
          </Button>
          {formation.visio_link && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmSend(true)}
              disabled={sending}
            >
              <Send className="h-4 w-4 mr-1" /> Envoyer
            </Button>
          )}
        </div>
      </div>

      <Dialog open={confirmSend} onOpenChange={setConfirmSend}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Envoyer le lien visio aux apprenants ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Un email contenant le lien visio sera envoyé à tous les apprenants inscrits
            (statut « inscrit » ou « confirmé »).
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSend(false)}>Annuler</Button>
            <Button onClick={handleSendVisio} disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2 : Vérifier tsc + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -6
```
Expected: clean.

- [ ] **Step 3 : Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeVisioLink.tsx
git commit -m "feat(resume-visio): bouton « Envoyer » fonctionnel via email_queue

- Bouton « Envoyer » ouvre un confirm dialog
- Au confirm : POST /api/sessions/[id]/send-visio-link (Tâche 5)
- Toast avec compteur enqueued + skipped pour visibility utilisateur
- AbortController non requis (POST court, pas de risque unmount-during-fetch)
- M4 résolu (bouton « Fonctionnalité à venir » devient fonctionnel)"
```

---

## Tâche 15 : Vérification finale

**Files:** aucun (vérifications uniquement).

- [ ] **Step 1 : Suite complète**

Run:
```bash
npx vitest run 2>&1 | tail -8
```
Expected: ≥ 475 tests verts (461 baseline + 14 nouveaux : 4 sessions + 4 sendVisio + 5 trainer-hours + 1 autres ajustements). Tout vert.

- [ ] **Step 2 : TypeScript clean**

Run:
```bash
npx tsc --noEmit 2>&1
```
Expected: zéro output.

- [ ] **Step 3 : Acceptance criteria de la spec §5**

```bash
# AC1 : plus de cast as unknown as { individual_price | email
grep -rn "as unknown as { individual_price\|as unknown as { email" src/ 2>/dev/null
# Expected: 0 résultat

# AC2 : contacts fetch avec entity_id
grep -B 1 -A 5 "from(\"contacts\")" src/ -rn 2>/dev/null | head -30
# Expected: chaque hit a .eq("entity_id", ...) à proximité

# AC3 : ResumeDangerZone ne contient plus la boucle de DELETE
grep -n "tables = \|for (const table" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeDangerZone.tsx
# Expected: 0 résultat

# AC4 : ResumeActions n'a plus le bouton Historique
grep -n "Historique\|History" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeActions.tsx
# Expected: 0 résultat

# AC5 : ResumeVisioLink a un bouton « Envoyer » fonctionnel
grep -n "handleSendVisio\|Fonctionnalité à venir" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ResumeVisioLink.tsx
# Expected : handleSendVisio présent, Fonctionnalité à venir absent

# AC6 : Route send-visio-link existe
ls src/app/api/sessions/\[id\]/send-visio-link/route.ts
# Expected : file exists

# AC7 : services exportés depuis sessions.ts
grep -n "export async function (updateSessionField|duplicateSession|deleteSession|sendVisioLinkToLearners)" src/lib/services/sessions.ts
# Expected : les 4 lignes (peut nécessiter -E pour grep ERE)

# AC8 : getTrainerStats exporté depuis trainer-hours.ts
grep -n "export function getTrainerStats" src/lib/services/trainer-hours.ts
# Expected : 1 résultat

# AC9 : Enrollment + Client étendus
grep -n "individual_price?:" src/lib/types/index.ts
grep -n "email?:" src/lib/types/index.ts
# Expected : 1 résultat chacun (sur les interfaces Enrollment et Client)

# AC10 : onRefresh() partout préfixé par await
grep -nE "^\s+onRefresh\(\);" src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/
# Expected : 0 résultat

# AC11 : Toast d'erreur générique éradiqué
grep -rnE 'toast\(\{ title: "Erreur", variant: "destructive" \}\)' src/app/\(dashboard\)/admin/formations/\[id\]/_components/sections/ 2>/dev/null
# Expected : 0 résultat (tous incluent désormais description: error.message)
```

- [ ] **Step 4 : Build Next.js**

Run:
```bash
npm run build 2>&1 | tail -20
```
Expected: build successful.

- [ ] **Step 5 : Récap des commits du chantier**

Run:
```bash
git log --oneline main..HEAD
```
Expected: 14 commits (Tâches 1-14, Tâche 15 = pas de commit).

- [ ] **Step 6 : Décision merge / PR / keep**

Présenter les options du skill `superpowers:finishing-a-development-branch` :
1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work

---

## Self-review (effectuée pendant la rédaction)

**Spec coverage** : tous les volets A-F de la spec sont couverts :
- Volet A → Tâches 1 (types), 6 (B2 cascade), 7 (B1 contacts + casts), 8 (casts learners)
- Volet B → Tâches 2 (updateSessionField, duplicateSession, deleteSession), 9 (consumers Description/Location/Manager), 10 (VisioLink), 11 (Actions handleStart), 12 (Financiers session_id), 13 (Trainers await)
- Volet C → Tâche 9 (cancel-reset), 10 (Zod URL), 8 (bulk send visibility), partout (error.message)
- Volet D → Tâche 11 (retrait Historique), Tâches 4+5+14 (Envoyer visio)
- Volet E → Tâche 3 (extraction getTrainerStats), Tâche 11 (extraction duplicateSession)
- Volet F → Tâches 2 et 3 (nouveaux tests)
- Volet G (RHF+Zod) → explicitement hors scope (Zod uniquement sur URL visio)

**Placeholder scan** : aucun "TBD", "TODO", "implementer plus tard". Tous les blocs de code complets.

**Type consistency** :
- `ServiceResult<T>` réutilisé entre les 4 nouvelles fonctions du service sessions (et conforme au type existant)
- `TrainerStats { hours, dates, slotCount }` cohérent entre lib (Tâche 3) et consumer (Tâche 13)
- `Enrollment.individual_price?` et `Client.email?` cohérents entre déclaration (Tâche 1) et lectures (Tâches 7, 8)
- `updateSessionField(supabase, sessionId, entityId, patch)` signature identique entre déclaration (Tâche 2) et 5+ consumers (Tâches 9, 10, 11, 14)
- `duplicateSession` retourne `{ newId }` utilisé en Tâche 11 (router.push)
- `sendVisioLinkToLearners` retourne `{ enqueued, skipped }` utilisé en Tâche 14 (toast)

Aucune référence à un symbole non défini.

---

## Exécution

Plan complete et sauvé à `docs/superpowers/plans/2026-05-25-solidification-tab-resume.md`. Deux options d'exécution :

**1. Subagent-Driven (recommandé)** — dispatch d'un subagent par tâche, revue spec compliance + code quality entre chaque, itération rapide (pattern identique au chantier Qualiopi).

**2. Inline Execution** — exécution des tâches dans cette session via `executing-plans`, batch execution avec checkpoints.

Quelle approche ?
