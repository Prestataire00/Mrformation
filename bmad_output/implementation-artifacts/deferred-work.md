# Deferred Work — items reportés des code reviews BMad

Ce fichier collecte les items identifiés en code review mais reportés à une future story (pré-existants, hors scope de la story en cours, refactor de fond, etc.).

---

## Deferred from: code review of h-19-taches-commerciales-vues-calendar-today (2026-05-18)

Scope du review : module CRM Tasks complet (frontend `src/app/(dashboard)/admin/crm/tasks/*` + backend `src/app/api/crm/tasks/*`).

### Décisions produit / scope (résolues le 2026-05-18)

- **Pagination front (status quo)** — Décision Wissam : ne pas refactor tant que volume `crm_tasks` < 1000. La route API expose déjà la pagination (`route.ts:59-72`), donc migration possible le jour où on en a besoin. Trigger : si l'admin signale "je ne vois pas toutes mes tâches" OR si `SELECT count(*) FROM crm_tasks WHERE entity_id = ?` dépasse 800. À ce moment-là : story dédiée pour migrer le front vers `fetch("/api/crm/tasks?page=X")` + TanStack Table cursor.
- **Scope rôle `commercial` (peer-access)** — Décision Wissam : statu quo h-17/h-18. Un commercial voit/modifie/supprime toutes les tâches CRM de son entité (pas seulement les siennes). Cohérent avec le modèle "équipe commerciale qui collabore". À NE PAS aligner sur le scope `trainer` (`assigned_to = user.id`) sauf changement de besoin produit.

### Sécurité / multi-tenant (P0 latent)

- **`entity_id` conditionnel côté front** — Tous les `query.eq("entity_id", entityId)` côté `page.tsx` sont gardés par `if (entityId)`. Combiné aux RLS prod `allow_all USING(true)` documentées (mémoire `project_rls_state.md`), c'est une fuite cross-tenant latente. Couplé à #2/#3 ci-dessous. Refs : `page.tsx:167,174,181,200,213,269`.
- **`createServiceClient()` par défaut sur POST/PATCH/DELETE** — La service-role bypasse RLS, seuls les `eq("entity_id", profile.entity_id)` codés à la main défendent. Si futur dev oublie un `eq`, élévation. Refs : `src/app/api/crm/tasks/route.ts:185-191`, `src/app/api/crm/tasks/[id]/route.ts:65-66,190-191`.

### Refactor architecturaux (règles CLAUDE.md violées par l'existant)

- **`<button>` HTML natif au lieu de `Button` shadcn** (règle 9) — `page.tsx:468,471,474,477,491` + `TodayView.tsx:77`. Pattern hérité, h-19 §6.3 instruisait explicitement de le reproduire. À refactorer via `ToggleGroup` shadcn dans une story dédiée.
- **Pas de React Hook Form + Zod côté UI form** (règle 6) — `page.tsx:153-321` utilise `useState<TaskFormData>` + `validateForm()` manuelle. Pré-existant.
- **Appels Supabase inline dans composant** (règle 10) — pas de `src/lib/services/crm-tasks.ts`. Tout `page.tsx` query Supabase directement. Pré-existant.

### Fonctionnel reporté

- **`reminder_at` non éditable sur tâche existante** — UI form expose seulement les presets à la création (page.tsx:262,599-622), aucun champ libre datetime, et le `TaskRow` édition ne montre rien sur `reminder_at`. Story h-21 (suite Epic H).
- **Pas de bascule auto à minuit en session longue** — Sections "Aujourd'hui"/"En retard" sont calculées au render et ne mettent pas à jour automatiquement quand on passe minuit. Low priority.
- **`handleRowClick` redirige sans confirm si édition en cours** — `page.tsx:1054-1062` push vers prospect/client même si `editingTaskId` actif → perte de modifs. UX iteration.

### Edge cases mineurs

- **`PRIORITY_BORDER[task.priority]` sans fallback** — Si une tâche Sellsy importée a une priorité hors enum (`urgent`, `null`), la bordure disparaît silencieusement. `CalendarView.tsx:156`.
- **`assigneeFilter` non validé contre liste profiles** — `page.tsx:204`. Protégé par RLS si fonctionnelles, mais fragile.
- **Tâches sans `due_date` invisibles dans CalendarView** — `CalendarView.tsx:57` `if (!task.due_date) continue;`. Comportement attendu mais aucune UI ne signale qu'il y a N tâches non visibles.
- **DST / timezone local dans `crm-task-reminder.ts`** — `computeReminderDate` (`setHours(9,0,0,0)` local) et `getReminderStatus` (comparaison Date locale vs ISO UTC) peuvent décaler de 1h autour des changements heure été/hiver.
- **`crm_notifications` insert sans check user actif** — `route.ts:242-260`, `[id]/route.ts:133-150`. Pollution possible de la table avec entrées non-lisibles par RLS.
