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

---

## Deferred from: spec-tasks-attribution-bug (2026-05-19)

- **Sellsy import : tâches importées ont `assigned_to = NULL`** — Le script `scripts/import-sellsy-crm.py` (ligne 467-469) ne mappe PAS la colonne Sellsy "assigné à" → UUID profile. Conséquence : les counts dropdown du module Tasks (qui dérivent de `crm_tasks.assigned_to`) ignorent toutes les tâches Sellsy historiques. Solutions possibles : (a) backfill SQL via matching nom prénom Sellsy → profile (comme c'est fait pour `created_by`), (b) extension script v2 qui parse la colonne assignee Sellsy. À traiter dans une story dédiée si Loris se plaint que ses tâches Sellsy historiques ne remontent pas via "Mes tâches".

### Defers code review spec-tasks-attribution-bug (2026-05-19)

- **Race condition commercial default URL desync** — Au mount d'un user `commercial`, fetchTasks fire 2 fois : (1) avec `assigneeFilter="all"` (initial state lu de l'URL vide), (2) après chargement du profile avec `assigneeFilter="me"`. La 1ère query montre brièvement toutes les tâches de l'équipe avant le filter "Mes tâches". Flicker visible. Fix possible : gater fetchTasks sur `assigneeRoleDefaultApplied === true`. Hors scope du fix actuel (race < 200ms en pratique).
- **Back-button URL clearing ne re-applique pas le default rôle** — Un commercial qui navigue avec `?assignee=me`, clique sur une tâche puis back, peut se retrouver sur une URL sans param. Le default n'est appliqué qu'au mount initial. Edge case rare, hors scope.
- **`statusFilter === "all"` + `assigneeFilter` non-"all" → `cancelled` invisible** — La fix #3 force `pending+in_progress` ce qui cache `cancelled`. Asymétrie : `cancelled` visible dans "Toute l'équipe → Toutes", invisible quand on filtre par personne. Pré-existant des tabs UI (only `all/pending/completed`). Si Loris a besoin de voir les cancelled, ajouter un tab dédié.
- **Combined cross-ref URL overflow** — Si search active + 200 prospects + 200 clients matchent en pre-fetch, l'URL combinée peut atteindre 14-18 KB. Le warning P8 actuel ne fire que par cross-ref individuel (200 atteint). À ajouter : aggregate cap.
- **`completedThisWeek` stat hero compte par `due_date` au lieu de `completed_at`** — Mauvaise sémantique : une tâche complétée cette semaine avec `due_date` ancien n'est pas comptée. Fix : utiliser `completed_at >= startOfWeek`.
- **Stale tasks après entity switch** — L'effect outer ne reset pas `tasks` quand entityId passe à null. Le bailout interne le fait mais l'effect skip avant. Edge case rare (entity switcher en cours de session).
- **`statusFilter`, `priorityFilter`, `search` non-synchronisés à l'URL** — Seul `assigneeFilter` est persistant URL. Refresh/share lose les autres filtres.
- **Label "Toute l'équipe (N)" inclut __unassigned__** — Ambigu : suggère "humans only" mais somme tout. Renommer en "Toutes" ou exclure __unassigned__ du compteur.
- **`hasActiveFilters` ne reflète pas le auto-restrict actif** — Quand fix #3 cache silencieusement les completed pour un commercial, "Réinitialiser" n'aide pas (les statuts restent restreints car statusFilter="all"). UX edge case.

---

## Deferred from: code review of h-22-documents-secondaires-attribuables-loris (2026-05-20)

Scope review : revue adversariale du flux complet « documents secondaires » (attribution → affichage TabConventionDocs → génération PDF → envoi → signature). 1 BLOCKER + 3 patches + 1 decision-needed tracés en action items dans la story ; defers ci-dessous = pré-existants hors symptôme.

- **`created_by` non renseigné sur les docs secondaires** [attribute-secondary/route.ts] — les rows sont insérées sans `created_by`. Colonne nullable → pas de blocage, mais l'audit Qualiopi « qui a attribué ce document » est incomplet. À renseigner (`user.id`) quand la route sera touchée pour le fix BLOCKER.
- **`getDocsForSession` sans filtre `entity_id` explicite** [documents-store.ts:132-143] — le SELECT ne filtre que par `session_id`. RLS `entity_isolation` + vérification de session en amont compensent. Défense en profondeur à ajouter si la fonction est réutilisée hors d'un contexte déjà vérifié.
- **Clé d'idempotence incohérente entre call-sites** — `attribute-secondary` construit la clé avec `owner_type ?? ""` / `owner_id ?? ""` (chaîne vide) là où d'autres call-sites utilisent `null`. Latent : sans effet tant que tous les owners sont non-null (cas actuel). À unifier si un doc_type à owner null apparaît.
- **`markDoc*` : read-modify-write non atomique sur `metadata`** [documents-store.ts] — deux mises à jour concurrentes du JSON `metadata` peuvent s'écraser. Pré-existant, pas une régression h-22 ; à traiter globalement si la concurrence devient réelle.
- **`generate-from-template` ne valide pas `ownerType` vs contexte** [generate-from-template/route.ts] — un doc généré avec un owner incohérent (ex. doc `learner` sans learner) sort en PDF avec placeholders non résolus au lieu d'une erreur explicite. Lié à la decision-needed `ownerType:"session"`.
- **Refonte `owner_type='session'` pour les 4 docs de synthèse** — `bilan_poe`, `reponses_evaluations`, `reponses_satisfaction_session`, `resultats_evaluations` restent rattachés à la 1ʳᵉ entreprise (`owner_type='company'`). Décision 2026-05-21 : conservé tel quel — le fix d'affichage (section « Documents secondaires ») les rend visibles sous leur entreprise. Amélioration future : passer en `owner_type='session'` (owner_id null) + section « Documents de session » + suppression du skip-si-aucune-entreprise dans `attribute-secondary`. Nécessite de vérifier la CHECK constraint `documents.owner_type` et d'étendre `ConventionOwnerType` côté UI.

---

## Deferred from: code review (2026-05-21) — Facturation espace formation

Scope review : revue adversariale de la sous-catégorie Facturation (13 fichiers, mode `no-spec`, 2 couches). 27 `patch` + 9 `defer`. Rapport complet : `code-review-facturation-2026-05-21.md`. Defers = réels mais nécessitant un travail plus large ou une décision produit.

- **`recipient_id` factice à l'import (`crypto.randomUUID()`)** [invoices/import/route.ts:81] — UUID ne pointant sur aucun client/apprenant → relances et email impossibles sur les factures importées. Fix correct : faire capturer un vrai destinataire par `ImportInvoiceDialog`, ou rendre `recipient_id` nullable + skip gracieux des externes dans `process-reminders`.
- **`affacturage` POST : 3 écritures séquentielles sans transaction** [affacturage/route.ts:85-130] — INSERT lot + INSERT pivots + UPDATE `is_factored` ; échec partiel → état incohérent. Atomicité réelle = RPC DB.
- **`affacturage/[id]` : cascade `paid` non réversible** [affacturage/[id]/route.ts:37-50] — Repasser un lot en `pending`/`cancelled` ne « dé-paie » pas les factures. Décision produit.
- **`auto-generate` : modèle de co-financement financeur/entreprise** [invoices/auto-generate/route.ts:231-277] — Le montant entreprise n'est pas déduit du co-financement financeur ; double facturation potentielle. À clarifier avec le métier avant de coder.
- **`invoice-pdf-export` : aucune pagination, débordement A4** [invoice-pdf-export.ts:431-447] — Facture INTER avec beaucoup d'apprenants déborde la page (footer figé « 1 »). Feature layout multi-pages.
- **Calcul TVA dupliqué ×3 + `calculateInvoiceTotals` code mort** [invoice-builder.ts:99-108] — Centraliser HT/TVA/TTC. Refactor.
- **`process-reminders` : pas de verrou de traitement par facture** — Deux runs concurrents du cron peuvent relancer 2×. Architectural.
- **Appels Supabase inline dans `TabFinances`** — Charges, passage `sent` etc. en `supabase.from(...)` direct dans le composant (viole CLAUDE.md règle 10). Extraire vers `src/lib/services/`.
- **`invoice-pdf-export` : avoir avec lignes → lignes positives, total négatif** [invoice-pdf-export.ts:250-315] — Document contradictoire ; edge case rare (avoirs créés avec `lines: []`).

---

## Découpage : spec-questionnaires-auto-eval (2026-06-26)

Le SPEC `bmad_output/specs/spec-questionnaires-auto-eval/SPEC.md` dépassait la cible de scope (1 seul goal ≤1600 tokens). Scindé en 2 livrables shippables développés **en parallèle** (sessions + branches distinctes), partageant le **Contrat gelé** (types `auto_eval_pre`/`auto_eval_post`, format réponses `program_objectives`).

- **Goal A — Auto-attribution backend** → `spec-questionnaires-auto-attribution.md` (cette session, branche `feat/questionnaires-auto-eval`). Seed questionnaires+règles, `default-packs.ts`, `execute-rule.ts` lazy-assign.
- **Goal B — Visualisation progression objectifs + % satisfaction** → `spec-questionnaires-progression-viz.md` (autre session, branche dédiée ex. `feat/questionnaires-progression-viz`). `loadObjectivesProgression`, `ObjectivesProgressionCard`, intégration `TabQuestionnaires`. Testable sur fixtures sans attendre A.

Aucun fichier commun entre A et B → pas de conflit git tant que chaque session reste sur sa branche. Décision Wissam (parallélisation).

---

## Deferred from: review spec-questionnaires-auto-attribution (2026-06-26)

- **Auto-attribution satisfaction à chaud dépend du tag `quality_indicator_type='satisfaction_chaud'`** — La règle seedée `questionnaire_satisfaction` (on_session_completion) ne s'auto-résout que si l'entité possède un questionnaire actif tagué `satisfaction_chaud`. Les questionnaires satisfaction existants (C3V/MR) ne sont peut-être pas tagués → la règle skippe proprement (console.warn, pas d'email). Positionnement + auto-éval (cœur du SPEC) ne sont PAS concernés (créés tagués par le seed). Décision à prendre : (a) taguer un questionnaire satisfaction existant par entité (= modification de données existantes, Ask First), ou (b) laisser l'admin tagger via l'UI questionnaires. À vérifier en prod : `SELECT entity_id, count(*) FROM questionnaires WHERE quality_indicator_type='satisfaction_chaud' AND is_active GROUP BY entity_id;`

---

## Deferred from: code review of spec-program-supports-docs-partages (2026-06-26)

Scope du review : feature « supports de cours attachés au programme » (table `program_documents`, publiés en Docs partagés admin + portail apprenant).

### Bucket `formation-docs` PUBLIC → URLs permanentes (isolation par bucket illusoire)

- **Constat (3 relecteurs)** : le bucket `formation-docs` est `public = true`. Les supports (`ProgramSupports`) y sont stockés et le portail apprenant ouvre directement la `file_url` publique permanente (choix explicitement acté dans la spec, boundary « Never » : pas d'élévation de rôle sur signed-url). Conséquence : un fichier reste téléchargeable par quiconque possède l'URL, sans contrôle `entity_id` ni authentification, et survit à la « suppression » DB tant que le fichier Storage existe.
- **Pourquoi reporté** : ce n'est PAS une régression de cette story — c'est l'architecture préexistante, identique à `formation_documents`/`TabDocsPartages`. La feature étend un pattern déjà en place. La défense applicative (RLS `program_documents` + signed-url côté admin + filtre `entity_id`) est en place côté lignes DB.
- **Trigger future story** : si des supports confidentiels doivent être strictement isolés par entité → migrer `formation-docs` vers un bucket PRIVÉ, router l'apprenant via `/api/storage/signed-url` (et y AJOUTER les rôles `learner`/`client` dans `requireRole`), et purger le fichier Storage de façon bloquante à la suppression. Concerne aussi rétroactivement `formation_documents`.

---

## Deferred from: code review of spec-p1-auto-attribution-sans-email (2026-06-27)

### Pas de contrainte UNIQUE sur questionnaire_responses(questionnaire_id, session_id, learner_id)

- **Constat (Edge Case Hunter)** : la réponse in-app (`learner/questionnaires/[id]/page.tsx`) fait un `.insert()` simple ; il n'existe que des index NON uniques sur `questionnaire_responses`. La protection anti-double est uniquement côté client (readOnly + check focus cross-onglet). En course (double-clic réseau lent, 2 onglets) → 2 lignes → double-comptage dans les agrégats Qualiopi (satisfaction, progression).
- **Amplifié par P1** : en mode in-app sans email, TOUS les apprenants passent désormais par ce chemin d'insert direct (avant, une part répondait via le token public). Exposition accrue.
- **Pourquoi reporté** : pré-existant (chemin in-app non modifié par P1), et un fix propre (UNIQUE index + onConflict, ou route serveur dédiée) touche aussi `public-submit` et la sémantique « re-répondre ». Hors scope du découplage email.
- **Trigger future story** : si les KPIs satisfaction/acquisition paraissent gonflés OU si un doublon est constaté en base → ajouter `CREATE UNIQUE INDEX` partiel + gérer le conflit côté insert in-app et public-submit (upsert ou 409 propre).

### Robustesse du déclencheur on_enrollment (positionnement)

- **Constat** : `on_enrollment` dépend d'un ping fire-and-forget (`trigger-on-enrollment`). En mode in-app sans email, un ping raté = positionnement absent de l'espace apprenant, silencieusement. (Note : avant P1 l'email était aussi gaté sur ce même ping — pas de régression nette, mais l'in-app étant désormais le seul canal, la fiabilité du ping compte davantage.)
- **Trigger future story** : si des positionnements manquent en prod → rattrapage idempotent (ex. job qui ré-applique les règles on_enrollment des sessions récentes, ou création de l'assignment masse à la création de session plutôt qu'à l'inscription).

---

## Deferred from: code review of spec-connexion-unique-redirection (2026-06-27)

### Rôle scopé avec entity_id NULL → coincé sur /select-entity (état corrompu)

- **Constat (Blind Hunter F3)** : pour un rôle scopé (learner/client/trainer), `resolveActiveEntity` ignore le cookie et exige `profile.entity_id`. Si celui-ci est NULL, l'utilisateur est renvoyé vers `/select-entity`, mais `/api/auth/switch-entity` n'autorise que super_admin/commercial → il ne peut pas écrire son propre `profile.entity_id` → il reste bloqué sur `/select-entity` (UX dégradée, pas une boucle HTTP car la page est interactive).
- **Pourquoi reporté** : état quasi impossible — tous les apprenants/clients sont créés AVEC `entity_id` (NOT NULL sur learners, posé par create-access/batch). Le `login` ne pose plus `profile.entity_id` (le tunnel pré-login le faisait), mais il n'y avait plus de tunnel. Probabilité ~0.
- **Trigger future story** : si un compte scopé sans entité apparaît (incohérence d'import) → soit autoriser `/select-entity` à écrire `profile.entity_id` pour tout rôle authentifié, soit un job de réconciliation `profiles.entity_id` depuis `learners.entity_id`.

### Nettoyage e2e : bloc select-role mort dans e2e/helpers/auth.ts

- Le helper e2e garde un `if (page.url().includes("select-role"))` alors que la page n'existe plus (inoffensif, jamais déclenché). À retirer lors d'un passage sur les e2e.


## Deferred from: code review of 1-1-editer-formateur-integre (2026-06-27)

- Role legacy non-enum : `FormationTrainer.role` est `string` en base — si une valeur hors enum existe, le Select ne l'affichera pas. Typer le champ ou ajouter un fallback.
- Race condition : pas d'optimistic locking sur `formation_trainers` — deux éditions concurrentes écrasent silencieusement.
- Session supprimée pendant dialog ouvert : le toast "Session introuvable" s'affiche mais le dialog reste ouvert sans action claire.

## Deferred from: quick-dev split "recherche" (2026-06-27)

- **Objectif B — Barre de recherche globale (popover live)** : différé. Construire dans
  `src/components/layout/Header.tsx` (actuellement un `<div>` mort, lignes 199-202) un vrai
  champ + popover de résultats live, cherchant entreprises clients ET prospects CRM, filtré
  `entity_id`, clic → fiche. Réutiliser le moteur unaccent/trigram livré par l'objectif A.
  Décisions produit déjà prises : résultats live (popover) ; périmètre clients + prospects.
  Cf. cadrage `bmad_output/planning-artifacts/2026-06-27-cadrage-recherche-globale-et-prospects.md`.

## Deferred from: code review "recherche prospects fuzzy" (2026-06-27)

- **Debounce / race search-as-you-type** (pré-existant) : la recherche prospects (liste) déclenche
  un fetch à chaque frappe sans debounce ni annulation des requêtes en vol → rafales RPC + risque
  d'affichage périmé si une réponse ancienne arrive après une récente. Ajouter un debounce ~300ms
  + garde "stale request".
- **Wildcards `_`/`%` littéraux** : la nouvelle recherche RPC ne ré-échappe pas `_`/`%` dans la
  partie `ILIKE` (l'ancien `computeSearchPattern` le faisait). Taper `a_b` matche `aXb`. Impact
  faible (faux positifs, pas de fuite). Échapper dans la RPC si gênant.
- **Perf requêtes 1-2 caractères** : sous 3 caractères, l'opérateur trigram `%` ne matche pas et
  le `ILIKE '%x%'` ne peut pas utiliser l'index GIN → seq scan (filtré entity_id). Pré-existant ;
  envisager un minimum de 2-3 caractères avant de lancer la recherche.
- **Count plafonné sous recherche** : sous recherche, `totalCount`/pagination sont bornés par
  `p_limit` (1000 en liste). Acceptable pour une liste paginée ; à revoir si un compteur exact est
  requis sur de très gros volumes de matches.

## Deferred from: code review "barre recherche globale header" (2026-06-27)

- **Abort des requêtes en vol** : la recherche globale (header) ne fait qu'une garde reqId (ignore
  les réponses périmées) mais n'annule pas les requêtes Supabase obsolètes (pas d'AbortController).
  Charge réseau inutile en frappe rapide. Pré-existant comme partout dans l'app.
- **Borne de longueur max de saisie** : pas de cap sur la longueur tapée dans la recherche globale ;
  ajouter un maxLength raisonnable (ex. 100).
- **aria-live sur l'état des résultats** : l'arrivée des résultats / "Aucun résultat" n'est pas
  annoncée aux lecteurs d'écran (région aria-live à ajouter).
- **UX ouverture** : la barre globale s'ouvre au clic (pattern command-palette) ; si on veut taper
  directement dans le header sans clic, prévoir un input header live + popover ancré (focus conservé)
  + nav clavier manuelle.

## Deferred from: code review "planning vrais créneaux" (2026-06-27)

- **Chunking des ids créneaux** : `fetchSessionSlots` fait `.in("session_id", ids)` ; sur une vue
  très large (année, multi-formateurs avec des centaines de sessions) l'URL PostgREST pourrait être
  trop longue. Chunker les ids (lots de ~100) si le besoin se présente. Le `.limit(5000)` couvre déjà
  la troncature lignes.
- **Filtre de date sur les créneaux** : on charge tous les créneaux des sessions visibles (sans borne
  start_time) pour préserver le "a des créneaux ?" global. Optimisable (charger in-range + un check
  d'existence séparé) si la volumétrie devient un souci.

## Découpage : programme générateur interne (cadrage 2026-06-27)

Source cadrage : `bmad_output/brainstorming/brainstorm-alignement-construction-programmes-2026-06-27/brainstorm-intent.md`.
Lot **(A) en cours** = générateur interne côté FORMATION (onglet Programme), branche `feat/programme-generateur-interne`.

- **Objectif B — Côté CRM/PROSPECT + programme flottant** : poser le même générateur sur le prospect
  (document de vente avant signature). Option B tranchée : sauver une vraie ligne `programs`
  « flottante » (+ PDF de vente), puis la rattacher à la formation d'un clic à la signature
  (`set training.program_id`) — on génère une fois, on rattache, pas de régénération. **Nécessite une
  migration SQL** pour le lien/stockage programme ↔ prospect (inexistant aujourd'hui). Dépend de (A).
- **Objectif C — Suppression du chemin manuel séquence-par-séquence** : un seul chemin de création
  (l'IA remplace la saisie manuelle), en conservant le lien programme → session existant
  (`session.training_id → training.program_id → programs`). Nettoyage UX, à faire une fois (A) validé.

### Sous-découpage de (A) — 2026-06-27 (spec dépassait 1600 tokens)

Spec A1 en cours : `spec-programme-generateur-interne.md`, branche `feat/programme-generateur-interne`.

- **A2 — PDF 4 pages au format des 2 exemples** : différé. Nouveau template
  `src/lib/templates/programme-formation-v2.ts` reproduisant les exemples Gamma (page 1 infos
  générales, page 2 cartes « résumé des séquences », pages 3-4 déroulé en **format texte** par
  séquence — objectifs opérationnels / contenus détaillés / méthodes / évaluation / durée), + variables
  de rendu dans `resolve-variables.ts` (ex. `{{sequences_resume}}` + `{{sequences_detail}}` sur le
  pattern `{{contenu_pedagogique}}` l.902-992), + routage du template v2 dans
  `generate-programme/route.ts` quand le programme a la structure enrichie (sans casser le legacy).
  Dépend de la structure de séquence enrichie livrée par A1. Donne le PDF qui remplace réellement Gamma.
  Décision Wissam : « coller à mes 2 exemples » (rework template, pas réutiliser le template Loris).

## Deferred from: code review spec-programme-generateur-interne A1 (2026-06-27)

- **Reset du champ « précisions » au re-render (RHF `values`)** — `GenerateProgramDialog.tsx` utilise `values:` (form réactif) avec `precisions: ""`. Un re-render parent pendant la frappe peut écraser la saisie en cours de « précisions ». Fenêtre étroite (la génération est async, `onRefresh` ne fire qu'au succès → ferme le dialog). LOW. Fix propre : `defaultValues` + `form.reset({...})` à l'ouverture, sortir `precisions` de `values`.
- **Sémantique de versioning décalée d'un cran** — `createProgramVersion` snapshote l'ANCIEN `content` sous une version pendant que `programs.version` passe à N+1 avec le NOUVEAU content. Design préexistant du service (le changement l'utilise tel quel, conformément au spec). À revoir globalement si l'historique des versions doit être strictement aligné. LOW.

## Deferred from: code review spec-programme-pdf-format-exemples A2 (2026-06-27)

- **Champs legacy voisins non échappés dans le PDF v2** — les résolveurs partagés `{{moyens_pedagogiques}}`, `{{dispositif_evaluation}}`, `{{equipe_pedagogique}}`, `{{profil_stagiaire}}`, `{{programme_prerequis}}` injectent le texte brut (pas d'`escapeProgrammeHtml`), alors que les 4 résolveurs A2 voisins échappent. Préexistant (touche aussi le template v1 + d'autres documents). Risque de régression si on change le comportement partagé (du HTML intentionnel pourrait exister). Trigger : si un `<`/`&`/balise dans un champ admin casse un PDF → centraliser l'échappement sur ces résolveurs après vérif des autres docs.
- **Labels statiques page 1 (Informations pratiques / Délais) affichés même vides** — « Prérequis : », « Public cible : », « Lieu : » sont en HTML statique dans `programme-formation-v2.ts` → label orphelin si la valeur résolue est vide. Cosmétique. À peaufiner au calage visuel du PDF (rendre la ligne conditionnelle nécessiterait un rendu côté résolveur).
- **Aperçu catalogue (generate-program-preview) affiche `[Lieu]` / `[Durée heures]`** — `previewSession` met `location`/dates à null, les résolveurs `{{lieu}}`/`{{duree_heures}}` rendent un placeholder `[…]`. Préexistant (convention placeholder). Visible seulement dans l'aperçu hub programme, pas dans le PDF formation réel.
- **Programme sans aucune séquence → pages 2-4 quasi blanches** — les `.page-break` du template v2 sont statiques ; un content routé v2 via `general_objectives` seul (sans modules) produit des pages vides. Cas dégénéré (A1 génère toujours des séquences). À ne traiter que si observé.
- **Effectif « maximum 12 » codé en dur** — conforme aux 2 exemples + au prompt client. Si l'effectif doit suivre `session.max_participants`, basculer sur le résolveur `{{effectif_max}}` (existe déjà).

## Deferred from: code review spec-programme-chemin-unique C (2026-06-27)

- **Route `import-pdf` orpheline** — `src/app/api/programs/import-pdf/route.ts` n'a plus aucun appelant depuis la suppression de l'écran `/admin/programs/import` (lot C). Le spec gelé limitait les suppressions à la page import + la route ai-extract, donc la route import-pdf a été LAISSÉE volontairement. À supprimer dans un lot de nettoyage (grep confirmé : 0 appelant ; expose un endpoint OpenAI/pdf-parse non référencé aux rôles admin). Vérifier zéro référence avant suppression.
