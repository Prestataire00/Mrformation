---
title: 'BPF — barre de progression « X/Y formations validées → prêt à déposer » (lot Should)'
type: 'feature'
created: '2026-07-03'
status: 'done'
baseline_commit: 'cbffd35ffd80dcb3e462caad1ee5ed7ec2d99a07'
context:
  - '{project-root}/bmad_output/brainstorming/brainstorm-sous-onglet-bpf-formation-2026-07-02/brainstorm-intent.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Loris a l'onglet BPF par-formation (valider une session), mais aucune vue d'ensemble : combien de formations sont validées, combien restent, est-ce « prêt à déposer » ? Il n'a pas de ligne d'arrivée.

**Approach:** Dans le rapport global `/admin/reports/bpf` (`BPFForm.tsx`), ajouter une **barre de progression** « X / Y formations validées → prêt à déposer », où Y = sessions de l'exercice affiché et X = sessions **validées ET actuellement sans trou** (🟢). Quand X === Y (et Y > 0) → état « 🎉 BPF prêt à déposer ». Réutilise `computeDataGaps` par session sur les données déjà chargées (`bpfRaw`), + une lecture **tolérante** de l'état de validation.

## Boundaries & Constraints

**Always:** `entity_id` strict ; zéro `any` ; logique de comptage **pure** dans `bpf-calculator.ts` (testée) / requêtes dans `bpf-report-service.ts` ; **Y = sessions de l'exercice** (celles du `sessionQuery` filtré date, pas toutes les sessions entité) ; **X = validé (`bpf_validated_at` non null) ET `totalGaps===0`** (mêmes 5 trous que le DataGapsPanel) ; lecture de l'état de validation **résiliente** (requête séparée en try/catch — jamais un SELECT explicite de `bpf_validated_at` dans le fetch global, qui casserait tout le rapport si le cache de schéma traîne — leçon hotfix `dc573b13`).

**Ask First:** —

**Never:** **auto-dé-validation = passive** (une session validée redevenue 🔴 est simplement **non comptée** dans X ; on **n'écrase PAS** `bpf_validated_at` — l'audit reste, l'onglet affiche déjà « Validé le X (⚠️ N nouveaux points) »). Pas de dé-validation active/cron. Pas de migration (colonnes déjà en base). Could (sélecteur d'année, traçabilité) hors scope. Rester sur `main`, ne pas toucher les fichiers non liés.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Progression partielle | 5 sessions exercice ; 3 validées+vertes, 1 validée-mais-rouge, 1 non validée | barre 3/5 (60 %) ; « 3/5 formations validées » | — |
| Prêt à déposer | 4 sessions, toutes validées ET vertes | 4/4 + « 🎉 BPF prêt à déposer » | — |
| Validée puis rouge | session validée dont un trou réapparaît | **non comptée** dans X (passif) ; `bpf_validated_at` inchangé en base | — |
| Aucune session | 0 session dans l'exercice | barre masquée (pas de « 0/0 ») | — |
| Colonnes validation absentes du cache | `fetchSessionValidations` échoue | try/catch → map vide → X=0, barre affichée sans casser le rapport | warn console, pas de toast |
| Isolation | admin C3V | Y/X calculés uniquement sur des sessions C3V (`entity_id`) | — |

</frozen-after-approval>

## Code Map

- `src/components/BPFForm.tsx` -- rapport global : y calculer la progression (dans `fetchData`, après `bpfRaw` + `sessions`) et rendre la barre après les KPI cards, avant le DataGapsPanel (~L987)
- `src/lib/bpf-calculator.ts` -- **ajouter** `computeBpfDepositProgress` (pur) : groupe `bpfRaw` par session, rejoue `computeDataGaps` par session, compte validé+vert
- `src/lib/services/bpf-report-service.ts` -- **ajouter** `fetchSessionValidations(supabase, entityId, sessionIds)` (requête tolérante try/catch → `Record<id,{validated_at,validated_by}>`)
- `src/components/ui/progress.tsx` -- réutiliser le shadcn `Progress` s'il existe, sinon div stylé Tailwind
- `src/lib/__tests__/bpf-calculator.test.ts` -- tests `computeBpfDepositProgress`

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/bpf-calculator.ts` -- `computeBpfDepositProgress(sessionIds: string[], data: {invoices, enrollments, trainings, formationTrainers, signatures, sessions}, validatedBySession: Record<string, boolean>)` → `{ total, ready, allReady }`. Pour chaque `sessionId` : filtrer `data` par `session_id` (training via `sessions[].training_id`), `computeDataGaps` → `totalGaps` ; `ready` si `validatedBySession[id] === true && totalGaps === 0`. `total = sessionIds.length`, `ready = count`, `allReady = total > 0 && ready === total` -- logique pure + testable
- [ ] `src/lib/services/bpf-report-service.ts` -- `fetchSessionValidations(supabase, entityId, sessionIds)` : `SELECT id, bpf_validated_at, bpf_validated_by WHERE entity_id AND id IN (...)`, enveloppé try/catch (retourne `{}` si échec) → map par id. Résilient au cache de schéma
- [ ] `src/components/BPFForm.tsx` -- dans `fetchData` : `sessionIds` = ids du `sessionQuery` (exercice) ; `const validations = await fetchSessionValidations(...)` ; `validatedBySession[id] = !!validations[id]?.validated_at` ; `computeBpfDepositProgress(sessionIds, bpfRaw, validatedBySession)` → state `depositProgress`. Rendu : bloc barre (label « {ready}/{total} formations validées », `Progress` ou div, + « 🎉 BPF prêt à déposer » si `allReady`) après les KPI cards, avant `<DataGapsPanel>` ; masqué si `total === 0`
- [ ] `src/lib/__tests__/bpf-calculator.test.ts` -- `computeBpfDepositProgress` : validé+vert compté, validé+rouge NON compté, non-validé NON compté, `allReady` quand tout validé+vert, `total===0`

**Acceptance Criteria:**
- Given des sessions dont certaines validées+vertes, when j'ouvre le rapport BPF, then la barre montre « X/Y formations validées » avec X = validées ET sans trou.
- Given toutes les sessions de l'exercice validées et sans trou, when j'ouvre le rapport, then « 🎉 BPF prêt à déposer ».
- Given une session validée dont un trou réapparaît, when je consulte la barre, then elle n'est plus comptée dans X (sans écrire en base).
- Given l'état de validation illisible (cache schéma), when le rapport se charge, then la barre s'affiche (X=0) sans casser le reste du rapport.
- Given admin C3V, when je consulte, then Y/X ne portent que sur des sessions C3V.

## Design Notes

Auto-dé-validation **passive** : X = validé ET vert, recalculé à chaque chargement. Une session validée qui redevient rouge sort de X sans écriture destructive (l'audit `bpf_validated_at` et le « Validé le X (⚠️ …) » de l'onglet restent). Évite tout cron/trigger.

Résilience : `fetchSessionValidations` isolée + try/catch — c'est la contre-mesure directe au hotfix `dc573b13` (un SELECT explicite d'une colonne hors cache PostgREST fait échouer toute la requête). Ici, au pire, la barre affiche 0 le temps que le cache se recharge, sans jamais casser le rapport.

`computeBpfDepositProgress` réutilise `computeDataGaps` (déjà testé) par session — même définition de « sans trou » (5 compteurs) que la pastille de l'onglet et que le DataGapsPanel → cohérence garantie.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur
- `npx vitest run src/lib/__tests__/bpf-calculator.test.ts` -- expected: existants verts + `computeBpfDepositProgress` verts

**Manual checks (if no CLI):**
- Ouvrir `/admin/reports/bpf` (compte C3V) : barre « X/Y validées » cohérente ; valider une session dans son onglet → X augmente au rechargement du rapport ; créer un trou sur une session validée → elle sort de X ; toutes validées+vertes → « 🎉 prêt à déposer ».

## Suggested Review Order

**Le calcul (cœur)**

- Point d'entrée : comptage pur par-session (réutilise `computeDataGaps`, mêmes 5 trous)
  [`bpf-calculator.ts:833`](../../src/lib/bpf-calculator.ts#L833)
- Câblage : `sessionIds` (exercice) + validations → `computeBpfDepositProgress`
  [`BPFForm.tsx:284`](../../src/components/BPFForm.tsx#L284)

**Résilience (leçon hotfix)**

- Lecture de l'état de validation en try/catch tolérant (ne casse jamais le rapport)
  [`bpf-report-service.ts:448`](../../src/lib/services/bpf-report-service.ts#L448)

**Rendu**

- Barre + « X/Y formations validées » + « 🎉 prêt à déposer » (masquée si total=0)
  [`BPFForm.tsx:995`](../../src/components/BPFForm.tsx#L995)

**Tests (support)**

- `computeBpfDepositProgress` (validé+vert vs validé+rouge vs non-validé, allReady)
  [`bpf-calculator.test.ts:713`](../../src/lib/__tests__/bpf-calculator.test.ts#L713)
