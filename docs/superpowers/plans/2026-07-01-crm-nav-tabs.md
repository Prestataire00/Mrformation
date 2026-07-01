# CRM — Barres d'onglets (Prospects + Prospection) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Navigation homogène : barre d'onglets partagée pour les 3 vues prospects et pour les 3 modules de prospection (+ ligne descriptive).

**Architecture:** 2 composants clients (`usePathname` pour l'actif) montés en tête des 6 pages. Retrait des liens de navigation ad hoc redondants.

**Tech Stack:** Next.js 14 (client), Tailwind, `next/link`, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-01-crm-nav-tabs-design.md`

---

## Pré-requis vérifiés

- `usePathname` de `next/navigation` (pattern `src/components/layout/*`). `cn` de `@/lib/utils`.
- Pages prospects : `prospects/page.tsx` (Kanban), `prospects/liste/page.tsx`, `prospects/portfolio/page.tsx` (fil d'Ariane « Kanban › Portefeuille » ~l.220-225 à retirer).
- Pages prospection : `campaigns/page.tsx`, `sequences/page.tsx`, `automations/page.tsx` (garde son `DomainToggle`).
- Barrières : `npx tsc --noEmit` + `npx vitest run`.

## File Structure

| Fichier | Action |
|---|---|
| `src/components/crm/ProspectsViewTabs.tsx` | Créer. |
| `src/components/crm/ProspectionTabs.tsx` | Créer. |
| `prospects/page.tsx`, `prospects/liste/page.tsx`, `prospects/portfolio/page.tsx` | Modifier : monter `ProspectsViewTabs` en tête + retirer nav redondante. |
| `campaigns/page.tsx`, `sequences/page.tsx`, `automations/page.tsx` | Modifier : monter `ProspectionTabs` en tête. |

---

## Task 1 : Composant `ProspectsViewTabs`

**Files:** Create: `src/components/crm/ProspectsViewTabs.tsx`

- [ ] **Step 1 : créer**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const VIEWS = [
  { href: "/admin/crm/prospects", label: "Kanban" },
  { href: "/admin/crm/prospects/liste", label: "Liste" },
  { href: "/admin/crm/prospects/portfolio", label: "Portefeuille" },
];

export function ProspectsViewTabs() {
  const pathname = usePathname();
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-gray-50 p-1">
      {VIEWS.map((v) => {
        const active = pathname === v.href;
        return (
          <Link
            key={v.href}
            href={v.href}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors",
              active ? "bg-white shadow-sm font-medium text-gray-900" : "text-gray-500 hover:text-gray-700",
            )}
          >
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2 : tsc** → PASS. **Step 3 : commit** — `feat(crm): composant ProspectsViewTabs`

---

## Task 2 : Composant `ProspectionTabs`

**Files:** Create: `src/components/crm/ProspectionTabs.tsx`

- [ ] **Step 1 : créer**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const MODULES = [
  { href: "/admin/crm/campaigns", label: "Campagnes", hint: "Un envoi email unique à un segment de contacts." },
  { href: "/admin/crm/sequences", label: "Séquences", hint: "Une suite de relances automatiques espacées dans le temps." },
  { href: "/admin/crm/automations", label: "Automatisations", hint: "Des actions déclenchées par un événement (ex. prospect gagné)." },
];

export function ProspectionTabs() {
  const pathname = usePathname();
  const current = MODULES.find((m) => m.href === pathname);
  return (
    <div className="space-y-1.5">
      <div className="inline-flex items-center gap-1 rounded-lg border bg-gray-50 p-1">
        {MODULES.map((m) => {
          const active = pathname === m.href;
          return (
            <Link
              key={m.href}
              href={m.href}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                active ? "bg-white shadow-sm font-medium text-gray-900" : "text-gray-500 hover:text-gray-700",
              )}
            >
              {m.label}
            </Link>
          );
        })}
      </div>
      {current && <p className="text-sm text-muted-foreground">{current.hint}</p>}
    </div>
  );
}
```

- [ ] **Step 2 : tsc** → PASS. **Step 3 : commit** — `feat(crm): composant ProspectionTabs (+ hint par module)`

---

## Task 3 : Monter les barres + retirer la nav redondante

**Files:** Modify les 6 pages.

- [ ] **Step 1 : prospects (3 pages)** — dans `prospects/page.tsx`, `prospects/liste/page.tsx`, `prospects/portfolio/page.tsx` : importer `import { ProspectsViewTabs } from "@/components/crm/ProspectsViewTabs";` et rendre `<ProspectsViewTabs />` **en tête** du JSX retourné (juste avant/au niveau du titre de page). Dans `portfolio/page.tsx`, **retirer le fil d'Ariane** « Kanban › Portefeuille » (~l.218-226) désormais remplacé. Dans `prospects/page.tsx`, si un lien direct « Portefeuille » existe dans l'en-tête, le retirer (remplacé par la barre) — garde les liens d'ACTION (ex. `?commercial=`, fiche prospect).

- [ ] **Step 2 : prospection (3 pages)** — dans `campaigns/page.tsx`, `sequences/page.tsx`, `automations/page.tsx` : importer `import { ProspectionTabs } from "@/components/crm/ProspectionTabs";` et rendre `<ProspectionTabs />` **en tête** du JSX (au-dessus du titre ; sur automations, au-dessus du `DomainToggle`).

- [ ] **Step 3 : tsc + vitest** → PASS. **Step 4 : commit** — `feat(crm): navigation par onglets sur prospects + prospection (retrait nav redondante)`

---

## Task 4 : Vérification

- [ ] **Step 1 : tsc** — `npx tsc --noEmit` → PASS.
- [ ] **Step 2 : vitest** — `npx vitest run` → PASS.
- [ ] **Step 3 : test manuel** :
  - [ ] Les 3 pages prospects montrent la barre (Kanban/Liste/Portefeuille), la courante surlignée ; `/prospects` (Kanban) actif ≠ `/prospects/liste`.
  - [ ] Les 3 modules prospection montrent la barre « Prospection » + la phrase du module courant ; navigation OK.
  - [ ] Plus de double navigation (fil d'Ariane portfolio retiré).
- [ ] **Step 4 : pas de commit** (validation).

---

## Self-Review (effectué)

- **Couverture spec :** `ProspectsViewTabs` (T1) ; `ProspectionTabs` + hint (T2) ; montage 6 pages + retrait redondances (T3) ; actif par pathname exact (composants). Pas de migration. ✅
- **Placeholders :** composants complets ; montage décrit précisément par fichier avec consignes de retrait ciblées.
- **Cohérence des types :** composants sans props (pas de contrat à croiser) ; `usePathname`/`cn` importés correctement.
