# Tâches terminées compactes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alléger l'affichage des tâches terminées dans la vue Tâches générale (Liste + Kanban) sans toucher au portail prospect ni aux tâches actives.

**Architecture:** Un prop `compact` sur `TaskRow` et `TaskKanbanCard` déclenche un rendu slim via un `return` conditionnel (mêmes handlers, closures de la fonction). La section « Terminées » de la vue Liste devient repliable (repliée par défaut).

**Tech Stack:** React, TypeScript, TailwindCSS, lucide-react.

**Spec :** `docs/superpowers/specs/2026-05-20-completed-tasks-compact-design.md`

**Anti-régression :** `compact` est optionnel, défaut `false` → tous les appels existants inchangés. Le `return` compact est placé APRÈS la branche `if (isEditing)` → éditer une tâche terminée affiche toujours le formulaire complet.

**Vérification :** changement purement UI → chaque tâche se vérifie par `npx tsc --noEmit`. La suite (400 tests) doit rester verte.

---

### Task 1 : Mode `compact` sur `TaskRow`

**Files:** Modify: `src/app/(dashboard)/admin/crm/tasks/page.tsx`

- [ ] **Step 1 : Ajouter le prop à l'interface** — dans `interface TaskRowProps`, après `isOverdue?: boolean;`, ajouter :

```ts
  compact?: boolean;
```

- [ ] **Step 2 : Ajouter `compact` à la déstructuration** — dans `function TaskRow({ ... })`, ajouter `compact` à la liste des paramètres déstructurés (ligne `task, getProfileName, onToggleComplete, onEdit, onDelete, isOverdue,`) :

```ts
  task, getProfileName, onToggleComplete, onEdit, onDelete, isOverdue, compact,
```

- [ ] **Step 3 : Hoister le calcul du titre** — juste après `const profileName = getProfileName(task.assigned_to);`, ajouter :

```ts
  const titleIsGeneric = isGenericTaskTitle(task.title, task.label);
  const displayTitle = titleIsGeneric
    ? (task.description?.trim() || task.prospect?.company_name || task.title)
    : task.title;
```

- [ ] **Step 4 : Dé-dupliquer dans l'IIFE du rendu normal** — dans le rendu normal, l'IIFE du titre recalcule `titleIsGeneric` et `displayTitle`. Remplacer ses 3 lignes de `const` :

```ts
            const titleIsGeneric = isGenericTaskTitle(task.title, task.label);
            const displayTitle = titleIsGeneric
              ? (task.description?.trim() || task.prospect?.company_name || task.title)
              : task.title;
            const showDescriptionInline = !titleIsGeneric && task.description;
```

par (les deux premières sont désormais hoistées) :

```ts
            const showDescriptionInline = !titleIsGeneric && task.description;
```

- [ ] **Step 5 : Ajouter le `return` compact** — juste avant le `return (` du rendu normal (la ligne `const priorityDotColor = ...` puis `const handleRowClick = ...` puis `return (`), insérer APRÈS `const handleRowClick` et son corps, AVANT le `return (` normal :

```tsx
  if (compact) {
    return (
      <div
        onClick={handleRowClick}
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 hover:bg-gray-50/80 transition-colors cursor-pointer",
          isCompleted && "opacity-50",
        )}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isCompleted}
            onCheckedChange={onToggleComplete}
            className="flex-shrink-0"
          />
        </div>
        <p className={cn("flex-1 min-w-0 truncate text-sm text-gray-500", isCompleted && "line-through")}>
          {displayTitle}
        </p>
        {task.due_date && (
          <span className="flex-shrink-0 text-[11px] text-gray-400">{formatDate(task.due_date)}</span>
        )}
      </div>
    );
  }

```

- [ ] **Step 6 : Typecheck** — Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "crm/tasks/page" || echo OK`. Expected: `OK`.

- [ ] **Step 7 : Commit**

```bash
git add "src/app/(dashboard)/admin/crm/tasks/page.tsx"
git commit -m "feat(crm): mode compact sur TaskRow"
```

---

### Task 2 : Mode `compact` sur `TaskKanbanCard`

**Files:** Modify: `src/app/(dashboard)/admin/crm/tasks/_components/TaskKanbanCard.tsx`

- [ ] **Step 1 : Ajouter le prop** — dans la signature de `TaskKanbanCard`, ajouter `compact` à la déstructuration et au type. La déstructuration `onCancelComplete,` devient `onCancelComplete, compact,` ; dans le type inline, après `onCancelComplete?: () => void;` ajouter `compact?: boolean;`.

- [ ] **Step 2 : Ajouter le `return` compact** — juste avant le `return (` final (après le calcul de `displayTitle`), insérer :

```tsx
  if (compact) {
    return (
      <div className="rounded-lg border border-gray-100 bg-white px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={task.status === "completed"}
            onCheckedChange={() => onToggle(task)}
            className="flex-shrink-0"
          />
          <span className={cn("flex-1 min-w-0 truncate text-xs text-gray-500", task.status === "completed" && "line-through")}>
            {displayTitle}
          </span>
          {task.due_date && (
            <span className="flex-shrink-0 text-[10px] text-gray-400">{formatDate(task.due_date)}</span>
          )}
        </div>
      </div>
    );
  }

```

- [ ] **Step 3 : Typecheck** — Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "TaskKanbanCard" || echo OK`. Expected: `OK`.

- [ ] **Step 4 : Commit**

```bash
git add "src/app/(dashboard)/admin/crm/tasks/_components/TaskKanbanCard.tsx"
git commit -m "feat(crm): mode compact sur TaskKanbanCard"
```

---

### Task 3 : Vue Liste repliable + branchement du mode compact

**Files:** Modify: `src/app/(dashboard)/admin/crm/tasks/page.tsx`

- [ ] **Step 1 : Importer les chevrons** — dans l'import `from "lucide-react"`, ajouter `ChevronDown` et `ChevronRight` (absents actuellement).

- [ ] **Step 2 : Ajouter l'état de pliage** — près des autres `useState` de la fonction `TasksPage` (par ex. après la ligne `const [viewMode, setViewMode] = useState<...>`), ajouter :

```ts
  // Section "Terminées" de la vue Liste — repliée par défaut.
  const [showCompletedList, setShowCompletedList] = useState(false);
```

- [ ] **Step 3 : Rendre la section « Terminées » repliable** — remplacer le bloc actuel :

```tsx
          {completedTasks.length > 0 && (
            <>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mt-4 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3" /> Terminées ({completedTasks.length}{tasks.filter(t => t.status === "completed").length > 100 ? ` sur ${tasks.filter(t => t.status === "completed").length}` : ""})
              </p>
              <div className="space-y-1">
                {completedTasks.map((task) => (
```

par :

```tsx
          {completedTasks.length > 0 && (() => {
            // Dépliée d'office sur l'onglet "Terminées" (sinon onglet vide) ;
            // sinon repliée par défaut.
            const completedExpanded = showCompletedList || statusFilter === "completed";
            const completedTotal = tasks.filter(t => t.status === "completed").length;
            return (
            <>
              <button
                type="button"
                onClick={() => setShowCompletedList((v) => !v)}
                className="w-full text-xs font-semibold text-green-600 uppercase tracking-wider mt-4 mb-2 flex items-center gap-1.5"
              >
                {completedExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <CheckCircle2 className="h-3 w-3" /> Terminées ({completedTasks.length}{completedTotal > 100 ? ` sur ${completedTotal}` : ""})
              </button>
              {completedExpanded && (
              <div className="space-y-1">
                {completedTasks.map((task) => (
```

- [ ] **Step 4 : Fermer les nouveaux blocs** — le bloc completed se terminait par :

```tsx
                ))}
              </div>
            </>
          )}
```

Le remplacer par (ferme le `{completedExpanded && (`, le fragment, et l'IIFE) :

```tsx
                ))}
              </div>
              )}
            </>
            );
          })()}
```

- [ ] **Step 5 : Passer `compact` aux `TaskRow` terminées** — dans le `completedTasks.map(...)`, sur le composant `<TaskRow`, ajouter le prop `compact`. Repérer le `<TaskRow` de ce map (clé `key={`completed-${task.id}`}`) et ajouter `compact` parmi ses props (par ex. juste après `isOverdue` n'y est pas — ajouter `compact` après `onCancelComplete={...}` ou n'importe où dans la liste de props) :

```tsx
                    compact
```

- [ ] **Step 6 : Passer `compact` aux cartes Kanban terminées** — dans la colonne « Terminées » du Kanban, le `kanbanCompleted.map(...)`. Remplacer :

```tsx
            {kanbanCompleted.map(task => <TaskKanbanCard key={task.id} task={task} onToggle={handleToggleComplete} onEdit={startEditingTask} completingTask={completingTask} completionNotes={completionNotes} onCompletionNotesChange={setCompletionNotes} onConfirmComplete={handleConfirmComplete} onCancelComplete={() => { setCompletingTask(null); setCompletionNotes(""); }} />)}
```

par (ajout de `compact` en fin de props) :

```tsx
            {kanbanCompleted.map(task => <TaskKanbanCard key={task.id} task={task} onToggle={handleToggleComplete} onEdit={startEditingTask} completingTask={completingTask} completionNotes={completionNotes} onCompletionNotesChange={setCompletionNotes} onConfirmComplete={handleConfirmComplete} onCancelComplete={() => { setCompletingTask(null); setCompletionNotes(""); }} compact />)}
```

- [ ] **Step 7 : Typecheck** — Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "crm/tasks/page" || echo OK`. Expected: `OK`.

- [ ] **Step 8 : Commit**

```bash
git add "src/app/(dashboard)/admin/crm/tasks/page.tsx"
git commit -m "feat(crm): section Terminées repliable + cartes compactes (vues Liste/Kanban)"
```

---

### Task 4 : Vérification finale

- [ ] **Step 1 : Typecheck global** — Run: `npx tsc --noEmit -p tsconfig.json`. Expected: aucune erreur.
- [ ] **Step 2 : Suite de tests** — Run: `npx vitest run`. Expected: 400 tests passent (changement purement UI, aucun test impacté).

---

### Vérification manuelle (après déploiement)

- [ ] Page Tâches, onglet « Toutes » : la section « Terminées » est **repliée** (chevron fermé) ; les tâches actives restent en plein affichage.
- [ ] Cliquer l'en-tête « Terminées » : la section se déplie ; les lignes terminées sont **compactes** (case + titre barré + date).
- [ ] Onglet « Terminées » : la section est **dépliée d'office**.
- [ ] Vue Kanban : la colonne « Terminées » affiche des **cartes fines** ; les 3 autres colonnes inchangées.
- [ ] Ouvrir une tâche terminée (clic) puis l'éditer : le **formulaire complet** s'affiche normalement.
- [ ] Une tâche d'un prospect (page prospect) : affichage des terminées **inchangé**.
