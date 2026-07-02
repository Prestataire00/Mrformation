---
title: 'Docs secondaires : désattribution + catalogue custom par entité'
type: 'feature'
created: '2026-07-01'
status: 'done'
baseline_commit: 'fad7ff0dccc723f50276e8e940284fb4ea6f8c7c'
context:
  - '{project-root}/bmad_output/specs/spec-docs-secondaires-custom/SPEC.md'
  - '{project-root}/bmad_output/specs/spec-docs-secondaires-custom/brownfield.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dans l'onglet « Docs secondaires » d'une session, l'admin (Loris) ne peut ni **retirer** un doc secondaire attribué par erreur, ni **créer ses propres types** — le catalogue est figé à 23 types codés en dur. Chaque nouveau besoin documentaire = ticket dev + déploiement.

**Approach:** Ajouter (A) une désattribution par type pour toute la session, et (B/C) un catalogue de types secondaires **custom par entité** stocké en base (table + CRUD), câblé dans le dialog d'attribution, la route `attribute-secondary`, l'affichage de l'onglet et la génération PDF — les 23 types legacy restent intacts.

## Boundaries & Constraints

**Always:**
- Isolation `entity_id` sur CHAQUE requête (catalogue custom, désattribution). Un type custom d'une entité n'est jamais visible/attribuable par une autre.
- Migration SQL dans un fichier séparé sous `supabase/migrations/`, jouée manuellement AVANT le push (RLS `ENABLE` + policies via `public.user_role()`, jamais `auth.`).
- Routes réservées `admin` + `super_admin` (`requireRole`), filtre `entity_id` en défense applicative.
- Logique Supabase dans `src/lib/services/` ; formulaires en RHF + Zod ; composants shadcn/ui ; aucun `any`.
- Cohabitation legacy : les 23 types codés en dur et l'invariant « type → template système `registry.ts` » restent valables pour eux ; les types custom se résolvent via `template_id` (document_templates), pas via `registry.ts`.
- Un type custom est **non-signable** en v1 (`requires_signature=false` forcé) et son `owner_type` est figé à la création (parmi `learner`/`trainer`/`session`, défaut `learner`).
- Désactivation **soft** (`is_active=false`) : ne casse ni ne supprime les `documents` déjà attribués de ce type ; pas de suppression dure de la définition.
- Désattribution = suppression des lignes `documents` du type pour toute la session (après confirmation) ; idempotente et ré-attribuable ensuite.

**Ask First:**
- Toute suppression dure d'une définition custom, tout partage cross-entité, ou tout câblage de la signature batch pour un type custom (hors périmètre v1).

**Never:**
- Ne pas modifier la liste ni le comportement des 23 types legacy.
- Pas d'éditeur WYSIWYG : réutiliser l'upload `.docx` → `document_templates` (`templates/import`) et `extract-docx-variables` existants.
- Pas de refonte du flux de génération : les types custom empruntent le chemin `template_id` existant.
- Ne pas confondre avec `formation_documents` (docs partagés) ni `TabDocsPartages` — la cible est la table unifiée `documents`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Désattribution nominale | `DELETE` avec `formationId` + `docType` legacy, docs présents | Supprime toutes les lignes `documents` (source=session) de ce `docType` dans l'entité ; renvoie `{ deleted: n }` ; audit log `delete` | — |
| Désattribution avec docs sensibles | Au moins 1 doc `is_signed`/`is_confirmed`/envoyé | UI affiche un **avertissement non bloquant** avant confirmation ; si confirmé, supprime quand même ; détail loggé | — |
| Désattribution type absent | `docType` sans ligne | Renvoie `{ deleted: 0 }` (no-op), pas d'erreur | 200, deleted 0 |
| Création type custom | `label`, `category`∈4, `ownerType`∈{learner,trainer,session}, fichier `.docx` | Génère `doc_type` unique `custom_…`, crée le `document_templates` (docx_fidelity), insère la définition active ; visible au catalogue de l'entité | 400 si champ/fichier manquant |
| Attribution d'un type custom | `docTypes` contient un `doc_type` custom **actif** de l'entité | Insère les `documents` (owner résolu via `ownerType`, `template_id`=celui de la définition, `requires_signature=false`, `custom_label`=libellé) | Rejeté 400 si type custom inconnu/inactif de l'entité |
| Génération PDF custom | `handleView` sur un doc custom (`template_id` présent) | Rend le PDF via le template uploadé (chemin `template_id` existant) — pas d'erreur « invariant registry » | Toast si template introuvable |
| Désactivation type custom | `PATCH is_active=false` | Disparaît du catalogue d'attribution ; les `documents` existants de ce type restent listés et générables | — |
| Renommage type custom | `PATCH label` | Nouveau libellé au catalogue ; `custom_label` des docs déjà attribués inchangé (snapshot) | — |
| Isolation | Admin entité A cible un `doc_type` custom de l'entité B | Rejeté (invisible / non résolu) | 400/404 |

</frozen-after-approval>

## Code Map

- `supabase/migrations/add_custom_secondary_doc_types.sql` -- **(nouveau)** table `custom_secondary_doc_types` + RLS + index.
- `src/lib/services/custom-secondary-doc-types.ts` -- **(nouveau)** service CRUD (list actifs, list pour affichage, create+template, rename, deactivate, getByDocType).
- `src/lib/services/documents-store.ts` -- ajouter `deleteDocsByDocType(...)` (miroir de `updateDocsByDocType` :377) ; éventuel helper d'insert `document_templates` réutilisable.
- `src/app/api/documents/attribute-secondary/route.ts` -- ajouter handler `DELETE` (désattribution) ; assouplir la validation POST (`z.array(z.string())`) + résoudre les types custom (owner/template) en plus du registry.
- `src/app/api/documents/custom-secondary-types/route.ts` -- **(nouveau)** `GET` (liste catalogue entité) + `POST` (création, FormData avec fichier).
- `src/app/api/documents/custom-secondary-types/[id]/route.ts` -- **(nouveau)** `PATCH` (rename + toggle `is_active`).
- `src/app/(dashboard)/admin/formations/[id]/_components/SecondaryDocCatalogDialog.tsx` -- fetch + affichage des types custom actifs dans leurs catégories ; entrée « Créer un type ».
- `src/app/(dashboard)/admin/formations/[id]/_components/CustomSecondaryTypeDialog.tsx` -- **(nouveau)** formulaire RHF+Zod création/renommage/désactivation + upload `.docx`.
- `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` -- inclure les types custom dans le filtrage secondaire (`isSecondaryDocType(d) || customTypes.has(d.doc_type)`), l'affichage (libellé/couleur/badge fallback via catégorie + `custom_label`) et ajouter le contrôle de désattribution par `doc_type`.
- `src/lib/templates/secondary-categories.ts` -- source des 4 catégories (`SECONDARY_CATEGORY_LABELS`) réutilisée pour valider `category` et colorer les customs (pas de modif des 23 types).
- `src/lib/__tests__/custom-secondary-doc-types.test.ts` -- **(nouveau)** tests unitaires (service + Zod + isolation + désattribution scopée).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/add_custom_secondary_doc_types.sql` -- créer table `custom_secondary_doc_types` (`id`, `entity_id` FK CASCADE, `doc_type` TEXT, `label` TEXT, `category` TEXT CHECK∈4, `owner_type` TEXT CHECK∈{learner,trainer,session} DEFAULT 'learner', `template_id` UUID FK `document_templates`, `is_active` BOOLEAN DEFAULT true, `created_at`/`updated_at`), `UNIQUE(entity_id, doc_type)`, RLS `entity_isolation` + `super_admin`, index `entity_id` -- catalogue persistant par entité.
- [x] `src/lib/services/custom-secondary-doc-types.ts` -- CRUD `ServiceResult<T>` : `listActiveCustomTypes`, `listCustomTypesForDisplay` (actifs ∪ ceux référencés par des docs existants), `createCustomType`, `renameCustomType`, `deactivateCustomType`, `getActiveCustomTypeByDocType` -- centraliser la logique Supabase.
- [x] `src/lib/services/documents-store.ts` -- `deleteDocsByDocType(supabase, entityId, sessionId, docType)` : `.delete()` filtré `entity_id`+`source_table='sessions'`+`source_id`+`doc_type`, renvoie `{ deleted }` -- désattribution scopée.
- [x] `src/app/api/documents/attribute-secondary/route.ts` -- (a) `DELETE` (`formationId`,`docType`) → `requireRole` admin/super_admin, vérifie session∈entité, `deleteDocsByDocType`, `logAudit('delete','documents',…, { docType, deleted })` ; (b) POST : valider `docTypes` comme `string[]`, accepter un type si legacy secondaire **ou** custom actif de l'entité, résoudre owner/`template_id`/`requires_signature=false`/`custom_label` pour les customs -- désattribution + attribution custom.
- [x] `src/app/api/documents/custom-secondary-types/route.ts` + `[id]/route.ts` -- `GET` liste (filtre `entity_id`), `POST` création (FormData : `label`,`category`,`ownerType`,`file` → génère `doc_type` unique, crée `document_templates` docx_fidelity, insère la définition), `PATCH` rename/`is_active` -- API catalogue.
- [x] `SecondaryDocCatalogDialog.tsx` -- charger les types custom actifs (GET) et les rendre dans leurs catégories aux côtés du legacy ; bouton « Créer un type » ouvrant le dialog custom -- cohabitation catalogue.
- [x] `CustomSecondaryTypeDialog.tsx` -- formulaire RHF+Zod (label requis, category∈4, ownerType∈3 figé, upload `.docx` requis) + liste des types existants avec renommer/désactiver -- gestion custom.
- [x] `TabConventionDocs.tsx` -- fetch `listCustomTypesForDisplay`, étendre le filtre secondaire, fournir libellé/couleur/badge fallback (catégorie + `custom_label`), et ajouter un contrôle de désattribution par `doc_type` (AlertDialog de confirmation, avertissement non bloquant si un doc du type est généré/signé/envoyé, appel `DELETE` puis `onRefresh`) -- affichage + CAP-1 UI.
- [x] `src/lib/__tests__/custom-secondary-doc-types.test.ts` -- couvrir la matrice I/O : Zod du POST create, unicité/format `doc_type`, isolation entity_id, désattribution scopée session+entité, désactivation ne casse pas les docs existants.

**Acceptance Criteria:**
- Given un admin sur une session avec un doc secondaire attribué, when il clique « Retirer » et confirme, then toutes les lignes `documents` de ce `doc_type` (session, entité) disparaissent de l'onglet et le type est ré-attribuable.
- Given au moins un doc du type déjà généré/signé/envoyé, when l'admin ouvre la confirmation, then un avertissement non bloquant est affiché sans empêcher la suppression.
- Given un admin qui crée un type custom (libellé + catégorie + destinataire + `.docx`), when il rouvre le dialog d'attribution, then le type apparaît dans sa catégorie, uniquement pour son entité.
- Given un type custom attribué à une session, when l'admin génère le PDF, then le rendu utilise le template uploadé sans erreur « invariant registry ».
- Given un type custom désactivé, when on recharge, then il disparaît du catalogue mais les docs déjà attribués restent listés et générables.
- Given un admin de l'entité A, when il tente de cibler un `doc_type` custom de l'entité B (attribution ou désattribution), then l'opération est rejetée.

## Spec Change Log

## Design Notes

**Résolution d'un `doc_type` custom (POST attribute-secondary).** Boucle par `docType` : si `getSystemTemplate(docType)` existe → chemin legacy inchangé ; sinon lookup `getActiveCustomTypeByDocType(supabase, entityId, docType)`. Si trouvé, résoudre l'owner via `def.owner_type` (`learner`→1 ligne/enrôlé, `trainer`→1 ligne/formateur, `session`→1 ligne `owner_type='company'` sur la 1ʳᵉ entreprise, exactement comme le legacy), et insérer `documents` avec `template_id=def.template_id`, `requires_signature=false`, `custom_label=def.label`. Un `docType` ni legacy ni custom-actif → rejet 400. La validation Zod devient `z.array(z.string().min(1)).min(1).max(50)` ; l'appartenance réelle est vérifiée serveur après résolution de l'entité.

**Génération.** `handleView` (TabConventionDocs:534) branche déjà sur `doc.template_id` → `getTemplateById` → rendu docx_fidelity. Comme les docs custom portent `template_id`, aucune modif du flux de génération ; il suffit que l'attribution pose le `template_id`.

**`doc_type` custom.** Généré serveur, ex. `custom_` + segment court, garanti unique via `UNIQUE(entity_id, doc_type)` et hors des 23 legacy. `isSecondaryDocType()` (legacy) renvoie false dessus : d'où le filtre étendu et les fallback d'affichage côté onglet/dialog.

**Template à la création.** Réutiliser le pattern de `templates/import` (upload `.docx` → bucket `formation-docs/templates/{entity_id}/{uuid}.docx` → insert `document_templates` docx_fidelity, `is_system=false`), idéalement via un helper partagé, puis lier `template_id` à la définition custom. Template obligatoire avant toute attribution.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: aucune erreur de type (barrière principale ; `npm run lint` cassé, cf. mémoire projet).
- `npx vitest run src/lib/__tests__/custom-secondary-doc-types.test.ts` -- expected: tous les tests verts.

**Manual checks:**
- Jouer `add_custom_secondary_doc_types.sql` dans Supabase AVANT le push.
- Sur une session réelle : créer un type custom avec `.docx`, l'attribuer, générer le PDF (vérifier qu'il utilise le template), le désattribuer (vérifier l'avertissement si signé), le désactiver (vérifier qu'un doc déjà attribué reste générable).

## Review Notes (step-04)

Revue adversariale (3 reviewers). Aucun `bad_spec`/`intent_gap` — patches uniquement :
- **PATCH catalogue non atomique** (blind #1) : fusionné en un seul UPDATE via `updateCustomType`.
- **Template orphelin** si `createCustomType` échoue après l'upload (edge #2) : rollback best-effort (storage + `document_templates`).
- **Extension custom** (acceptance #1) : restreinte à `.docx` (contrainte « template Word »).
- **UX fichier requis** (acceptance #2) : bouton « Créer » désactivé tant qu'aucun fichier.
- Faux positifs vérifiés & rejetés : `custom_label` (stocké en `metadata` jsonb, pas de colonne), génération custom via `template_id` (chemin `handleView`→`generate-from-template` OK), PDF vide bulk/matrice (non atteignable pour les customs — bouton masqué + matrice = `DEFAULT_*_DOCS`).
- **Différé** : super_admin cross-entité (`profile.entity_id` vs `resolveActiveEntityId`) — convention pré-existante du module Documents, cf. `deferred-work.md`.

## Suggested Review Order

**Schéma & contrat de données**

- Table catalogue custom par entité : RLS + `UNIQUE(entity_id, doc_type)` + `template_id NOT NULL`.
  [`add_custom_secondary_doc_types.sql:17`](../../supabase/migrations/add_custom_secondary_doc_types.sql#L17)

**Résolution legacy ↔ custom (cœur)**

- Point d'entrée : le POST route un `docType` custom via la définition base, legacy via le registry.
  [`attribute-secondary/route.ts:201`](../../src/app/api/documents/attribute-secondary/route.ts#L201)
- Résolution scopée entité (actif seulement) consommée par l'attribution.
  [`custom-secondary-doc-types.ts:107`](../../src/lib/services/custom-secondary-doc-types.ts#L107)

**Désattribution (CAP-1)**

- DELETE : session vérifiée dans l'entité puis suppression scopée.
  [`attribute-secondary/route.ts:311`](../../src/app/api/documents/attribute-secondary/route.ts#L311)
- Helper de suppression (miroir de `updateDocsByDocType`), filtré entity+session+doc_type.
  [`documents-store.ts:443`](../../src/lib/services/documents-store.ts#L443)

**Catalogue custom : création & gestion (CAP-2/4)**

- POST création : upload template → définition liée, avec rollback best-effort.
  [`custom-secondary-types/route.ts:49`](../../src/app/api/documents/custom-secondary-types/route.ts#L49)
- Helper partagé upload `.docx` → `document_templates` docx_fidelity.
  [`documents-store.ts:479`](../../src/lib/services/documents-store.ts#L479)
- PATCH atomique (renommage/(dé)activation soft).
  [`custom-secondary-types/[id]/route.ts:17`](../../src/app/api/documents/custom-secondary-types/[id]/route.ts#L17)
- Écriture atomique unique côté service.
  [`custom-secondary-doc-types.ts:190`](../../src/lib/services/custom-secondary-doc-types.ts#L190)

**Câblage UI (CAP-3 + affichage)**

- Catalogue unifié legacy + custom actifs, groupés par catégorie.
  [`SecondaryDocCatalogDialog.tsx:84`](../../src/app/(dashboard)/admin/formations/[id]/_components/SecondaryDocCatalogDialog.tsx#L84)
- Filtre secondaire étendu aux customs (par préfixe) dans l'onglet.
  [`TabConventionDocs.tsx:1531`](../../src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx#L1531)
- Désattribution UI : confirmation + avertissement non bloquant si sensible.
  [`TabConventionDocs.tsx:1628`](../../src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx#L1628)
- Dialog de gestion custom (RHF+Zod + upload).
  [`CustomSecondaryTypeDialog.tsx:105`](../../src/app/(dashboard)/admin/formations/[id]/_components/CustomSecondaryTypeDialog.tsx#L105)

**Support**

- Tests unitaires (isolation, scope désattribution, Zod, update atomique).
  [`custom-secondary-doc-types.test.ts:1`](../../src/lib/__tests__/custom-secondary-doc-types.test.ts#L1)
