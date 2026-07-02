---
title: 'BPF-2.3 — Câblage rapport : panneau trous, Cadre C factures, F-1/F-2, exports'
type: 'feature'
created: '2026-07-02'
status: 'done'
baseline_commit: '3c5950a384a7c49a55ee7d459befe99235197a2c'
context:
  - '{project-root}/bmad_output/planning-artifacts/epics-stories-bpf.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sur `/admin/reports/bpf`, les champs et calculateurs BPF sont construits mais non montés dans `BPFForm.tsx` : le Cadre C lit encore les **devis acceptés** (`computeSectionC(quotesForCalc)`), F-1 lit `learner.learner_type`, F-2 recopie la saisie manuelle G, et `DataGapsPanel` n'est rendu nulle part. Le rapport ne reflète donc pas les vraies factures, et Loris ne peut pas fiabiliser les ~599 factures importées (date/catégorie).

**Approach:** Appeler `fetchBPFData()` dans `BPFForm`, monter `DataGapsPanel` en haut, brancher le Cadre C sur `computeSectionCFromInvoices` (total **combiné** fiable+à-vérifier, avec split affiché), lire `enrollment.bpf_trainee_type` pour F-1, calculer F-2 depuis les sessions `is_subcontracted_to_other_of`, et passer le split + les trous aux exports PDF/Excel. Ajouter un **batch « Confirmer les N dates »** + tri frontière-d'année-d'abord pour que Loris fiabilise vite.

## Boundaries & Constraints

**Always:** `entity_id` strict sur chaque requête/mutation ; zéro `any` ; logique de calcul dans `bpf-calculator.ts` / mutations dans `bpf-report-service.ts` (jamais d'update Supabase inline dans le composant) ; total Cadre C = fiable + à-vérifier (confirmé par Loris), la confirmation d'une date reclasse à-vérifier→fiable **sans changer le total** ; stagiaires F-2 ⊆ F-1 (même base d'heures = durée session).

**Ask First:** basculer F-1 sur les heures **signées** (`computeSectionF1`, refactor BPF-2.2) — hors scope, ne pas faire sans accord ; passer le total Cadre C en « fiable uniquement ».

**Never:** nouvelle migration (colonnes déjà dans `bpf_qualification_fields.sql`) ; toucher les fichiers non liés déjà modifiés dans l'arbre ; remplacer la boucle inline F-1/F-3/F-4 ni changer E/G/KPI ; créer une branche (rester sur `main`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cadre C combiné | facture 1000€ confirmée `entreprise_privee` + 500€ non-confirmée `cpf` | `combined` line_1=1000 & line_2e=500 ; `fiable` line_1=1000 ; `aVerifier` line_2e=500 ; count=1 | — |
| Cadre C funding null | facture 300€ `funding_type=null`, non confirmée | repliée sur `line_11` (combined + aVerifier) ; comptée `invoices_sans_funding` | — |
| F-2 sous-traitée | S1 `is_subcontracted=true` (5 apprenants, 7h) + S2 `false` | `f2 = {stagiaires:5, heures: Σ durées}` ; les 5 comptent aussi en F-1 | — |
| F-1 type stagiaire | `enrollment.bpf_trainee_type='salarie_prive'` | compté ligne a (bucket `salarie_prive`) | `null` → bucket `autre` |
| Batch confirm dates | clic « Confirmer les N dates » | `invoice_date_confirmed=true` pour toutes les factures listées en **une** mutation ; elles quittent la liste ; Cadre C recalculé | toast erreur, pas de refetch |

</frozen-after-approval>

## Code Map

- `src/components/BPFForm.tsx` -- orchestrateur : ajoute l'appel `fetchBPFData`, monte `DataGapsPanel`, câble Cadre C/F-1/F-2, passe le split aux exports
- `src/lib/bpf-calculator.ts` -- `computeSectionCFromInvoices`/`computeDataGaps`/`computeSectionF1` existants ; **ajouter** `computeSectionF2` + `buildSectionCView`
- `src/lib/services/bpf-report-service.ts` -- `fetchBPFData` + mutations existants ; **ajouter** `batchConfirmInvoiceDates`
- `src/components/bpf/DataGapsPanel.tsx` -- construit ; ajouter batch « Confirmer les N dates » + tri déc./janv. d'abord
- `src/components/bpf/SectionC.tsx` -- ajouter le sous-bloc « dont fiable / dont à vérifier » (props optionnelles) + libellé « depuis les factures »
- `src/lib/pdf-export.ts` -- `exportBPFFullToPDF` accepte déjà le split + `dataGaps` (aucune modif, juste alimenter)
- `src/lib/__tests__/bpf-calculator.test.ts` -- ajouter tests `computeSectionF2` + `buildSectionCView`

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/bpf-calculator.ts` -- ajouter `computeSectionF2(enrollments, sessionInfoById)` (stagiaires uniques + heures durée-session des sessions `isSubcontracted`, exclut `cancelled`) et `buildSectionCView(result)` (replie `non_classifie`→`line_11`, retourne `{combined, fiable, aVerifier}`) -- garder la logique hors composant + testable
- [x] `src/lib/services/bpf-report-service.ts` -- ajouter `batchConfirmInvoiceDates(supabase, ids[])` (`invoice_date_confirmed=true` + `updated_at`) -- une seule mutation `.in("id", ids)`
- [x] `src/components/bpf/DataGapsPanel.tsx` -- bouton « Confirmer les {N} dates » (loading + toast + `onRefresh`) et tri factures déc./janv. en tête -- fiabilisation en masse
- [x] `src/components/bpf/SectionC.tsx` -- props `aVerifierTotal?`, `aVerifierCount?`, `onScrollToGaps?` ; rendre les 2 lignes fiable(vert)/à-vérifier(ambre) si `count>0`, ligne à-vérifier cliquable -- affichage du split
- [x] `src/components/BPFForm.tsx` -- appeler `fetchBPFData(supabase, entityId, fiscalYear)` ; `sectionC`=combined via `buildSectionCView` ; stocker fiable/aVerifier/count + `computeDataGaps` + raw pour le panneau ; monter `<DataGapsPanel>` sous `<BPFHeader>` ; select enrollments + `bpf_trainee_type` et buckets `salarie_prive` ; `is_subcontracted_to_other_of` dans le select sessions → `computeSectionF2`→`bpf.f2` ; exports Excel (remplacer TODO 851-852) et PDF (params 902-903) alimentés ; `onRefresh=fetchData` -- le câblage
- [x] `src/lib/__tests__/bpf-calculator.test.ts` -- tests des 5 scénarios de la matrice pour `computeSectionF2` + `buildSectionCView` -- non-régression des 32 tests existants

**Acceptance Criteria:**
- Given des factures avec trous (date/funding), when j'ouvre le BPF, then le panneau « Données à compléter » s'affiche en haut avec le bon compteur et 4 onglets éditables.
- Given je clique « Confirmer les N dates », when la mutation réussit, then toutes les factures listées passent `invoice_date_confirmed=true`, quittent le panneau, et le Cadre C reclasse leur montant en « fiable » (total inchangé).
- Given je suis admin C3V, when je consulte/corrige, then je ne vois QUE des données C3V (`entity_id` strict), MR jamais mêlé.
- Given une session « sous-traitée à un autre organisme », when le rapport se charge, then F-2 affiche ses stagiaires/heures réels (plus la recopie de G).

## Design Notes

Deux fetch coexistent volontairement : la boucle inline existante (sessions + `training.duration_hours` + classification/nsf/mode) alimente E/F-1/F-3/F-4/KPI ; `fetchBPFData` alimente **en plus** factures (C), trous (panneau) et `is_subcontracted` (F-2). Pas de fusion : `fetchBPFData` ne ramène ni durée ni classification → tout rebrancher = refactor BPF-2.2 hors scope.

`buildSectionCView` : `combined = fiable + a_verifier` par ligne, puis `non_classifie` (fiable/à-vérifier) replié sur `line_11` ; `aVerifierCount = gaps.invoices_non_confirmees`. Comparaison N-1 laissée sur devis (lightweight) — à harmoniser plus tard.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur (zéro `any`, props/typages OK)
- `npx vitest run src/lib/__tests__/bpf-calculator.test.ts` -- expected: 32 tests existants verts + nouveaux `computeSectionF2`/`buildSectionCView` verts

**Manual checks (if no CLI):**
- Charger `/admin/reports/bpf` (compte C3V) : panneau trous en haut, Cadre C libellé « depuis les factures » + lignes fiable/à-vérifier, F-2 non nul si session sous-traitée ; « Confirmer les N dates » vide la liste et bascule les montants en fiable ; export PDF affiche l'encadré vert, Excel les 2 sous-totaux.

## Suggested Review Order

**Source du CA — Cadre C basé factures (le cœur du changement)**

- Point d'entrée : fetch factures + split fiable/à-vérifier, remplace les devis
  [`BPFForm.tsx:244`](../../src/components/BPFForm.tsx#L244)
- Aplatit le résultat : combine fiable+à-vérifier, replie `non_classifie`→ligne 11
  [`bpf-calculator.ts:493`](../../src/lib/bpf-calculator.ts#L493)
- Affiche le split (fiable vert / à-vérifier ambre cliquable) sous le total
  [`SectionC.tsx:88`](../../src/components/bpf/SectionC.tsx#L88)

**Fiabilisation facile (panneau + batch)**

- Montage du DataGapsPanel en haut du rapport (ancre scroll)
  [`BPFForm.tsx:975`](../../src/components/BPFForm.tsx#L975)
- Batch « Confirmer les N dates » + tri risque-d'abord (dates nulles/déc./janv.)
  [`DataGapsPanel.tsx:208`](../../src/components/bpf/DataGapsPanel.tsx#L208)
- Mutation batch durcie avec garde `entity_id` (patch review)
  [`bpf-report-service.ts:272`](../../src/lib/services/bpf-report-service.ts#L272)

**Cadres F-1 / F-2**

- F-1 : lecture de `enrollment.bpf_trainee_type` (au lieu de `learner_type`)
  [`BPFForm.tsx:354`](../../src/components/BPFForm.tsx#L354)
- F-2 : calcul depuis les sessions sous-traitées, ⊆ F-1 strict
  [`bpf-calculator.ts:454`](../../src/lib/bpf-calculator.ts#L454)

**Exports**

- Excel + PDF alimentés avec le split réel (remplace les TODO)
  [`BPFForm.tsx:886`](../../src/components/BPFForm.tsx#L886)

**Tests (support)**

- `computeSectionF2` + `buildSectionCView` (7 cas, dont F-2 ⊆ F-1)
  [`bpf-calculator.test.ts:457`](../../src/lib/__tests__/bpf-calculator.test.ts#L457)
