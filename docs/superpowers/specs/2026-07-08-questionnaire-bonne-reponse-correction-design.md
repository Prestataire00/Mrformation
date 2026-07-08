# Design — Définition de la bonne réponse + correction automatique (QCM / oui-non)

Date : 2026-07-08

## Problème

À la création d'un questionnaire d'évaluation, il est impossible de définir la
bonne réponse d'une question **choix multiple (QCM)** ou **oui/non**. Sans bonne
réponse stockée, aucune correction automatique n'est possible. Hors
questionnaires de satisfaction (qui n'ont pas de « bonne » réponse).

## État existant (investigué)

- Table `questions` : `id, questionnaire_id, text, type ('rating'|'text'|'multiple_choice'|'yes_no'), options JSONB, order_index, is_required`. **Aucun champ de bonne réponse.**
- La **correction automatique existe déjà** côté backend : `src/lib/services/questionnaire-scoring.ts` (`isCorrect`, `computeScore`, recalcul rétroactif). Elle lit aujourd'hui `question.options.correct_answer` (format objet type OpenAI : `{ options:[...], correct_answer: index }`), consommé par `load-evaluation-results.ts`, `load-session-aggregates.ts` et le PDF `resultats-evaluations`.
- L'éditeur admin (`src/app/(dashboard)/admin/questionnaires/page.tsx`) sauve `options` comme **simple tableau** `["A","B"]` (sans bonne réponse) → les QCM créés manuellement ne sont jamais scorables.
- ~5 écrans lisent `question.options` comme un **tableau** de choix : fill apprenant (`learner/questionnaires/[id]/page.tsx`), fill/edit formateur (`trainer/questionnaires/[id]/fill|edit`), éditeur admin, `LearnerResponsesDialog.tsx`.

## Décisions produit

- **Optionnelle par question** : une question sans bonne réponse est simplement exclue du score (déjà supporté par `total_scorable`).
- **Visibilité** : score/correction visibles **admin + formateur uniquement** (écrans existants). Rien côté apprenant.
- **Types concernés** : **QCM** et **oui/non** uniquement. (Le backend sait scorer le texte, mais l'auto-correction de réponses libres est fragile → hors périmètre.)
- **Éditeurs** : admin **et** formateur (cohérence).

## Approche retenue (Approche 1 — colonne dédiée)

Nouvelle colonne `questions.correct_answer` plutôt que le format objet dans
`options`. Motivation : `options` reste un tableau → les ~5 écrans de réponse
sont **inchangés** (blast radius minimal, pas de risque de casser le rendu).
Seul coût : une migration simple.

## Spécification

### 1. Modèle de données

Migration `supabase/migrations/add_questions_correct_answer.sql` :

```sql
ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_answer JSONB;
```

Convention de stockage :
- **QCM** : le **texte de la bonne option** (string) — robuste au réordonnancement des options (vs un index).
- **Oui/Non** : `"oui"` ou `"non"`.
- `NULL` : question non notée (exclue du score).

`options` reste un tableau de choix (inchangé). Pas de nouvelle policy RLS
nécessaire (ajout de colonne sur table existante). ⚠️ Migration à jouer en prod
**avant** le push (convention repo).

### 2. Scoring (`src/lib/services/questionnaire-scoring.ts`)

`QuestionRow` gagne `correct_answer?: unknown`.

`isCorrect(question, userAnswer)` :
1. `correct = question.correct_answer ?? (question.options as {correct_answer?}).correct_answer`. Si absent → `null` (non scorable).
2. **QCM** :
   - Si `correct` est une **string** (nouveau format) → `normalize(userAnswer) === normalize(correct)`.
   - Si `correct` est un **number** (legacy IA) → logique index actuelle conservée (résolution label→index via `options.options`/`choices`).
3. **oui/no / true_false / text / short_answer** : `normalize(userAnswer) === normalize(correct)` (inchangé).
4. **rating / program_objectives** : `null` (non scorable, inchangé).

`computeScore` / `total_scorable` : inchangés — une question est scorable ssi
`isCorrect` renvoie un booléen. Le repli legacy garantit qu'aucun questionnaire
généré par IA ne régresse.

### 3. UI éditeur

**`QuestionFormData`** gagne `correctAnswer: string | null`.

Rendu conditionnel (seulement si le questionnaire n'est **pas** de type
`satisfaction`, et pour les types de question `multiple_choice` / `yes_no`) :
- **QCM** : à côté de chaque option saisie, un radio « ✓ bonne réponse » (un
  seul sélectionnable ; désélectionnable → « non noté »). La valeur enregistrée
  = le **texte** de l'option cochée.
- **Oui/Non** : sélecteur « Bonne réponse : Oui / Non / (non noté) ».

Save (insert/update `questions`) : écrit `correct_answer` = texte option /
`"oui"` / `"non"` / `null`. Édition d'une question existante : recharge
`correct_answer` dans le formulaire.

Écrans à modifier :
- `src/app/(dashboard)/admin/questionnaires/page.tsx` (éditeur de questions).
- `src/app/(dashboard)/trainer/questionnaires/create/page.tsx`.
- `src/app/(dashboard)/trainer/questionnaires/[id]/edit/page.tsx`.
- Route(s) d'insert questions côté formateur si le corps est typé (`trainer/questionnaires` POST) → accepter `correct_answer`.

### 4. Affichage des scores

Aucun développement : les écrans admin/formateur (résultats, agrégats session,
PDF `resultats-evaluations`) consomment déjà `computeScore`. La correction et le
% apparaissent dès qu'une bonne réponse est définie.

### 5. Tests

- `isCorrect` : QCM par label (correct / incorrect), oui-non (correct / incorrect),
  non-noté (`correct_answer` null → `null`), **legacy index** (compat conservée).
- `computeScore` : `total_scorable` compte les questions avec la nouvelle colonne ;
  questionnaire 100% satisfaction (aucune `correct_answer`) → `score_percent = null`.
- Barrières repo : `tsc --noEmit` + `vitest` (lint ESLint 9 cassé).

## Hors périmètre

- Auto-correction des réponses libres (`text`) et des ratings.
- Affichage de la note côté apprenant.
- Barème/pondération par question (chaque question scorable vaut 1 point).
- Migration/backfill des QCM existants (l'admin définit les bonnes réponses à la main ; les questions restent simplement « non notées » tant que non renseignées).
