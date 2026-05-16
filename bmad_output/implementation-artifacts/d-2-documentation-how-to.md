---
storyId: D2
storyKey: d-2-documentation-how-to
epic: D
title: Documentation utilisateur "Comment ajouter un nouveau type de document"
status: done
priority: low
effort: 0.5-1 j-h
sourcePRD: prd-documents.md FR-DOC-29
sourceEpic: epics-documents.md ligne 565-591
createdAt: 2026-05-17
completedAt: 2026-05-17
---

# Story D2 — Documentation utilisateur how-to

## Story Statement

**As a** Loris (gérant OF, admin),
**I want** une page statique `/admin/documents/how-to` qui m'explique en 5 étapes comment ajouter un nouveau type de document,
**So that** je peux le faire en autonomie sans demander à un dev (≈ 5 min/template).

## Acceptance Criteria

### AC-1 — 5 étapes structurées
- **Given** je vais sur `/admin/documents/how-to`
- **Then** je vois 5 étapes claires avec titre, description, et illustration (ou icône)
- **Steps attendus** :
  1. Télécharger un template Word d'exemple
  2. Modifier le Word avec les variables `{{xxx}}` (référence catalogue)
  3. Vérifier les variables disponibles dans le catalogue
  4. Importer le template via la page `/admin/documents/import`
  5. Tester la génération dans `/admin/test-convention`

### AC-2 — Liens vers ressources liées
- Lien vers `/admin/documents/variables` (catalogue 83 balises `[%Var%]`)
- Lien vers `/admin/documents/import` (page upload)
- Lien vers `/admin/test-convention` (page test)

### AC-3 — Style cohérent avec admin
- Utilise composants Shadcn (Card, Button)
- Header h1 + breadcrumb back vers `/admin/documents`
- Responsive

## Files to Create

- `src/app/(dashboard)/admin/documents/how-to/page.tsx` 🆕

## Implementation

Page client-side React, statique (pas de données dynamiques sauf compteur balises depuis `TEMPLATE_VARIABLES.length`). Style aligné avec `/admin/documents/variables` (que j'ai produite dans PR1).

## Definition of Done

- [x] Fichier `src/app/(dashboard)/admin/documents/how-to/page.tsx` créé
- [x] 5 étapes affichées + 3 liens cliquables vers /import, /variables, /test-convention
- [x] Typecheck `npx tsc --noEmit` OK
- [x] Tests existants passent (343/343)
- [x] PR créée + mergée
- [x] Sprint-status : d-2 → done, epic-d → done (dernière story de D)

## Dev Agent Record

**Implementation 2026-05-17 :**
- Page client-side React `/admin/documents/how-to` (~210 lignes)
- 5 cartes étapes avec Badge numéroté + icône Lucide (Download, FileText, ListChecks, Upload, FlaskConical)
- Carte intro bleue (Lightbulb) qui explique différence templates système vs custom
- Section troubleshooting (4 problèmes fréquents, fond ambre)
- Footer Quick Links (4 boutons : Catalogue, Importer, Tester, Retour)
- Utilise `TEMPLATE_VARIABLES.length` pour afficher dynamiquement le count (83 actuellement)
- Pattern visuel cohérent avec `/admin/documents/variables` (cards Shadcn, max-w-4xl)
- Typecheck `npx tsc --noEmit` : 0 erreur
- Tests : 343/343 passent (aucune régression)

**Files modifiés :**
- `src/app/(dashboard)/admin/documents/how-to/page.tsx` (NEW)
- `bmad_output/implementation-artifacts/sprint-status.yaml` (d-2 → done, epic-d → done)
