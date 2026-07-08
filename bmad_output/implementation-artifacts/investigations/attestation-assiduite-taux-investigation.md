# Investigation: Attestation d'assiduité — taux figé à 100 %

## Hand-off Brief

1. **What happened.** L'attestation d'assiduité affiche « heures réalisées = durée totale, taux = 100 % » dès que l'apprenant possède **≥ 1 signature** sur la session, quel que soit le nombre de créneaux réellement émargés — heuristique binaire assumée « MVP ». (Confirmé)
2. **Where the case stands.** Racine confirmée dans le résolveur de variables et les deux routes de génération ; le calcul réel par créneau existe déjà ailleurs (`computeLearnerAttendance`) et le schéma le supporte (`signatures.time_slot_id`). Aucune migration nécessaire.
3. **What's needed next.** Correctif ciblé (`bmad-quick-dev`) : faire calculer heures/taux à partir des créneaux signés (réutiliser `computeLearnerAttendance`) et injecter les valeurs dans le résolveur, au lieu du set binaire `signedLearnerIds`.

## Case Info

| Field            | Value                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Ticket           | N/A                                                                    |
| Date opened      | 2026-07-08                                                             |
| Status           | Concluded                                                             |
| System           | LMS MR/C3V — Next.js 14 / Supabase, génération PDF (Puppeteer)         |
| Evidence sources | Code source, schema.sql + migrations Supabase                         |

## Problem Statement

L'attestation d'assiduité doit indiquer les heures **réellement** suivies par le stagiaire. Elle affiche actuellement le total de la formation (100 %) même quand le parcours n'a pas été suivi intégralement.

## Evidence Inventory

| Source                                                             | Status    | Notes                                                                 |
| ------------------------------------------------------------------ | --------- | --------------------------------------------------------------------- |
| `src/lib/templates/attestation-assiduite.ts`                       | Available | Docstring assume explicitement la règle MVP « ≥1 signature → 100 % »  |
| `src/app/api/documents/generate-attestation-assiduite/route.ts`    | Available | Route single — ne sélectionne que `signer_id`                         |
| `src/app/api/documents/generate-attestations-assiduite-batch/route.ts` | Available | Route batch — même requête binaire                                    |
| `src/lib/utils/resolve-variables.ts`                               | Available | Builders `{{heures_realisees_apprenant}}` / `{{taux_realisation}}`    |
| `supabase/migrations/*emargement*.sql`                             | Available | `signatures.time_slot_id` déjà en place                               |
| `src/lib/services/learner-attendance.ts`                           | Available | Calcul réel par créneau déjà implémenté et testable (fonction pure)   |

## Confirmed Findings

### Finding 1 : Le calcul heures/taux est binaire (100 % ou 0 %)

**Evidence:** `src/lib/utils/resolve-variables.ts:780-795`

**Detail:** Les builders `{{heures_realisees_apprenant}}` et `{{taux_realisation}}` retournent `planned_hours` / `100.00` si `data.signedLearnerIds` contient `learner.id`, sinon `0.00` / `0.00`. Aucune notion de créneaux partiellement suivis. Pire, si `signedLearnerIds` n'est pas fourni (cas mock), le fallback assume « présent » → 100 %.

### Finding 2 : Les routes ne remontent que « a signé au moins une fois »

**Evidence:** `generate-attestation-assiduite/route.ts:80-99` ; `generate-attestations-assiduite-batch/route.ts:93-118`

**Detail:** Les deux routes font `signatures.select("signer_id").eq("signer_type","learner")` — sans `time_slot_id` — puis construisent un `Set<signer_id>`. L'information de granularité par créneau est disponible en base mais **jamais lue**.

### Finding 3 : L'intention MVP est documentée dans le code

**Evidence:** `src/lib/templates/attestation-assiduite.ts:9-12`

**Detail:** « MVP "heures réalisées" : si l'apprenant a ≥1 signature pour la session, on suppose qu'il a fait l'intégralité (heures = planned_hours, taux 100%). À affiner ultérieurement via signatures par créneau (nécessiterait migration du schéma signatures). »

## Deduced Conclusions

### Deduction 1 : Le prérequis invoqué par le MVP est déjà levé

**Based on:** Finding 3 + migrations Supabase.

**Reasoning:** Le commentaire conditionne l'affinage à « une migration du schéma signatures ». Or `signatures.time_slot_id → formation_time_slots(id)` a été ajouté par `add-formation-tabs-4-5-6.sql` et rendu unique/slot-aware par `add-slot-aware-emargement.sql`. `formation_time_slots` porte `start_time`/`end_time` (durée calculable).

**Conclusion:** Le vrai calcul est réalisable **sans nouvelle migration**, uniquement côté application.

### Deduction 2 : La logique correcte existe déjà et est réutilisable

**Based on:** `src/lib/services/learner-attendance.ts:48-84`.

**Reasoning:** `computeLearnerAttendance` prend les créneaux d'une session et les `signedSlotIds`, et renvoie `signed_hours`, `total_hours`, `rate_pct` — exactement ce qu'attend l'attestation. Fonction pure, déjà testée.

**Conclusion:** Le correctif est un branchement de données, pas une nouvelle logique métier.

## Source Code Trace

| Champ          | Valeur                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------ |
| Error origin   | `resolve-variables.ts:780-795` (builders heures/taux binaires)                             |
| Trigger        | Génération attestation (routes single/batch) qui ne passent que `signedLearnerIds`         |
| Condition      | Apprenant ayant ≥ 1 signature mais < 100 % des créneaux → affiché 100 %                     |
| Related files  | `learner-attendance.ts` (calcul correct), `attestation-assiduite.ts` (template + docstring) |

## Conclusion

**Confidence:** High

Racine **confirmée** : le taux de réalisation n'est jamais calculé à partir des créneaux réellement émargés. Les builders du résolveur (`resolve-variables.ts:780-795`) et les deux routes de génération appliquent une règle binaire « a signé ≥ 1 fois ⇒ 100 % ». Le schéma (`signatures.time_slot_id`) et une fonction de calcul correcte (`computeLearnerAttendance`) existent déjà ; le défaut est purement applicatif et corrigeable sans migration.

## Recommended Next Steps

### Fix direction

1. **Routes** (`generate-attestation-assiduite` + `generate-attestations-assiduite-batch`) : charger `formation_time_slots` de la session (`id, start_time, end_time`) et les signatures apprenant **avec `time_slot_id`** ; par apprenant, dériver `signedSlotIds`.
2. **Calcul** : appeler `computeLearnerAttendance` (ou son cœur `slotHours`) → `signed_hours`, `total_hours`, `rate_pct`.
3. **Résolveur** : passer ces valeurs déjà calculées via `custom_variables` / le contexte, et faire pointer `{{heures_realisees_apprenant}}` / `{{taux_realisation}}` dessus au lieu de l'heuristique binaire.
4. **Cas limites à décider avec le métier :**
   - Session **sans créneaux** (`formation_time_slots` vide) → fallback actuel (planned_hours) à conserver, sinon on régresse vers 0 h partout.
   - Signatures **legacy à `time_slot_id = NULL`** (émargement session non slot-aware) → à traiter comme « présent intégral » ou à exclure ? Sans règle, risque de faux 0 %.
   - Base du taux : `signed_hours / total_hours` (heures) vs `signed_slots / total_slots` (créneaux) — l'attestation parle d'heures, privilégier les heures.
5. **Mock** (`generate-attestation-assiduite-mock`) : garder un jeu 14 h / 100 % mais idéalement illustrer un cas partiel.

### Diagnostic

Repro en prod (read-only) : sur une session à N créneaux, un apprenant n'ayant émargé qu'une partie doit ressortir avec `signed_hours < total_hours`. Vérifier que `signatures.time_slot_id` est bien peuplé sur les sessions récentes (sinon le fallback legacy domine).

## Reproduction Plan

1. Session avec ≥ 2 `formation_time_slots`.
2. Un apprenant signe **un seul** créneau.
3. Générer l'attestation d'assiduité → observé : « durée effectivement suivie = durée totale, taux 100 % ». Attendu : heures = durée du créneau signé, taux = part réellement suivie.

## Side Findings

- `resolve-variables.ts:786,793` : quand `signedLearnerIds` est absent, fallback « présent » → 100 %. Combiné au correctif, veiller à ce que l'absence de données ne re-produise pas silencieusement du 100 %.
- Les deux routes dupliquent la requête signatures/contexte — le correctif est à appliquer aux deux (risque d'oubli sur la batch).
