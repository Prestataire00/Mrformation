---
storyId: H19
storyKey: h-19-taches-commerciales-vues-calendar-today
epic: H
title: Tâches commerciales — ajouter vues Calendar + Aujourd'hui (Epic H)
status: ready-for-dev
priority: P2
effort: 1-2 j-h
wave: hot-fix (extension Epic H)
sourceBrainstorming: bmad_output/brainstorming/brainstorming-session-2026-05-18-1915.md
createdAt: 2026-05-18
createdBy: bmad-create-story (Claude Opus 4.7)
---

# Story H19 — Tâches commerciales : vues Calendar + Aujourd'hui

## 1. Story Statement

**As a** commercial (Marc, Taline — rôle `commercial`),
**I want** pouvoir consulter mes tâches en vue Calendar (positionnement par date d'échéance) et en vue Aujourd'hui (focus du jour),
**So that** je peux planifier ma semaine visuellement et exécuter ma journée sans bruit cognitif.

## 2. Context

Suite à la session brainstorming du 2026-05-18 ([brainstorming-session-2026-05-18-1915.md](../brainstorming/brainstorming-session-2026-05-18-1915.md)), on a décidé d'enrichir le module `crm_tasks` existant avec 2 vues supplémentaires inspirées de HubSpot. **L'existant est déjà bien fourni** :
- Backend CRUD complet (`/api/crm/tasks/route.ts` + `[id]/route.ts` ~500 LOC)
- Page `/admin/crm/tasks/page.tsx` (~1265 LOC) avec **List + Kanban** déjà fonctionnels
- Stats hero (dueToday, overdue, activeReminders, completedThisWeek)
- Reminders system + labels Sellsy déjà câblés

Cette story h-19 est volontairement **minimale** : on ajoute juste les 2 vues manquantes pour valider l'usage avant d'investir dans l'ergonomie HubSpot avancée (snooze, delegate, @mention, automations — réservés à h-20/h-21 si l'usage le justifie).

**Décisions structurantes héritées du brainstorming** :
- Tâches restent rattachables à prospect ET client (statu quo, pas de changement breaking)
- Pas de système de types/catégories à ajouter (géré ailleurs)
- Pas d'IA, pas de mobile, pas de reporting commercial
- 4 vues cible : List ✅ + Kanban ✅ + **Calendar (h-19)** + **Aujourd'hui (h-19)**

## 3. Scope

### Dans le scope h-19

1. Ajouter le **viewMode `"calendar"`** au state existant (`useState<"list" | "kanban" | "calendar" | "today">`)
2. Ajouter le **viewMode `"today"`**
3. Ajouter 2 boutons toggle dans la barre de vue existante (lignes ~463-467 de page.tsx, à côté des boutons List/Kanban)
4. Implémenter le rendu **Calendar** : grille mensuelle (par défaut) + toggle semaine, tâches positionnées sur leur `due_date`, click sur tâche → ouvre l'edit modal existant
5. Implémenter le rendu **Today** : focus visuel sur les tâches `due_date === today` + `overdue`, triées par priorité descendante, design "focus mode" épuré

### Hors scope (réservé h-20 si validé)

- Bouton flottant `+ Task` global
- Quick-add inline sur fiche prospect
- Snooze, delegate, @mention
- Automations (devis envoyé J+3, prospect inactif 30j)
- Digest matinal email
- Retrait de `client_id` de l'UX (statu quo)

## 4. Acceptance Criteria (Given/When/Then)

### AC-1 — Vue Calendar : grille mensuelle navigable

- **Given** je suis sur `/admin/crm/tasks` et je clique sur le bouton "Calendar" dans la barre de vue
- **When** la vue Calendar s'affiche
- **Then** je vois une grille mensuelle du mois courant (lun-dim, 5-6 lignes selon le mois)
- **And** chaque case jour affiche jusqu'à 3 tâches dues ce jour-là (titre tronqué si > 20 char, couleur de bordure selon priorité — `PRIORITY_BORDER` existant)
- **And** si > 3 tâches sur un jour, un badge "+N" indique le nombre restant
- **And** les boutons "◀ Mois précédent" et "Mois suivant ▶" naviguent dans le temps (state local `currentMonth`)
- **And** un bouton "Aujourd'hui" recadre sur le mois courant

### AC-2 — Vue Calendar : interactions

- **Given** la vue Calendar est affichée
- **When** je clique sur une tâche dans une case jour
- **Then** l'edit modal existant (`Dialog` à la ligne ~990 de page.tsx) s'ouvre avec la tâche pré-remplie
- **When** je clique sur une case jour vide
- **Then** le create modal existant s'ouvre avec `due_date` pré-rempli à ce jour (pas obligatoire pour MVP, nice-to-have)

### AC-3 — Vue Aujourd'hui : focus du jour

- **Given** je clique sur le bouton "Aujourd'hui" dans la barre de vue
- **When** la vue Today s'affiche
- **Then** elle montre **uniquement** : (a) les tâches `due_date === aujourd'hui` ET pas `completed/cancelled`, (b) les tâches en retard (`due_date < aujourd'hui` et pas `completed/cancelled`)
- **And** la section "En retard" apparaît en haut (badge rouge), suivie de "Aujourd'hui" (badge bleu)
- **And** chaque tâche est triée par priorité descendante (`high → medium → low`)
- **And** un état vide explicite "🎉 Aucune tâche à traiter aujourd'hui" si les 2 sections sont vides

### AC-4 — Vue Aujourd'hui : interactions

- **Given** la vue Today est affichée
- **When** je clique sur la checkbox d'une tâche
- **Then** son status passe à `completed` (handler `handleToggleStatus` existant ou équivalent), la tâche disparaît avec animation/transition courte
- **When** je clique sur le titre d'une tâche
- **Then** l'edit modal s'ouvre

### AC-5 — Toggle de vue : 4 boutons synchrones

- **Given** je suis sur `/admin/crm/tasks`
- **When** je regarde la barre de vue
- **Then** je vois 4 boutons icônes alignés horizontalement : `List` (existant), `LayoutGrid` (Kanban, existant), `Calendar` (NEW, `Calendar` icon lucide), `Sun` (Today, NEW, `Sun` icon lucide ou `Star`)
- **And** le bouton actif a `bg-white shadow-sm font-medium`, les inactifs `text-gray-500`
- **And** le viewMode persiste pendant la session (state React local, pas besoin de localStorage)

### AC-6 — Zéro régression sur List + Kanban + form CRUD

- **Given** les fonctionnalités existantes
- **When** je teste manuellement les vues List et Kanban après cette story
- **Then** elles fonctionnent exactement comme avant (drag-drop, tri, filtres, stats hero, search, dialogs)
- **And** le form CRUD (création + édition + suppression) reste identique
- **And** le système de reminders et labels Sellsy reste intact

## 5. Tasks / Subtasks

- [ ] **Task 1 — Étendre le type de viewMode** (AC-5)
  - [ ] Ligne ~121 de `page.tsx` : `useState<"list" | "kanban" | "calendar" | "today">("list")`
  - [ ] Ajouter les imports d'icônes manquantes (`Sun` ou autre depuis `lucide-react`)
- [ ] **Task 2 — Ajouter les 2 boutons toggle dans la barre de vue** (AC-5)
  - [ ] Lignes ~463-467 de `page.tsx` : ajouter 2 `<button>` après le bouton Kanban, même styling Tailwind
  - [ ] Title attribute pour accessibilité : "Vue calendrier" / "Focus du jour"
- [ ] **Task 3 — Implémenter le rendu Calendar** (AC-1, AC-2)
  - [ ] Extraire un nouveau composant `<CalendarView tasks={...} onTaskClick={...} />` dans `src/app/(dashboard)/admin/crm/tasks/_components/CalendarView.tsx` (NEW file, pour ne pas alourdir page.tsx déjà gros)
  - [ ] Utiliser `date-fns` (déjà installé, v4) : `startOfMonth`, `endOfMonth`, `startOfWeek`, `endOfWeek`, `eachDayOfInterval`, `isSameMonth`, `isSameDay`, `format`, `addMonths`, `subMonths`
  - [ ] State local `currentMonth: Date` initialisé à `new Date()`
  - [ ] Grille 7 colonnes × 5-6 lignes via Tailwind `grid grid-cols-7`
  - [ ] Pour chaque jour : filtrer `tasks.filter(t => t.due_date && isSameDay(parseISO(t.due_date), day))`, afficher max 3, badge "+N" si plus
  - [ ] Bordure gauche couleur priorité via `PRIORITY_BORDER` existant (lignes 75-79)
  - [ ] Click tâche → callback `onTaskClick(task)` qui appelle `openEditDialog` du parent
- [ ] **Task 4 — Implémenter le rendu Today** (AC-3, AC-4)
  - [ ] Extraire un composant `<TodayView tasks={...} onTaskClick={...} onToggleStatus={...} />` dans `_components/TodayView.tsx` (NEW)
  - [ ] Réutiliser la logique existante (lignes ~425-444 de page.tsx) pour `todayStr`, `kanbanOverdue`, `kanbanToday` — extract en helpers si pas déjà
  - [ ] Section "En retard" (collapse pliable optionnel) puis section "Aujourd'hui"
  - [ ] Tri par priorité : `[...tasks].sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority])` avec `PRIORITY_ORDER = { high: 3, medium: 2, low: 1 }`
  - [ ] Empty state si les 2 sections vides
  - [ ] Checkbox click → `onToggleStatus(task.id, 'completed')` qui PATCH `/api/crm/tasks/[id]`
- [ ] **Task 5 — Brancher les 2 vues dans la section de rendu principale** (AC-1, AC-3)
  - [ ] Ligne ~624 de `page.tsx`, étendre le conditionnel actuel `viewMode === "kanban"` en `switch (viewMode)`
  - [ ] Importer les 2 nouveaux composants
- [ ] **Task 6 — Validation tsc + smoke manuel** (AC-6)
  - [ ] `npx tsc --noEmit` clean
  - [ ] `npx vitest run` sans régression
  - [ ] Smoke local : créer 5-10 tâches test, switcher entre les 4 vues, vérifier que chaque vue affiche les bonnes données et que les clicks fonctionnent
- [ ] **Task 7 — Commit + push**
  - [ ] Commit : `feat(crm): h-19 vues Calendar + Aujourd'hui pour les taches commerciales (Epic H)`
  - [ ] MAJ sprint-status : `h-19 → review`

## 6. Dev Notes

### 6.1 — Architecture du code existant à respecter

**Fichier principal** : [src/app/(dashboard)/admin/crm/tasks/page.tsx](src/app/(dashboard)/admin/crm/tasks/page.tsx) — 1265 LOC
- État courant : un seul fichier, contient state + handlers + 2 vues + 2 modals (create + edit)
- **Risque** : ajouter 2 vues + leur logique directement dans page.tsx la fait passer à 1500+ LOC, devient ingérable
- **Décision** : extraire `CalendarView` et `TodayView` dans un sous-dossier `_components/` pour préserver la lisibilité (~150 LOC chacun)

**Conventions existantes à suivre** :
- Shadcn/ui components (`Button`, `Card`, `Dialog`, `Select`)
- Tailwind classes (pas de CSS modules)
- `useToast` pour les feedback async
- `formatDate` depuis `@/lib/utils`
- Icônes `lucide-react`
- Types depuis `@/lib/types` (`CrmTask`, `TaskPriority`, `TaskStatus`)

### 6.2 — Librairie date-fns (déjà installée v4)

Pas de nouvelle dépendance. `date-fns` v4 et `date-fns-tz` v3.2 déjà dans `package.json`. Pas besoin d'une lib calendar lourde (react-big-calendar, fullcalendar) — la grille mensuelle se fait en 50 LOC avec `date-fns` + Tailwind grid.

**API date-fns à utiliser** :
```ts
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, format, addMonths, subMonths, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

const days = eachDayOfInterval({
  start: startOfWeek(startOfMonth(currentMonth), { locale: fr }),
  end: endOfWeek(endOfMonth(currentMonth), { locale: fr }),
});
// → 35 ou 42 jours, parfait pour grid grid-cols-7
```

### 6.3 — Pattern toggle de vue à reproduire

Existant lignes 461-470 de page.tsx :
```tsx
<div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
  <button onClick={() => setViewMode("list")} className={cn("px-2 py-1 text-xs rounded-md transition", viewMode === "list" ? "bg-white shadow-sm font-medium" : "text-gray-500")}>
    <List className="h-3.5 w-3.5" />
  </button>
  <button onClick={() => setViewMode("kanban")} className={cn("px-2 py-1 text-xs rounded-md transition", viewMode === "kanban" ? "bg-white shadow-sm font-medium" : "text-gray-500")}>
    <LayoutGrid className="h-3.5 w-3.5" />
  </button>
  {/* AJOUTS h-19 : */}
  <button onClick={() => setViewMode("calendar")} className={cn(...)} title="Vue calendrier">
    <Calendar className="h-3.5 w-3.5" />
  </button>
  <button onClick={() => setViewMode("today")} className={cn(...)} title="Focus du jour">
    <Sun className="h-3.5 w-3.5" />
  </button>
</div>
```

### 6.4 — Pattern checkbox toggle status

Vérifier dans le code existant (ligne ~640+ probablement) comment Kanban gère le toggle status pour le réutiliser dans TodayView. Si pas extrait en helper, l'extraire (au moins en local helper dans page.tsx).

### 6.5 — Empty states

Conventions UX projet :
- Empty state avec icône (`Sun` pour Today, `Calendar` pour Calendar)
- Texte explicite + ton léger : "🎉 Aucune tâche à traiter aujourd'hui — profitez-en !"
- Pas de CTA inutile (sauf un lien "+ Créer une tâche" qui ouvre le modal create)

### 6.6 — Previous Story Intelligence (h-13 → h-18, mergées 2026-05-17/18)

Patterns récents Epic H confirmés :
- **Commits Epic H = small, focused, P0 d'abord** : un seul sujet par commit, message bilingue rigoureux, co-author Claude Opus 4.7
- **Pas de migration DB pour cette story** : juste UI/UX
- **`npx tsc --noEmit` avant chaque commit** : convention projet, échec = blocking
- **Test snapshots stables** depuis b0af85e (date figée dans `beforeAll`) — h-19 ne touche pas aux templates donc pas d'impact

### 6.7 — Git Intelligence (last 5 commits avant h-19)

```
df964b5 docs(bmad): session brainstorming Taches CRM commercial (Epic H pre-story)
b71e8dc fix(users): h-18 ajoute 'commercial' aux validations API (Epic H)
f5c519d feat(users): h-18 ajoute Commercial dans le formulaire de creation + stats (Epic H)
827af9d fix(crm): h-17 RLS via JOIN parent pour tables sans entity_id natif (Epic H)
5115660 fix(crm): h-17 migration utilise public.user_role() (Epic H)
```

### 6.8 — Project Context Reference

- `CLAUDE.md` règles 1-10 (notamment règles 4 "Jamais de bouton sans handler" et 9 "Toujours utiliser shadcn/ui")
- `_bmad/bmm/config.yaml` : `document_output_language: French`
- `bmad_output/brainstorming/brainstorming-session-2026-05-18-1915.md` : contexte stratégique complet

### 6.9 — Risques + mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| page.tsx devient trop gros (>1500 LOC) | Élevée si non-extrait | Maintenabilité | Extraire CalendarView + TodayView dans `_components/` |
| Performance vue Calendar avec >100 tâches/mois | Faible | UX | Filtrer côté client (déjà tout en memory), ok jusqu'à 500 tâches. Si >, paginer côté API future story |
| Calendar mal localisé (lundi/dimanche, mois en anglais) | Moyenne | UX | Importer `fr` depuis `date-fns/locale` et passer `{ locale: fr }` à `startOfWeek` et `format` |
| Test snapshots cassent | Très faible | CI | Cette story ne touche AUCUN template/PDF, donc 0 impact |

### 6.10 — Testing standards

- Tests unitaires : aucun test existant sur cette page, pas obligatoire d'en ajouter pour h-19 (smoke manuel suffit pour ce hot-fix UX)
- Si DEV veut ajouter, tester la logique de filtrage Today (overdue + dueToday) et la génération de la grille Calendar (eachDayOfInterval). Pattern : créer un fichier `_components/__tests__/CalendarView.test.tsx` avec Vitest + Testing Library (déjà en place dans le projet).

## 7. References

- [Source: src/app/(dashboard)/admin/crm/tasks/page.tsx:121] — viewMode state à étendre
- [Source: src/app/(dashboard)/admin/crm/tasks/page.tsx:441-444] — logique kanbanOverdue / kanbanToday réutilisable
- [Source: src/app/(dashboard)/admin/crm/tasks/page.tsx:461-470] — pattern toggle barre de vue à reproduire
- [Source: src/app/(dashboard)/admin/crm/tasks/page.tsx:624] — section conditionnelle de rendu à étendre
- [Source: src/lib/utils/crm-task-label-style.ts] — helpers existants labels (NE PAS dupliquer)
- [Source: src/lib/utils/crm-task-reminder.ts] — helpers existants reminders (NE PAS dupliquer)
- [Source: bmad_output/brainstorming/brainstorming-session-2026-05-18-1915.md] — contexte stratégique brainstorming
- [Source: CLAUDE.md] — règles projet absolues

## 8. Dev Agent Record

### Agent Model Used

(à renseigner par le dev — ex: `claude-opus-4-7[1m]`)

### Debug Log References

(à renseigner pendant l'implémentation)

### Completion Notes List

(à renseigner avant code-review)

### File List

(à renseigner avant code-review — liste exhaustive des fichiers modifiés/créés)

## 9. Questions ouvertes pour le dev

1. **Vue Calendar : grille mensuelle ou semaine + mois en toggle ?** — proposé mensuel par défaut, mais si Wissam préfère une vue semaine plus dense pour le commercial type "agenda RDV", à confirmer.
2. **TodayView : afficher aussi les tâches sans date ?** — débat UX. Proposé non par défaut (cohérent avec "Today" stricte), mais peut se justifier (tâches "ASAP" sans date). Décision DEV ou demande à Wissam.
3. **Empty state Calendar** : montrer un message global "Aucune tâche ce mois-ci" si zéro tâche dans le mois affiché ? Ou laisser la grille vide sans message ?
