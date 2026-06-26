---
title: "Fix extraction réponses évaluations : découverte des questionnaires de session drift-proof"
type: 'bugfix'
created: '2026-06-26'
status: 'done'
baseline_commit: 'a48882ed4b08a0610a4be8c26c7bd70a3850cf35'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/supabase/migrations/sync_assignments_to_questionnaire_sessions.sql'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le document secondaire d'extraction des réponses (`reponses_evaluations`, `reponses_satisfaction_session`) affiche « Aucune réponse… » même quand des réponses existent. Cause racine : `loadSatisfactionAggregates` / `loadEvaluationAggregates` / l'acquisition de `loadQualiopiIndicators` découvrent les questionnaires de la session **uniquement via `questionnaire_sessions`**, alors que le système actuel (onglets formation + auto-attribution) attribue via `formation_evaluation_assignments` / `formation_satisfaction_assignments`. Le pont est un trigger SQL miroir **non garanti déployé en prod** (drift) → la table miroir reste vide → l'extraction ne trouve aucun questionnaire. Deux correctifs antérieurs (set `DOC_TYPES_NEEDING_AGGREGATES`, puis le trigger miroir) n'ont pas tenu.

**Approach:** Rendre la découverte **indépendante du miroir** : un helper unique résout les questionnaires d'une session par type en **UNION** de `questionnaire_sessions` (legacy/manuel) + de la table d'assignment correspondante (`formation_evaluation_assignments` pour `evaluation`, `formation_satisfaction_assignments` pour `satisfaction`), dédupliqué par `questionnaire_id`. On l'utilise aux 3 points de découverte du fichier. C'est exactement la source que lit déjà `loadObjectivesProgression` (qui, elle, fonctionne).

## Boundaries & Constraints

**Always:** Filtrer par `session_id` (l'isolation `entity_id` transite par la session, cf. JSDoc existant — ne PAS ajouter de `.eq("entity_id")` direct sur ces tables sans colonne entity_id). Conserver la sémantique de type (`type='evaluation'` / `type='satisfaction'`) via le join `questionnaires`. Dédupliquer par `questionnaire_id`. Pas de `any`.

**Ask First:** Toute modification du trigger SQL ou des tables d'assignment. Tout changement des builders de template / du format des documents.

**Never:** Pas de dépendance au déploiement du trigger miroir. Ne pas écrire dans `questionnaire_sessions` depuis le code applicatif. Ne pas toucher au calcul `loadObjectivesProgression` (déjà correct). Pas de nouveau document ni de nouveau doc_type. Ne pas changer le filtre `session_id` des réponses (les réponses portent bien `session_id`, confirmé).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Questionnaire attribué via assignment, trigger NON déployé | `formation_*_assignments` peuplé, `questionnaire_sessions` vide | Helper retourne le questionnaire ; agrégats + extraction non vides | aucune réponse → agrégat avec responseCount 0, pas de crash |
| Questionnaire attribué via legacy `questionnaire_sessions` | mirror présent, pas d'assignment | Toujours découvert (pas de régression) | N/A |
| Attribué dans les DEUX sources | mirror + assignment | Compté une seule fois (dédup par `questionnaire_id`) | N/A |
| Assignment satisfaction en masse | `formation_satisfaction_assignments` plusieurs lignes (chaud/froid, targets), `target_id` NULL | 1 seul questionnaire_id dédupliqué, type=satisfaction | N/A |
| Type incohérent | assignment pointant un questionnaire d'un autre type | Exclu (filtre `questionnaires.type`) | N/A |
| Aucun questionnaire | ni mirror ni assignment | `[]` → builders affichent « Aucune réponse… » (comportement normal) | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/services/load-session-aggregates.ts:66` -- `loadSatisfactionAggregates`, découverte via `questionnaire_sessions` (à remplacer).
- `src/lib/services/load-session-aggregates.ts:211` -- `loadQualiopiIndicators`, découverte évaluations pour acquisition (à remplacer).
- `src/lib/services/load-session-aggregates.ts:294` -- `loadEvaluationAggregates`, découverte via `questionnaire_sessions` (besoin id **+ title**).
- `src/lib/services/load-session-aggregates.ts:374` -- `loadObjectivesProgression`, **modèle correct** lisant `formation_evaluation_assignments` (ne pas modifier).
- `supabase/migrations/sync_assignments_to_questionnaire_sessions.sql` -- trigger miroir (contexte : la cause du drift).
- `src/app/api/documents/generate-from-template/route.ts:542` -- consommateur (charge `loadSessionAggregates` pour les doc_types d'extraction).
- `src/lib/__tests__/objectives-progression.test.ts` -- pattern de mock Supabase chaînable à réutiliser.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/services/load-session-aggregates.ts` -- Ajouter un helper privé `getSessionQuestionnaireMeta(supabase, sessionId, type: 'evaluation' | 'satisfaction'): Promise<{ id: string; title: string }[]>` qui UNION `questionnaire_sessions` + la table d'assignment du type (join `questionnaires!inner(id, type, title)`, filtre `session_id`, garde `type` correspondant, dédup par `questionnaire_id`). -- source de vérité unifiée, drift-proof.
- [x] `src/lib/services/load-session-aggregates.ts` -- Remplacer les 3 découvertes (`loadSatisfactionAggregates` L66-80, `loadQualiopiIndicators` acquisition L211-220, `loadEvaluationAggregates` L292-304) par un appel au helper. Pour l'évaluation, utiliser `title` du helper (plus de `qs.questionnaires.title`). -- corrige le bug aux 3 endroits, cohérent.
- [x] `src/lib/__tests__/load-session-aggregates-discovery.test.ts` -- Tester le helper / les loaders : découverte via assignment seul (trigger absent), via mirror seul, dédup des deux, filtre par type, cas vide. Mock Supabase chaînable (cf. objectives-progression.test.ts). -- couvre la matrice I/O.

**Acceptance Criteria:**
- Given une session dont les questionnaires d'évaluation/satisfaction sont attribués via `formation_*_assignments` et `questionnaire_sessions` vide (trigger non déployé), when on génère le document d'extraction des réponses, then les réponses des apprenants apparaissent (agrégats non vides).
- Given une session dont un questionnaire est attribué via l'ancien `questionnaire_sessions` uniquement, when on génère l'extraction, then il reste découvert (aucune régression).
- Given un questionnaire présent dans les deux sources, when la découverte s'exécute, then il n'est compté qu'une fois.
- Given une session sans aucun questionnaire, when on génère l'extraction, then le document affiche « Aucune réponse… » sans erreur.

## Design Notes

Helper (esquisse) :
```ts
const ASSIGN = { evaluation: "formation_evaluation_assignments",
                 satisfaction: "formation_satisfaction_assignments" } as const;
const [qs, asg] = await Promise.all([
  supabase.from("questionnaire_sessions")
    .select("questionnaire_id, questionnaires:questionnaires!inner(id, type, title)").eq("session_id", sessionId),
  supabase.from(ASSIGN[type])
    .select("questionnaire_id, questionnaires:questionnaires!inner(id, type, title)").eq("session_id", sessionId),
]);
const byId = new Map<string, string>();
for (const r of [...(qs.data ?? []), ...(asg.data ?? [])] as Row[])
  if (r.questionnaires?.type === type && !byId.has(r.questionnaire_id))
    byId.set(r.questionnaire_id, r.questionnaires.title ?? "");
return [...byId].map(([id, title]) => ({ id, title }));
```
Le join `questionnaires!inner` fonctionne sur les 3 tables (chacune a la FK `questionnaire_id → questionnaires`). Pas de stopgap migration requis côté code (l'admin peut toujours déployer le trigger séparément, mais ce n'est plus nécessaire).

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur
- `npx vitest run src/lib/__tests__/load-session-aggregates-discovery.test.ts` -- expected: tous verts
- `npx vitest run src/lib/__tests__/objectives-progression.test.ts src/lib/__tests__/qualiopi-score.test.ts` -- expected: pas de régression

**Manual checks:**
- Sur une session réelle avec questionnaires attribués (onglets formation) et réponses soumises, générer le document secondaire « Réponses aux évaluations » → vérifier que les tableaux sont remplis (et plus « Aucune réponse… »).

## Suggested Review Order

Une seule préoccupation : unifier la découverte des questionnaires de session.

- Entrée : le helper drift-proof (UNION mirror + assignments, dédup par questionnaire_id, filtre type)
  [`load-session-aggregates.ts:79`](../../src/lib/services/load-session-aggregates.ts#L79)

- Garde-fou anti-régression (issu de la revue) : les erreurs des 2 sources sont loguées, plus jamais avalées en silence
  [`load-session-aggregates.ts:90`](../../src/lib/services/load-session-aggregates.ts#L90)

- Site 1 — satisfaction : découverte remplacée par le helper
  [`load-session-aggregates.ts:123`](../../src/lib/services/load-session-aggregates.ts#L123)

- Site 2 — acquisition Qualiopi : idem
  [`load-session-aggregates.ts:258`](../../src/lib/services/load-session-aggregates.ts#L258)

- Site 3 — agrégats évaluation : helper en parallèle des enrollments, `title` consommé du helper
  [`load-session-aggregates.ts:332`](../../src/lib/services/load-session-aggregates.ts#L332)

- Invariant : `loadObjectivesProgression` (la source déjà correcte) reste strictement intacte
  [`load-session-aggregates.ts:406`](../../src/lib/services/load-session-aggregates.ts#L406)

- Tests : découverte assignment-seul / mirror-seul / dédup / filtre type / masse / vide
  [`load-session-aggregates-discovery.test.ts:37`](../../src/lib/__tests__/load-session-aggregates-discovery.test.ts#L37)
