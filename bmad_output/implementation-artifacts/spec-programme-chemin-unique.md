---
title: 'Un seul chemin de création de programme (IA) — retrait saisie manuelle [C]'
type: 'refactor'
created: '2026-06-27'
status: 'done'
baseline_commit: 'd4b9b5bd'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/bmad_output/brainstorming/brainstorm-alignement-construction-programmes-2026-06-27/brainstorm-intent.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Il existe plusieurs façons de fabriquer un programme (saisie manuelle séquence-par-séquence, extraction depuis document, génération IA), ce qui crée de la confusion et du doublon avec le générateur IA livré en A1.

**Approach:** Ne garder qu'**un seul chemin de création** : la génération IA (prompt A1). Retirer la saisie manuelle séquence-par-séquence (textarea JSON du hub + grille de modules de l'édition) et l'extraction depuis document (`ai-extract` + écran `/admin/programs/import`). Porter le générateur IA dans le hub pour créer un programme catalogue standalone. Conserver l'édition des **métadonnées** (titre, BPF, durées, public…) et **intact** le lien programme→session. Scope = **C** (suite de A1/A2). Pas de migration SQL.

## Boundaries & Constraints

**Always:**
- Réutiliser `GenerateProgramDialog` (A1) comme unique voie de création/(re)génération de contenu. Dans le hub, créer un programme standalone via `createProgram` (entity courante) **sans** attacher de session.
- Conserver le service `programs.ts` (create/update/deleteProgram, createProgramVersion) et l'attribution programme→formation (`TabProgramme.handleAssignProgram`, `sessions.program_id`) **strictement inchangés**.
- Garder l'édition des métadonnées d'un programme (titre, description, objectifs, durées, public cible, prérequis, équipe, **champs BPF/Qualiopi**, certification) et le « Générer avec l'IA » de la page détail (régénère le contenu via `/api/ai/generate-program`).
- `entity_id` filtré sur toute requête. RHF + Zod, shadcn/ui, services dédiés, aucun `any`.

**Ask First:**
- Aucune migration SQL (lecture/écriture `programs.content` inchangées). Si un besoin de schéma apparaît, HALT.
- Avant suppression de la route `ai-extract` ou de la page `import` : confirmer par `grep` qu'il ne reste **aucun** appelant ; sinon HALT.

**Never:**
- Ne pas casser le rendu/affichage/PDF d'un programme (A2) ni la chaîne d'attribution session.program_id.
- Ne pas supprimer les versions, le catalogue (toggle `is_active`), l'e-learning, les supports (`program_documents`), les enrollments.
- Pas de logique CRM/prospect (lot B). Pas de migration SQL.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Création hub | Clic « Générer (IA) » dans `/admin/programs` | `GenerateProgramDialog` → `createProgram` (sans session) → programme dans la liste après refetch | Toast erreur, rien créé |
| Plus de saisie manuelle | Ouverture création/édition | Aucun textarea JSON de content, aucune grille d'ajout/réordonnancement de séquences | N/A |
| Édition métadonnées | Programme existant, « Modifier » | Champs titre/BPF/durées/public éditables et enregistrés ; pas d'éditeur de séquences | Toast erreur |
| Régénération détail | `/admin/programs/[id]` « Générer avec l'IA » | Régénère le content via IA (inchangé) | Toast erreur |
| Import retiré | Accès `/admin/programs/import` ou bouton « Remplir depuis un document » | N'existent plus ; aucune route morte appelée | N/A |
| Attribution formation | Onglet Programme : attribuer / voir / PDF | Inchangé (sessions.program_id préservé) | inchangé |

</frozen-after-approval>

## Code Map

- `src/app/(dashboard)/admin/programs/page.tsx` -- hub : retirer la création manuelle (emptyForm + textarea JSON content ~l.107-134, `validateContent` ~l.295-308) et le flux `handleAiExtractForNewProgram` (~l.319-386) ; retirer le lien vers `/import` (~l.642-646) ; brancher `GenerateProgramDialog` pour « Nouveau programme (IA) ».
- `src/components/programs/GenerateProgramDialog.tsx` -- supporter un usage **standalone** (pas de session) : titre/durée saisis dans le dialog, `onAccept(content)` géré par le hub via `createProgram`.
- `src/app/(dashboard)/admin/programs/[id]/_components/EditProgramDialog.tsx` -- retirer la grille de modules (~l.331-451) et le bouton « Remplir depuis un document » / `handleAiExtract` (~l.84-187) ; garder l'édition des métadonnées.
- `src/app/(dashboard)/admin/programs/[id]/page.tsx` -- `handleSave` (~l.283-346) : enregistrer les **métadonnées** sans reconstruire `content` depuis `editModules` ; retirer le flux ai-extract ; garder « Générer avec l'IA ».
- `src/app/(dashboard)/admin/programs/import/page.tsx` -- **supprimer** l'écran.
- `src/app/api/programs/ai-extract/route.ts` -- **supprimer** la route après vérification « zéro appelant ».
- `src/lib/validations/program.ts` -- `programHubFormSchema` : le `content` n'est plus saisi manuellement ; ajuster (création via objet généré, validé par `programContentSchema`). Conserver `programContentSchema`.
- Tests : `src/lib/validations/__tests__/program.test.ts` (+ tests programme) -- retirer/ajuster ce qui couvre la saisie manuelle/ai-extract.

## Tasks & Acceptance

**Execution:**
- [x] `src/components/programs/GenerateProgramDialog.tsx` -- mode standalone (sans session) -- réutilisable dans le hub.
- [x] `src/app/(dashboard)/admin/programs/page.tsx` -- remplacer création manuelle + ai-extract + lien import par « Générer (IA) » (createProgram sans session, refetch) -- chemin unique de création.
- [x] `src/app/(dashboard)/admin/programs/[id]/_components/EditProgramDialog.tsx` -- retirer grille modules + ai-extract, garder métadonnées -- édition métadonnées only.
- [x] `src/app/(dashboard)/admin/programs/[id]/page.tsx` -- `handleSave` métadonnées-only, retrait ai-extract, garder régénération IA -- cohérence détail.
- [x] `src/app/(dashboard)/admin/programs/import/page.tsx` + `src/app/api/programs/ai-extract/route.ts` -- supprimer (après `grep` zéro référence) -- retrait import doc.
- [x] `src/lib/validations/program.ts` + tests -- ajuster `programHubFormSchema` + retirer/adapter les tests de saisie manuelle/ai-extract ; ajouter un test « création hub via IA produit un content valide » -- filet anti-régression.

**Acceptance Criteria:**
- Given le hub `/admin/programs`, when je crée un programme, then ça passe par le générateur IA (aucune saisie manuelle de séquences) et le programme apparaît après refetch.
- Given un programme existant, when je l'édite, then je peux modifier titre + métadonnées BPF/durées/public, mais il n'y a plus de grille d'édition des séquences.
- Given l'app après ce lot, when je cherche « Remplir depuis un document » ou `/admin/programs/import`, then ils n'existent plus et aucun appel à `ai-extract` ne subsiste (`grep` vide).
- Given l'attribution programme→formation, when j'attribue / affiche / télécharge le PDF, then tout fonctionne comme avant (sessions.program_id intact).
- Given toute opération programme, when elle s'exécute, then `entity_id` est filtré et aucune migration SQL n'est introduite.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur (aucun `any`, aucun import mort après suppressions)
- `npx vitest run src/lib/validations/__tests__/program.test.ts src/lib/services/__tests__/programs.test.ts` -- expected: verts
- `grep -rn "ai-extract\|programs/import\|Remplir depuis un document" src` -- expected: aucune référence résiduelle

**Manual checks:**
- Hub : créer un programme via IA → apparaît dans la liste. Éditer → métadonnées éditables, pas de grille de séquences.
- Onglet Programme d'une formation : attribuer / voir / PDF → inchangé.

## Suggested Review Order

**Nouveau chemin de création (entrée)**

- Création hub via IA + garde-fou contenu (modules ≥ 1) avant insert.
  [`page.tsx:286`](../../src/app/%28dashboard%29/admin/programs/page.tsx#L286)
- Bouton « Nouveau programme (IA) » + branchement du dialog.
  [`page.tsx:545`](../../src/app/%28dashboard%29/admin/programs/page.tsx#L545)
- Dialog rendu standalone (props défauts vides, onAccept(generated, title)).
  [`GenerateProgramDialog.tsx:60`](../../src/components/programs/GenerateProgramDialog.tsx#L60)

**Édition = métadonnées (préservation du contenu)**

- `handleSave` préserve `content` existant, n'écrit que les métadonnées.
  [`[id]/page.tsx:281`](../../src/app/%28dashboard%29/admin/programs/%5Bid%5D/page.tsx#L281)
- EditProgramDialog : grille de modules retirée, métadonnées conservées.
  [`EditProgramDialog.tsx`](../../src/app/%28dashboard%29/admin/programs/%5Bid%5D/_components/EditProgramDialog.tsx)

**Schéma (périphérie)**

- `programHubFormSchema` sans `content` (saisie manuelle retirée).
  [`program.ts:84`](../../src/lib/validations/program.ts#L84)

**Suppressions** : écran `admin/programs/import/page.tsx` + route `api/programs/ai-extract/route.ts` (zéro appelant confirmé). Route `import-pdf` orpheline → `deferred-work.md`.
