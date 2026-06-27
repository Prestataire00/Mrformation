---
title: 'Générateur de programme interne — IA + relecture (onglet Formation) [A1]'
type: 'feature'
created: '2026-06-27'
status: 'done'
baseline_commit: 'd3a5710ad7da440b984b1caf7baa1a1aa3a6efec'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/bmad_output/brainstorming/brainstorm-alignement-construction-programmes-2026-06-27/brainstorm-intent.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La construction d'un programme se fait 100 % hors plateforme (ChatGPT pour le contenu, Gamma pour la mise en page). On internalise d'abord la **génération du contenu** dans l'onglet Programme d'une formation, en réutilisant les briques existantes.

**Approach:** Un bouton « Générer le programme (IA) » dans l'onglet Programme pré-remplit nom + durée depuis la formation et offre un champ libre « précisions ». Il appelle la génération IA (prompt métier du client), affiche le résultat pour relecture (régénérer / corriger léger), puis l'enregistre versionné sur `programs.content` (structure de séquence enrichie : objectifs opérationnels, contenus détaillés, méthodes, évaluation). Le téléchargement PDF reste le template actuel pour ce lot. Scope = **A1**. Le PDF au format des 2 exemples (A2), le côté CRM/prospect (B) et la suppression du builder manuel (C) sont reportés (`deferred-work.md`).

## Boundaries & Constraints

**Always:**
- Réutiliser les briques existantes : route `/api/ai/generate-program`, service `openai.ts`, `programs` service + `program_versions`, `ProgramContentPreview`. Pas de briques parallèles.
- Le prompt de génération = le prompt-type fourni par le client (Design Notes), paramétré nom / durée / précisions, sortie JSON contrainte.
- Structure de contenu **rétro-compatible** : nouveaux champs de séquence optionnels ; les programmes existants s'affichent et se génèrent sans changement.
- Accepter une génération → `createProgramVersion` (snapshot) puis `updateProgram(content)`, puis refetch.
- Chaque requête Supabase filtre `entity_id`. Logique Supabase dans `src/lib/services/`. Formulaire en RHF + Zod. shadcn/ui. Aucun `any`.

**Ask First:**
- Avant toute migration SQL : ce lot ne touche PAS la base (`programs.content` est un JSONB libre). Si un besoin de schéma apparaît, HALT.

**Never:**
- Pas de nouveau template PDF ni de changement de mise en page (lot A2).
- Pas de stockage/lien programme ↔ prospect ni de bouton CRM (lot B).
- Ne pas supprimer la saisie manuelle séquence-par-séquence existante (lot C).
- Pas d'éditeur de mise en page, pas de choix de couleur.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Génération nominale | Formation avec titre + durée, clic « Générer (IA) », précisions vides | Aperçu d'un programme structuré (page 1 + séquences enrichies), rien d'enregistré encore | Toast erreur si 4xx/5xx, état précédent conservé |
| Avec précisions | précisions = « formation DPC, public aides-soignants » | Précisions injectées au prompt, contenu adapté | idem |
| Régénérer | Aperçu affiché, clic « Régénérer » | Nouvel appel, remplace l'aperçu | idem |
| Accepter | Aperçu validé | `createProgramVersion` + `updateProgram`, refetch, toast succès | Toast erreur, pas de version partielle |
| Pas de programme attribué | État « aucun programme » | Le bouton génère un nouveau `programs` (createProgram) puis l'attribue | Toast erreur |
| Programme legacy | `content` sans nouveaux champs | Affichage + PDF actuels inchangés | N/A |
| Rate limit | > 5 générations/min | Message « réessayez dans Xs » | 429 géré |

</frozen-after-approval>

## Code Map

- `src/lib/services/openai.ts` -- `generateStructuredProgram` (prompt + `GeneratedProgramContent`, l.116-179) : remplacer le prompt par celui du client, accepter `precisions` + `duration_days`, enrichir la structure par séquence.
- `src/app/api/ai/generate-program/route.ts` -- accepter `precisions` dans le body (l.16-30) et le transmettre au service.
- `src/lib/types/index.ts` -- `ProgramContent` / `ProgramContentModule` (l.614-638) : champs optionnels (séquence : `operational_objectives[]`, `content_details[]`, `methods`, `evaluation`, `summary_objective` ; page 1 : `general_objectives[]`, `access_terms`).
- `src/lib/validations/program.ts` -- `programContentSchema` (l.30-56) : refléter ces champs optionnels.
- `src/components/programs/GenerateProgramDialog.tsx` -- NOUVEAU dialog RHF+Zod : titre/durée pré-remplis + champ précisions, états loading / régénérer / accepter, utilise `ProgramContentPreview`.
- `src/components/programs/ProgramContentPreview.tsx` -- étendre l'aperçu pour montrer les séquences enrichies (l.1-241).
- `src/app/(dashboard)/admin/formations/[id]/_components/TabProgramme.tsx` -- bouton « Générer le programme (IA) » dans l'état A et l'état « aucun programme » (l.194-266) + accepter (create/updateProgram + version) + refetch.
- `src/lib/services/programs.ts` -- réutiliser `createProgram` / `updateProgram` / `createProgramVersion` (l.54-132).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/types/index.ts` + `src/lib/validations/program.ts` -- ajouter les champs optionnels de séquence + page 1 -- structure enrichie sans casser l'existant.
- [x] `src/lib/services/openai.ts` -- prompt client paramétrable (nom/durée/précisions), accepter `precisions`/`duration_days`, retourner la structure enrichie -- moteur de contenu aligné.
- [x] `src/app/api/ai/generate-program/route.ts` -- accepter et transmettre `precisions` -- input « précisions ».
- [x] `src/components/programs/GenerateProgramDialog.tsx` + `ProgramContentPreview.tsx` -- dialog génération (RHF+Zod, pré-remplissage, régénérer) + aperçu relecture enrichi -- flux générer → relire → régénérer.
- [x] `src/app/(dashboard)/admin/formations/[id]/_components/TabProgramme.tsx` -- brancher le bouton + accepter (createProgram si aucun / createProgramVersion + updateProgram) + refetch + toasts -- intégration onglet.
- [x] `src/lib/__tests__/program*.test.ts` -- tests Zod : nouveaux champs optionnels acceptés + rétro-compat (content legacy valide).

**Acceptance Criteria:**
- Given une formation avec titre et durée, when je clique « Générer le programme (IA) », then le dialog est pré-rempli (titre + durée) avec un champ « précisions » optionnel.
- Given un aperçu généré, when je clique « Régénérer », then un nouvel aperçu remplace le précédent sans rien enregistrer.
- Given un aperçu validé, when je clique « Accepter », then le programme est enregistré (nouvelle version) et l'onglet le reflète après refetch.
- Given un programme existant sans nouveaux champs, when je l'affiche ou télécharge son PDF, then aucune régression.
- Given une formation d'une entité, when toute opération programme s'exécute, then chaque requête Supabase filtre `entity_id`.

## Design Notes

Prompt client à intégrer dans `generateStructuredProgram` (instruction, paramétrée `{nom}` `{jours}` `{heures}` `{precisions}`, sortie JSON contrainte) :

> « Tu es un concepteur pédagogique senior pour un organisme de formation en France. THÉMATIQUE : {nom} sur {jours} jours soit {heures} heures. Génère un programme détaillé (objectifs opérationnels, contenus, méthodes, évaluations, durée par séquence). Infos générales : objectifs généraux, max 12 personnes, prérequis, public cible, lieu, délais/modalités d'accès, méthodes pédagogiques (alternance apports théoriques/ateliers, ludo-pédagogie, support de synthèse), modalités d'évaluation (acquis en continu, à chaud, émargements, accessibilité/handicap). Résumé des séquences (titre + objectif). Détail par séquence : objectifs opérationnels, contenus détaillés avec exemples, méthodes, évaluation, durée. Verbes d'action, granularité fine, langage professionnel, exemples concrets, normes DPC/TP si présentes dans : {precisions}. »

Forme de séquence enrichie (additive, tous champs optionnels) :
```
{ id, title, duration_hours, summary_objective,
  operational_objectives: string[], content_details: string[],
  methods: string, evaluation: string }
```
Le PDF reste le template actuel dans ce lot — A2 livrera le rendu au format des exemples à partir de cette structure.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur sur les fichiers touchés
- `npx tsc --noEmit` -- expected: pas d'erreur de type (aucun `any`)
- `npx vitest run src/lib/__tests__/program.test.ts src/lib/validations/__tests__/program.test.ts` -- expected: verts

**Manual checks:**
- Onglet Programme d'une formation : générer → relire → régénérer → accepter → l'onglet montre le programme enregistré, aperçu enrichi visible.
- Programme legacy : affichage + PDF actuels inchangés.

## Suggested Review Order

**Point d'entrée**

- Le dialog : génère → aperçu → régénérer/accepter, sans aucune écriture Supabase.
  [`GenerateProgramDialog.tsx:85`](../../src/components/programs/GenerateProgramDialog.tsx#L85)

**Intégration onglet & persistance (le cœur du risque)**

- Acceptation : aiguillage create vs version+update, refetch.
  [`TabProgramme.tsx:164`](../../src/app/%28dashboard%29/admin/formations/%5Bid%5D/_components/TabProgramme.tsx#L164)
- Garde-fou : validation du `content` (Zod) avant toute écriture.
  [`TabProgramme.tsx:198`](../../src/app/%28dashboard%29/admin/formations/%5Bid%5D/_components/TabProgramme.tsx#L198)
- Atomicité : cleanup de l'orphelin si le rattachement échoue.
  [`TabProgramme.tsx:262`](../../src/app/%28dashboard%29/admin/formations/%5Bid%5D/_components/TabProgramme.tsx#L262)
- Bouton « Générer le programme (IA) » dans les deux états.
  [`TabProgramme.tsx:374`](../../src/app/%28dashboard%29/admin/formations/%5Bid%5D/_components/TabProgramme.tsx#L374)

**Moteur IA**

- Prompt client paramétré + structure enrichie + normalisation tolérante de la sortie.
  [`openai.ts:148`](../../src/lib/services/openai.ts#L148)
- Normalisation Zod : coerce des nombres, `modules` garanti tableau.
  [`openai.ts:236`](../../src/lib/services/openai.ts#L236)
- Route : accepte/transmet `precisions`, rate-limit 12/min.
  [`route.ts:11`](../../src/app/api/ai/generate-program/route.ts#L11)

**Rendu relecture**

- Aperçu enrichi par séquence (+ repli `topics` legacy).
  [`ProgramContentPreview.tsx:213`](../../src/components/programs/ProgramContentPreview.tsx#L213)

**Schéma, types & tests (périphérie)**

- Champs optionnels additifs (rétro-compatibilité).
  [`types/index.ts:623`](../../src/lib/types/index.ts#L623)
  [`program.ts:42`](../../src/lib/validations/program.ts#L42)
- Tests rétro-compat + schéma du formulaire.
  [`program.test.ts`](../../src/lib/validations/__tests__/program.test.ts)
