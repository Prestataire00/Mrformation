# Design — Suivi Qualité se remplit à l'usage (fusion live + précalculé)

**Date :** 2026-06-17
**Statut :** Design validé (brainstorming)
**Page cible :** `src/app/(dashboard)/admin/reports/qualite/page.tsx`

---

## 0. Problème (vérifié)
- Aucun pipeline ne maintient `quality_scores` : aucune route n'y écrit ; les 102 lignes viennent d'une migration/seed, **non maintenues**, avec les colonnes éval à NULL (mais la **satisfaction historique** y est, ex. 63 valeurs en 2025).
- La page fait un **early-return** sur `quality_scores` dès qu'il en existe (l.42) → le **calcul live** (qui sait pourtant tout calculer depuis `questionnaire_responses`, l.66+) est court-circuité.
- Conséquence : les **réponses futures** (apprenant via `public-submit`, admin via `fill-for-learner`) s'enregistrent dans `questionnaire_responses` mais **n'apparaissent jamais** sur la page, masquées par les `quality_scores` vides.

## 1. Décision (validée)
**Fusionner** les deux sources au lieu de « soit l'un soit l'autre » : la page calcule **toujours** le live depuis `questionnaire_responses` **et** le superpose sur les `quality_scores` migrés. Par (formation, indicateur), **le live l'emporte** s'il a une valeur réelle ; sinon on garde la valeur précalculée (historique). Aucun nouveau pipeline d'écriture (pas de trigger) — calcul à la volée au chargement.

## 2. Comportement attendu
- **Réponse remplie aujourd'hui** → recalcul live au prochain chargement → la valeur s'affiche (la page « se remplit à l'usage »).
- **Historique migré 2025** (satisfaction dans `quality_scores`, sans `questionnaire_responses`) → conservé (le live n'a rien pour cette formation → on garde le précalculé).
- Une formation qui a À LA FOIS un précalculé et de nouvelles réponses → la valeur live (réelle) remplace le précalculé pour l'indicateur concerné.

## 3. Architecture
- **Fonction pure** `src/lib/reports/merge-quality-rows.ts` : `mergeQualityRows(precomputed: QualiteRow[], live: QualiteRow[]): QualiteRow[]`.
  - Clé = identifiant stable de ligne (vérifier dans la page : nom de formation normalisé + année, ou `session_id` — utiliser la clé déjà utilisée pour construire les `QualiteRow`).
  - Base = précalculé ; pour chaque clé présente dans le live, **chaque indicateur non-null du live écrase** la valeur précalculée ; les clés présentes uniquement dans le live sont ajoutées.
  - Indicateurs concernés : `eval_preformation, eval_pendant, eval_postformation, auto_eval_pre, auto_eval_post, satisfaction_chaud, satisfaction_froid`.
- **Page** : retirer l'`early-return` (l.42). Exécuter le mapping précalculé ET la computation live (déjà écrite), puis `setRows(mergeQualityRows(precomputedRows, liveRows))`. Conserver le filtrage `entity_id` + le scope année (déjà en place).

## 4. États & robustesse
- `quality_scores` vide → `mergeQualityRows([], live)` = live seul (comportement actuel du fallback).
- `questionnaire_responses` vide → `mergeQualityRows(precomputed, [])` = précalculé seul (historique).
- Perf : la computation live interroge sessions + réponses de l'année (bornée) — acceptable au chargement.

## 5. Tests (TDD sur la fonction pure)
`mergeQualityRows` :
- une valeur live non-null écrase la valeur précalculée du même indicateur/clé ;
- une valeur live null/absente n'écrase PAS (on garde le précalculé) ;
- une clé présente seulement dans le live est ajoutée ;
- une clé présente seulement dans le précalculé est conservée ;
- precomputed vide → live ; live vide → precomputed.

## 6. Hors périmètre (YAGNI)
- Recompute/écriture de `quality_scores` (trigger/endpoint) — non nécessaire, le live à la volée suffit.
- La collecte elle-même (les routes `public-submit`/`fill-for-learner` écrivent déjà `questionnaire_responses` — vérifié).
- Le mapping questionnaire→indicateur (déjà implémenté dans le live).

## 7. Suite
Design → writing-plans (TDD sur `mergeQualityRows`) → exécution → PR sur `main`.
