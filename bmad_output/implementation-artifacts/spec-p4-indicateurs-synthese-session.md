---
title: "3 indicateurs de synthèse en tête de l'onglet questionnaires : positionnement avant/après (%) + satisfaction (/5)"
type: 'feature'
created: '2026-06-26'
status: 'done'
baseline_commit: '6a91ff4e4a3b01b2ca47b9b1c498f33d25365b26'
context:
  - '{project-root}/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sur l'onglet questionnaires d'une session, l'admin voit les questionnaires attribués mais pas de lecture synthétique des résultats. Il veut 3 indicateurs d'emblée : niveau de positionnement AVANT, niveau APRÈS avec l'évolution, et la satisfaction en note /5. Les données existent déjà (`loadObjectivesProgression` → moyennes avant/après 1-5 par objectif ; `loadQualiopiIndicators.satisfactionRate` → %) mais l'`ObjectivesProgressionCard` ne les expose pas sous cette forme (elle montre le détail par objectif + un % satisfaction).

**Approach:** Pur affichage, AUCUN recalcul d'agrégat ni fetch. Ajouter une fonction pure qui dérive 3 indicateurs « tête de gondole » des props existantes : niveau global avant (= moyenne des `avgBefore` par objectif, exprimée en %), niveau global après (% + delta avant→après), et satisfaction convertie en note /5 (`satisfactionRate / 20`). Les afficher en bandeau de 3 tuiles en haut de `ObjectivesProgressionCard`, au-dessus du détail par objectif existant (conservé).

## Boundaries & Constraints

**Always:** Dériver UNIQUEMENT de `progressions` (ObjectiveProgression[]) et `satisfactionRate` déjà passés en props. Moyennes globales calculées sur les objectifs au côté non-null seulement. Conversion `% = moyenne/5×100`, `note/5 = satisfactionRate/20`. Logique de calcul dans une fonction pure testable. shadcn/ui (`Card`, `Progress`, `Badge`), cohérence visuelle avec la carte existante. Pas de `any`.

**Ask First:** Toute modification des calculs `loadObjectivesProgression` / `loadQualiopiIndicators`. Tout changement de la sémantique « positionnement = auto-évaluation 1-5 » (pas un quiz bonnes/mauvaises réponses).

**Never:** Ne pas refaire les agrégats ni ajouter de requête Supabase. Ne pas supprimer le détail de progression par objectif existant. Ne pas toucher aux autres onglets ni à `QuestionnaireOverview`. Pas de nouvelle table/migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Avant + après + satisfaction présents | progressions avec avgBefore/avgAfter, satisfactionRate=84 | 3 tuiles : Avant 90%, Après 96% (+6 pts), Satisfaction 4,2/5 | N/A |
| Seulement positionnement avant répondu | avgAfter tous null | Tuile Avant en %, tuile Après « — », pas de delta | N/A |
| Aucune progression mais satisfaction | progressions=[], satisfactionRate=80 | Tuiles avant/après « — », Satisfaction 4,0/5 ; détail par objectif masqué (existant) | N/A |
| Aucune donnée | progressions=[], satisfactionRate=null | Carte entièrement masquée (comportement existant inchangé) | N/A |
| Objectifs partiels | certains avgBefore null | Moyenne globale calculée sur les objectifs non-null uniquement | division par 0 évitée → null → « — » |

</frozen-after-approval>

## Code Map

- `src/lib/services/load-session-aggregates.ts:384` -- type `ObjectiveProgression` ; y ajouter la fonction pure `computeSessionHeadlineIndicators`.
- `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/ObjectivesProgressionCard.tsx:58` -- composant ; insérer le bandeau 3 tuiles en tête de `CardContent`, remplacer la jauge satisfaction isolée (l.74-90) par la tuile Satisfaction /5 ; conserver les barres par objectif.
- `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx:176` -- réf. : la carte est déjà montée avec les bonnes props (rien à changer côté fetch).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/services/load-session-aggregates.ts` -- Ajouter `computeSessionHeadlineIndicators(progressions: ObjectiveProgression[], satisfactionRate: number | null): { beforePct: number | null; afterPct: number | null; deltaPct: number | null; satisfactionOn5: number | null }`. Moyenne des `avgBefore`/`avgAfter` non-null → `/5×100` ; `deltaPct = afterPct - beforePct` (null si un côté manquant) ; `satisfactionOn5 = satisfactionRate/20`. -- pure, testable, aucun fetch.
- [x] `src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/ObjectivesProgressionCard.tsx` -- Calculer les indicateurs via le helper ; rendre un bandeau de 3 tuiles en haut (« Positionnement avant » %, « Positionnement après » % + badge delta réutilisant `DeltaBadge`/évolution, « Satisfaction » X,X/5) ; remplacer la jauge satisfaction isolée par la tuile /5 ; garder les barres par objectif. Valeurs null → « — ». -- exposition des 3 indicateurs.
- [x] `src/lib/__tests__/session-headline-indicators.test.ts` -- Tester `computeSessionHeadlineIndicators` sur les cas de la matrice I/O (complet, après manquant, sans progression, partiels, null). -- règle tests.

**Acceptance Criteria:**
- Given une session avec positionnement avant/après et satisfaction, when l'admin ouvre l'onglet questionnaires, then il voit en tête 3 indicateurs : niveau avant en %, niveau après en % avec l'évolution, et la satisfaction en note /5.
- Given seul le positionnement avant a été répondu, when l'admin ouvre l'onglet, then la tuile « après » affiche « — » sans évolution, sans erreur.
- Given aucune donnée de progression ni satisfaction, when l'admin ouvre l'onglet, then la carte reste masquée (comportement inchangé).
- Given des objectifs partiellement renseignés, when les moyennes sont calculées, then elles ne portent que sur les objectifs au côté non-null (pas de division par zéro).

## Design Notes

`satisfactionRate` est déjà un % (= moyenne/5 × 20). Donc `note/5 = satisfactionRate / 20` (ex. 84 → 4,2/5). Le niveau de positionnement est une auto-évaluation 1-5 (pas un score de bonnes réponses) → « % de réussite » = `moyenne/5 × 100` (ex. 4,5/5 → 90 %), conforme à l'intention client. `deltaPct` exprime l'évolution en points de %.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur
- `npx vitest run src/lib/__tests__/session-headline-indicators.test.ts` -- expected: tous verts

**Manual checks:**
- Sur une session avec réponses positionnement avant/après + satisfaction, ouvrir l'onglet questionnaires → vérifier les 3 tuiles (avant %, après % + évolution, satisfaction /5) et que le détail par objectif reste affiché en dessous.

## Suggested Review Order

**Dérivation (pure)**

- Entrée : helper qui dérive les 3 indicateurs des données existantes (conversions /5→% et ÷20, clamp [0,100])
  [`load-session-aggregates.ts:407`](../../src/lib/services/load-session-aggregates.ts#L407)

- Évolution honnête (revue F2) : moyenne des deltas APPARIÉS par objectif, pas la différence de deux moyennes disjointes
  [`load-session-aggregates.ts:428`](../../src/lib/services/load-session-aggregates.ts#L428)

**Rendu**

- Calcul des indicateurs dans la carte
  [`ObjectivesProgressionCard.tsx:92`](../../src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/ObjectivesProgressionCard.tsx#L92)

- Bandeau 3 tuiles (avant %, après % + évolution, satisfaction /5) ; remplace la jauge isolée, détail par objectif conservé
  [`ObjectivesProgressionCard.tsx:107`](../../src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/ObjectivesProgressionCard.tsx#L107)

- Badge d'évolution en points de %
  [`ObjectivesProgressionCard.tsx:16`](../../src/app/(dashboard)/admin/formations/[id]/_components/questionnaires/ObjectivesProgressionCard.tsx#L16)

**Tests**

- Conversions, après-manquant, objectifs disjoints (delta null), delta apparié, évolution négative
  [`session-headline-indicators.test.ts:19`](../../src/lib/__tests__/session-headline-indicators.test.ts#L19)
