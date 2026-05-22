# Refonte UX de la page Finances — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre l'UI de l'onglet Finances de la fiche formation (« Polish ciblé ») — sections vides masquées, KPIs corrigés, actions de ligne consolidées, charges repliables — sans toucher la base de données ni les routes API.

**Architecture:** On extrait des helpers purs testables (`finances-display.ts`) puis 5 sous-composants React (`_components/finances/`), et on recâble enfin `TabFinances.tsx` pour les utiliser. Les composants sont assemblés du plus bas niveau au plus haut (helper → KpiBand / ActionsMenu → Row → Section → Charges → recâblage).

**Tech Stack:** Next.js 14, React, TypeScript strict, Tailwind, shadcn/ui (`dropdown-menu`, `progress` déjà présents), Vitest (environnement `node` — pas de tests de composant, cf. spec §7).

**Spec :** `docs/superpowers/specs/2026-05-21-page-finances-refonte-design.md`

**Branche :** `feat/page-finances-refonte`

---

## File Structure

- `src/lib/utils/finances-display.ts` — **créé.** Types partagés (`Invoice`, `Charge`, `Stats`) + helpers purs : `getInvoiceRowActions`, `getDefaultRecipientType`, `computeMargin`.
- `src/lib/utils/__tests__/finances-display.test.ts` — **créé.** Tests des 3 helpers.
- `src/app/(dashboard)/admin/formations/[id]/_components/finances/FinancesKpiBand.tsx` — **créé.** Zone 1 (4 cartes KPI).
- `.../finances/InvoiceActionsMenu.tsx` — **créé.** Zone 4 (bouton contextuel + menu ⋯).
- `.../finances/InvoiceRow.tsx` — **créé.** Zone 4 (une ligne de facture).
- `.../finances/InvoiceSection.tsx` — **créé.** Zone 3 (section par type, masquée si vide).
- `.../finances/ChargesPanel.tsx` — **créé.** Zone 5 (charges + marge repliables).
- `.../_components/TabFinances.tsx` — **modifié.** Recâblage : utilise les composants, barre d'action unique, sections masquées, état vide, déclencheur du picker corrigé (§4.1), type par défaut (§4.2).

**Convention de test :** l'environnement Vitest est `node` sans React Testing Library — **les composants ne sont pas testés unitairement** (spec §7). Seuls les helpers purs de Task 1 ont des tests. Les tâches de composant se vérifient par `npx tsc --noEmit` + suite Vitest verte.

---

## Task 1 : Helpers purs + types — `finances-display.ts`

**Files:**
- Create: `src/lib/utils/finances-display.ts`
- Create: `src/lib/utils/__tests__/finances-display.test.ts`

- [ ] **Step 1 : Écrire les tests**

Créer `src/lib/utils/__tests__/finances-display.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import {
  getInvoiceRowActions,
  getDefaultRecipientType,
  computeMargin,
} from "@/lib/utils/finances-display";

describe("getInvoiceRowActions", () => {
  it("pending : primaire email, menu pdf/markPaid/edit/avoir", () => {
    expect(getInvoiceRowActions({ status: "pending", is_avoir: false })).toEqual({
      primary: "email",
      menu: ["pdf", "markPaid", "edit", "avoir"],
    });
  });

  it("sent : primaire markPaid, menu pdf/email/avoir", () => {
    expect(getInvoiceRowActions({ status: "sent", is_avoir: false })).toEqual({
      primary: "markPaid",
      menu: ["pdf", "email", "avoir"],
    });
  });

  it("late : même traitement que sent", () => {
    expect(getInvoiceRowActions({ status: "late", is_avoir: false }).primary).toBe("markPaid");
  });

  it("paid : primaire pdf, jamais markPaid", () => {
    const a = getInvoiceRowActions({ status: "paid", is_avoir: false });
    expect(a.primary).toBe("pdf");
    expect(a.menu).not.toContain("markPaid");
  });

  it("cancelled : ni avoir ni edit", () => {
    const a = getInvoiceRowActions({ status: "cancelled", is_avoir: false });
    expect(a.menu).not.toContain("avoir");
    expect(a.menu).not.toContain("edit");
  });

  it("avoir : pdf + email uniquement, quel que soit le statut", () => {
    expect(getInvoiceRowActions({ status: "sent", is_avoir: true })).toEqual({
      primary: "pdf",
      menu: ["email"],
    });
  });

  it("edit réservé aux factures pending (règle H7)", () => {
    for (const status of ["sent", "late", "paid", "cancelled"]) {
      expect(getInvoiceRowActions({ status, is_avoir: false }).menu).not.toContain("edit");
    }
  });
});

describe("getDefaultRecipientType", () => {
  it("company si des entreprises sont liées", () => {
    expect(getDefaultRecipientType({ formation_companies: [{}], formation_financiers: [] })).toBe("company");
  });

  it("financier si pas d'entreprise mais des financeurs", () => {
    expect(getDefaultRecipientType({ formation_companies: [], formation_financiers: [{}] })).toBe("financier");
  });

  it("learner si ni entreprise ni financeur", () => {
    expect(getDefaultRecipientType({ formation_companies: [], formation_financiers: [] })).toBe("learner");
  });

  it("learner si les listes sont absentes", () => {
    expect(getDefaultRecipientType({})).toBe("learner");
  });
});

describe("computeMargin", () => {
  it("marge = facturé − charges", () => {
    expect(computeMargin({ total_invoiced: 12300, total_charges: 1200 })).toBe(11100);
  });

  it("marge négative possible", () => {
    expect(computeMargin({ total_invoiced: 500, total_charges: 800 })).toBe(-300);
  });

  it("arrondi à 2 décimales", () => {
    expect(computeMargin({ total_invoiced: 100.005, total_charges: 0 })).toBe(100.01);
  });
});
```

- [ ] **Step 2 : Lancer les tests → échec attendu**

Run: `npx vitest run src/lib/utils/__tests__/finances-display.test.ts`
Expected: FAIL — `finances-display` n'existe pas (`Failed to resolve import`).

- [ ] **Step 3 : Créer `finances-display.ts`**

Créer `src/lib/utils/finances-display.ts` :

```ts
// Helpers d'affichage de l'onglet Finances (fiche formation).
// Fonctions pures — cf. spec docs/superpowers/specs/2026-05-21-page-finances-refonte-design.md

/** Une facture telle que renvoyée par l'API /invoices. */
export interface Invoice {
  id: string;
  recipient_type: string;
  recipient_id: string;
  recipient_name: string;
  amount: number;
  prefix: string;
  number: number;
  global_number: number;
  fiscal_year: number;
  reference: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  is_avoir: boolean;
  parent_invoice_id: string | null;
  created_at: string;
  reminder_count?: number;
  auto_generated?: boolean;
  external_reference?: string | null;
}

/** Une charge de formation. */
export interface Charge {
  id: string;
  label: string;
  amount: number;
  created_at: string;
}

/** Agrégats financiers renvoyés par l'API /invoices. */
export interface Stats {
  total_invoiced: number;
  total_paid: number;
  total_pending: number;
  total_late: number;
  total_charges: number;
}

/** Identifiant d'une action de ligne de facture. */
export type InvoiceActionId = "pdf" | "email" | "markPaid" | "edit" | "avoir";

export interface InvoiceRowActions {
  /** Action mise en avant (bouton visible). */
  primary: InvoiceActionId;
  /** Actions reléguées au menu « ⋯ ». */
  menu: InvoiceActionId[];
}

/**
 * Action primaire + contenu du menu « ⋯ » d'une facture, selon son statut.
 * Respecte la règle serveur H7 : « edit » n'est proposé que sur les factures
 * `pending`. Cf. spec §4.3.
 */
export function getInvoiceRowActions(
  invoice: Pick<Invoice, "status" | "is_avoir">,
): InvoiceRowActions {
  if (invoice.is_avoir) {
    return { primary: "pdf", menu: ["email"] };
  }
  switch (invoice.status) {
    case "pending":
      return { primary: "email", menu: ["pdf", "markPaid", "edit", "avoir"] };
    case "sent":
    case "late":
      return { primary: "markPaid", menu: ["pdf", "email", "avoir"] };
    case "paid":
      return { primary: "pdf", menu: ["email", "avoir"] };
    case "cancelled":
      return { primary: "pdf", menu: ["email"] };
    default:
      return { primary: "pdf", menu: ["email"] };
  }
}

/**
 * Type de destinataire par défaut à l'ouverture du dialogue de création :
 * entreprise si la formation en a, sinon financeur, sinon apprenant.
 * Cf. spec §4.2.
 */
export function getDefaultRecipientType(formation: {
  formation_companies?: unknown[] | null;
  formation_financiers?: unknown[] | null;
}): "company" | "financier" | "learner" {
  if ((formation.formation_companies ?? []).length > 0) return "company";
  if ((formation.formation_financiers ?? []).length > 0) return "financier";
  return "learner";
}

/** Marge = Facturé − Charges, arrondie à 2 décimales. Cf. spec §4.7. */
export function computeMargin(
  stats: Pick<Stats, "total_invoiced" | "total_charges">,
): number {
  return Math.round((stats.total_invoiced - stats.total_charges) * 100) / 100;
}
```

- [ ] **Step 4 : Lancer les tests → succès attendu**

Run: `npx vitest run src/lib/utils/__tests__/finances-display.test.ts`
Expected: PASS — 14 tests verts.

- [ ] **Step 5 : Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/utils/finances-display.ts src/lib/utils/__tests__/finances-display.test.ts
git commit -m "feat(finances): helpers purs finances-display + types partages"
```

---

## Task 2 : Composant `FinancesKpiBand`

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/finances/FinancesKpiBand.tsx`

Composant React de présentation. Pas de test unitaire (cf. convention de test ci-dessus).

- [ ] **Step 1 : Créer le composant**

Créer `src/app/(dashboard)/admin/formations/[id]/_components/finances/FinancesKpiBand.tsx` :

```tsx
import { formatCurrency } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import type { Stats } from "@/lib/utils/finances-display";

interface Props {
  stats: Stats;
  /** Objectif de facturation (`formation.total_price`), ou null si absent. */
  objectif: number | null;
}

/** Zone 1 du spec : 4 cartes d'indicateurs financiers. */
export function FinancesKpiBand({ stats, objectif }: Props) {
  const pct =
    objectif && objectif > 0
      ? Math.min(100, (stats.total_invoiced / objectif) * 100)
      : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="border rounded-lg p-3">
        <p className="text-sm font-medium text-gray-600">Facturé</p>
        <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.total_invoiced)}</p>
        {pct !== null && objectif !== null && (
          <div className="mt-2">
            <Progress value={pct} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">
              sur {formatCurrency(objectif)} objectif
            </p>
          </div>
        )}
      </div>
      <div className="border rounded-lg p-3">
        <p className="text-sm font-medium text-gray-600">Encaissé</p>
        <p className="text-2xl font-bold text-green-700">{formatCurrency(stats.total_paid)}</p>
      </div>
      <div className="border rounded-lg p-3">
        <p className="text-sm font-medium text-gray-600">En attente</p>
        <p className="text-2xl font-bold text-amber-600">{formatCurrency(stats.total_pending)}</p>
      </div>
      <div className="border rounded-lg p-3">
        <p className="text-sm font-medium text-gray-600">En retard</p>
        <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.total_late)}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/finances/FinancesKpiBand.tsx"
git commit -m "feat(finances): composant FinancesKpiBand (zone 1 — KPIs)"
```

---

## Task 3 : Composant `InvoiceActionsMenu`

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceActionsMenu.tsx`

Utilise `getInvoiceRowActions` (Task 1) et le composant shadcn `dropdown-menu` (déjà présent dans `src/components/ui/`).

- [ ] **Step 1 : Créer le composant**

Créer `src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceActionsMenu.tsx` :

```tsx
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileDown, Send, CheckCircle, Pencil, Undo2, MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import {
  getInvoiceRowActions,
  type InvoiceActionId,
  type Invoice,
} from "@/lib/utils/finances-display";

export interface InvoiceActionHandlers {
  onDownloadPdf: (inv: Invoice) => void;
  onSendEmail: (inv: Invoice) => void;
  onMarkPaid: (inv: Invoice) => void;
  onEdit: (inv: Invoice) => void;
  onCreateAvoir: (inv: Invoice) => void;
}

interface Props extends InvoiceActionHandlers {
  invoice: Invoice;
}

const ACTION_META: Record<
  InvoiceActionId,
  { label: string; short: string; icon: LucideIcon }
> = {
  pdf: { label: "Télécharger le PDF", short: "PDF", icon: FileDown },
  email: { label: "Envoyer par email", short: "Envoyer", icon: Send },
  markPaid: { label: "Marquer payée", short: "Marquer payée", icon: CheckCircle },
  edit: { label: "Modifier", short: "Modifier", icon: Pencil },
  avoir: { label: "Créer un avoir", short: "Créer un avoir", icon: Undo2 },
};

/** Zone 4 du spec : bouton d'action contextuel + menu « ⋯ », adaptés au statut. */
export function InvoiceActionsMenu({ invoice, ...handlers }: Props) {
  const { primary, menu } = getInvoiceRowActions(invoice);

  const run = (id: InvoiceActionId) => {
    if (id === "pdf") handlers.onDownloadPdf(invoice);
    else if (id === "email") handlers.onSendEmail(invoice);
    else if (id === "markPaid") handlers.onMarkPaid(invoice);
    else if (id === "edit") handlers.onEdit(invoice);
    else if (id === "avoir") handlers.onCreateAvoir(invoice);
  };

  const PrimaryIcon = ACTION_META[primary].icon;

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => run(primary)}>
        <PrimaryIcon className="h-3.5 w-3.5 mr-1" />
        {ACTION_META[primary].short}
      </Button>
      {menu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Plus d'actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menu.map((id) => {
              const Icon = ACTION_META[id].icon;
              return (
                <DropdownMenuItem key={id} onClick={() => run(id)}>
                  <Icon className="h-4 w-4 mr-2" />
                  {ACTION_META[id].label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceActionsMenu.tsx"
git commit -m "feat(finances): composant InvoiceActionsMenu (bouton contextuel + menu)"
```

---

## Task 4 : Composant `InvoiceRow`

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceRow.tsx`

Utilise `InvoiceActionsMenu` (Task 3).

- [ ] **Step 1 : Créer le composant**

Créer `src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceRow.tsx` :

```tsx
import { Badge } from "@/components/ui/badge";
import { InvoiceActionsMenu, type InvoiceActionHandlers } from "./InvoiceActionsMenu";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/lib/utils/finances-display";

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-gray-100 text-gray-700" },
  sent: { label: "Envoyée", className: "bg-blue-100 text-blue-700" },
  paid: { label: "Payée", className: "bg-green-100 text-green-700" },
  late: { label: "En retard", className: "bg-red-100 text-red-700" },
  cancelled: { label: "Annulée", className: "bg-gray-100 text-gray-500 line-through" },
};

interface Props extends InvoiceActionHandlers {
  invoice: Invoice;
}

/** Zone 4 du spec : une ligne de facture lisible. */
export function InvoiceRow({ invoice, ...handlers }: Props) {
  const badge = STATUS_BADGES[invoice.status] ?? STATUS_BADGES.pending;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">
        {invoice.reference}
      </span>
      <span className="flex-1 min-w-0 font-medium text-sm text-gray-900 truncate">
        {invoice.recipient_name}
        {invoice.is_avoir && (
          <Badge variant="outline" className="ml-1.5 text-[10px] border-purple-300 text-purple-600">
            AV
          </Badge>
        )}
      </span>
      <span
        className={`text-sm font-semibold w-24 text-right shrink-0 ${
          invoice.is_avoir ? "text-purple-600" : "text-gray-900"
        }`}
      >
        {formatCurrency(invoice.amount)}
      </span>
      <span className="w-36 shrink-0">
        <Badge className={`${badge.className} text-[11px]`}>{badge.label}</Badge>
        {invoice.due_date && (
          <span className="block text-[11px] text-muted-foreground mt-0.5">
            échéance {new Date(invoice.due_date).toLocaleDateString("fr-FR")}
          </span>
        )}
      </span>
      <span className="w-52 shrink-0">
        <InvoiceActionsMenu invoice={invoice} {...handlers} />
      </span>
    </div>
  );
}
```

- [ ] **Step 2 : Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceRow.tsx"
git commit -m "feat(finances): composant InvoiceRow (ligne de facture)"
```

---

## Task 5 : Composant `InvoiceSection`

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceSection.tsx`

Utilise `InvoiceRow` (Task 4). **Retourne `null` si la section n'a aucune facture** (spec §3, zone 3 — sections vides masquées).

- [ ] **Step 1 : Créer le composant**

Créer `src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceSection.tsx` :

```tsx
import { InvoiceRow } from "./InvoiceRow";
import type { InvoiceActionHandlers } from "./InvoiceActionsMenu";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/lib/utils/finances-display";

interface Props extends InvoiceActionHandlers {
  title: string;
  icon: string;
  /** Factures déjà filtrées sur ce type de destinataire. */
  invoices: Invoice[];
}

/** Zone 3 du spec : section par type. Masquée (`null`) si aucune facture. */
export function InvoiceSection({ title, icon, invoices, ...handlers }: Props) {
  if (invoices.length === 0) return null;

  // Total = factures hors avoirs (cohérent avec les KPIs).
  const total = invoices
    .filter((i) => !i.is_avoir)
    .reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2 border-b-2 border-gray-200 pb-1.5">
        <h3 className="text-sm font-bold text-gray-800">
          {icon} {title}
        </h3>
        <span className="text-xs font-medium text-muted-foreground">
          {invoices.length} facture{invoices.length > 1 ? "s" : ""}
        </span>
        <span className="ml-auto text-sm font-semibold text-gray-600">
          {formatCurrency(total)}
        </span>
      </div>
      {invoices.map((inv) => (
        <InvoiceRow key={inv.id} invoice={inv} {...handlers} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2 : Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceSection.tsx"
git commit -m "feat(finances): composant InvoiceSection (section masquee si vide)"
```

---

## Task 6 : Composant `ChargesPanel`

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/finances/ChargesPanel.tsx`

Bloc repliable (état interne `useState`, pas de composant shadcn `Collapsible`). Gère son propre formulaire d'ajout ; expose `onAddCharge` / `onDeleteCharge`.

- [ ] **Step 1 : Créer le composant**

Créer `src/app/(dashboard)/admin/formations/[id]/_components/finances/ChargesPanel.tsx` :

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, ChevronDown, Trash2, Plus, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { computeMargin, type Charge } from "@/lib/utils/finances-display";

interface Props {
  charges: Charge[];
  totalInvoiced: number;
  totalCharges: number;
  /** Insère une charge ; rejette en cas d'erreur (le panneau affiche l'état). */
  onAddCharge: (label: string, amount: number) => Promise<void>;
  onDeleteCharge: (id: string) => void;
}

/** Zone 5 du spec : charges + marge, repliables (repliées par défaut). */
export function ChargesPanel({
  charges,
  totalInvoiced,
  totalCharges,
  onAddCharge,
  onDeleteCharge,
}: Props) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const margin = computeMargin({
    total_invoiced: totalInvoiced,
    total_charges: totalCharges,
  });

  const handleAdd = async () => {
    const parsed = parseFloat(amount);
    if (!label.trim() || isNaN(parsed) || parsed <= 0) return;
    setSaving(true);
    try {
      await onAddCharge(label.trim(), parsed);
      setLabel("");
      setAmount("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm"
      >
        <span className="flex items-center gap-2 font-medium text-gray-700">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Charges &amp; marge
        </span>
        <span className="text-muted-foreground">
          Marge {formatCurrency(margin)} · {charges.length} charge
          {charges.length > 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          {charges.length > 0 && (
            <table className="w-full text-sm">
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5">{c.label}</td>
                    <td className="py-1.5 text-right font-medium">{formatCurrency(c.amount)}</td>
                    <td className="py-1.5 text-right w-8">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-500"
                        onClick={() => onDeleteCharge(c.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="flex items-center gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Libellé de la charge…"
              className="h-8 text-sm flex-1 max-w-[220px]"
            />
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Montant"
              className="h-8 text-sm w-28"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={handleAdd}
              disabled={saving || !label.trim() || !amount}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3 mr-1" />
              )}
              Ajouter
            </Button>
          </div>

          <div className="flex justify-between text-sm border-t pt-2">
            <span className="text-muted-foreground">Marge (Facturé − Charges)</span>
            <span className={`font-bold ${margin >= 0 ? "text-green-700" : "text-red-600"}`}>
              {formatCurrency(margin)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/finances/ChargesPanel.tsx"
git commit -m "feat(finances): composant ChargesPanel (charges + marge repliables)"
```

---

## Task 7 : Recâbler `TabFinances.tsx`

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx`

Cette tâche remplace le corps de rendu de la page par les nouveaux composants, corrige le déclencheur du picker (§4.1) et applique le type par défaut (§4.2). Les dialogues (Créer une facture, picker entreprise, aperçu auto-génération, import) sont **conservés**.

- [ ] **Step 1 : Imports + types partagés**

Dans `TabFinances.tsx`, après la ligne `import { getFormationKind, getLearnersForCompany, getAmountForCompany } from "@/lib/utils/formation-companies";`, ajouter :

```tsx
import { getDefaultRecipientType, type Invoice, type Charge, type Stats } from "@/lib/utils/finances-display";
import { FinancesKpiBand } from "./finances/FinancesKpiBand";
import { InvoiceSection } from "./finances/InvoiceSection";
import { ChargesPanel } from "./finances/ChargesPanel";
```

Puis **supprimer les interfaces locales `Invoice`, `Charge` et `Stats`** déclarées en tête de fichier — elles sont désormais importées depuis `finances-display.ts`. Toutes leurs utilisations existantes dans le fichier restent valides (mêmes champs).

- [ ] **Step 2 : Retirer l'état du formulaire de charge devenu interne à `ChargesPanel`**

Supprimer le bloc `// Inline charge form` et ses 3 `useState` (`chargeLabel`, `chargeAmount`, `savingCharge`) — ils vivent désormais dans `ChargesPanel`.

- [ ] **Step 3 : Remplacer `handleCreateCharge` par `handleAddCharge`**

Remplacer toute la fonction `handleCreateCharge` (de `const handleCreateCharge = async () => {` à son `};`) par :

```tsx
  // ── Add charge ── (le formulaire est porté par ChargesPanel)

  const handleAddCharge = async (label: string, amount: number): Promise<void> => {
    try {
      const { error } = await supabase.from("formation_charges").insert({
        session_id: formation.id,
        entity_id: formation.entity_id,
        label,
        amount,
      });
      if (error) throw error;
      toast({ title: "Charge ajoutée" });
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible d'ajouter la charge";
      toast({ title: "Erreur", description: message, variant: "destructive" });
      throw err; // ChargesPanel doit savoir que l'ajout a échoué.
    }
  };
```

- [ ] **Step 4 : Ajouter `handleRecipientTypeChange` et `openCreateInvoice`**

Juste **avant** le `useEffect` qui ouvre le picker (le bloc commenté `// Auto-pré-remplit la facture à l'ouverture…`), insérer ces deux fonctions :

```tsx
  // Crée un formulaire de facture vierge (fonction → `lines` jamais partagé).
  const createEmptyInvoiceForm = () => ({
    recipient_type: "learner",
    recipient_name: "",
    recipient_id: "",
    recipient_siret: "",
    recipient_address: "",
    due_date: "",
    notes: "",
    external_reference: "",
    funding_type: "",
    lines: [{ description: "", quantity: "1", unit_price: "" }],
  });

  // Ouvre le dialogue de création (le useEffect ci-dessous applique le
  // type par défaut + déclenche picker/préremplissage — spec §4.1/§4.2).
  const openCreateInvoice = () => {
    setEditingInvoiceId(null);
    setInvoiceForm(createEmptyInvoiceForm());
    setInvoiceDialog(true);
  };

  // Changement de type de destinataire (à l'ouverture du dialogue ET via le
  // Select). Spec §4.1 : le picker entreprise se déclenche ICI sur INTER,
  // plus à l'ouverture du dialogue.
  const handleRecipientTypeChange = (newType: string) => {
    setInvoiceForm((f) => ({
      ...f,
      recipient_type: newType,
      recipient_name: "",
      recipient_id: "",
      recipient_siret: "",
      recipient_address: "",
    }));
    const kind = getFormationKind(formation);
    if (newType === "company" && kind === "inter") {
      setCompanyPickerOpen(true);
    } else if (newType === "company" && kind === "intra") {
      setTimeout(() => prefillInvoiceLines("company"), 50);
    }
    // learner / financier : le préremplissage attend le choix du destinataire
    // précis (handleRecipientSelect s'en charge).
  };
```

- [ ] **Step 5 : Réécrire le `useEffect` d'ouverture du dialogue**

Remplacer **tout** le `useEffect` actuel (le bloc commenté `// Auto-pré-remplit la facture…` jusqu'à `}, [invoiceDialog, editingInvoiceId, formation.id]);`) par :

```tsx
  // À l'ouverture du dialogue (création), applique le type par défaut puis
  // délègue à handleRecipientTypeChange (picker INTER / préremplissage INTRA).
  useEffect(() => {
    if (invoiceDialog && !editingInvoiceId) {
      handleRecipientTypeChange(getDefaultRecipientType(formation));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceDialog, editingInvoiceId, formation.id]);
```

- [ ] **Step 6 : Brancher le `Select` de type sur `handleRecipientTypeChange`**

Dans le dialogue « Créer une facture », le `Select` du « Type de destinataire » a aujourd'hui :

```tsx
onValueChange={(v) => setInvoiceForm((f) => ({ ...f, recipient_type: v, recipient_siret: "", recipient_address: "" }))}
```

Le remplacer par :

```tsx
onValueChange={handleRecipientTypeChange}
```

- [ ] **Step 7 : Raccourcir les titres de `SECTION_CONFIG`**

Le titre de section est désormais préfixé par « Factures » via le titre de page. Remplacer `SECTION_CONFIG` (en tête de fichier) par :

```tsx
const SECTION_CONFIG = [
  { type: "learner", title: "Apprenants", icon: "👤" },
  { type: "company", title: "Entreprises", icon: "🏢" },
  { type: "financier", title: "Financeurs", icon: "🏛️" },
] as const;
```

- [ ] **Step 8 : Remplacer le corps de rendu**

Dans le `return (`, remplacer tout le bloc qui va du commentaire `{/* ═══ HERO ROW — Stats financières ═══ */}` jusqu'à la fermeture de la section Charges (le `</div>` qui ferme `{/* Charges */}`, juste avant `{/* Dialog -- Créer une facture avec lignes */}`) par :

```tsx
      {/* Zone 1 — Indicateurs */}
      <FinancesKpiBand stats={stats} objectif={formation.total_price ?? null} />

      {/* Zone 2 — Barre d'action */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Factures</h3>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setImportRecipientType("company"); setImportDialogOpen(true); }}
            className="text-sm text-muted-foreground hover:underline"
          >
            Importer une facture
          </button>
          <Button size="sm" onClick={openCreateInvoice}>
            <Plus className="h-4 w-4 mr-1" /> Créer une facture
          </Button>
        </div>
      </div>

      {/* Bandeau d'auto-génération (conditionnel — comportement inchangé) */}
      {canAutoGenerate && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">Formation terminée — aucune facture générée</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Génère automatiquement les factures selon le type de formation, les entreprises et financeurs liés.
            </p>
          </div>
          <Button size="sm" className="shrink-0" onClick={handlePreviewAutoGenerate} disabled={previewLoading}>
            {previewLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Générer les factures
          </Button>
        </div>
      )}

      {/* Zone 3 — Sections par type (vides masquées) ou état vide global */}
      {invoices.length === 0 ? (
        <div className="text-center py-10 border border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground">Aucune facture pour cette formation.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={openCreateInvoice}>
            <Plus className="h-4 w-4 mr-1" /> Créer une facture
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {SECTION_CONFIG.map(({ type, title, icon }) => (
            <InvoiceSection
              key={type}
              title={title}
              icon={icon}
              invoices={invoices.filter((i) => i.recipient_type === type)}
              onDownloadPdf={handleDownloadPdf}
              onSendEmail={handleSendInvoiceEmail}
              onMarkPaid={(inv) => handleUpdateStatus(inv.id, "paid")}
              onEdit={handleEditInvoice}
              onCreateAvoir={(inv) => handleCreateInvoice(true, inv)}
            />
          ))}
        </div>
      )}

      {/* Zone 5 — Charges & marge */}
      <ChargesPanel
        charges={charges}
        totalInvoiced={stats.total_invoiced}
        totalCharges={stats.total_charges}
        onAddCharge={handleAddCharge}
        onDeleteCharge={handleDeleteCharge}
      />
```

Les dialogues qui suivent (`{/* Dialog -- Créer une facture… */}`, picker, aperçu, import) restent **inchangés**.

- [ ] **Step 9 : Retirer le code mort de `TabFinances.tsx`**

L'ancien rendu (remplacé au Step 8) était le seul à utiliser plusieurs déclarations. Les retirer, sinon `npm run lint` (ESLint `no-unused-vars`) échoue :

- Remplacer la ligne d'import `lucide-react` par exactement :

```tsx
import { Plus, Trash2, Loader2 } from "lucide-react";
```

`Plus`, `Trash2` (bouton de suppression d'une ligne produit, conservé dans le dialogue) et `Loader2` restent utilisés. `CheckCircle`, `Undo2`, `FileDown`, `Send`, `Upload`, `Eye`, `Pencil` ne le sont plus — leur logique est passée dans les sous-composants.

- Supprimer les constantes `STATUS_BADGES` et `REMINDER_BADGES` (en tête de fichier) : seul l'ancien rendu des lignes les utilisait. `InvoiceRow` porte sa propre copie de `STATUS_BADGES`.

- [ ] **Step 10 : Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur. Si une erreur « is declared but its value is never read » apparaît, retirer le symbole concerné (Step 9) et relancer.

- [ ] **Step 11 : Lint + suite de tests complète**

Run: `npm run lint`
Expected: aucune erreur (notamment aucun import ni variable inutilisé).

Run: `npx vitest run`
Expected: toute la suite verte (404 tests initiaux + 14 nouveaux de Task 1).

- [ ] **Step 12 : Commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx"
git commit -m "feat(finances): recablage TabFinances — composants, picker INTER, type par defaut"
```

---

## Task 8 : Vérification finale

**Files:** aucun (vérification uniquement).

- [ ] **Step 1 : Typecheck global** — Run: `npx tsc --noEmit -p tsconfig.json`. Expected: aucune erreur.

- [ ] **Step 2 : Lint + suite complète** — Run: `npm run lint` (aucune erreur) puis `npx vitest run` (toute la suite verte).

- [ ] **Step 3 : Recherche de résidus** — Run: `grep -n "chargeLabel\|chargeAmount\|savingCharge\|handleCreateCharge" "src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx"`. Expected: aucun résultat (l'ancien état de charge a bien été retiré).

- [ ] **Step 4 : Revue manuelle (après déploiement) — critères de succès du spec §8 :**
  - Une formation sans facture affiche l'état vide « Aucune facture pour cette formation ».
  - Les sections sans facture ne s'affichent pas ; seules les sections peuplées apparaissent.
  - Un seul bouton « + Créer une facture » ; « Importer » est un lien discret.
  - KPIs visibles : Facturé (avec barre) / Encaissé / En attente / En retard.
  - Chaque ligne : un bouton contextuel + un menu « ⋯ » adapté au statut (« Modifier » seulement sur les `pending`).
  - Bloc « Charges & marge » replié par défaut ; déplié → tableau + ajout + marge.
  - Formation **INTER** : « + Créer une facture » → choisir le type « Entreprise » ouvre le picker ; choisir « Apprenant »/« Financeur » ne l'ouvre pas.
  - Formation **INTRA** : « + Créer une facture » pré-remplit l'unique entreprise sans picker.
  - Non-régression : création, édition (pending), auto-génération, export PDF, envoi email, création d'avoir.
