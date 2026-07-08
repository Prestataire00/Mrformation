---
title: 'Attestation assiduité — heures réelles par créneau émargé'
type: 'bugfix'
created: '2026-07-08'
status: 'done'
context: []
baseline_commit: '46598b14ff9fcf484f0a582f6d05460bf7585cd8'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'attestation d'assiduité affiche « durée effectivement suivie = durée totale, taux 100 % » dès que l'apprenant possède ≥ 1 signature sur la session (heuristique binaire « MVP »), même s'il n'a émargé qu'une partie des créneaux. Cf. investigation `bmad_output/implementation-artifacts/investigations/attestation-assiduite-taux-investigation.md`.

**Approach:** Calculer les heures réellement suivies à partir des créneaux (`formation_time_slots`) que l'apprenant a émargés (signatures portant `time_slot_id`), en réutilisant la logique pure existante `computeLearnerAttendance`. Aucune migration : `signatures.time_slot_id` existe déjà.

## Boundaries & Constraints

**Always:**
- Base du taux = **heures** : `taux = signed_hours / total_hours × 100` (total_hours = somme des durées de tous les créneaux de la session).
- Le calcul par créneau ne s'applique **que** quand l'apprenant a ≥ 1 signature slot-level (`time_slot_id` non NULL) pour la session.
- Appliquer la correction aux **deux** routes : single (`generate-attestation-assiduite`) et batch (`generate-attestations-assiduite-batch`).
- Filtrer les requêtes Supabase par `entity_id` (déjà fait via la session) et conserver `signer_type = "learner"`.
- Convention `signatures.signer_id = learners.id` côté apprenant (cf. mémoire `project_signatures_signer_id_convention`).

**Ask First:**
- Tout changement à la ligne « Durée de la formation » du template (reste `planned_hours` — hors périmètre).
- Toute modification du schéma / migration (ne doit pas être nécessaire).

**Never:**
- Ne pas régresser les sessions legacy : si la session n'a **aucun** `formation_time_slots`, OU si l'apprenant n'a que des signatures à `time_slot_id = NULL`, conserver le comportement présence intégrale (`planned_hours` / 100 % si présent, 0 / 0 % si absent) via le fallback binaire existant.
- Ne pas toucher aux autres builders du résolveur ni aux autres types de documents.
- Pas de nouvelle migration SQL.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Émargement partiel slot-aware | Session 2 créneaux (3h + 4h = 7h) ; apprenant a signé le créneau 3h (`time_slot_id` renseigné) | heures réalisées = `3.00`, taux = `42.86` | N/A |
| Présence intégrale slot-aware | Apprenant a signé les 2 créneaux (7h) | heures = `7.00`, taux = `100.00` | N/A |
| Absent slot-aware | Session a des créneaux ; apprenant n'a aucune signature | heures = `0.00`, taux = `0.00` (fallback binaire, absent du set) | N/A |
| Legacy — signature sans créneau | Apprenant a une signature `time_slot_id = NULL` (émargement non slot-aware) | Fallback présence intégrale = `planned_hours` / `100.00` | N/A |
| Legacy — session sans créneaux | `formation_time_slots` vide pour la session | Fallback binaire inchangé (présent → planned_hours/100 %, absent → 0/0) | N/A |
| Mock / preview | `signedLearnerIds` et `learnerAttendance` non fournis | Fallback « présent » = `planned_hours` / `100.00` (inchangé) | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/services/learner-attendance.ts` -- logique pure existante `computeLearnerAttendance` (signed_hours/total_hours) ; ajouter un helper d'entrée `computeAttestationAttendance(slots, signatureRows, learnerId)` → `{ signedHours, totalHours, ratePct } | null` (null = utiliser le fallback legacy).
- `src/lib/utils/resolve-variables.ts` -- `ResolveContext` (ajouter champ optionnel `learnerAttendance`) ; builders `{{heures_realisees_apprenant}}` / `{{taux_realisation}}` (l.780-795) qui doivent préférer `learnerAttendance` quand présent, sinon fallback binaire existant.
- `src/app/api/documents/generate-attestation-assiduite/route.ts` -- route single : charger les créneaux + signatures avec `time_slot_id`, calculer et passer `learnerAttendance`.
- `src/app/api/documents/generate-attestations-assiduite-batch/route.ts` -- route batch : idem, par apprenant dans la boucle.
- `src/lib/utils/__tests__/resolve-variables-attestations.test.ts` -- tests builders (existants = fallback ; ajouter cas `learnerAttendance`).
- `src/lib/services/__tests__/learner-attendance.test.ts` -- tests helper pur (ajouter cas du nouveau helper).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/services/learner-attendance.ts` -- ajouter `SlotSignatureRow` (`{ signer_id: string|null; time_slot_id: string|null }`) et `computeAttestationAttendance(slots, rows, learnerId)` : dériver `signedSlotIds` (rows du learner avec `time_slot_id` non NULL) ; si `slots` vide OU `signedSlotIds` vide → retourner `null` ; sinon réutiliser `computeLearnerAttendance` (1 session) et retourner `{ signedHours, totalHours, ratePct }` où `ratePct = totalHours>0 ? signed/total×100 : 0` (arrondi 1 décimale).
- [x] `src/lib/utils/resolve-variables.ts` -- ajouter `learnerAttendance?: { signedHours: number; totalHours: number; ratePct: number }` à `ResolveContext` (avec commentaire) ; dans les deux builders, `if (data.learnerAttendance) return data.learnerAttendance.<x>.toFixed(2)` en tête, sinon garder la logique binaire actuelle inchangée.
- [x] `src/app/api/documents/generate-attestation-assiduite/route.ts` -- ajouter la lecture `formation_time_slots (id, start_time, end_time)` de la session (en parallèle) ; ajouter `time_slot_id` au `select` des signatures ; calculer `learnerAttendance = computeAttestationAttendance(slots, signatureRows, learnerId) ?? undefined` ; l'ajouter au `context` et refléter heures/taux dans `cacheInputs.custom_variables`.
- [x] `src/app/api/documents/generate-attestations-assiduite-batch/route.ts` -- idem ; charger créneaux + `time_slot_id` une fois, calculer `learnerAttendance` par apprenant dans la boucle `tasks`, l'ajouter au `context` et aux `custom_variables`.
- [x] `src/lib/services/__tests__/learner-attendance.test.ts` + `src/lib/utils/__tests__/resolve-variables-attestations.test.ts` -- couvrir les scénarios de la matrice (partiel, intégral, absent, legacy NULL, session sans créneaux).

**Acceptance Criteria:**
- Given une session à plusieurs créneaux et un apprenant ayant émargé une partie, when on génère l'attestation (single ou batch), then « durée effectivement suivie » = somme des heures des créneaux signés et le taux = ces heures / total des heures des créneaux.
- Given une session sans créneaux ou un apprenant sans signature slot-level, when on génère l'attestation, then le comportement legacy (présence intégrale / absence) est strictement conservé.
- Given la suite de tests, when on lance `tsc --noEmit` et `vitest run`, then tout passe (tests existants inchangés + nouveaux cas).

## Spec Change Log

## Design Notes

Le résolveur préfère une valeur pré-calculée pour éviter d'y injecter des I/O Supabase (builders synchrones purs). Le helper retourne `null` plutôt que de deviner, ce qui laisse le résolveur retomber proprement sur l'heuristique binaire existante — c'est ce qui garantit zéro régression sur les données legacy.

Ratio base heures (extrait cible du builder) :
```ts
"{{taux_realisation}}": (() => {
  if (data.learnerAttendance) return data.learnerAttendance.ratePct.toFixed(2);
  // ... fallback binaire existant inchangé
})(),
```

Note (hors périmètre, à signaler si divergence en prod) : la ligne « Durée de la formation » reste `planned_hours`. Si la somme des créneaux diffère de `planned_hours`, un apprenant intégralement présent affichera taux 100 % avec des heures suivies possiblement ≠ de la durée affichée. Non traité ici (intent : base = heures des créneaux).

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur (rappel mémoire : `npm run lint` est cassé, ne pas l'utiliser).
- `npx vitest run src/lib/services/__tests__/learner-attendance.test.ts src/lib/utils/__tests__/resolve-variables-attestations.test.ts` -- expected: tous verts, nouveaux cas inclus.

**Manual checks (if no CLI):**
- Repro read-only en prod : session à ≥ 2 créneaux, apprenant ayant émargé une partie → l'attestation doit montrer heures < total et taux < 100 %.

## Spec Change Log

- **2026-07-08 — patch (revue Blind Hunter + Edge Case Hunter).** Finding : créneaux à durée nulle/négative ou signature orpheline (`time_slot_id` absent des créneaux) produisaient `signedHours = 0` → faux « 0 heure / 0 % » sur un document légal. Amendement : `computeAttestationAttendance` retourne désormais `null` si `totalHours <= 0` OU `signedHours <= 0` → retombe sur le fallback legacy (présence intégrale) au lieu d'imprimer un faux 0. Tests ajoutés (créneaux dégénérés, signature orpheline, absent-avec-créneaux). KEEP : le helper reste une fonction pure retournant `null` comme signal de fallback ; les builders du résolveur inchangés.

## Suggested Review Order

**Cœur du calcul**

- Point d'entrée : le nouveau helper pur qui somme les heures des créneaux émargés et signale le fallback via `null`.
  [`learner-attendance.ts:72`](../../src/lib/services/learner-attendance.ts#L72)

- Garde anti-régression : `null` sur données dégénérées/orphelines → présence intégrale legacy plutôt qu'un faux 0.
  [`learner-attendance.ts:89`](../../src/lib/services/learner-attendance.ts#L89)

**Branchement dans le rendu**

- Les builders préfèrent l'assiduité pré-calculée ; sinon heuristique binaire inchangée.
  [`resolve-variables.ts:791`](../../src/lib/utils/resolve-variables.ts#L791)

- Nouveau champ optionnel du contexte de résolution.
  [`resolve-variables.ts:27`](../../src/lib/utils/resolve-variables.ts#L27)

**Câblage des routes**

- Route single : lecture des créneaux + `time_slot_id`, calcul de `learnerAttendance`.
  [`generate-attestation-assiduite/route.ts:115`](../../src/app/api/documents/generate-attestation-assiduite/route.ts#L115)

- Route batch : idem par apprenant dans la boucle.
  [`generate-attestations-assiduite-batch/route.ts:141`](../../src/app/api/documents/generate-attestations-assiduite-batch/route.ts#L141)

**Périphériques**

- Docstring du template mise à jour (comportement par créneau).
  [`attestation-assiduite.ts:9`](../../src/lib/templates/attestation-assiduite.ts#L9)

- Tests du helper (partiel, intégral, legacy, dégénéré, orphelin).
  [`learner-attendance.test.ts:71`](../../src/lib/services/__tests__/learner-attendance.test.ts#L71)

- Tests des builders (priorité `learnerAttendance`).
  [`resolve-variables-attestations.test.ts:87`](../../src/lib/utils/__tests__/resolve-variables-attestations.test.ts#L87)
