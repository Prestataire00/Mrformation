---
title: 'Supports de cours attachés au programme, publiés en Docs partagés'
type: 'feature'
created: '2026-06-26'
status: 'done'
baseline_commit: '070f7976e0b304a13131df771d9ea4ef4b77bffc'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/supabase/migrations/add-formation-tabs-4-5-6.sql'
  - '{project-root}/supabase/migrations/aut-prog-b-fix-rls-programs.sql'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les supports pédagogiques ne peuvent être déposés qu'au niveau d'une session (`formation_documents`). Un programme réutilisé par plusieurs sessions oblige à re-uploader les mêmes fichiers session par session, et les stagiaires n'ont aucun accès à ces supports dans leur portail.

**Approach:** Stocker les supports une seule fois sur le programme (nouvelle table `program_documents`, source unique). Les afficher par jointure à la lecture (aucune duplication, rétroactif sur toutes les sessions liées) dans l'onglet Docs partagés côté admin **et** dans le portail apprenant des stagiaires de chaque session rattachée à ce programme.

## Boundaries & Constraints

**Always:**
- Chaque ligne `program_documents` porte un `entity_id` ; toute requête filtre par `entity_id`. RLS obligatoire avec `public.user_role()` / `public.user_entity_id()` (jamais `auth.*`).
- Réutiliser le bucket public existant `formation-docs` (chemin `programs/{program_id}/…`) et les patterns existants (upload via client Supabase, ouverture via signed-URL côté admin).
- Logique DB dans un service `src/lib/services/program-documents.ts` (pas d'appel Supabase inline dans les composants au-delà de l'upload Storage, conformément au pattern `TabDocsPartages`).
- Composants shadcn/ui, handlers avec try/catch + toast + état loading + refetch.

**Ask First:**
- Étendre la fonctionnalité au **portail client (entreprise)** `client/documents` (hors périmètre ici — seul le portail apprenant/stagiaire est ciblé).
- Toute suppression/altération de la catégorie de session `program_support` existante dans `formation_documents`.

**Never:**
- Ne pas copier/dupliquer les fichiers dans `formation_documents` à la création de session (modèle source-unique imposé).
- Ne pas ajouter le rôle `learner` à la route `/api/storage/signed-url` : le bucket étant déjà public en lecture, l'apprenant ouvre directement la `file_url` publique.
- Pas de type `any` ; pas de table sans RLS.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin attache un support | Fichier déposé sur page programme | Upload `formation-docs/programs/{id}/…` + insert `program_documents` (entity_id du programme), liste rafraîchie | toast erreur si upload/insert KO |
| Session liée, onglet Docs partagés | `program_id` présent | Section « Supports du programme » liste les `program_documents` en lecture seule (badge « hérité ») | section vide si aucun |
| Stagiaire ouvre son portail | Inscrit à session avec `program_id` | Carte « Supports de cours » des programmes de SES sessions ; clic = ouvre `file_url` | aucune carte si aucun ; isolation par ses sessions |
| Session sans `program_id` | program_id null | Aucun support hérité, pas de crash | N/A |
| Admin supprime un support | Suppression sur page programme | Delete DB + remove Storage (non-bloquant) ; disparaît partout à la lecture suivante | toast erreur si delete DB KO |

</frozen-after-approval>

## Code Map

- `supabase/migrations/add-formation-tabs-4-5-6.sql` -- réf. `formation_documents` (pattern table/RLS à imiter).
- `aut-prog-b-fix-rls-programs.sql` -- réf. pattern RLS `public.user_role()` / `public.user_entity_id()`.
- `src/lib/types/index.ts` l.638 -- zone `Program` ; y ajouter `ProgramDocument` + `program_documents?`.
- `src/lib/services/programs.ts` -- réf. Result pattern à reproduire dans le nouveau service.
- `src/app/(dashboard)/admin/programs/[id]/page.tsx` l.931-948 -- zone des `SectionDivider` où monter `<ProgramSupports>`.
- `.../formations/[id]/_components/TabDocsPartages.tsx` l.24-57, 311-317 -- section `program_support` à enrichir.
- `.../formations/[id]/page.tsx` l.~88 -- join `program:programs(*)` à étendre.
- `src/app/api/storage/signed-url/route.ts` l.~28 (`TABLES`) + `src/lib/storage/fetch-signed-doc-url.ts` l.8 (union) -- supporter `program_documents`.
- `src/app/(dashboard)/learner/documents/page.tsx` l.70-156 -- `fetchDocuments` à compléter.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/add_program_documents.sql` -- créer `program_documents` (id, program_id FK programs ON DELETE CASCADE, entity_id FK entities NOT NULL, file_name, file_url, uploaded_by FK profiles ON DELETE SET NULL, created_at) + index (program_id, entity_id) ; RLS : write `admin`/`super_admin` (entity), read `admin`/`super_admin`/`trainer`/`client`/`learner` (entity) — pattern `public.user_role()`. Idempotent (DROP POLICY IF EXISTS). -- source de vérité multi-tenant.
- [x] `supabase/schema.sql` -- ajouter la définition de table en doc.
- [x] `src/lib/types/index.ts` -- `ProgramDocument` + `program_documents?` sur `Program`. -- typage strict, pas de `any`.
- [x] `src/lib/services/program-documents.ts` -- CRUD filtré `entity_id`. -- règle CLAUDE.md #10.
- [x] `src/app/(dashboard)/admin/programs/[id]/_components/ProgramSupports.tsx` + montage dans `page.tsx` -- upload/list/delete avec toasts + loading + refetch. -- point d'admin choisi.
- [x] `src/app/api/storage/signed-url/route.ts` + `src/lib/storage/fetch-signed-doc-url.ts` -- supporter `program_documents`. -- ouverture sécurisée côté admin.
- [x] `src/app/(dashboard)/admin/formations/[id]/page.tsx` + `TabDocsPartages.tsx` -- jointure + rendu lecture seule des supports hérités. -- visibilité admin.
- [x] `src/app/(dashboard)/learner/documents/page.tsx` -- carte « Supports de cours » par session du stagiaire. -- visibilité stagiaire.
- [x] `src/lib/__tests__/program-documents.test.ts` -- tester le service (CRUD, filtre `entity_id`) et les cas de la matrice I/O. -- règle tests.

**Acceptance Criteria:**
- Given un programme avec un support attaché, when l'admin ouvre l'onglet Docs partagés d'une session liée à ce programme, then le support apparaît en lecture seule sous « Supports du programme » sans avoir été re-uploadé.
- Given deux sessions partageant le même programme, when un support est ajouté au programme, then les deux sessions et leurs stagiaires le voient immédiatement (aucune duplication en base).
- Given un stagiaire inscrit à une session de l'entité X, when il ouvre son portail Documents, then il voit uniquement les supports des programmes de SES sessions et peut les ouvrir.
- Given un super_admin sur une autre entité, when il consulte ces supports, then l'isolation `entity_id` est respectée (cross-entité autorisé seulement pour super_admin).

## Design Notes

Modèle **source unique** : `program_documents` est la seule table de stockage ; aucune écriture dans `formation_documents`. Côté admin l'héritage est une simple jointure `programs → program_documents` ; côté stagiaire la chaîne est `learner → enrollments → sessions.program_id → program_documents`. La catégorie `program_support` de `formation_documents` reste pour d'éventuels supports spécifiques à UNE session (non touchée).

Accès fichiers : bucket `formation-docs` déjà public → l'apprenant ouvre la `file_url` publique directement (pas d'élévation de rôle sur la route signed-URL) ; l'admin garde le signed-URL existant pour cohérence.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur sur les fichiers modifiés
- `npx tsc --noEmit` -- expected: aucune erreur de type
- `npx vitest run src/lib/__tests__/program-documents.test.ts` -- expected: tous les tests verts

**Manual checks:**
- Appliquer `add_program_documents.sql` dans Supabase Dashboard, attacher un support à un programme ayant ≥2 sessions, vérifier l'affichage admin (2 onglets Docs partagés) et stagiaire (portail), puis l'isolation entité.

## Suggested Review Order

**Schéma & sécurité (le cœur du modèle source-unique)**

- Entrée : la table + RLS multi-tenant (`public.user_role`, lecture learner, écriture admin)
  [`add_program_documents.sql:23`](../../supabase/migrations/add_program_documents.sql#L23)

- Policy de lecture stagiaire/client/trainer scopée entité — l'isolation effective
  [`add_program_documents.sql:52`](../../supabase/migrations/add_program_documents.sql#L52)

- Type partagé + relation optionnelle sur `Program`
  [`index.ts:666`](../../src/lib/types/index.ts#L666)

**Logique métier (service centralisé, filtre entity_id)**

- CRUD filtré `entity_id` (defense in depth) — pattern Result du projet
  [`program-documents.ts:55`](../../src/lib/services/program-documents.ts#L55)

**Publication par jointure (admin)**

- Join `programs(*, program_documents(*))` qui rend l'héritage rétroactif sans duplication
  [`page.tsx:83`](../../src/app/(dashboard)/admin/formations/[id]/page.tsx#L83)

- Rendu lecture seule « Hérités du programme » dans la section program_support
  [`TabDocsPartages.tsx:203`](../../src/app/(dashboard)/admin/formations/[id]/_components/TabDocsPartages.tsx#L203)

**Point d'admin (upload/list/delete)**

- Composant supports : upload Storage + service, toasts/loading/refetch
  [`ProgramSupports.tsx:57`](../../src/app/(dashboard)/admin/programs/[id]/_components/ProgramSupports.tsx#L57)

- Montage sous SectionDivider « Supports de cours »
  [`page.tsx:934`](../../src/app/(dashboard)/admin/programs/[id]/page.tsx#L934)

**Visibilité stagiaire (portail apprenant)**

- Filtre `entity_id` explicite + multi-fiches `.in()` (patches de revue)
  [`page.tsx:126`](../../src/app/(dashboard)/learner/documents/page.tsx#L126)

- Carte « Supports de cours » par session, ouverture URL publique
  [`page.tsx:334`](../../src/app/(dashboard)/learner/documents/page.tsx#L334)

**Accès fichier (signed-url admin)**

- Ajout `program_documents` à la table d'accès signed-url
  [`route.ts:20`](../../src/app/api/storage/signed-url/route.ts#L20)

**Périphériques**

- Tests service (CRUD, isolation entity_id) + garde-fous migration (RLS, idempotence)
  [`program-documents.test.ts:114`](../../src/lib/__tests__/program-documents.test.ts#L114)
