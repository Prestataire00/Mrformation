---
title: 'Planning : afficher les sessions sur leurs vrais créneaux (fin du "tout le temps")'
type: bugfix
created: '2026-06-27'
status: done
baseline_commit: 5fe1df1346df8bf8f64a6087e4f6b54a9d805d9c
context:
  - '{project-root}/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dans la page Planning globale, une session (ex. « pilotée et adaptée gestion RH »)
s'affiche sur **tous les jours** entre sa `start_date` et sa `end_date`, donnant l'impression
qu'elle se déroule « tout le temps », alors qu'elle n'a que 7 créneaux réels. Cause confirmée :
`isSessionOnDay` (`planning/page.tsx:158-162`) teste `day >= start_date && day <= end_date` et
n'a **aucune** connaissance des créneaux (`formation_time_slots` n'est jamais chargé dans cette page).

**Approach:** Charger les créneaux des sessions visibles et n'afficher une session un jour donné
que si elle a un **créneau ce jour-là**. Conserver un **fallback** sur le span `start_date→end_date`
uniquement pour les sessions **sans aucun créneau** (sessions simples/legacy), pour ne pas les faire
disparaître du planning. Logique de matching extraite dans un service pur testable.

## Boundaries & Constraints

**Always:** charger les créneaux filtrés par les `session_id` des sessions déjà chargées (donc
déjà filtrées `entity_id` — défense en profondeur) ; logique Supabase dans `src/lib/services/` ;
matching jour/créneau dans une fonction pure testable ; cohérence du calcul de jour avec
`toLocalDate` existant (jour local Y-M-D).

**Ask First:** changer le fallback des sessions sans créneau (ex. n'afficher que le jour de
`start_date` au lieu du span complet) ; appliquer le même correctif à d'autres écrans.

**Never:** casser l'affichage des sessions legacy sans créneaux ; recharger les créneaux à chaque
render (le faire quand la liste des sessions visibles change) ; recherche/chargement cross-entité.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Session avec créneaux | 7 créneaux sur la période | affichée uniquement les 7 jours de créneau | — |
| Jour sans créneau | session longue, jour vide | NON affichée ce jour-là | — |
| Session sans créneau | 0 `formation_time_slots` | fallback : affichée sur le span start→end (comportement actuel) | — |
| Plusieurs créneaux même jour | 2 créneaux le même jour | affichée une fois ce jour | — |
| Chargement créneaux échoue | erreur Supabase | fallback span pour toutes (pas de page cassée) | échec silencieux + log |
| Aucune session visible | liste vide | aucun fetch créneaux, planning vide normal | — |

</frozen-after-approval>

## Code Map

- `src/app/(dashboard)/admin/planning/page.tsx` -- `isSessionOnDay` (l.158-162, span brut) ; fetch
  sessions (l.760-790, sans créneaux) ; usages du filtre jour (l.405, 498, 544).
- `src/lib/services/planning-slots.ts` -- NOUVEAU : fetch des créneaux + index jour + lookup pur.
- `supabase` table `formation_time_slots` (`session_id`, `start_time`).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/services/planning-slots.ts` -- NOUVEAU.
  `fetchSessionSlots(supabase, sessionIds)` → `ServiceResult<{ slots: {session_id; start_time}[] }>`
  (`.from("formation_time_slots").select("session_id, start_time").in("session_id", ids)` ; ids vide →
  slots []). `dayKeyFromDate(date)` / `dayKeyFromIso(iso)` → `YYYY-MM-DD` local (aligné `toLocalDate`).
  `buildSlotDayIndex(slots)` (pur) → `{ sessionsWithSlots: Set<string>; slotDaysBySession: Map<string,
  Set<string>> }`. `slotDayLookup(index, sessionId, dayKey)` → `boolean | null` (null si la session
  n'a aucun créneau). -- moteur de matching.
- [x] `src/app/(dashboard)/admin/planning/page.tsx` -- après chargement des `sessions`, appeler
  `fetchSessionSlots` pour leurs ids, construire l'index (state), gérer l'erreur (fallback). Modifier
  `isSessionOnDay` : `const v = slotDayLookup(index, session.id, dayKeyFromDate(day)); if (v !== null)
  return v;` sinon span `start_date→end_date` actuel. -- branchement.
- [x] `src/lib/services/__tests__/planning-slots.test.ts` -- `buildSlotDayIndex` + `slotDayLookup` :
  session avec créneaux (jour avec/sans), session sans créneau → null (fallback), plusieurs créneaux
  même jour, `dayKeyFromIso/Date` cohérents. -- couverture.

**Acceptance Criteria:**
- Given une session avec 7 créneaux sur une longue période, when j'ouvre le planning, then elle
  apparaît uniquement les 7 jours correspondants (plus « tout le temps »).
- Given un jour sans créneau dans la période de la session, when je regarde ce jour, then la session
  n'y figure pas.
- Given une session sans aucun créneau, when j'ouvre le planning, then elle reste affichée sur son
  span `start_date→end_date` (comportement inchangé).
- Given le chargement des créneaux échoue, when la page s'affiche, then elle ne plante pas (fallback
  span) et l'erreur est loggée.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur
- `npx vitest run src/lib/services/__tests__/planning-slots.test.ts` -- expected: vert
- `npm run build` -- expected: build OK

**Manual checks:**
- Page Planning : la session « pilotée et adaptée gestion RH » n'apparaît plus que sur ses jours de
  créneau ; une session sans créneau reste visible sur sa période.

## Suggested Review Order

**Diagnostic**

- La cause : span start→end peint la session "tout le temps" ; remplacé par un matching créneaux
  [`page.tsx`](../../src/app/(dashboard)/admin/planning/page.tsx)

**Moteur (service pur)**

- Fetch créneaux (limit 5000) + index jour (Europe/Paris) + lookup avec fallback (null)
  [`planning-slots.ts`](../../src/lib/services/planning-slots.ts)

**Branchement**

- `isSessionOnDay` : créneaux puis fallback span ; sessions + index posés ensemble (anti-flash) ;
  prop `slotIndex` threadée dans les 3 vues
  [`page.tsx`](../../src/app/(dashboard)/admin/planning/page.tsx)

**Tests**

- 6 cas (index, lookup, fallback null, dédup, dayKey Paris, fetch)
  [`planning-slots.test.ts`](../../src/lib/services/__tests__/planning-slots.test.ts)
