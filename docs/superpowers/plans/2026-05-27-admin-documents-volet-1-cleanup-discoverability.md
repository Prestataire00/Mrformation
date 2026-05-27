# Sous-chantier 1 `/admin/documents` — V1 Nettoyage + V3 Découvrabilité Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Éliminer les doublons UI visibles en dérivant 5 listes inline depuis les sources de vérité existantes (`registry.ts` + `template-variables.ts`), rendre les 3 pages satellites découvrables via sous-tabs sticky, et fixer 1 bug de `<title>` HTML.

**Architecture:**
1. Extraire `DocumentType` dans un fichier types partagé `src/lib/templates/types.ts`.
2. Créer 2 helpers de dérivation (`official-templates.ts`, `doc-type-options.ts`) qui consomment le registry système (clés inchangées, juste mapping ID → métadonnées UI).
3. Ajouter 1 helper `DOCUMENT_VARIABLES` dans `template-variables.ts` ; supprimer le dead code `AVAILABLE_VARIABLES` dans `emails/page.tsx` (jamais référencé).
4. Créer 1 composant `<DocumentsTabsNav />` sticky avec 4 onglets, ajouté en haut des 4 pages.
5. 1 fix `<title>` HTML decharge (5 min).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Vitest baseline 550 tests, shadcn/ui, TailwindCSS, Lucide icons.

**Branche cible** : `feat/admin-documents-volet-1-cleanup-discoverability` (depuis `main` à `fdc57f9`).

**Source spec** : [docs/superpowers/specs/2026-05-27-admin-documents-volet-1-cleanup-discoverability-design.md](../specs/2026-05-27-admin-documents-volet-1-cleanup-discoverability-design.md)

---

## File Structure

**Created** :
- `src/lib/templates/types.ts` (~10 LOC) — `DocumentType` extracted
- `src/lib/templates/official-templates.ts` (~120 LOC) — `OFFICIAL_TEMPLATES` dérivé du registry
- `src/lib/templates/doc-type-options.ts` (~20 LOC) — `DOC_TYPE_OPTIONS` dérivé
- `src/app/(dashboard)/admin/documents/_components/DocumentsTabsNav.tsx` (~50 LOC) — Sous-tabs sticky

**Modified** :
- `src/lib/templates/lettre-decharge-responsabilite.ts` — fix `<title>` HTML (bonus)
- `src/lib/template-variables.ts` — ajout `DOCUMENT_VARIABLES` helper
- `src/app/(dashboard)/admin/documents/page.tsx` — retire `OFFICIAL_TEMPLATES` + `AVAILABLE_VARIABLES` + `DocumentType` inline, ajoute imports, ajoute `<DocumentsTabsNav />`
- `src/app/(dashboard)/admin/documents/import/page.tsx` — retire `DOC_TYPE_OPTIONS` inline, ajoute imports + `<DocumentsTabsNav />`
- `src/app/(dashboard)/admin/documents/variables/page.tsx` — retire `<Link Retour>`, ajoute `<DocumentsTabsNav />`
- `src/app/(dashboard)/admin/documents/how-to/page.tsx` — retire `<Link Retour>` + import orphelin `ArrowLeft`, ajoute `<DocumentsTabsNav />`
- `src/app/(dashboard)/admin/emails/page.tsx` — supprime dead code `AVAILABLE_VARIABLES`

**Pas touchés** :
- `STARTER_TEMPLATES` dans `documents/page.tsx` (logique propre avec HTML inline)
- `ATTACHMENT_OPTIONS` dans `emails/page.tsx` (autre liste, hors-scope V1)
- `PREVIEW_VALUES` / `PREVIEW_VARS` (data d'exemple, hors-scope V1)
- Aucune route API, aucun service, aucun test (550 baseline maintenu)

---

## Task 0: Baseline + branche + audit DB préalable

**Files:** Aucun (vérifications + setup branche)

- [ ] **Step 1: Vérifier état initial**

Run: `git status`
Expected: `On branch main, ...` (untracked .claude/skills/* OK)

Run: `git log -1 --oneline`
Expected: dernier commit doc (probablement `fdc57f9` ou plus récent si autre commit ajouté)

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files  49 passed (49)` et `Tests  550 passed (550)`

Run: `npx tsc --noEmit 2>&1 | head -3`
Expected: aucune sortie

- [ ] **Step 2: Créer la branche depuis main**

```bash
git checkout -b feat/admin-documents-volet-1-cleanup-discoverability
```

Expected: `Switched to a new branch 'feat/admin-documents-volet-1-cleanup-discoverability'`

- [ ] **Step 3: Lister les doc_types du registry pour aligner OFFICIAL_TEMPLATE_META**

Run: `grep -nE "^\s+[a-z_]+:\s*\{$" src/lib/templates/registry.ts | head -35`

Tu dois voir 32 doc_types. Les 11 utilisés actuellement par `OFFICIAL_TEMPLATES` (à confirmer par lecture) sont :
1. `convocation`
2. `certificat_realisation`
3. `attestation_assiduite`
4. `feuille_emargement`
5. `convention_entreprise`
6. `feuille_emargement_collectif`
7. `planning_semaine`
8. `convention_intervention`
9. `cgv`
10. `politique_confidentialite`
11. `reglement_interieur`

Les 21 autres (avis_hab_elec_*, attestation_aipr, certificat_*, autorisation_image, decharge_*, lettre_decharge_*, charte_formateur, contrat_engagement_stagiaire, bilan_poe, reponses_*, resultats_*, programme_formation, planning_hebdo_signe, feuille_emargement_vierge) sont **sectoriels** : ne PAS les ajouter à `OFFICIAL_TEMPLATE_META`. Si besoin futur, on les ajoutera.

- [ ] **Step 4: Audit DB préalable (optionnel selon accès Wissam)**

Wissam doit ouvrir le Supabase Dashboard SQL Editor et lancer :
```sql
SELECT DISTINCT doc_type FROM document_templates ORDER BY doc_type;
SELECT DISTINCT doc_type FROM generated_documents ORDER BY doc_type;
```

Si Wissam fournit les résultats, comparer avec les 32 clés registry. Toute clé DB hors registry doit être documentée comme "doc_type custom" ou "doc_type legacy".

**Si pas d'accès DB** : skip cette étape. La stratégie zero-key-change garantit qu'on ne casse rien. Audit pourra être fait après merge.

Pas de commit pour Task 0 (juste setup).

---

## Task 1: Bonus — fix `<title>` HTML lettre-decharge

**Files:**
- Modify: `src/lib/templates/lettre-decharge-responsabilite.ts`

- [ ] **Step 1: Lire les 2 fichiers decharge pour confirmer state**

Run: `grep -E "<title>" src/lib/templates/decharge-responsabilite.ts src/lib/templates/lettre-decharge-responsabilite.ts`

Tu dois voir :
```
src/lib/templates/decharge-responsabilite.ts:<title>Lettre de décharge de responsabilité</title>
src/lib/templates/lettre-decharge-responsabilite.ts:<title>Lettre de décharge de responsabilité</title>
```

Les 2 ont le même `<title>` — c'est le bug à fixer.

- [ ] **Step 2: Modifier `lettre-decharge-responsabilite.ts`**

Find & Replace dans `src/lib/templates/lettre-decharge-responsabilite.ts` :
- **AVANT** : `<title>Lettre de décharge de responsabilité</title>`
- **APRÈS** : `<title>Lettre de décharge — Départ anticipé</title>`

(`decharge-responsabilite.ts` garde son `<title>` actuel comme version "longue" canonique.)

- [ ] **Step 3: Vérifier le résultat**

Run: `grep -E "<title>" src/lib/templates/decharge-responsabilite.ts src/lib/templates/lettre-decharge-responsabilite.ts`

Expected :
```
src/lib/templates/decharge-responsabilite.ts:<title>Lettre de décharge de responsabilité</title>
src/lib/templates/lettre-decharge-responsabilite.ts:<title>Lettre de décharge — Départ anticipé</title>
```

- [ ] **Step 4: Vérifier TS clean + Vitest vert**

Run: `npx tsc --noEmit 2>&1 | head -3`
Expected: aucune sortie

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Tests "`
Expected: `Tests  550 passed (550)`

- [ ] **Step 5: Commit**

```bash
git add src/lib/templates/lettre-decharge-responsabilite.ts
git commit -m "fix(documents): différencie <title> HTML lettre-decharge (bonus Sous-chantier 1)

Les 2 templates 'decharge-responsabilite.ts' (version longue avec liste
de conséquences) et 'lettre-decharge-responsabilite.ts' (version courte
1 page avec champs manuscrits) avaient le même <title> HTML 'Lettre de
décharge de responsabilité' — résultat : aperçu PDF indistinguible côté
admin et libellés trompeurs dans les exports.

Fix : version courte devient 'Lettre de décharge — Départ anticipé',
version longue garde 'Lettre de décharge de responsabilité' (canonique).

Refs: docs/superpowers/specs/2026-05-27-admin-documents-volet-1-cleanup-discoverability-design.md § 4.3"
```

---

## Task 2: V1.0 — Extraire `DocumentType` dans `src/lib/templates/types.ts`

**Files:**
- Create: `src/lib/templates/types.ts`
- Modify: `src/app/(dashboard)/admin/documents/page.tsx:86`

`DocumentType` est actuellement défini dans `documents/page.tsx` ligne 86 mais sera utilisé par le nouveau `official-templates.ts`. Extraction pour éviter qu'une lib importe d'une page.

- [ ] **Step 1: Créer `src/lib/templates/types.ts`**

```ts
/**
 * Types partagés pour les templates et documents du module Documents.
 *
 * `DocumentType` est la catégorie d'un document utilisée pour le rendu UI
 * (badge couleur, icône) — différente du `doc_type` du registry système
 * qui identifie un template spécifique.
 *
 * Mapping conceptuel :
 *   - "agreement"   → conventions
 *   - "certificate" → certificats, attestations
 *   - "attendance"  → émargements, plannings
 *   - "invoice"     → factures, devis
 *   - "other"       → CGV, règlement intérieur, etc.
 */
export type DocumentType = "agreement" | "certificate" | "attendance" | "invoice" | "other";
```

- [ ] **Step 2: Modifier `documents/page.tsx` — retirer la def locale + ajouter import**

Trouver la ligne 86 :
```ts
type DocumentType = "agreement" | "certificate" | "attendance" | "invoice" | "other";
```

La supprimer.

Ajouter dans les imports (après les autres `@/lib/...`) :
```ts
import type { DocumentType } from "@/lib/templates/types";
```

- [ ] **Step 3: Vérifier TS clean**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Tests "`
Expected: `Tests  550 passed (550)`

- [ ] **Step 4: Commit**

```bash
git add src/lib/templates/types.ts 'src/app/(dashboard)/admin/documents/page.tsx'
git commit -m "refactor(documents): extract DocumentType to src/lib/templates/types.ts

Le type DocumentType (5 valeurs union : agreement | certificate |
attendance | invoice | other) était défini inline dans documents/page.tsx.
Extraction dans un fichier partagé pour permettre à src/lib/templates/
official-templates.ts (créé en Task 3) de l'utiliser sans importer
depuis une page.

Refs: docs/superpowers/specs/2026-05-27-admin-documents-volet-1-cleanup-discoverability-design.md § 4.1"
```

---

## Task 3: V1.1 — `official-templates.ts` + remplacement dans `documents/page.tsx`

**Files:**
- Create: `src/lib/templates/official-templates.ts`
- Modify: `src/app/(dashboard)/admin/documents/page.tsx:166-194` (retire interface + const inline)

- [ ] **Step 1: Lire le code inline actuel**

Run: `sed -n '166,196p' 'src/app/(dashboard)/admin/documents/page.tsx'`

Tu dois voir l'interface `OfficialTemplate` (lignes ~167-174) + la const `OFFICIAL_TEMPLATES` (lignes ~176-194) avec 11 entrées.

- [ ] **Step 2: Créer `src/lib/templates/official-templates.ts`**

```ts
/**
 * Catalogue des templates officiels système (UI metadata).
 * Source de vérité : src/lib/templates/registry.ts (set des doc_types couverts).
 *
 * Cette liste est DÉRIVÉE du registry système : pour chaque doc_type présent
 * dans SYSTEM_TEMPLATES_BY_DOC_TYPE, on associe des métadonnées UI (catégorie,
 * libellé, type, autoConfirmed).
 *
 * Si un nouveau doc_type est ajouté au registry sans métadonnées UI ici, il
 * n'apparaîtra pas dans le catalogue — détecté immédiatement par bug visible.
 * Un console.warn dev-time signale aussi l'absence.
 *
 * Les doc_types sectoriels du registry (avis_hab_elec_*, attestation_aipr,
 * certificat_travail_hauteur, etc.) ne sont PAS catalogués ici car ils
 * apparaissent par contexte (sélection manuelle dans la fiche formation).
 */

import { SYSTEM_TEMPLATES_BY_DOC_TYPE } from "./registry";
import type { DocumentType } from "./types";

export interface OfficialTemplate {
  id: string;
  name: string;
  category: "learner" | "company" | "trainer" | "common";
  categoryLabel: string;
  type: DocumentType;
  autoConfirmed: boolean;
}

// Métadonnées UI par doc_type — les clés DOIVENT correspondre aux clés du registry.
// Voir src/lib/templates/registry.ts pour la liste complète des doc_types couverts.
const OFFICIAL_TEMPLATE_META: Record<string, Omit<OfficialTemplate, "id">> = {
  // Apprenant
  convocation: {
    name: "CONVOCATION À LA FORMATION",
    category: "learner",
    categoryLabel: "Apprenant",
    type: "certificate",
    autoConfirmed: false,
  },
  certificat_realisation: {
    name: "CERTIFICAT DE RÉALISATION",
    category: "learner",
    categoryLabel: "Apprenant",
    type: "certificate",
    autoConfirmed: false,
  },
  attestation_assiduite: {
    name: "ATTESTATION D'ASSIDUITÉ",
    category: "learner",
    categoryLabel: "Apprenant",
    type: "attendance",
    autoConfirmed: false,
  },
  feuille_emargement: {
    name: "FEUILLE D'ÉMARGEMENT",
    category: "learner",
    categoryLabel: "Apprenant",
    type: "attendance",
    autoConfirmed: false,
  },
  // Entreprise
  convention_entreprise: {
    name: "CONVENTION ENTREPRISE",
    category: "company",
    categoryLabel: "Entreprise",
    type: "agreement",
    autoConfirmed: false,
  },
  feuille_emargement_collectif: {
    name: "FEUILLE D'ÉMARGEMENT COLLECTIF",
    category: "company",
    categoryLabel: "Entreprise",
    type: "attendance",
    autoConfirmed: false,
  },
  planning_semaine: {
    name: "PLANNING DE LA SEMAINE",
    category: "company",
    categoryLabel: "Entreprise",
    type: "attendance",
    autoConfirmed: false,
  },
  // Formateur
  convention_intervention: {
    name: "CONVENTION D'INTERVENTION",
    category: "trainer",
    categoryLabel: "Formateur",
    type: "agreement",
    autoConfirmed: false,
  },
  // Communs (auto-confirmés — pas besoin de signature)
  cgv: {
    name: "CGV",
    category: "common",
    categoryLabel: "Commun",
    type: "other",
    autoConfirmed: true,
  },
  politique_confidentialite: {
    name: "POLITIQUE DE CONFIDENTIALITÉ",
    category: "common",
    categoryLabel: "Commun",
    type: "other",
    autoConfirmed: true,
  },
  reglement_interieur: {
    name: "RÈGLEMENT INTÉRIEUR",
    category: "common",
    categoryLabel: "Commun",
    type: "other",
    autoConfirmed: true,
  },
};

/**
 * Liste dérivée des templates officiels. Pour chaque doc_type du registry
 * avec des métadonnées UI ici, on construit un OfficialTemplate complet.
 *
 * L'ordre est celui des clés de OFFICIAL_TEMPLATE_META (apprenant → entreprise
 * → formateur → communs).
 */
export const OFFICIAL_TEMPLATES: OfficialTemplate[] = Object.keys(OFFICIAL_TEMPLATE_META)
  .filter((docType) => {
    if (!(docType in SYSTEM_TEMPLATES_BY_DOC_TYPE)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[official-templates] doc_type "${docType}" présent dans OFFICIAL_TEMPLATE_META mais absent du registry — entrée ignorée.`,
        );
      }
      return false;
    }
    return true;
  })
  .map((docType) => ({ id: docType, ...OFFICIAL_TEMPLATE_META[docType]! }));
```

- [ ] **Step 3: Modifier `documents/page.tsx` — retirer interface + const inline + ajouter import**

Trouver et **supprimer** :
- Lignes 167-174 : `interface OfficialTemplate { ... }`
- Lignes 176-194 : `const OFFICIAL_TEMPLATES: OfficialTemplate[] = [...];`

Ajouter dans les imports (après les autres `@/lib/...`) :
```ts
import { OFFICIAL_TEMPLATES, type OfficialTemplate } from "@/lib/templates/official-templates";
```

- [ ] **Step 4: Vérifier les 5 références JSX OFFICIAL_TEMPLATES marchent**

Run: `grep -nE "OFFICIAL_TEMPLATES" 'src/app/(dashboard)/admin/documents/page.tsx'`

Tu dois voir 4-5 lignes restantes (les `.length`, `.filter`, `.map` du JSX). Toutes doivent fonctionner sans modification — l'API du tableau est identique.

- [ ] **Step 5: Vérifier TS clean + Vitest vert**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie (clean)

Si erreur sur `OfficialTemplate` non utilisé : retirer `type OfficialTemplate` de l'import si pas référencé ailleurs dans `documents/page.tsx`.

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Tests "`
Expected: `Tests  550 passed (550)`

- [ ] **Step 6: Commit**

```bash
git add src/lib/templates/official-templates.ts 'src/app/(dashboard)/admin/documents/page.tsx'
git commit -m "refactor(documents): dérive OFFICIAL_TEMPLATES depuis registry (V1.1)

Crée src/lib/templates/official-templates.ts : OFFICIAL_TEMPLATES est
maintenant DÉRIVÉ du registry système (SYSTEM_TEMPLATES_BY_DOC_TYPE).
Pour chaque doc_type, des métadonnées UI (catégorie, libellé, type,
autoConfirmed) sont associées via OFFICIAL_TEMPLATE_META.

Élimine 1 des 5 listes inline non-synchronisées. 11 entrées au lieu
de 12 dans le deep-dive (les doc_types sectoriels avis_hab_elec_*,
attestation_aipr, etc. ne sont PAS catalogués — sélection contextuelle
dans la fiche formation).

Console.warn dev-time si métadonnées UI référencent un doc_type absent
du registry (filet de sécurité contre la drift future).

Refs: docs/superpowers/specs/2026-05-27-admin-documents-volet-1-cleanup-discoverability-design.md § 4.1.1"
```

---

## Task 4: V1.2 — `doc-type-options.ts` + remplacement dans `import/page.tsx`

**Files:**
- Create: `src/lib/templates/doc-type-options.ts`
- Modify: `src/app/(dashboard)/admin/documents/import/page.tsx:30-45`

- [ ] **Step 1: Créer `src/lib/templates/doc-type-options.ts`**

```ts
/**
 * Options du select d'import (admin/documents/import/page.tsx).
 *
 * Combine :
 *   - Les doc_types système (depuis OFFICIAL_TEMPLATES dérivé du registry)
 *   - Les extras non-générables : facture, devis, autre (free-text autorisé)
 *
 * Note : la liste actuelle inline dans import/page.tsx contient aussi
 * "convention_apprenant" et "programme" qui n'existent pas dans le registry.
 * On les exclut volontairement de cette liste dérivée — l'option "autre"
 * permet le free-text si besoin d'un type custom.
 */

import { OFFICIAL_TEMPLATES } from "./official-templates";

const EXTRA_DOC_TYPES: { value: string; label: string }[] = [
  { value: "facture", label: "Facture" },
  { value: "devis", label: "Devis" },
  { value: "autre", label: "Autre" },
];

export const DOC_TYPE_OPTIONS: { value: string; label: string }[] = [
  ...OFFICIAL_TEMPLATES.map((t) => ({ value: t.id, label: t.name })),
  ...EXTRA_DOC_TYPES,
];
```

**Note** : la liste résultante aura 14 entrées (11 OFFICIAL + 3 EXTRA), libellés en MAJUSCULES pour les 11 templates système (cohérent avec OFFICIAL_TEMPLATES). C'est un changement subtil de l'UX (avant : "Convention entreprise" / Après : "CONVENTION ENTREPRISE") — acceptable comme amélioration de cohérence visuelle. Si Wissam préfère lowercase pour le select d'import, ajuster lors du smoke check.

- [ ] **Step 2: Modifier `import/page.tsx` — retirer const inline + ajouter import**

Lire le contexte :
```bash
sed -n '28,48p' 'src/app/(dashboard)/admin/documents/import/page.tsx'
```

Trouver et **supprimer** (lignes 30-45) :
```ts
const DOC_TYPE_OPTIONS = [
  { value: "convention_entreprise", label: "Convention entreprise" },
  // ... 14 entrées ...
];
```

Ajouter dans les imports (avec les autres) :
```ts
import { DOC_TYPE_OPTIONS } from "@/lib/templates/doc-type-options";
```

- [ ] **Step 3: Vérifier TS clean + Vitest vert**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Tests "`
Expected: `Tests  550 passed (550)`

- [ ] **Step 4: Commit**

```bash
git add src/lib/templates/doc-type-options.ts 'src/app/(dashboard)/admin/documents/import/page.tsx'
git commit -m "refactor(documents): dérive DOC_TYPE_OPTIONS depuis OFFICIAL_TEMPLATES (V1.2)

Crée src/lib/templates/doc-type-options.ts. La liste 14 entrées
(11 doc_types système + facture/devis/autre extras) est maintenant
construite par spread depuis OFFICIAL_TEMPLATES.

Conséquence côté UX : les libellés du select sont en MAJUSCULES
(comme dans le catalogue officiel) au lieu de la casse mixte
précédente. Cohérence visuelle.

Élimine 1 des 5 listes inline non-synchronisées (3/5 restantes).

Refs: docs/superpowers/specs/2026-05-27-admin-documents-volet-1-cleanup-discoverability-design.md § 4.1.2"
```

---

## Task 5: V1.3 — `DOCUMENT_VARIABLES` helper + suppression dead code emails

**Files:**
- Modify: `src/lib/template-variables.ts` (ajout helper)
- Modify: `src/app/(dashboard)/admin/documents/page.tsx:112-130` (retire `AVAILABLE_VARIABLES` inline)
- Modify: `src/app/(dashboard)/admin/emails/page.tsx:119-135` (supprime dead code `AVAILABLE_VARIABLES`)

- [ ] **Step 1: Ajouter le helper `DOCUMENT_VARIABLES` à la fin de `template-variables.ts`**

Ouvrir `src/lib/template-variables.ts`. À la fin du fichier (après la fonction `getCategoryCounts`), ajouter :

```ts

/**
 * Variables disponibles pour les documents (UI helper).
 * Dérivé de TEMPLATE_VARIABLES, filtré par `availableIn.includes("document")`.
 *
 * Format : { key (sans braces), label } — utilisé par
 * admin/documents/page.tsx pour afficher la liste des variables
 * connues + détecter les variables inconnues dans les templates custom.
 *
 * Note : `EMAIL_VARIABLES` n'a pas été ajouté car le dead code
 * `AVAILABLE_VARIABLES` dans admin/emails/page.tsx a été supprimé
 * en Task 5 (le composant `InsertVariableButton` utilise déjà
 * directement TEMPLATE_VARIABLES filtré par `availableIn: "email"`).
 */
export const DOCUMENT_VARIABLES: { key: string; label: string }[] = TEMPLATE_VARIABLES
  .filter((v) => v.availableIn.includes("document"))
  .map((v) => ({ key: v.key, label: v.label }));
```

- [ ] **Step 2: Modifier `documents/page.tsx` — retirer `AVAILABLE_VARIABLES` inline + renommer JSX refs**

Trouver et **supprimer** (lignes 112-130) :
```ts
const AVAILABLE_VARIABLES = [
  { key: "nom_client", label: "Nom de l'entreprise" },
  // ... 17 entrées ...
];
```

Ajouter dans les imports (avec les autres `@/lib/...`) :
```ts
import { DOCUMENT_VARIABLES } from "@/lib/template-variables";
```

Renommer les 3 références JSX :
- Ligne ~1765 : `AVAILABLE_VARIABLES.some((av) => av.key === v)` → `DOCUMENT_VARIABLES.some((av) => av.key === v)`
- Ligne ~1798 : `AVAILABLE_VARIABLES.map((v) => (` → `DOCUMENT_VARIABLES.map((v) => (`
- Ligne ~1839 : `variables={AVAILABLE_VARIABLES}` → `variables={DOCUMENT_VARIABLES}`

Run pour vérifier 0 référence orpheline : `grep -n "AVAILABLE_VARIABLES" 'src/app/(dashboard)/admin/documents/page.tsx'`
Expected: aucune sortie

- [ ] **Step 3: Modifier `emails/page.tsx` — supprimer dead code `AVAILABLE_VARIABLES`**

Lire le contexte :
```bash
sed -n '117,138p' 'src/app/(dashboard)/admin/emails/page.tsx'
```

Trouver et **supprimer entièrement** la const :
```ts
const AVAILABLE_VARIABLES = [
  { key: "{{nom_apprenant}}", label: "Nom complet de l'apprenant" },
  // ... 15 entrées ...
];
```

Vérifier qu'aucune référence n'existe :
```bash
grep -n "AVAILABLE_VARIABLES" 'src/app/(dashboard)/admin/emails/page.tsx'
```
Expected: aucune sortie (c'était dead code, suppression sans remplacement)

**NE PAS toucher** à `PREVIEW_VARS` qui est utilisé par `getPreview()` (ligne ~155-160).

- [ ] **Step 4: Vérifier TS clean + Vitest vert**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Tests "`
Expected: `Tests  550 passed (550)`

- [ ] **Step 5: Commit**

```bash
git add src/lib/template-variables.ts 'src/app/(dashboard)/admin/documents/page.tsx' 'src/app/(dashboard)/admin/emails/page.tsx'
git commit -m "refactor(documents): dérive DOCUMENT_VARIABLES + supprime dead code emails (V1.3)

3 changements :

1. Ajoute DOCUMENT_VARIABLES dans src/lib/template-variables.ts —
   dérivé de TEMPLATE_VARIABLES filtré par availableIn includes 'document'.

2. Remplace AVAILABLE_VARIABLES inline dans admin/documents/page.tsx
   (17 entrées) par l'import DOCUMENT_VARIABLES (dérivation).

3. Supprime AVAILABLE_VARIABLES inline dans admin/emails/page.tsx
   (15 entrées) — DEAD CODE : la const était définie mais jamais
   référencée. Le composant InsertVariableButton utilise déjà
   directement TEMPLATE_VARIABLES filtré par availableIn 'email'.

Élimine les 2 dernières des 5 listes inline (0/5 restantes).
PREVIEW_VARS dans emails/page.tsx reste en place (utilisé par getPreview).

Refs: docs/superpowers/specs/2026-05-27-admin-documents-volet-1-cleanup-discoverability-design.md § 4.1.3"
```

---

## Task 6: V3 — `DocumentsTabsNav` + ajouter dans les 4 pages

**Files:**
- Create: `src/app/(dashboard)/admin/documents/_components/DocumentsTabsNav.tsx`
- Modify: `src/app/(dashboard)/admin/documents/page.tsx`
- Modify: `src/app/(dashboard)/admin/documents/variables/page.tsx`
- Modify: `src/app/(dashboard)/admin/documents/import/page.tsx`
- Modify: `src/app/(dashboard)/admin/documents/how-to/page.tsx`

- [ ] **Step 1: Créer le dossier `_components/`**

```bash
mkdir -p 'src/app/(dashboard)/admin/documents/_components'
```

- [ ] **Step 2: Créer `DocumentsTabsNav.tsx`**

Créer `src/app/(dashboard)/admin/documents/_components/DocumentsTabsNav.tsx` :

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutGrid, Variable, Upload, HelpCircle } from "lucide-react";

interface Tab {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: Tab[] = [
  { href: "/admin/documents", label: "Catalogue", icon: LayoutGrid },
  { href: "/admin/documents/variables", label: "Variables", icon: Variable },
  { href: "/admin/documents/import", label: "Importer", icon: Upload },
  { href: "/admin/documents/how-to", label: "Aide", icon: HelpCircle },
];

export function DocumentsTabsNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-10 bg-white border-b border-gray-200 mb-6 -mx-6 px-6">
      <div className="flex gap-1">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Ajouter `<DocumentsTabsNav />` dans `documents/page.tsx`**

Ajouter dans les imports :
```tsx
import { DocumentsTabsNav } from "./_components/DocumentsTabsNav";
```

Trouver le retour JSX de `DocumentsPage()`. Il y a probablement un wrapper `<div className="p-6 max-w-7xl mx-auto space-y-6">` ou similaire. Ajouter `<DocumentsTabsNav />` comme premier enfant :

```tsx
return (
  <div className="p-6 max-w-7xl mx-auto space-y-6">
    <DocumentsTabsNav />
    {/* ... reste du JSX existant ... */}
  </div>
);
```

- [ ] **Step 4: Modifier `variables/page.tsx` — retirer `<Link Retour>` + ajouter `<DocumentsTabsNav />`**

Lire le contexte :
```bash
sed -n '45,60p' 'src/app/(dashboard)/admin/documents/variables/page.tsx'
```

Tu verras probablement :
```tsx
<div className="flex items-center gap-3">
  <Link href="/admin/documents">
    <Button variant="ghost" size="sm">
      <ArrowLeft className="h-4 w-4" />
    </Button>
  </Link>
  {/* ... titre ... */}
</div>
```

Le supprimer (le bouton Retour ET le `<Link>` wrapper, garder le titre).

Vérifier si `ArrowLeft` et `Link` ne sont plus utilisés ailleurs. Si orphelins, les retirer des imports.

Ajouter dans les imports :
```tsx
import { DocumentsTabsNav } from "../_components/DocumentsTabsNav";
```

Ajouter `<DocumentsTabsNav />` comme premier enfant du wrapper :
```tsx
return (
  <div className="p-6 max-w-4xl mx-auto space-y-6">
    <DocumentsTabsNav />
    {/* ... reste ... */}
  </div>
);
```

- [ ] **Step 5: Modifier `import/page.tsx` — ajouter `<DocumentsTabsNav />`**

Ajouter dans les imports :
```tsx
import { DocumentsTabsNav } from "../_components/DocumentsTabsNav";
```

Ajouter `<DocumentsTabsNav />` comme premier enfant du wrapper du return JSX. La structure exacte dépend du contenu de la page (lire `sed -n '70,90p' 'src/app/(dashboard)/admin/documents/import/page.tsx'` pour identifier le bon endroit).

Pas de `<Link Retour>` à retirer dans cette page (vérifié en Task 0).

- [ ] **Step 6: Modifier `how-to/page.tsx` — retirer `<Link Retour>` + `ArrowLeft` import + ajouter `<DocumentsTabsNav />`**

Lire le contexte :
```bash
sed -n '22,35p' 'src/app/(dashboard)/admin/documents/how-to/page.tsx'
```

Tu verras :
```tsx
<Link href="/admin/documents">
  <Button variant="ghost" size="sm">
    <ArrowLeft className="h-4 w-4" />
  </Button>
</Link>
```

Le supprimer.

Vérifier dans les imports si `ArrowLeft` et `Link` sont encore utilisés ailleurs dans le fichier :
```bash
grep -n "ArrowLeft\|<Link" 'src/app/(dashboard)/admin/documents/how-to/page.tsx'
```

Si `ArrowLeft` n'est plus utilisé : le retirer de l'import lucide.
Si `Link` n'est plus utilisé : retirer l'import next/link.

Ajouter dans les imports :
```tsx
import { DocumentsTabsNav } from "../_components/DocumentsTabsNav";
```

Ajouter `<DocumentsTabsNav />` comme premier enfant du wrapper return.

- [ ] **Step 7: Vérifier TS clean + Vitest vert**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: aucune sortie

Si TS pleure sur un import orphelin (`Link is declared but its value is never read`), retirer cet import.

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Tests "`
Expected: `Tests  550 passed (550)`

- [ ] **Step 8: Vérifier que `<DocumentsTabsNav />` apparaît dans les 4 pages**

Run: `grep -l "<DocumentsTabsNav" 'src/app/(dashboard)/admin/documents/'**/*.tsx 2>/dev/null | head -10`

Expected : 4 fichiers listés (`page.tsx`, `variables/page.tsx`, `import/page.tsx`, `how-to/page.tsx`).

- [ ] **Step 9: Commit**

```bash
git add 'src/app/(dashboard)/admin/documents/_components/DocumentsTabsNav.tsx' 'src/app/(dashboard)/admin/documents/page.tsx' 'src/app/(dashboard)/admin/documents/variables/page.tsx' 'src/app/(dashboard)/admin/documents/import/page.tsx' 'src/app/(dashboard)/admin/documents/how-to/page.tsx'
git commit -m "feat(documents): sous-tabs sticky DocumentsTabsNav sur 4 pages (V3)

Crée src/app/(dashboard)/admin/documents/_components/DocumentsTabsNav.tsx :
composant sticky avec 4 onglets (Catalogue / Variables / Importer / Aide),
navigation par href avec usePathname() pour détecter le tab actif
(highlight bleu).

Ajouté en haut des 4 pages :
- documents/page.tsx (Catalogue actif)
- documents/variables/page.tsx (Variables actif) — Link 'Retour' retiré
- documents/import/page.tsx (Importer actif)
- documents/how-to/page.tsx (Aide actif) — Link 'Retour' + ArrowLeft import retirés

Rend les 3 pages satellites découvrables depuis la racine. Le pattern
sticky avec -mx-6 px-6 neutralise le padding parent et le rétablit
visuellement, permettant à la nav de coller au scroll sans déborder.

Refs: docs/superpowers/specs/2026-05-27-admin-documents-volet-1-cleanup-discoverability-design.md § 4.2"
```

---

## Task 7: Vérification finale

**Files:** Aucun (vérifications uniquement)

- [ ] **Step 1: Suite Vitest complète verte**

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files  49 passed (49)` et `Tests  550 passed (550)`

- [ ] **Step 2: TypeScript strict clean**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

- [ ] **Step 3: Build Next.js success**

Run: `npm run build 2>&1 | grep -E "Compiled|error\b|Error\b" | head -3`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Grep de cohérence — toutes les listes inline ont disparu**

```bash
# 0 OFFICIAL_TEMPLATES = [ inline (la def doit avoir disparu)
grep -nE "^const OFFICIAL_TEMPLATES = " 'src/app/(dashboard)/admin/documents/page.tsx'
# Expected: aucune sortie

# 0 DOC_TYPE_OPTIONS = [ inline
grep -nE "^const DOC_TYPE_OPTIONS = " 'src/app/(dashboard)/admin/documents/import/page.tsx'
# Expected: aucune sortie

# 0 AVAILABLE_VARIABLES = [ inline dans documents/page.tsx
grep -nE "^const AVAILABLE_VARIABLES = " 'src/app/(dashboard)/admin/documents/page.tsx'
# Expected: aucune sortie

# 0 AVAILABLE_VARIABLES = [ inline dans emails/page.tsx
grep -nE "^const AVAILABLE_VARIABLES = " 'src/app/(dashboard)/admin/emails/page.tsx'
# Expected: aucune sortie
```

- [ ] **Step 5: Grep de cohérence — DocumentsTabsNav dans les 4 pages**

Run: `grep -l "<DocumentsTabsNav" 'src/app/(dashboard)/admin/documents/'**/*.tsx 2>/dev/null`
Expected : 4 fichiers (`page.tsx`, `variables/page.tsx`, `import/page.tsx`, `how-to/page.tsx`)

- [ ] **Step 6: Récap des commits du sous-chantier**

Run: `git log --oneline fdc57f9..HEAD`

Expected : 5 commits (Tasks 1-5 et 6 ayant chacun 1 commit) :
```
<sha> feat(documents): sous-tabs sticky DocumentsTabsNav sur 4 pages (V3)
<sha> refactor(documents): dérive DOCUMENT_VARIABLES + supprime dead code emails (V1.3)
<sha> refactor(documents): dérive DOC_TYPE_OPTIONS depuis OFFICIAL_TEMPLATES (V1.2)
<sha> refactor(documents): dérive OFFICIAL_TEMPLATES depuis registry (V1.1)
<sha> refactor(documents): extract DocumentType to src/lib/templates/types.ts
<sha> fix(documents): différencie <title> HTML lettre-decharge (bonus Sous-chantier 1)
```

(6 commits total — Tasks 1, 2, 3, 4, 5, 6.)

---

## Task 8: STOP — smoke check manuel par Wissam (~15 min)

**Files:** Aucun (procédure manuelle)

> ⚠️ **Le subagent S'ARRÊTE ICI.** Le controller (Claude) présente la procédure ci-dessous à Wissam et attend la décision Go/No-go. Task 9 ne se déclenche **qu'après** le Go.

### Procédure smoke check

**A. Affichage de base + tabs sticky**
- [ ] Ouvrir `/admin/documents` → la page charge
- [ ] Sous-tabs visibles en haut : Catalogue / Variables / Importer / Aide
- [ ] Tab "Catalogue" est highlight bleu (actif)
- [ ] Scroll de la page → tabs restent sticky en haut

**B. Catalogue sans doublons (V1.1)**
- [ ] La section "Documents officiels" affiche **11 templates** (pas plus)
- [ ] Apprenant : Convocation, Certificat de réalisation, Attestation d'assiduité, Feuille d'émargement
- [ ] Entreprise : Convention entreprise, Feuille d'émargement collectif, Planning de la semaine
- [ ] Formateur : Convention d'intervention
- [ ] Communs : CGV, Politique de confidentialité, Règlement intérieur
- [ ] **AUCUN doublon visible** (Attestation d'assiduité ×1, Certificat de réalisation ×1, Convention entreprise ×1, Convention d'intervention ×1)

**C. Variables (V1.3)**
- [ ] Section variables affiche un ensemble cohérent (pas de duplicate)
- [ ] Click sur tab "Variables" → arrive sur `/admin/documents/variables`
- [ ] Tab "Variables" highlight bleu
- [ ] Pas de bouton "← Retour" (la nav le remplace)

**D. Importer (V1.2)**
- [ ] Click sur tab "Importer" → arrive sur `/admin/documents/import`
- [ ] Tab "Importer" highlight bleu
- [ ] Select des doc_types affiche 14 options (11 système en MAJUSCULES + Facture + Devis + Autre)

**E. Aide**
- [ ] Click sur tab "Aide" → arrive sur `/admin/documents/how-to`
- [ ] Tab "Aide" highlight bleu
- [ ] Pas de bouton "← Retour" (la nav le remplace)

**F. Navigation cross-pages**
- [ ] Depuis `/admin/documents/how-to`, click sur tab "Catalogue" → retour à `/admin/documents`
- [ ] Pendant scroll de chaque page, les tabs restent visibles (sticky)

**G. Génération document — non-régression**
- [ ] Depuis le catalogue, click sur un template (e.g. Convocation) → ouvre la flow de génération existante
- [ ] Aucun crash ou comportement bizarre

**H. Titre PDF lettre-decharge (bonus)**
- [ ] (Si testable) Générer une "Lettre de décharge — départ anticipé" → vérifier que le PDF a comme titre "Lettre de décharge — Départ anticipé" (pas l'ancien "Lettre de décharge de responsabilité")
- [ ] Générer une "Décharge de responsabilité" longue → vérifier titre "Lettre de décharge de responsabilité"

**I. Emails — non-régression**
- [ ] Ouvrir `/admin/emails` → la page charge sans erreur
- [ ] Le bouton "Insérer variable" marche (utilise InsertVariableButton, qui lit TEMPLATE_VARIABLES)

### Décision

- ✅ **Go** : Task 9 (merge + push prod)
- ❌ **No-go** : noter le finding, fix, re-tester

---

## Task 9: Après Go — finishing-a-development-branch

**Files:** Aucun (orchestration git)

- [ ] **Step 1: Invoquer finishing-a-development-branch**

Annoncer : "I'm using the finishing-a-development-branch skill to complete this work."

Utiliser superpowers:finishing-a-development-branch :
1. Verify tests : `npx vitest run` → 550 passed
2. Determine base : main
3. Pattern habituel : **merge local sur main + push prod**
4. Cleanup branch `feat/admin-documents-volet-1-cleanup-discoverability`

- [ ] **Step 2: Confirmer push prod**

Run: `git log --oneline origin/main..HEAD` (après push)
Expected: liste vide.

---

## Résumé du sous-chantier

| Task | Livrable | Estimation |
|------|----------|-----------|
| 0 | Baseline + branche + audit DB | 20 min |
| 1 | Bonus — fix `<title>` lettre-decharge | 5 min |
| 2 | V1.0 — extract `DocumentType` to types.ts | 15 min |
| 3 | V1.1 — `official-templates.ts` + remplacement | 1h |
| 4 | V1.2 — `doc-type-options.ts` + remplacement | 30 min |
| 5 | V1.3 — `DOCUMENT_VARIABLES` + suppression dead code | 45 min |
| 6 | V3 — `DocumentsTabsNav` + 4 pages | 1h |
| 7 | Vérification finale | 20 min |
| 8 | STOP smoke check Wissam | ~15 min manuel |
| 9 | Finishing | 10 min |
| **Total** | | **~5h** |

**Critères d'acceptance** (cf. spec § 6) : tous validés avant Task 9.

**Risque prod** : faible — pure refacto par dérivation (zero key change) + ajout d'une nav sticky.

**Bénéfice immédiat pour l'admin** :
- Catalogue cohérent sans doublons
- 3 pages satellites accessibles via tabs sticky (au lieu de pages orphelines)
- Variables affichées partagées avec emails (source de vérité commune)
