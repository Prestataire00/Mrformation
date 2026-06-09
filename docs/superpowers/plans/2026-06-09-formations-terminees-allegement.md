# Allègement des formations terminées (Hub Formations) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dans la vue cartes du Hub Formations, regrouper les sessions actives en haut et replier les sessions terminées et annulées dans des sections dépliables, sans rien masquer définitivement.

**Architecture:** Pur regroupement d'affichage côté client dans `src/app/(dashboard)/admin/trainings/page.tsx`. La logique de partition est extraite en fonction pure testable (`src/lib/utils/session-grouping.ts`). Le repli utilise le wrapper shadcn `Collapsible` (le primitive Radix est déjà en dépendance). La carte de session, aujourd'hui inline, est extraite en helper `renderCard` interne au composant pour être réutilisée dans chaque groupe sans duplication.

**Tech Stack:** Next.js 14 (client component), TypeScript strict, shadcn/ui + Radix Collapsible, Vitest.

**Référence cadrage :** `bmad_output/planning-artifacts/2026-06-09-cadrage-formations-terminees-allegement.md`

---

## File Structure

| Fichier | Rôle | Action |
|---------|------|--------|
| `src/lib/utils/session-grouping.ts` | Fonction pure `partitionSessions` qui classe les sessions en `active` / `completed` / `cancelled`. | Créer |
| `src/lib/utils/__tests__/session-grouping.test.ts` | Tests unitaires Vitest de la partition. | Créer |
| `src/components/ui/collapsible.tsx` | Wrapper shadcn standard du primitive `@radix-ui/react-collapsible`. | Créer |
| `src/app/(dashboard)/admin/trainings/page.tsx` | Brancher le mode regroupé (vue cartes) : helper `renderCard`, sections repliables, condition d'activation. | Modifier |

**Décision de découpage :** la carte n'est PAS extraite dans un fichier séparé. Elle dépend des setters d'état de la page (`setSessionToDelete`, `setDeleteDialogOpen`) ; un helper `renderCard` interne au composant évite le prop-drilling et garde le code qui change ensemble au même endroit. Seule la logique pure (sans React) part dans un util testable.

---

## Task 1: Fonction pure de partition des sessions

**Files:**
- Create: `src/lib/utils/session-grouping.ts`
- Test: `src/lib/utils/__tests__/session-grouping.test.ts`

- [ ] **Step 1: Write the failing test**

Créer `src/lib/utils/__tests__/session-grouping.test.ts` :

```typescript
import { describe, it, expect } from "vitest";
import { partitionSessions } from "../session-grouping";

interface S { id: string; status: string }

function s(id: string, status: string): S {
  return { id, status };
}

describe("partitionSessions", () => {
  it("classe upcoming et in_progress dans le groupe actif", () => {
    const sessions = [s("a", "upcoming"), s("b", "in_progress")];
    const { active, completed, cancelled } = partitionSessions(sessions);
    expect(active.map((x) => x.id)).toEqual(["a", "b"]);
    expect(completed).toEqual([]);
    expect(cancelled).toEqual([]);
  });

  it("classe completed dans le groupe terminé", () => {
    const { active, completed, cancelled } = partitionSessions([s("a", "completed")]);
    expect(completed.map((x) => x.id)).toEqual(["a"]);
    expect(active).toEqual([]);
    expect(cancelled).toEqual([]);
  });

  it("classe cancelled dans le groupe annulé", () => {
    const { active, completed, cancelled } = partitionSessions([s("a", "cancelled")]);
    expect(cancelled.map((x) => x.id)).toEqual(["a"]);
    expect(active).toEqual([]);
    expect(completed).toEqual([]);
  });

  it("préserve l'ordre d'entrée à l'intérieur de chaque groupe", () => {
    const sessions = [s("a", "completed"), s("b", "upcoming"), s("c", "completed"), s("d", "in_progress")];
    const { active, completed } = partitionSessions(sessions);
    expect(active.map((x) => x.id)).toEqual(["b", "d"]);
    expect(completed.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("range tout statut inconnu dans actif (défaut sûr : reste visible)", () => {
    const { active } = partitionSessions([s("a", "unknown_status")]);
    expect(active.map((x) => x.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/utils/__tests__/session-grouping.test.ts`
Expected: FAIL — `Failed to resolve import "../session-grouping"` / `partitionSessions is not a function`.

- [ ] **Step 3: Write minimal implementation**

Créer `src/lib/utils/session-grouping.ts` :

```typescript
/**
 * Partitionne les sessions du Hub Formations en trois groupes d'affichage :
 * - active   : sessions sur lesquelles l'admin doit agir (à venir, en cours)
 * - completed: sessions terminées (rangées dans un pli replié)
 * - cancelled: sessions annulées (rangées dans un pli replié distinct)
 *
 * Tout statut inconnu est traité comme actif : défaut sûr, la session reste
 * visible plutôt que d'être cachée dans un pli.
 *
 * Fonction pure (pas de dépendance React) → testable en isolation.
 * Le générique <T> évite d'importer le type de la page ; seul `status` est requis.
 */
export function partitionSessions<T extends { status: string }>(
  sessions: T[]
): { active: T[]; completed: T[]; cancelled: T[] } {
  const active: T[] = [];
  const completed: T[] = [];
  const cancelled: T[] = [];

  for (const session of sessions) {
    if (session.status === "completed") {
      completed.push(session);
    } else if (session.status === "cancelled") {
      cancelled.push(session);
    } else {
      active.push(session);
    }
  }

  return { active, completed, cancelled };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/utils/__tests__/session-grouping.test.ts`
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/session-grouping.ts src/lib/utils/__tests__/session-grouping.test.ts
git commit -m "feat(formations): fonction pure partitionSessions (actives/terminées/annulées)"
```

---

## Task 2: Wrapper shadcn Collapsible

**Files:**
- Create: `src/components/ui/collapsible.tsx`

> Le primitive `@radix-ui/react-collapsible@^1.1.12` est déjà dans `package.json` ; il manque seulement le wrapper shadcn. C'est le fichier shadcn standard, sans modification.

- [ ] **Step 1: Create the wrapper**

Créer `src/components/ui/collapsible.tsx` :

```tsx
"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i collapsible || echo "OK: aucune erreur collapsible"`
Expected: `OK: aucune erreur collapsible`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/collapsible.tsx
git commit -m "feat(ui): ajoute le wrapper shadcn Collapsible"
```

---

## Task 3: Extraire la carte en helper `renderCard`

But : sortir le JSX de la carte (actuellement inline dans `.map()`) en un helper réutilisable, **sans changer le rendu**. Étape de refactor pur, commitée séparément pour isoler tout diff visuel.

**Files:**
- Modify: `src/app/(dashboard)/admin/trainings/page.tsx`

- [ ] **Step 1: Ajouter le helper `renderCard` dans le composant**

Dans le corps du composant page (juste après la définition de `getEnrollmentCount`, vers la ligne 279, AVANT le `return`), ajouter :

```tsx
  // Rendu d'une carte de session. Helper interne (pas un fichier séparé) car
  // il dépend des setters d'état de la page (suppression). Réutilisé par la
  // grille active et par les plis terminées/annulées → évite la duplication.
  function renderCard(session: SessionCard) {
    const statusCfg = STATUS_CONFIG[session.status] ?? { label: session.status, color: "bg-gray-100 text-gray-600" };
    const modeCfg = MODE_CONFIG[session.mode] ?? { label: session.mode, icon: MapPin };
    const ModeIcon = modeCfg.icon;
    const enrollCount = getEnrollmentCount(session);

    return (
      <Link key={session.id} href={`/admin/formations/${session.id}`}>
        <Card className="overflow-hidden transition-shadow hover:shadow-md cursor-pointer">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 flex-1 min-w-0">
                {session.title}
              </h3>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/admin/formations/${session.id}`} className="gap-2">
                      <BookOpen className="h-4 w-4" />
                      Gérer
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => { e.preventDefault(); setSessionToDelete(session); setDeleteDialogOpen(true); }}
                    className="gap-2 text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>

          <CardContent className="space-y-2 pb-3 px-4">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <CalendarDays className="h-3 w-3 text-gray-400" />
              <span>{formatDate(session.start_date)} — {formatDate(session.end_date)}</span>
            </div>

            {session.location && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <MapPin className="h-3 w-3 text-gray-400" />
                <span className="truncate">{session.location}</span>
              </div>
            )}

            {/* CONT-3 audit BMAD : afficher le programme source pour
                donner du contexte sans devoir ouvrir la fiche. */}
            {session.program?.title && (
              <div className="flex items-center gap-1.5 text-xs text-purple-700">
                <BookOpen className="h-3 w-3 text-purple-500" />
                <span className="truncate font-medium">{session.program.title}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className={cn("text-[10px] border-0 font-medium", statusCfg.color)}>
                {statusCfg.label}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-medium gap-1">
                <ModeIcon className="h-3 w-3" />
                {modeCfg.label}
              </Badge>
              {session.is_subcontracted && (
                <Badge variant="outline" className="text-[10px] font-medium gap-1 border-purple-300 text-purple-700">
                  <Briefcase className="h-3 w-3" /> S-T
                </Badge>
              )}
              {(session.qualiopi_score ?? 0) > 0 && (
                <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                  (session.qualiopi_score ?? 0) >= 67 ? "bg-green-100 text-green-700" :
                  (session.qualiopi_score ?? 0) >= 34 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                )}>
                  <Shield className="h-2.5 w-2.5" /> {session.qualiopi_score}%
                </span>
              )}
              <div className="flex items-center gap-1 text-[10px] text-gray-400 ml-auto">
                <Users className="h-3 w-3" />
                {enrollCount}{session.max_participants ? `/${session.max_participants}` : ""}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  }
```

- [ ] **Step 2: Remplacer le corps de la vue cartes par l'appel au helper**

Remplacer le bloc actuel de la vue cartes (de `/* ═══ VUE CARDS ═══ */` jusqu'au `</div>` fermant de la grille, soit les lignes 635-730) par :

```tsx
        /* ═══ VUE CARDS ═══ */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((session) => renderCard(session))}
        </div>
```

- [ ] **Step 3: Vérifier le type-check et le build de la page**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "trainings/page" || echo "OK: page trainings sans erreur de type"`
Expected: `OK: page trainings sans erreur de type`.

- [ ] **Step 4: Vérification visuelle (lint rapide)**

Run: `npx next lint --file "src/app/(dashboard)/admin/trainings/page.tsx" 2>&1 | tail -5 || echo "lint terminé"`
Expected: aucune nouvelle erreur ESLint introduite (warnings préexistants tolérés).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/admin/trainings/page.tsx"
git commit -m "refactor(formations): extrait renderCard pour réutiliser la carte de session"
```

---

## Task 4: Mode regroupé avec sections repliables

But : quand `statusFilter === "all"` ET la recherche est vide, afficher les actives en grille puis deux plis repliés (Terminées, Annulées). Sinon, conserver la grille plate de la Task 3.

**Files:**
- Modify: `src/app/(dashboard)/admin/trainings/page.tsx`

- [ ] **Step 1: Importer Collapsible, ChevronRight et partitionSessions**

Dans le bloc `lucide-react` (imports en tête de fichier, vers la ligne 41), ajouter `ChevronRight` à la liste des icônes importées.

Après l'import de `Link` (vers la ligne 57), ajouter :

```tsx
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { partitionSessions } from "@/lib/utils/session-grouping";
```

- [ ] **Step 2: Ajouter l'état d'ouverture des plis**

À côté des autres `useState` de filtres (vers la ligne 158-159, après `modeFilter`), ajouter :

```tsx
  // Plis des sessions closes (mode regroupé) — repliés par défaut à chaque visite.
  const [showCompleted, setShowCompleted] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
```

- [ ] **Step 3: Calculer la condition de regroupement et la partition**

Juste après la définition de `filtered` (après la ligne 275) et avant `getEnrollmentCount`, ajouter :

```tsx
  // Le regroupement Actives / plis ne s'applique qu'en vue par défaut :
  // filtre « Tous les statuts » ET aucune recherche. Dès qu'on filtre ou
  // qu'on cherche, on veut une grille plate pour tout voir d'un coup.
  const isGroupedView =
    viewMode === "grid" && statusFilter === "all" && debouncedSearch.trim() === "";
  const { active, completed, cancelled } = partitionSessions(filtered);
```

- [ ] **Step 4: Brancher le rendu groupé dans la vue cartes**

Remplacer le bloc de la vue cartes issu de la Task 3 :

```tsx
        /* ═══ VUE CARDS ═══ */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((session) => renderCard(session))}
        </div>
```

par :

```tsx
        /* ═══ VUE CARDS ═══ */
        isGroupedView ? (
          <div className="space-y-6">
            {/* Sessions actives — toujours visibles, en grandes cartes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {active.map((session) => renderCard(session))}
            </div>
            {active.length === 0 && (
              <p className="text-sm text-gray-400 py-4">Aucune formation active.</p>
            )}

            {/* Pli des sessions terminées */}
            {completed.length > 0 && (
              <Collapsible open={showCompleted} onOpenChange={setShowCompleted}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 py-1">
                  <ChevronRight className={cn("h-4 w-4 transition-transform", showCompleted && "rotate-90")} />
                  Terminées
                  <Badge variant="outline" className="text-[10px]">{completed.length}</Badge>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {completed.map((session) => renderCard(session))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Pli des sessions annulées */}
            {cancelled.length > 0 && (
              <Collapsible open={showCancelled} onOpenChange={setShowCancelled}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 py-1">
                  <ChevronRight className={cn("h-4 w-4 transition-transform", showCancelled && "rotate-90")} />
                  Annulées
                  <Badge variant="outline" className="text-[10px]">{cancelled.length}</Badge>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {cancelled.map((session) => renderCard(session))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((session) => renderCard(session))}
          </div>
        )
```

- [ ] **Step 5: Vérifier le type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "trainings/page" || echo "OK: page trainings sans erreur de type"`
Expected: `OK: page trainings sans erreur de type`.

- [ ] **Step 6: Vérification manuelle dans l'app**

Run: `npm run dev` puis ouvrir `/admin/trainings`.
Expected (à confirmer visuellement, cf. critères d'acceptation du cadrage) :
- Filtre « Tous » + recherche vide → actives en cartes en haut, « ▸ Terminées (N) » et « ▸ Annulées (N) » repliés en bas.
- Clic sur un pli → déplie/replie la grille du groupe ; le chevron pivote.
- Choisir le filtre « Terminées » OU taper une recherche → grille plate, plus de pli.
- La vue Kanban (bouton bascule) est inchangée.
- Un groupe vide (ex. aucune annulée) n'affiche pas sa section.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/admin/trainings/page.tsx"
git commit -m "feat(formations): regroupe les sessions actives et replie terminées/annulées (vue cartes)"
```

---

## Task 5: Vérification finale

**Files:** aucun (validation).

- [ ] **Step 1: Suite de tests complète**

Run: `npm test`
Expected: tous les tests passent, dont les 5 de `session-grouping.test.ts`.

- [ ] **Step 2: Type-check global**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 3: Relecture des critères d'acceptation**

Relire les 7 critères d'acceptation du cadrage (`bmad_output/planning-artifacts/2026-06-09-cadrage-formations-terminees-allegement.md`, §5) et cocher chacun à partir de la vérification manuelle de la Task 4.

---

## Notes de conformité (CLAUDE.md)

- ✅ Pas de `any` : `partitionSessions` est générique, la page conserve `SessionCard`.
- ✅ Aucun appel Supabase ajouté ; aucun changement de filtre `entity_id`.
- ✅ Composants shadcn/ui (Collapsible, Card, Badge) ; pas de HTML natif d'UI.
- ✅ Pas de modification de `schema.sql`.
- ✅ Boutons (triggers de pli) avec handler réel ; aucune action async donc pas de try/catch requis ici.
