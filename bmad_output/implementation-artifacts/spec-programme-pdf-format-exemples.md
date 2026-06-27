---
title: 'PDF programme au format des 2 exemples client (template v2) [A2]'
type: 'feature'
created: '2026-06-27'
status: 'done'
baseline_commit: 'fae240e2'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/bmad_output/implementation-artifacts/spec-programme-generateur-interne.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le PDF programme actuel utilise le template « Loris » (tableaux par jour/créneau), différent des 2 PDF exemples du client (sortis de Gamma). Pour remplacer définitivement Gamma, le PDF doit reproduire ces exemples.

**Approach:** Créer un template v2 (`programme-formation-v2.ts`) reproduisant les exemples : page 1 infos générales, page 2 cartes « résumé des séquences », pages 3-4 déroulé **texte** par séquence (objectifs opérationnels / contenus détaillés / méthodes / évaluation / durée). Ajouter les résolveurs de variables lisant la structure enrichie livrée par A1, et router les routes PDF programme vers v2 quand le `content` est enrichi — sinon le template legacy. Scope = **A2**. (B CRM/prospect, C suppression builder manuel restent reportés.)

## Boundaries & Constraints

**Always:**
- Réutiliser le pipeline existant : `resolveVariables`/`resolveDocumentVariables`, `DocumentGenerationService` (Puppeteer + cache), `loadEntitySettings` (logo / nom / coordonnées organisme), le système d'alias `[%…%]` → `{{clé}}`.
- Réutiliser les résolveurs page 1 existants quand ils conviennent (`{{profil_stagiaire}}`, `{{programme_prerequis}}`, `{{effectif_max}}`, `{{moyens_pedagogiques}}`, `{{dispositif_evaluation}}`, `{{equipe_pedagogique}}`, organisme/footer). N'ajouter de nouveaux résolveurs que pour le réellement nouveau : `{{objectifs_generaux}}`, `{{delais_modalites_acces}}`, `{{sequences_resume}}`, `{{sequences_detail}}`.
- Le nouveau template hérite des champs enrichis de `programs.content` (A1) : racine `general_objectives[]`, `access_terms`, `target_audience`, `prerequisites`, `location`, `pedagogical_resources[]`, `evaluation_methods[]`, `team_description` ; séquence `modules[]` = `{ id, title, duration_hours, summary_objective, operational_objectives[], content_details[], methods, evaluation, topics[] }`.
- Habillage standard unique, PAS de logique couleur. Un bloc « Accessibilité » standard (texte fixe), comme dans les exemples.
- `entity_id` filtré sur toute requête (déjà le cas dans les routes). Aucun `any`.

**Ask First:**
- Aucune migration SQL (`programs.content` reste un JSONB libre). Si un besoin de schéma apparaît, HALT.

**Never:**
- Ne pas modifier ni casser le template legacy `programme-formation.ts` ni son rendu pour les programmes non enrichis.
- Pas de logique CRM/prospect (B), pas de suppression du builder manuel (C).
- Pas de changement de la structure de données A1 (lecture seule ici).
- Pas de choix de couleur / d'éditeur de mise en page.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Programme enrichi | `content` avec `modules[].operational_objectives`/`content_details` | PDF rendu via template v2 (page1 / cartes / texte par séquence) | Erreur PDF → réponse erreur gérée (inchangé) |
| Programme legacy | `content` sans champs enrichis | PDF rendu via template legacy (aucune régression) | idem |
| Séquence partielle | un module sans `evaluation`/`methods` | Le bloc manquant est omis proprement (pas de label vide) | N/A |
| Objectifs généraux absents | `general_objectives` vide | Section omise ou repli sur `objectives` racine | N/A |
| Aperçu hub programme | route `generate-program-preview` (programId) sur programme enrichi | Même rendu v2 que le téléchargement formation | idem |
| Cache | régénération après modif programme | Cache invalidé (clé inclut `program_updated_at` + version de template) | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/templates/programme-formation-v2.ts` -- NOUVEAU : `PROGRAMME_FORMATION_V2_HTML` (4 pages : page1 infos + 2 encadrés ; page2 grille de cartes ; page3-4 texte par séquence) + footer (réutiliser `PROGRAMME_FORMATION_FOOTER_TEMPLATE` existant). S'appuyer sur les classes CSS du template actuel pour la charte.
- `src/lib/utils/resolve-variables.ts` -- ajouter les résolveurs `{{objectifs_generaux}}`, `{{delais_modalites_acces}}`, `{{sequences_resume}}` (cartes : titre + durée + `summary_objective`), `{{sequences_detail}}` (par séquence : titre+durée, puces `operational_objectives`, `content_details`, `methods`, `evaluation`) — sur le pattern de `{{contenu_pedagogique}}` (l.902-992). Ajouter les alias `[%…%]` correspondants dans `ALIAS_TO_VARIABLE_KEY` (l.1452-1557).
- `src/app/api/documents/generate-programme/route.ts` -- choisir v2 vs legacy via un helper `isEnrichedProgramContent(content)` avant `resolveDocumentVariables` (l.~89) ; ajouter un `custom_variables.template_version` au cache.
- `src/app/api/documents/generate-program-preview/route.ts` -- même routage (l.~128) pour cohérence de l'aperçu hub.
- `src/lib/utils/program-content.ts` (ou inline) -- NOUVEAU petit helper `isEnrichedProgramContent(content)` : vrai si un module porte `operational_objectives`/`content_details` ou si `general_objectives` présent. Réutilisable par les 2 routes.
- `src/lib/utils/__tests__/resolve-variables-programme.test.ts` -- étendre : rendu des nouveaux résolveurs sur content enrichi + repli propre sur content legacy/partiel.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/utils/program-content.ts` -- helper `isEnrichedProgramContent(content)` -- décision de routage v2/legacy partagée.
- [x] `src/lib/utils/resolve-variables.ts` -- 4 nouveaux résolveurs (`objectifs_generaux`, `delais_modalites_acces`, `sequences_resume`, `sequences_detail`) lisant la structure enrichie + leurs alias `[%…%]` -- alimente le template v2 ; repli propre si champ absent.
- [x] `src/lib/templates/programme-formation-v2.ts` -- template HTML 4 pages reproduisant les 2 exemples (page1 infos + encadrés Informations pratiques / Délais ; page2 cartes ; page3-4 texte) + bloc Accessibilité standard -- rendu cible.
- [x] `src/app/api/documents/generate-programme/route.ts` + `generate-program-preview/route.ts` -- router v2 si `isEnrichedProgramContent`, sinon legacy ; cache `template_version` -- bascule sans régression.
- [x] `src/lib/utils/__tests__/resolve-variables-programme.test.ts` -- tests des 4 résolveurs (enrichi + partiel + legacy) -- garantit rendu + repli.

**Acceptance Criteria:**
- Given un programme enrichi (généré par A1) sur une formation, when je télécharge son PDF, then il fait 4 pages au format des 2 exemples : page 1 infos générales + 2 encadrés, page 2 cartes « résumé des séquences », pages 3-4 déroulé texte par séquence — et plus aucun recours à Gamma.
- Given un programme legacy (sans champs enrichis), when je télécharge son PDF, then le rendu legacy est inchangé (aucune régression).
- Given une séquence sans `methods`/`evaluation`, when le PDF se génère, then les blocs manquants sont omis proprement (pas de titre orphelin).
- Given l'aperçu du hub programme (`generate-program-preview`), when le programme est enrichi, then il utilise le même rendu v2 que le téléchargement formation.
- Given toute génération PDF, when elle s'exécute, then les requêtes Supabase filtrent `entity_id` (inchangé) et aucune migration SQL n'est introduite.

## Design Notes

Cible visuelle = les 2 PDF exemples MR Formation (« Bien installer le résident » 14h ; « Communication managériale N2 » 14h). Page 1 : bandeau titre + logo, « Objectifs généraux » (puces), 2 encadrés côte à côte (Informations pratiques : durée, max 12, prérequis, public, lieu | Délais et modalités d'accès : délai, inscription, convocation, formateur), Méthodes pédagogiques (ludo-pédagogie), Modalités d'évaluation, encart Accessibilité, footer coordonnées. Habillage standard unique (pas de variante couleur entre exemples).

Rendu séquence (`{{sequences_detail}}`, repli propre si vide) :
```
<div class="sequence"><h3>{title} ({duration_hours}h)</h3>
  <p class="lbl">Objectifs opérationnels</p><ul>…operational_objectives…</ul>
  <p class="lbl">Contenus détaillés</p><ul>…content_details…</ul>
  <p class="lbl">Méthodes</p><p>{methods}</p>
  <p class="lbl">Évaluation</p><p>{evaluation}</p></div>
```

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur (aucun `any`)
- `npx vitest run src/lib/utils/__tests__/resolve-variables-programme.test.ts` -- expected: verts
- (`npm run lint` est cassé au niveau config ESLint du projet — préexistant, non bloquant pour ce lot.)

**Manual checks:**
- Générer un PDF depuis un programme enrichi → comparer visuellement aux 2 exemples (4 pages, structure conforme).
- Générer un PDF d'un programme legacy → rendu inchangé.

## Suggested Review Order

**Routage (le pivot v2 ↔ legacy)**

- Décision d'aiguillage : v2 si contenu enrichi, sinon legacy.
  [`program-content.ts:25`](../../src/lib/utils/program-content.ts#L25)
- Branchement route formation + cache `template_version`.
  [`generate-programme/route.ts:94`](../../src/app/api/documents/generate-programme/route.ts#L94)
- Même branchement pour l'aperçu hub.
  [`generate-program-preview/route.ts:133`](../../src/app/api/documents/generate-program-preview/route.ts#L133)

**Rendu des séquences (cœur du format)**

- Résolveurs enrichis : titre de section porté ici (anti-orphelin), échappement HTML.
  [`resolve-variables.ts:1059`](../../src/lib/utils/resolve-variables.ts#L1059)
- Objectifs généraux + délais (repli propre).
  [`resolve-variables.ts:1026`](../../src/lib/utils/resolve-variables.ts#L1026)
- Helper d'échappement HTML.
  [`resolve-variables.ts:140`](../../src/lib/utils/resolve-variables.ts#L140)

**Template v2 (mise en page)**

- Le template 4 pages : page1 + encadrés, page-breaks vers cartes puis déroulé.
  [`programme-formation-v2.ts:30`](../../src/lib/templates/programme-formation-v2.ts#L30)

**Tests (périphérie)**

- Rendu enrichi / partiel / legacy + détection enrichi.
  [`resolve-variables-programme.test.ts`](../../src/lib/utils/__tests__/resolve-variables-programme.test.ts)
