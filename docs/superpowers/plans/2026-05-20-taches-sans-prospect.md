# Mise en avant des tâches CRM sans prospect — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de repérer et filtrer les tâches CRM non rattachées à un prospect, dans la page Tâches.

**Architecture:** Deux ajouts dans le composant page `tasks/page.tsx` : (1) un interrupteur de filtre serveur « Sans prospect » dans la barre de filtres ; (2) un badge ambre cliquable dans le composant `TaskRow` (vue Liste) qui ouvre l'édition inline de la tâche.

**Tech Stack:** Next.js 14 (App Router, client component), TypeScript, Supabase JS, TailwindCSS, lucide-react.

**Spec :** `docs/superpowers/specs/2026-05-20-taches-sans-prospect-design.md`

**Note vérification :** la page est un gros composant client (1546 lignes) sans harnais de test composant. La vérification de chaque tâche = `npx tsc --noEmit` (doit passer) + checklist manuelle. Pas de tests unitaires inventés.

---

### Task 1 : Filtre interrupteur « Sans prospect »

**Files:**
- Modify: `src/app/(dashboard)/admin/crm/tasks/page.tsx`

- [ ] **Step 1 : Importer l'icône `AlertTriangle`**

Dans le bloc d'import `from "lucide-react"`, ajouter `AlertTriangle`. Anchor :

```tsx
  Building2,
```

devient :

```tsx
  AlertTriangle,
  Building2,
```

- [ ] **Step 2 : Ajouter l'état `noProspectFilter`**

Anchor (zone Filters) :

```tsx
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("pending");
```

devient :

```tsx
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("pending");
  // Filtre : n'afficher que les tâches non rattachées (ni prospect ni client).
  const [noProspectFilter, setNoProspectFilter] = useState(false);
```

- [ ] **Step 3 : Appliquer le filtre côté serveur dans `fetchTasks`**

Anchor :

```tsx
      if (priorityFilter !== "all") query = query.eq("priority", priorityFilter);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
```

devient :

```tsx
      if (priorityFilter !== "all") query = query.eq("priority", priorityFilter);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      // « Sans prospect » = tâche rattachée à rien (ni prospect ni client).
      if (noProspectFilter) query = query.is("prospect_id", null).is("client_id", null);
```

- [ ] **Step 4 : Ajouter `noProspectFilter` aux deps du `useCallback` `fetchTasks`**

Anchor :

```tsx
  }, [supabase, entityId, priorityFilter, statusFilter, search, assigneeFilter, currentUserId, toast]);
```

devient :

```tsx
  }, [supabase, entityId, priorityFilter, statusFilter, search, assigneeFilter, currentUserId, toast, noProspectFilter]);
```

- [ ] **Step 5 : Ajouter `noProspectFilter` aux deps du `useEffect` de déclenchement du fetch**

Anchor :

```tsx
  }, [entityId, search, priorityFilter, statusFilter, assigneeFilter, currentUserId]);
```

devient :

```tsx
  }, [entityId, search, priorityFilter, statusFilter, assigneeFilter, currentUserId, noProspectFilter]);
```

- [ ] **Step 6 : Inclure le filtre dans `hasActiveFilters`**

Anchor :

```tsx
  const hasActiveFilters = search || priorityFilter !== "all" || statusFilter !== "all" || assigneeFilter !== roleDefaultAssignee;
```

devient :

```tsx
  const hasActiveFilters = search || priorityFilter !== "all" || statusFilter !== "all" || assigneeFilter !== roleDefaultAssignee || noProspectFilter;
```

- [ ] **Step 7 : Ajouter le bouton-interrupteur dans la barre de filtres**

Anchor (le `<div>` qui contient les Select Priorité / Propriétaire) :

```tsx
        <div className="flex items-center gap-2">
          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as TaskPriority | "all")}>
```

devient :

```tsx
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setNoProspectFilter((v) => !v)}
            aria-pressed={noProspectFilter}
            title="N'afficher que les tâches non rattachées à un prospect"
            className={cn(
              "flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-medium border transition",
              noProspectFilter
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-gray-200 text-gray-500 hover:bg-gray-100",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Sans prospect
          </button>
          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as TaskPriority | "all")}>
```

- [ ] **Step 8 : Vérifier le typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "tasks/page" || echo "OK"`
Expected: `OK` (aucune erreur TS sur le fichier).

- [ ] **Step 9 : Commit**

```bash
git add "src/app/(dashboard)/admin/crm/tasks/page.tsx"
git commit -m "feat(crm): filtre interrupteur « Sans prospect » sur la page Tâches"
```

---

### Task 2 : Badge « Sans prospect » cliquable (vue Liste)

**Files:**
- Modify: `src/app/(dashboard)/admin/crm/tasks/page.tsx` (composant `TaskRow`)

- [ ] **Step 1 : Ajouter le badge dans la rangée de métadonnées de `TaskRow`**

Le badge s'insère juste après le bloc `{task.client && (...)}`, à l'intérieur de la rangée de métadonnées. Anchor :

```tsx
          {task.client && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3 text-green-600" />
              {task.client.company_name}
            </span>
          )}
        </div>
```

devient :

```tsx
          {task.client && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3 text-green-600" />
              {task.client.company_name}
            </span>
          )}
          {!task.prospect && !task.client && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              title="Cette tâche n'est rattachée à aucun prospect — cliquer pour en attribuer un"
              className="flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              Sans prospect
            </button>
          )}
        </div>
```

- [ ] **Step 2 : Vérifier le typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "tasks/page" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3 : Commit**

```bash
git add "src/app/(dashboard)/admin/crm/tasks/page.tsx"
git commit -m "feat(crm): badge cliquable « Sans prospect » dans la liste des tâches"
```

---

### Vérification finale (manuelle, après déploiement)

- [ ] Sur `/admin/crm/tasks` (vue Liste), un bouton « ⚠ Sans prospect » apparaît dans la barre de filtres.
- [ ] Cliquer le bouton : il passe en ambre et la liste ne montre plus que les tâches sans prospect (toutes vues : Liste, Kanban, Calendrier, Focus du jour).
- [ ] Re-cliquer : le filtre se désactive.
- [ ] En vue Liste, une tâche sans prospect affiche un badge ambre « ⚠ Sans prospect ».
- [ ] Cliquer ce badge ouvre le formulaire d'édition inline de la tâche (avec le Select Prospect).
- [ ] Une tâche avec prospect (ou client) n'affiche pas le badge.
