# Solidification Questionnaires — Volet D (UX pilotage) — Chantier 2b

> **Chantier 2b sur 2** (P0-5 auto Qualiopi reporté à Chantier 2c). Focus UX pour résoudre la pain principale Wissam : « pas facile de piloter la partie questionnaire en l'état ».

**Date :** 2026-05-26
**Branche cible :** `feat/questionnaires-volet-d-ux` (depuis `main` post-merge Chantier 2a à `0162ad1`)
**Effort estimé :** 15-22h (~3-4 jours de dev)
**Pattern :** brainstorming → spec → writing-plans → subagent-driven-development → finishing-a-development-branch (identique aux 8 chantiers précédents)
**Source Chantier 1 :** [docs/superpowers/specs/2026-05-25-questionnaires-solidification-p0-design.md](2026-05-25-questionnaires-solidification-p0-design.md)
**Source Chantier 2a :** [docs/superpowers/specs/2026-05-25-questionnaires-solidification-p1-design.md](2026-05-25-questionnaires-solidification-p1-design.md)
**Deep-dive :** [docs/deep-dive-tab-questionnaires.md](../../deep-dive-tab-questionnaires.md)

---

## 1. Contexte & objectifs

Chantier 1 (mergé à `b239757`) a résolu les 4 P0 critiques. Chantier 2a (mergé à `0162ad1`) a nettoyé la dette technique (Volets B + C + F + bug multiple_choice). Score qualité actuel : **8/10** (vs 3/10 baseline).

Ce Chantier 2b vise à **résoudre la pain principale produit** de Wissam : « pas facile de piloter la partie questionnaire en l'état ». L'admin ne voit pas d'un coup d'œil qui a répondu, où en sont les indicateurs Qualiopi, ni comment voir les réponses détaillées d'un apprenant.

Cible qualité : **9/10**. Reste après ce chantier : P0-5 (cron auto Qualiopi avec pièce jointe — Chantier 2c).

---

## 2. Décisions du brainstorming

| Q | Décision | Rationale |
|---|---|---|
| **Q1 — Périmètre** | **Option B** : Volet D seul, P0-5 reporté à Chantier 2c | P0-5 (cron auto) est risqué (touche les automatisations actives prod) — mérite sa propre validation stricte. Volet D résout le pain principal et est sans risque (pure UI). |
| **Q2 — Gestes prioritaires** | **3 features** : (1) Voir qui n'a pas répondu pour relancer, (2) Voir l'état des indicateurs Qualiopi, (3) Vue compacte stats par stage, **+ Feature D** : (4) Voir les réponses détaillées d'un apprenant | Sélection multi-select par Wissam. La génération PDF (geste 3 initial) reste OK via le tab actuel. |
| **Architecture** | Enrichir TabQuestionnaires (pas de nouveau tab) avec 4 nouveaux sous-composants `_components/questionnaires/` | YAGNI : 13 tabs déjà beaucoup. Le tab existant est à 395 LOC, peut accueillir +50 LOC d'orchestration sans devenir énorme. |
| **Composant `LearnerResponsesDialog`** | Construit from scratch (pas de réutilisation possible) | Recherche dans le code : 3 fichiers rendent des questions (`questionnaire/[token]`, `learner/questionnaires`, `AdminFillQuestionnaireDialog`) mais tous en mode **saisie**, jamais en mode **read-only display**. |

---

## 3. Architecture vue d'ensemble

Chantier 2b = enrichissement de `TabQuestionnaires.tsx` avec 4 nouveaux composants. **Pas de migration SQL, pas de nouvelle route API.**

### 3.1 — Composants à créer

| Composant | Rôle | LOC estimé |
|---|---|---|
| `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/QuestionnaireOverview.tsx` | Bannière en haut : 4 KPIs (Attribués / Envoyés / Répondus / En attente) + ligne Qualiopi (statut des indicateurs) | ~120 |
| `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/StageStatsBar.tsx` | 4 chiffres compacts inline dans chaque stage card (attribués / envoyés / répondus / taux %) + code couleur | ~80 |
| `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/LearnerStatusGrid.tsx` | Grid `apprenants × questionnaires` avec 5 statuts, 3 filtres, bouton "Relancer non-répondants" | ~200 |
| `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/LearnerResponsesDialog.tsx` | Modal read-only avec switch sur `question.type` pour formater les réponses (rating, text, multiple_choice, yes_no, program_objectives) | ~150 |

### 3.2 — Helper de calcul à créer

`src/lib/utils/questionnaire-stats.ts` (~80 LOC) :
- `computeStageStats(stage, assignments, tokens, responses, learners): { attributed: number; sent: number; answered: number; rate: number }`
- `computeLearnerStatuses(enrollments, assignments, tokens, responses): Array<{ learner, questionnaire, status: "answered"|"sent"|"not_sent"|"not_assigned"|"expired" }>`

### 3.3 — Modifications minimales de TabQuestionnaires

- Remplacer le header actuel (2 compteurs lignes 117-122) par `<QuestionnaireOverview .../>`
- Ajouter `<StageStatsBar stage={stage} .../>` dans chaque stage card (juste sous le titre/objectif, avant la liste d'items)
- Ajouter `<LearnerStatusGrid .../>` repliable en bas, sous les 4 stage cards
- Étendre le `Promise.all` de `fetchData()` pour charger aussi `questionnaire_tokens` (statut "envoyé" requis dans le grid)
- Conserver `<ItemDetail .../>` au clic sur un item (inchangé)

### 3.4 — Effort total

| Section | Heures |
|---|---|
| Section 4 — QuestionnaireOverview | 3-4h |
| Section 5 — StageStatsBar | 2-3h |
| Section 6 — LearnerStatusGrid | 4-5h |
| Section 7 — LearnerResponsesDialog | 3-4h |
| Helper `questionnaire-stats.ts` + 3 tests Vitest | 2-3h |
| Intégration TabQuestionnaires + fetchData étendu | 1-2h |
| **Total Chantier 2b** | **15-21h** |

### 3.5 — Hors scope Chantier 2b

- **P0-5** (cron auto Qualiopi sans pièce jointe) → Chantier 2c dédié
- **Vue inversée "par questionnaire → liste apprenants"** (proposée Section 4 du brainstorming, refusée pour YAGNI)
- **Tests E2E** sur le grid interactif (Playwright non installé, hors stack)
- **Refactor architectural** TabQuestionnaires sections/ (toujours < 500 LOC après ce chantier, pas justifié)
- **Vue cross-sessions** (dashboard global de tous les apprenants sur toutes les sessions) — non scopé, demanderait son propre chantier

---

## 4. `QuestionnaireOverview` — Bannière en haut

### 4.1 — Visuel cible

Remplace le header actuel (gradient avec 2 compteurs `Réponses total` + `Complétion %`) par :

```
┌──────────────────────────────────────────────────────────────────────┐
│ Questionnaires de la session                                          │
│                                                                       │
│  [Attribués: 6]  [Envoyés: 24/30]  [Répondus: 18/30]  [En attente: 6] │
│                                                                       │
│  Qualiopi : ✅ Q15 positionnement (80%) · ⚠ Q22 satisfaction (30%) · ⏸ Q23 froid │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 — KPIs détaillés

| KPI | Source |
|---|---|
| **Attribués** | `formation_evaluation_assignments.length + formation_satisfaction_assignments.length` filtré par `session_id` |
| **Envoyés** | nb de `questionnaire_tokens` distincts (générés) pour la session / nb total possible (= nb attributions × nb apprenants concernés) |
| **Répondus** | nb de `questionnaire_responses` distincts pour la session |
| **En attente** | Envoyés - Répondus |

### 4.3 — Ligne Qualiopi

Itère sur les indicateurs Qualiopi **liés aux questionnaires** uniquement (pas tous les indicateurs). Liste à confirmer en **Task 0 du plan** par grep sur `loadQualiopiIndicators` :

- Indicateurs typiques (à confirmer) :
  - `Q15` — Positionnement avant formation (eval_preformation + auto_eval_pre)
  - `Q22` — Satisfaction à chaud (satisfaction_chaud)
  - `Q23` — Satisfaction à froid (satisfaction_froid)
  - `Q24` — Évaluation des acquis (eval_postformation + auto_eval_post)

Statut par indicateur :
- ✅ : 80%+ d'apprenants ont répondu au questionnaire associé
- ⚠ : 1-79% (partiel)
- ⏸ : 0% (pas encore commencé)

### 4.4 — Click handlers

- **Click sur "En attente"** → scrolle vers `LearnerStatusGrid` (smooth scroll) + active le filtre "Non-répondants uniquement"
- **Click sur un indicateur Qualiopi ⚠ ou ⏸** → scrolle vers le stage correspondant (avant/après/froid selon mapping)

### 4.5 — Source des données

`QuestionnaireOverview` reçoit en props : `questionnaires`, `assignments` (eval + satis), `tokens`, `responses`, `enrollments`, `qualiopiIndicators` (de `loadQualiopiIndicators`). Tout est déjà chargé en `fetchData()` de TabQuestionnaires (à étendre pour inclure `tokens` + `qualiopiIndicators`).

---

## 5. `StageStatsBar` — Stats inline par stage

### 5.1 — Visuel cible

Inséré dans chaque stage card, entre l'objectif (existant) et la liste des items (existant) :

```
┌─────────────────────────────────────────┐
│ 📋 Avant la formation                   │ ← header stage existant
│ 7 jours avant — Connaître le niveau...  │ ← objectif existant
│                                          │
│ ─────────────────────────────────────── │
│ 2 attribués · 12/15 envoyés · 8 répondus · 53% │ ← NEW StageStatsBar
│ ─────────────────────────────────────── │
│                                          │
│ [Item 1] Questionnaire positionnement... │ ← items existants
│ [Item 2] Auto-évaluation pré-formation...│
└─────────────────────────────────────────┘
```

### 5.2 — Logique

`<StageStatsBar stage={stage} assignments={getAssignments(stage)} tokens={tokens} responses={responses} learners={enrollments} />`

Utilise le helper `computeStageStats(stage, assignments, tokens, responses, learners)` qui retourne :

```ts
{
  attributed: number;  // nb d'ItemType du stage qui ont au moins 1 attribution
  sent: number;         // nb tokens générés pour les questionnaires du stage
  expectedSent: number; // attributions × apprenants concernés
  answered: number;     // nb responses distinctes pour le stage
  rate: number;         // answered / sent, en %
}
```

### 5.3 — Code couleur du taux

- `rate < 25%` : rouge (`bg-red-100 text-red-700`) — alerte forte
- `26% ≤ rate ≤ 70%` : orange (`bg-amber-100 text-amber-700`) — en cours
- `rate > 70%` : vert (`bg-emerald-100 text-emerald-700`) — bon

Cohérent avec le code couleur de `loadQualiopiIndicators` (rouge / orange / vert).

### 5.4 — Effort

| Tâche | Heures |
|---|---|
| Helper `computeStageStats` + 3 tests Vitest (stage vide, partiel, complet) | 1h |
| Composant `StageStatsBar.tsx` | 1h |
| Intégration dans TabQuestionnaires (insertion dans chaque stage card) | 30 min |
| **Total Section 5** | **2-3h** |

---

## 6. `LearnerStatusGrid` — Grid apprenants × questionnaires + relance

**La section la plus impactante du chantier.**

### 6.1 — Placement

Nouvelle section repliable en bas de TabQuestionnaires, après les 4 stage cards et le `ItemDetail` :

```
┌────────────────────────────────────────────────┐
│ ▾ État des réponses par apprenant              │ ← header pliable
└────────────────────────────────────────────────┘
```

Repliée par défaut sur les petites sessions (< 5 apprenants × < 5 questionnaires). Dépliée auto sur les grosses (≥ 5 × 5). Choix dans le composant.

### 6.2 — Structure du grid

```
                    | Q.positionn. | Auto-éval pré | Eval post   | Satis chaud | Satis froid |
─────────────────────┼──────────────┼───────────────┼─────────────┼─────────────┼─────────────
ALICE Martin        |  ✅ Répondu  |  ✅ Répondu   |  ⏸ Pas envoyé│  📨 Envoyé  |  —         |
BOB Dupont          |  📨 Envoyé   |  ⏸ Pas envoyé │  ⏸ Pas envoyé│  📨 Envoyé  |  —         |
CAROLINE Lambert    |  ✅ Répondu  |  📨 Envoyé    |  ⏸ Pas envoyé│  ✅ Répondu │  —         |
─────────────────────┴──────────────┴───────────────┴─────────────┴─────────────┴─────────────
Filtre statut : [Tous ▾]   ☐ Non-répondants uniquement   [Relancer non-répondants (12)]
```

### 6.3 — 5 statuts distincts par cellule

| Icône | Statut | Condition | Click |
|---|---|---|---|
| ✅ | Répondu | `responses` contient `(learner_id, questionnaire_id)` | Ouvre `LearnerResponsesDialog` |
| 📨 | Envoyé | `questionnaire_tokens` contient `(learner_id, questionnaire_id)` mais pas de réponse | Tooltip : "Token généré le X/Y/Z, expire le X/Y/Z" |
| ⏸ | Pas envoyé | Attribution existe (`formation_*_assignments`) mais pas de token | Tooltip : "Aucun token généré pour cet apprenant" |
| — | Non attribué | Pas d'attribution pour ce questionnaire/apprenant | Aucun |
| ❌ | Expiré | Token existe mais `expires_at < NOW()` | Tooltip + bouton "Régénérer" |

### 6.4 — 3 filtres en bas du grid

1. **Dropdown "Filtrer par statut"** : Tous / Répondu / Envoyé non répondu / Pas envoyé / Expiré
2. **Toggle "Non-répondants uniquement"** : raccourci équivalent à statut `in ["Envoyé", "Expiré"]`
3. **Bouton "Relancer non-répondants (N)"** : POST `/api/questionnaires/relaunch` avec `{ session_id, learner_ids: <unique apprenants filtrés> }` + toast succès/erreur

### 6.5 — Helper `computeLearnerStatuses`

```ts
// src/lib/utils/questionnaire-stats.ts
export type LearnerStatus = "answered" | "sent" | "not_sent" | "not_assigned" | "expired";

export interface LearnerStatusCell {
  learnerId: string;
  learnerName: string;
  questionnaireId: string;
  questionnaireTitle: string;
  stage: "before" | "during" | "after" | "cold";
  status: LearnerStatus;
  responseId?: string;       // si answered
  tokenExpiresAt?: string;   // si sent | expired
}

export function computeLearnerStatuses(
  enrollments: Enrollment[],
  assignments: (EvalAssignment | SatisAssignment)[],
  tokens: QuestionnaireToken[],
  responses: QuestionnaireResponse[],
): LearnerStatusCell[];
```

Le helper produit la matrice complète (1 ligne par couple `learner × questionnaire` attribué).

### 6.6 — Effort détaillé

| Tâche | Heures |
|---|---|
| Helper `computeLearnerStatuses` + 4 tests Vitest (cas all-answered, partial, expired, mixed) | 1-2h |
| Composant `LearnerStatusGrid.tsx` (~200 LOC : table + filtres + bouton relancer) | 2-3h |
| Intégration dans TabQuestionnaires + fetch des tokens dans Promise.all | 1h |
| **Total Section 6** | **4-6h** |

---

## 7. `LearnerResponsesDialog` — Modal read-only des réponses

### 7.1 — Trigger

S'ouvre au clic sur une cellule ✅ Répondu dans `LearnerStatusGrid`.

### 7.2 — Visuel cible

```
[Modal Title] Réponses d'Alice Martin — Questionnaire positionnement

Soumis le 15/04/2026 à 14:32

1. Êtes-vous à l'aise avec le sujet ?
   Réponse : 3/5

2. Quelles sont vos attentes ?
   Réponse : "Apprendre les bases du HTML"

3. Combien d'expérience avez-vous ?
   Réponse : ▸ Moins d'1 an (✓ Correct)

4. Connaissez-vous HTML5 ?
   Réponse : Oui ✓

[Fermer]
```

### 7.3 — Logique de rendu par type

```tsx
function renderResponse(question: ExpandedQuestion, response: unknown): JSX.Element {
  switch (question.type) {
    case "rating":
      return <span>Réponse : {String(response)}/{question.options.max ?? 5}</span>;

    case "text":
    case "short_answer":
      return <span>Réponse : "{String(response ?? "")}"</span>;

    case "multiple_choice": {
      // Affiche l'option choisie + indicateur ✓/✗ si correct_answer disponible
      const choices = (question.options as { options?: string[]; correct_answer?: number })?.options ?? [];
      const correctIdx = (question.options as { correct_answer?: number })?.correct_answer;
      const userIdx = typeof response === "number"
        ? response
        : choices.findIndex(o => normalize(o) === normalize(String(response)));
      const isCorrectAnswer = typeof correctIdx === "number" ? userIdx === correctIdx : null;
      return (
        <span>
          Réponse : ▸ {choices[userIdx] ?? String(response)}
          {isCorrectAnswer === true && <span className="text-emerald-600"> (✓ Correct)</span>}
          {isCorrectAnswer === false && <span className="text-red-600"> (✗ Incorrect)</span>}
        </span>
      );
    }

    case "yes_no":
      return <span>Réponse : {normalize(response) === "oui" ? "Oui" : "Non"}</span>;

    case "program_objectives":
      // response = Record<objective, "Oui"|"Non">
      return (
        <ul>
          {Object.entries(response as Record<string, string>).map(([obj, val]) => (
            <li key={obj}>{obj} : <b>{val}</b></li>
          ))}
        </ul>
      );

    default:
      return <span>Réponse : {JSON.stringify(response)}</span>;
  }
}
```

Réutilise `normalize` et `isCorrect` du helper `questionnaire-scoring.ts` (déjà exportés depuis Chantier 1).

### 7.4 — Source des données

Le state `responses` est déjà chargé par `fetchData()` de TabQuestionnaires. La modal filtre : `responses.find(r => r.learner_id === X && r.questionnaire_id === Y)`. Si la réponse est trouvée, on fetch les `questions` du questionnaire (seul fetch supplémentaire si pas déjà chargé).

### 7.5 — Effort

| Tâche | Heures |
|---|---|
| Composant `LearnerResponsesDialog.tsx` (~150 LOC) | 2-3h |
| Helper `renderResponse(question, response)` réutilisable | 30 min |
| Intégration avec `LearnerStatusGrid` (state ouvert/fermé + props) | 30 min |
| Spot check manuel sur les 5 types de questions | 30 min |
| **Total Section 7** | **3-4h** |

---

## 8. Acceptance Criteria

### AC1 — `QuestionnaireOverview` (bannière)
- ✅ Bannière en haut de TabQuestionnaires (remplace le header actuel à 2 compteurs)
- ✅ 4 KPIs visibles : Attribués / Envoyés / Répondus / En attente
- ✅ Ligne Qualiopi : ≥ 3 indicateurs (liste exacte confirmée en Task 0) avec statut ✅/⚠/⏸
- ✅ Click sur "En attente" scrolle au `LearnerStatusGrid` + active le filtre non-répondants

### AC2 — `StageStatsBar`
- ✅ 4 chiffres compacts visibles dans chaque stage card
- ✅ Code couleur du taux : rouge < 25%, orange 26-70%, vert > 70%
- ✅ Helper `computeStageStats()` testé par ≥ 3 tests Vitest

### AC3 — `LearnerStatusGrid`
- ✅ Grid `apprenants (lignes) × questionnaires (colonnes)` rendu en bas
- ✅ 5 statuts distincts : ✅ Répondu / 📨 Envoyé / ⏸ Pas envoyé / — Non attribué / ❌ Expiré
- ✅ 3 filtres : dropdown statut + toggle non-répondants + bouton "Relancer (N)"
- ✅ Bouton "Relancer" POST `/api/questionnaires/relaunch` avec body `{ session_id, learner_ids }` + toast
- ✅ Pliable/dépliable (replié par défaut sur petites sessions)

### AC4 — `LearnerResponsesDialog`
- ✅ S'ouvre au clic sur une cellule ✅ Répondu
- ✅ Support des 5 types de questions (rating, text/short_answer, multiple_choice, yes_no, program_objectives)
- ✅ Pour multiple_choice : affiche correct/incorrect si `correct_answer` disponible (réutilise `isCorrect()` du helper scoring)

### AC5 — Helper + Tests
- ✅ `src/lib/utils/questionnaire-stats.ts` créé avec `computeStageStats` + `computeLearnerStatuses`
- ✅ ≥ 7 tests Vitest sur les helpers (3 stage + 4 learner statuses)
- ✅ Coverage `questionnaire-stats.ts` ≥ 90% (pas de threshold strict 100% pour éviter friction sur edge cases)

### AC6 — Qualité générale
- ✅ Suite Vitest verte (514 baseline + 7 nouveaux helper tests = ≥ 521)
- ✅ Coverage 100% maintenu sur `questionnaire-scoring.ts` (Chantier 2a)
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run build` succès
- ✅ Aucun nouveau cast `as unknown as`
- ✅ Tous les nouveaux handlers async ont try/catch + toast (pattern uniforme Chantier 2a)

### AC7 — Process
- ✅ Branche `feat/questionnaires-volet-d-ux` depuis `main` à `0162ad1`
- ✅ ~10-13 commits granulaires (1 commit = 1 sous-composant ou helper)
- ✅ Aucune migration SQL
- ✅ Aucune nouvelle route API (réutilisation `/api/questionnaires/relaunch` + `loadSessionAggregates`)
- ✅ Validation manuelle légère : ouvrir 1 session de test, vérifier bannière + stages + grid affichent les données réelles, tester 1 relance

---

## 9. Risques résiduels

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| TabQuestionnaires grossit à > 600 LOC | Moyenne | Bas | Le découpage en 4 sous-composants `questionnaires/` maintient TabQuestionnaires à ~500 LOC. Si dépassement, refactor en `sections/` (chantier ultérieur). |
| Liste exacte des indicateurs Qualiopi inconnue | Haute | Bas | Task 0 du plan investigue `loadQualiopiIndicators` pour confirmer la liste. Si pas exactement les 3 attendus, adapter le design avec la vraie liste. |
| Performance N+1 sur `LearnerStatusGrid` pour grosses sessions (> 20 apprenants × > 10 questionnaires) | Faible | Moyen | Helper `computeLearnerStatuses` fait 1 seul pass O(N×M) en mémoire (pas de re-fetch). Acceptable jusqu'à 100×20 grid. |
| Modal `LearnerResponsesDialog` n'affiche pas correctement un type rare | Moyenne | Bas | Fallback `default: JSON.stringify(response)` couvre les types non gérés. Spot check sur les 5 types principaux. |
| Indicateurs Qualiopi mappés à des questionnaires différents selon les comptes | Moyenne | Moyen | Le mapping vient du registre Qualiopi (back-end) — devrait être consistent. À confirmer Task 0. |

---

## 10. Hors scope (Chantier 2c ou ultérieur)

**Chantier 2c (P0-5)** :
- **P0-5 — Auto Qualiopi sans pièce jointe** : règles `formation_automation_rules` standard (J-3 / J0 / J+7 / J+30) envoient des emails sans pièce jointe ni lien token. Refactor du cron pour intégrer la génération de token + insertion du lien dans le corps de l'email. Validation manuelle stricte sur compte test avant push prod.

**Hors scope définitif** :
- Vue inversée "par questionnaire → liste apprenants" (YAGNI, le grid actuel suffit)
- Tests E2E Playwright (hors stack)
- Vue cross-sessions (dashboard global de tous les apprenants × toutes les sessions)
- Refactor `sections/` de TabQuestionnaires (taille reste < 500 LOC)

---

## 11. Ordre d'exécution (pour writing-plans)

Le plan d'implémentation va suivre l'ordre :

1. **Task 0** — Baseline + branche + investigation `loadQualiopiIndicators` (liste exacte indicateurs Qualiopi liés aux questionnaires)
2. **Task 1** — Helper `questionnaire-stats.ts` (computeStageStats) + 3 tests Vitest TDD
3. **Task 2** — Helper `questionnaire-stats.ts` (computeLearnerStatuses) + 4 tests Vitest TDD
4. **Task 3** — Étendre `fetchData()` de TabQuestionnaires pour charger `questionnaire_tokens` + `qualiopiIndicators`
5. **Task 4** — Composant `QuestionnaireOverview.tsx` + intégration dans TabQuestionnaires
6. **Task 5** — Composant `StageStatsBar.tsx` + intégration dans chaque stage card
7. **Task 6** — Composant `LearnerStatusGrid.tsx` + intégration en bas de TabQuestionnaires
8. **Task 7** — Composant `LearnerResponsesDialog.tsx` + intégration avec `LearnerStatusGrid`
9. **Task 8** — Vérification finale acceptance criteria
10. **Task 9** — finishing-a-development-branch (merge + push)

---

## 12. Self-review

(Effectuée post-rédaction.)

- ✅ **Placeholder scan** : aucun "TBD", "TODO", section incomplète. Liste exacte des indicateurs Qualiopi marquée "à confirmer Task 0" — c'est une investigation planifiée, pas un placeholder.
- ✅ **Internal consistency** : les 4 composants (Section 4-7) ont chacun une responsabilité distincte. Le helper (Section 3.2) est consommé par 3 composants (Overview, StageStatsBar, Grid). Pas de chevauchement.
- ✅ **Scope check** : 4 composants + 1 helper + 7 tests = ~15-22h. Taille appropriée pour 1 chantier. Pas de décomposition nécessaire (P0-5 déjà décomposé en 2c).
- ✅ **Ambiguity check** : "Repliable par défaut sur petites sessions" pourrait être ambigu — clarifié Section 6.1 (< 5 apprenants × < 5 questionnaires).

---

**FIN DU DESIGN**
