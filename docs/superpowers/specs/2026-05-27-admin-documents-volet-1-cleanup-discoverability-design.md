# Sous-chantier 1 `/admin/documents` — V1 Nettoyage + V3 Découvrabilité + bonus

> **Spec validée par Wissam le 2026-05-27.**
> Source : Deep-dive [docs/deep-dive-admin-documents.md](../../deep-dive-admin-documents.md) (commit `18b3f5d`).

---

## 1. Contexte

Le deep-dive BMAD du 2026-05-27 a donné le verbatim de Wissam : « c'est une catastrophe il faut tout repenser » sur `/admin/documents`. Score actuel **4.5/10** (le plus bas mesuré). 2 douleurs principales :
1. **UX confuse / workflow casse-tête** — doublons visibles dans le catalogue
2. **Templates / doublons / nettoyage** — entrées legacy coexistent avec les nouvelles

Le deep-dive a identifié 5 volets + 1 bonus (~25-36h MVP). Ce **Sous-chantier 1** traite les **2 quick wins UX-impactants** : V1 (nettoyage doublons par dérivation depuis sources de vérité) + V3 (découvrabilité satellites par sous-tabs sticky). Le doublon `<title>` HTML decharge est ajouté en bonus (~5 min).

### 1.1 Findings post-exploration corrigeant le deep-dive

L'exploration a révélé 2 surprises :

1. **Le "doublon fichier" `decharge-*` n'est PAS un doublon** : `decharge-responsabilite.ts` (144 LOC, version longue avec liste de conséquences) et `lettre-decharge-responsabilite.ts` (150 LOC, version courte 1 page avec champs à remplir à la main) sont **2 templates distincts pour 2 usages distincts** (routes API séparées, doc_types DB différents, libellés différents). MAIS leur `<title>` HTML est identique → bug copy-paste à fixer.

2. **5 listes parallèles, pas 4** : en plus des 4 listes identifiées par le deep-dive (`OFFICIAL_TEMPLATES`, `STARTER_TEMPLATES`, `DOC_TYPE_OPTIONS`, `AVAILABLE_VARIABLES` ×2), il existe **2 sources de vérité centralisées non utilisées** :
   - `src/lib/templates/registry.ts` (483 LOC, 11 doc_types système)
   - `src/lib/template-variables.ts` (167 LOC, variables centralisées avec catégories)

→ Le scope V1 réel = **aligner les 5 listes inline sur les 2 sources de vérité existantes** par dérivation TypeScript.

---

## 2. Goal

Éliminer les doublons UI visibles (5 listes inline non-synchronisées) en dérivant depuis les sources de vérité existantes (`registry.ts` + `template-variables.ts`), rendre les 3 pages satellites découvrables via sous-tabs sticky, et fixer un bug de `<title>` HTML decharge.

---

## 3. Périmètre

### 3.1 In-scope — 3 livrables

| # | Livrable | Volet | Fichiers | Estimation |
|---|----------|-------|----------|-----------|
| 1 | Dériver les 5 listes inline depuis registry/template-variables | V1 | 3 nouveaux + 3 modifiés | ~3-4h |
| 2 | Sous-tabs sticky `DocumentsTabsNav` partagé | V3 | 1 nouveau + 4 modifiés | ~2-3h |
| 3 | Fix `<title>` HTML doublon decharge | bonus | 1 modifié | ~5 min |

**Estimation totale** : **~5-7h** (vs ~10-12h deep-dive — pattern de sur-estimation 1.5-2× cohérent avec sous-chantiers précédents).

### 3.2 Out-of-scope (volets V2, V4, V5, V6 reportés)

- **V2** : Refonte UX page racine — futur sous-chantier
- **V4** : Sécurité multi-tenant (3 violations) — futur sous-chantier
- **V5** : Refacto archi page racine 2340 LOC — DEFER selon Wissam
- **V6** : Tests Vitest — bonus optionnel

### 3.3 Out-of-scope (volontaire)

- **STARTER_TEMPLATES** reste inline (3 entrées avec HTML strings, logique différente du registry)
- **Audit DB exhaustif** : juste un check rapide en Task 0 pour confirmer alignement des clés. Pas de migration SQL.
- **Refacto du contenu des pages satellites** (how-to, import, variables) : on touche juste leur layout pour ajouter la nav, pas leur contenu.

---

## 4. Architecture

### 4.1 V1 — Dériver les 5 listes inline

**État actuel (5 listes parallèles)** :

| Liste | Localisation | Entrées | Cible |
|---|---|---|---|
| `OFFICIAL_TEMPLATES` | `admin/documents/page.tsx:176` | 11 | → dérive de `registry.ts` |
| `STARTER_TEMPLATES` | `admin/documents/page.tsx:216` | 3 | → **reste inline** (logique propre) |
| `DOC_TYPE_OPTIONS` | `admin/documents/import/page.tsx:30` | 14 | → dérive de `registry.ts` + extras |
| `AVAILABLE_VARIABLES` (docs) | `admin/documents/page.tsx:112` | 17 | → dérive de `template-variables.ts` |
| `AVAILABLE_VARIABLES` (emails) | `admin/emails/page.tsx:119` | 15 | → dérive de `template-variables.ts` |

**Fichiers à créer** :

#### 4.1.1 `src/lib/templates/official-templates.ts` (~80 LOC)

```ts
/**
 * Catalogue des templates officiels système (UI metadata).
 * Source de vérité : src/lib/templates/registry.ts (set des doc_types couverts).
 *
 * Cette liste est dérivée du registry : pour chaque doc_type présent dans
 * SYSTEM_TEMPLATES_BY_DOC_TYPE, on associe des métadonnées UI (catégorie,
 * libellé, type, autoConfirmed). Si un nouveau doc_type est ajouté au
 * registry sans métadonnées UI ici, il n'apparaîtra pas dans le catalogue
 * — détecté immédiatement par bug visible (catalogue incomplet).
 */

import { SYSTEM_TEMPLATES_BY_DOC_TYPE } from "./registry";

export interface OfficialTemplate {
  id: string;
  name: string;
  category: "learner" | "company" | "trainer" | "common";
  categoryLabel: string;
  type: "certificate" | "attendance" | "agreement" | "other";
  autoConfirmed: boolean;
}

// Métadonnées UI par doc_type — clés DOIVENT correspondre aux clés du registry.
const OFFICIAL_TEMPLATE_META: Record<string, Omit<OfficialTemplate, "id">> = {
  convocation_apprenant: {
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
  // ... etc pour les 11 doc_types couverts par le registry (à compléter
  //     en lisant la liste exacte des clés dans registry.ts au runtime).
};

export const OFFICIAL_TEMPLATES: OfficialTemplate[] = Object.keys(SYSTEM_TEMPLATES_BY_DOC_TYPE)
  .map((docType) => {
    const meta = OFFICIAL_TEMPLATE_META[docType];
    if (!meta) {
      // Log dev-time pour signaler un doc_type registry sans métadonnées UI.
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[OFFICIAL_TEMPLATES] doc_type "${docType}" présent dans registry mais sans métadonnées UI. Catalogue incomplet.`);
      }
      return null;
    }
    return { id: docType, ...meta };
  })
  .filter((t): t is OfficialTemplate => t !== null);
```

#### 4.1.2 `src/lib/templates/doc-type-options.ts` (~30 LOC)

```ts
/**
 * Options du select d'import (admin/documents/import/page.tsx).
 * Combine les doc_types système (depuis OFFICIAL_TEMPLATES) + extras
 * non-générables (facture, devis, autre).
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

#### 4.1.3 Helpers ajoutés à `src/lib/template-variables.ts`

```ts
// Helpers de dérivation pour les pages admin (à ajouter à la fin du fichier).

/**
 * Variables disponibles pour les documents (filter `availableIn` includes "document").
 * Format : { key (sans braces), label }. Utilisé par admin/documents/page.tsx.
 */
export const DOCUMENT_VARIABLES: { key: string; label: string }[] = TEMPLATE_VARIABLES
  .filter((v) => v.availableIn.includes("document"))
  .map((v) => ({ key: v.key, label: v.label }));

/**
 * Variables disponibles pour les emails (filter `availableIn` includes "email").
 * Format : { key (AVEC braces {{...}}), label }. Utilisé par admin/emails/page.tsx.
 */
export const EMAIL_VARIABLES: { key: string; label: string }[] = TEMPLATE_VARIABLES
  .filter((v) => v.availableIn.includes("email"))
  .map((v) => ({ key: v.techPlaceholder, label: v.label }));
```

**Fichiers modifiés** :

- **`src/app/(dashboard)/admin/documents/page.tsx`** :
  - Retirer `const OFFICIAL_TEMPLATES = [...]` (12 lignes)
  - Retirer `const AVAILABLE_VARIABLES = [...]` (18 lignes)
  - Ajouter `import { OFFICIAL_TEMPLATES, type OfficialTemplate } from "@/lib/templates/official-templates";`
  - Ajouter `import { DOCUMENT_VARIABLES } from "@/lib/template-variables";`
  - Renommer toutes les références `AVAILABLE_VARIABLES` → `DOCUMENT_VARIABLES` dans le JSX

- **`src/app/(dashboard)/admin/emails/page.tsx`** :
  - Retirer `const AVAILABLE_VARIABLES = [...]` (16 lignes)
  - Ajouter `import { EMAIL_VARIABLES as AVAILABLE_VARIABLES } from "@/lib/template-variables";` (alias pour minimiser les changements JSX)

- **`src/app/(dashboard)/admin/documents/import/page.tsx`** :
  - Retirer `const DOC_TYPE_OPTIONS = [...]` (15 lignes)
  - Ajouter `import { DOC_TYPE_OPTIONS } from "@/lib/templates/doc-type-options";`

### 4.2 V3 — Sous-tabs sticky `DocumentsTabsNav`

**Composant créé** :

#### `src/app/(dashboard)/admin/documents/_components/DocumentsTabsNav.tsx` (~50 LOC)

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
                  : "border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300"
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

**4 pages modifiées** : ajout `<DocumentsTabsNav />` en haut du JSX retourné.

| Page | Avant | Après |
|---|---|---|
| `documents/page.tsx` | `<div className="p-6 max-w-7xl mx-auto space-y-6">` | Ajouter `<DocumentsTabsNav />` comme 1er enfant |
| `documents/variables/page.tsx` | Contient un `<Link href="/admin/documents">← Retour</Link>` | Retirer le lien Retour (la nav le remplace) + ajouter `<DocumentsTabsNav />` |
| `documents/import/page.tsx` | Pas de Link "← Retour" | Ajouter `<DocumentsTabsNav />` en haut |
| `documents/how-to/page.tsx` | Contient `<Link href="/admin/documents">← Retour</Link>` + icon `ArrowLeft` | Retirer le Link Retour + l'import `ArrowLeft` orphelin + ajouter `<DocumentsTabsNav />` |

**Note technique** : la classe `sticky top-0 z-10 -mx-6 px-6` permet à la nav de coller au scroll sans déborder du padding parent. Le `-mx-6` neutralise le padding du `<div className="p-6">` parent et le `px-6` le rétablit visuellement.

### 4.3 Bonus — Fix `<title>` HTML decharge

**`src/lib/templates/lettre-decharge-responsabilite.ts`** :
- **AVANT** : `<title>Lettre de décharge de responsabilité</title>`
- **APRÈS** : `<title>Lettre de décharge — Départ anticipé</title>`

`src/lib/templates/decharge-responsabilite.ts` reste avec le `<title>` actuel (version "longue" canonique).

---

## 5. Tests

### 5.1 Aucun nouveau test Vitest requis

Pure refacto (dérivation) + ajout d'un composant nav. Aucune nouvelle logique métier à couvrir. Les 550 tests existants restent verts comme garde de régression.

### 5.2 Audit DB préalable (Task 0)

Avant de toucher aux clés, vérifier l'alignement DB → registry :

```sql
SELECT DISTINCT doc_type FROM document_templates ORDER BY doc_type;
SELECT DISTINCT doc_type FROM generated_documents ORDER BY doc_type;
```

Comparer avec `Object.keys(SYSTEM_TEMPLATES_BY_DOC_TYPE)`. **Toute clé DB qui n'existe pas dans le registry doit être documentée** (probablement un doc_type custom ou un legacy). Le but est de ne PAS modifier de clés — juste dériver.

### 5.3 Smoke check manuel (~15 min en Task 7)

Liste complète au § 6 ci-dessous.

---

## 6. Critères d'acceptance

**Technique** :
- [ ] Audit DB préalable effectué (Task 0) — clés DB et registry alignées (ou divergences documentées)
- [ ] 3 nouveaux fichiers créés : `official-templates.ts`, `doc-type-options.ts`, `DocumentsTabsNav.tsx`
- [ ] 2 helpers ajoutés à `template-variables.ts` (`DOCUMENT_VARIABLES`, `EMAIL_VARIABLES`)
- [ ] `documents/page.tsx` : `OFFICIAL_TEMPLATES` + `AVAILABLE_VARIABLES` inline retirés (remplacés par imports)
- [ ] `emails/page.tsx` : `AVAILABLE_VARIABLES` inline retiré
- [ ] `import/page.tsx` : `DOC_TYPE_OPTIONS` inline retiré
- [ ] `STARTER_TEMPLATES` reste inline dans `documents/page.tsx` (logique propre préservée)
- [ ] `<DocumentsTabsNav />` ajouté en haut des 4 pages
- [ ] `<title>` HTML de `lettre-decharge-responsabilite.ts` différencié
- [ ] Vitest : 550/550 maintenu
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` success

**Validation manuelle Wissam (~15 min en Task 7)** :
- [ ] Page `/admin/documents` charge correctement
- [ ] Catalogue OFFICIAL_TEMPLATES affiche les 11 docs sans doublon visible (Attestation d'assiduité ×1, Certificat de réalisation ×1, Convention entreprise ×1, Convention intervention ×1)
- [ ] Variables affichées sur `/admin/documents` alignées avec celles de `/admin/documents/variables`
- [ ] Variables affichées sur `/admin/emails` au format `{{...}}`
- [ ] Sous-tabs sticky visibles en haut des 4 pages, tab actif highlight bleu
- [ ] Click "Variables" depuis `/admin/documents` → arrive sur `/admin/documents/variables` avec tab "Variables" actif
- [ ] Click "Importer" → arrive sur `/admin/documents/import`
- [ ] Click "Aide" → arrive sur `/admin/documents/how-to`
- [ ] Click "Catalogue" depuis n'importe quelle satellite → retour à `/admin/documents`
- [ ] Génération d'un document test (e.g. Convocation) marche encore (registry → PDF)
- [ ] Le bouton "Importer" du select dans `/admin/documents/import` montre les 14 doc_types (11 système + facture + devis + autre)

---

## 7. Pattern d'exécution

**Branche** : `feat/admin-documents-volet-1-cleanup-discoverability` (depuis `main` à `18b3f5d`)

**~9 tasks bite-sized** :

| Task | Livrable | Estimation |
|------|----------|-----------|
| 0 | Baseline + branche + audit DB préalable | 20 min |
| 1 | Bonus — fix `<title>` HTML lettre-decharge | 5 min |
| 2 | V1.1 — `official-templates.ts` + remplacer inline dans `documents/page.tsx` | 1h |
| 3 | V1.2 — `doc-type-options.ts` + remplacer inline dans `import/page.tsx` | 30 min |
| 4 | V1.3 — helpers `DOCUMENT_VARIABLES` + `EMAIL_VARIABLES`, remplacer dans `documents/page.tsx` + `emails/page.tsx` | 1h |
| 5 | V3 — `DocumentsTabsNav` + ajouter dans les 4 pages | 1h |
| 6 | Vérifications finales (Vitest + tsc + build + grep cohérence) | 30 min |
| 7 | STOP smoke check Wissam | ~15 min manuel |
| 8 | Finishing après Go (merge + push prod) | 10 min |

**Ordre intentionnel** : du moins risqué (bonus title 5 min) au plus complexe (V3 nav 4 pages). Audit DB en Task 0 = garde de sécurité avant de toucher aux clés.

---

## 8. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Doc_type DB désaligné avec registry (clé orpheline en DB) | Faible | Moyen | Audit DB préalable Task 0 — documentation des divergences, **on ne touche pas aux clés**, juste dérivation |
| `OFFICIAL_TEMPLATE_META` incomplet → doc_type registry invisible dans catalogue | Très faible | Faible | Console.warn dev-time signale, smoke check Task 7 vérifie présence des 11 docs |
| `availableIn` mal renseigné dans `template-variables.ts` → variable manquante UI | Faible | Faible | Lecture du fichier en Task 4 + smoke check vérifie variables visibles |
| Sous-tabs casse la mise en page existante (sticky chevauche le header parent) | Moyen | Faible | Test visuel Task 7, ajuster `z-index` ou top offset si conflit |
| `_components/` directory n'existe pas dans `admin/documents/` | Très faible | Faible | À créer si besoin (`mkdir -p`) |
| Régression visuelle subtile (espacement après injection nav) | Faible | Faible | Smoke check visuel des 4 pages |

---

## 9. Estimation finale

| Tâche | Estimation |
|-------|-----------|
| Tasks 0-6 (audit + 5 extractions/créations + cleanup) | ~5h |
| Task 7 (smoke check manuel Wissam) | ~15 min |
| Task 8 (finishing) | ~10 min |
| **Total Sous-chantier 1** | **~5-6h** |

---

## 10. Suite

Après merge prod du Sous-chantier 1 :

- **Score `/admin/documents`** : passe de **4.5/10 → ~5.5/10** (V1+V3+bonus = quick wins UX-impactants mais pas le cœur du problème ; V2 refonte UX page racine sera le vrai changement).
- **Sous-chantier 2** : Volet V2 — Refonte UX page racine (~12-18h, focus #1 de Wissam). Sera brainstormé séparément après ce sous-chantier 1.
- **Sous-chantiers ultérieurs** : V4 sécurité multi-tenant, V5 refacto archi (DEFER selon Wissam), V6 tests.

L'admin verra **dès le merge** :
- Le catalogue sans doublons (Attestation d'assiduité ×1, Convention ×2 au lieu de ×3, etc.)
- Les 3 pages satellites accessibles via sous-tabs sticky (au lieu de pages orphelines invisibles)
- Cohérence vocabulaire (les libellés viennent d'une source unique)
