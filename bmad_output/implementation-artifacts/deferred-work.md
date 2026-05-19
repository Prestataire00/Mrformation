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

---

## Deferred from: code review of h-22-documents-secondaires-attribuables-loris (2026-05-19)

Scope du review : story h-22 (branche 23 templates secondaires + UI catalogue + 5 signables + migration). Defers identifiés post-triage (BLOCKER/HIGH traités séparément).

- **Triple-source des doc_types** — `SECONDARY_DOC_TYPES` (secondary-categories.ts) + `SYSTEM_TEMPLATES_BY_DOC_TYPE` keys (registry.ts) + `ConventionDocType` union (types/index.ts). Le `satisfies readonly ConventionDocType[]` protège la direction array → union mais pas l'inverse. Test runtime cross-check à ajouter quand on aura un 4e ajout (h-23+) qui forcera la factorisation.
- **`decharge_responsabilite` vs `lettre_decharge_responsabilite`** — Templates near-duplicates. UX call avec Loris au smoke prod : garder les 2, en deprecate un, ou guidance UI ("Choisir l'un des deux"). Pas un bug code.
- **Pas de "favoris templates par formation"** — Story h-23 candidate (cf spec h-22 §3 Hors scope). Loris attribue manuellement à chaque session pour le MVP.
- **`DOC_SHORT` perd la disambiguation "BR"** — Label compact `"Hab. B1V/B2V"` pour `avis_hab_elec_b1v_b2v_br`. Acceptable car le doc_type technique reste précis ; à revisiter si Loris signale confusion.
- **Param API `formationId` est sémantiquement un `session.id`** — Convention projet (formation = session côté UI). Rename hors-scope. Note : peut induire en erreur sur les jointures `formation_trainers.formation_id` / `formation_companies.formation_id` (vraies FK formation_id) qui sont distinctes de `enrollments.session_id` — vérifier au moment du fix B1 que ces FK sont bien préservées si on bascule sur `insertDocs`.
- **`DOC_LABELS_PLURAL` non mis à jour pour les 23 nouveaux types** — Fallback string-slug fonctionne. À compléter quand une UI surface concrètement un label pluriel pour un secondaire (mass action ciblée).

---

## Deferred from: code review of h-23-crm-prospects-hotfixes (2026-05-19)

Scope review : 6 sujets bundle h-23 (nom cliquable, hardening conversion, bouton créer, Pappers UPFRONT, search Tasks+Prospects, Communications/Timeline). 5 BLOCKERS sécurité/correctness à patcher + 10 patches HIGH/MEDIUM. Defers ci-dessous = debt acceptable pour ne pas bloquer le smoke prod.

- **Kanban inline form non refactoré vers `AddProspectDialog` partagé** — Auditor BLOCKER. La spec h-23 demandait l'extraction depuis la kanban vers un composant partagé. Livré comme NEW composant sur la liste uniquement, kanban garde son Dialog inline. Anti-DRY mais sans régression fonctionnelle. À traiter dans une story h-24 si on consolide.
- **`sector` field pas auto-fillé par Pappers à la création** — `CompanySearchResult` n'expose pas `sector`, requires extension du type + appel Pappers naf_label → sector mapping. Hors-scope MVP. Pourra être ajouté quand un user concret le demande.
- **Pattern `useState` + manual validation dans `AddProspectDialog`** — Violation CLAUDE.md rule #6 (RHF+Zod). Hérité du kanban (qui utilise aussi useState). Migration projet-wide à faire dans une story dédiée d'harmonisation forms CRM.
- **Inline `supabase.from().insert()` dans `AddProspectDialog`** — Violation CLAUDE.md rule #10. Refactor services dédié (extraction vers `src/lib/services/crm-prospects.ts`).
- **Pas de UNIQUE constraint sur `crm_prospects(entity_id, LOWER(company_name))`** — Permet 2 prospects identiques côté DB. Migration séparée si besoin.
- **A11y : button cliquable nested dans `<tr onClick>` (liste prospects)** — Audit a11y dédié, axe/WCAG warnings.
- **Empty state du tab Communication post-h-23** — Si prospect a zéro email, tab affiche blanc. Ajouter fallback dans `ProspectEmailSection`.
- **`splitName` SQL fragile sur NBSP / whitespace exotique** — `regexp_split_to_array` plus robuste, cosmétique data quality.
- **UX confusion liste prospects** — Cellules name/contact naviguent vers la fiche, autres cellules togglent le panel select bas. Choisir un seul comportement (tout naviguer OU tout toggler + icône dédiée). Itération UX.
