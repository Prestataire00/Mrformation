# Annulation de facture dans l'UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un admin d'annuler une facture erronée depuis l'UX (status `cancelled`), de façon conforme (numéro conservé, pas de suppression dure).

**Architecture:** Le back-end (PATCH `status='cancelled'`) et le badge « Annulée » existent déjà. On ajoute l'action côté UI : `cancel` dans le modèle d'actions piloté par `getInvoiceRowActions`, le handler `onCancel`, une confirmation via le composant `Dialog` shadcn dans `TabFinances`, et on exclut les annulées du `total_invoiced`.

**Tech Stack:** Next.js 14, TypeScript strict, shadcn/ui (Dialog, DropdownMenu), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-30-annulation-facture-ux-design.md`

---

## Pré-requis vérifiés (état actuel)

- `InvoiceActionId = "pdf" | "email" | "markPaid" | "edit" | "avoir"` dans `src/lib/utils/finances-display.ts:46`.
- `getInvoiceRowActions(invoice)` (même fichier, ~l.60) renvoie `{ primary, menu }` selon `status`. Cas actuel `cancelled` : `{ primary: "pdf", menu: ["email"] }`.
- `InvoiceActionsMenu` (`finances/InvoiceActionsMenu.tsx`) : `InvoiceActionHandlers` (5 handlers), `ACTION_META` (Record exhaustif), `run()` (dispatch Record exhaustif). Un id ajouté à l'union SANS entrée dans `ACTION_META` et `dispatch` = erreur de compilation (garde-fou).
- `InvoiceSection` (`finances/InvoiceSection.tsx:36`) relaie les handlers à `InvoiceRow` via `{...handlers}` → ajouter `onCancel` à `InvoiceActionHandlers` le propage automatiquement.
- `TabFinances` : `handleUpdateStatus(invoiceId, status)` (PATCH + toast + `fetchData()`) existe déjà ; rendu via `InvoiceSection` (~l.888) avec les 5 handlers ; utilise déjà `Dialog` (state `invoiceDialog`).
- `finances-display.test.ts` existe avec des tests `getInvoiceRowActions` à `toEqual` exact (donc l'ajout de `cancel` aux menus fait échouer les assertions existantes → à mettre à jour).
- Gates projet : `npx tsc --noEmit` + `npx vitest run` (lint ESLint 9 cassé, ne pas l'utiliser).

## File Structure

| Fichier | Action |
|---|---|
| `src/lib/utils/finances-display.ts` | +`"cancel"` à `InvoiceActionId` ; `getInvoiceRowActions` : ajoute `cancel` aux menus pending/sent/late/paid, et `cancelled` → lecture seule `{primary:"pdf", menu:[]}`. |
| `src/lib/utils/__tests__/finances-display.test.ts` | Met à jour les attentes des cas existants + ajoute un cas « menu contient cancel ». |
| `src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceActionsMenu.tsx` | +`onCancel` au type, +entrée `cancel` dans `ACTION_META` et `dispatch`. |
| `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx` | State `cancelTarget` + `Dialog` de confirmation + `onCancel={(inv)=>setCancelTarget(inv)}`. |
| `src/app/api/formations/[id]/invoices/route.ts` | `total_invoiced` exclut les `cancelled`. |

---

## Task 1 : modèle d'actions — ajouter `cancel` (TDD)

**Files:**
- Modify: `src/lib/utils/finances-display.ts`
- Test: `src/lib/utils/__tests__/finances-display.test.ts`

- [ ] **Step 1 : mettre à jour les tests (échoueront contre le code actuel)**

Dans `finances-display.test.ts`, mets les attentes `menu` des cas existants à ces valeurs EXACTES (ajout de `"cancel"`), et passe `cancelled` en lecture seule :

```ts
// pending
expect(getInvoiceRowActions({ status: "pending", is_avoir: false })).toEqual({
  primary: "email",
  menu: ["pdf", "markPaid", "edit", "avoir", "cancel"],
});
// sent
expect(getInvoiceRowActions({ status: "sent", is_avoir: false })).toEqual({
  primary: "markPaid",
  menu: ["pdf", "email", "avoir", "cancel"],
});
// late
expect(getInvoiceRowActions({ status: "late", is_avoir: false })).toEqual({
  primary: "markPaid",
  menu: ["pdf", "email", "avoir", "cancel"],
});
// paid : menu contient cancel
{
  const a = getInvoiceRowActions({ status: "paid", is_avoir: false });
  expect(a.primary).toBe("pdf");
  expect(a.menu).toContain("cancel");
}
// cancelled : lecture seule (aucune action de menu)
expect(getInvoiceRowActions({ status: "cancelled", is_avoir: false })).toEqual({
  primary: "pdf",
  menu: [],
});
// avoir : inchangé, pas de cancel
expect(getInvoiceRowActions({ status: "sent", is_avoir: true })).toEqual({
  primary: "pdf",
  menu: ["email"],
});
```

Adapte les blocs `it(...)` existants pour porter ces assertions (remplace les anciennes valeurs `menu`, conserve les libellés des `it`).

- [ ] **Step 2 : lancer les tests → échec attendu**

Run: `npx vitest run src/lib/utils/__tests__/finances-display.test.ts`
Expected: FAIL (les menus actuels n'ont pas `cancel`, et `cancelled` renvoie encore `menu:["email"]`).

- [ ] **Step 3 : implémenter**

Dans `finances-display.ts`, change l'union (l.46) :

```ts
export type InvoiceActionId = "pdf" | "email" | "markPaid" | "edit" | "avoir" | "cancel";
```

Puis le `switch` de `getInvoiceRowActions` (garde le `if (invoice.is_avoir)` au-dessus inchangé) :

```ts
  switch (invoice.status) {
    case "pending":
      return { primary: "email", menu: ["pdf", "markPaid", "edit", "avoir", "cancel"] };
    case "sent":
    case "late":
      return { primary: "markPaid", menu: ["pdf", "email", "avoir", "cancel"] };
    case "paid":
      return { primary: "pdf", menu: ["email", "avoir", "cancel"] };
    case "cancelled":
      return { primary: "pdf", menu: [] };
    default:
      return { primary: "pdf", menu: ["email"] };
  }
```

- [ ] **Step 4 : tests → vert**

Run: `npx vitest run src/lib/utils/__tests__/finances-display.test.ts`
Expected: PASS.

> Note : `tsc` sera ROUGE après cette tâche (l'union `cancel` n'a pas encore d'entrée dans `ACTION_META`/`dispatch` ni de handler `onCancel`) — c'est exactement le garde-fou d'exhaustivité. Résolu en Task 2.

- [ ] **Step 5 : commit**

```bash
git add src/lib/utils/finances-display.ts src/lib/utils/__tests__/finances-display.test.ts
git commit -m "feat(facture): action 'cancel' dans le modèle d'actions + cancelled lecture seule

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 : InvoiceActionsMenu — câbler l'action `cancel`

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceActionsMenu.tsx`

- [ ] **Step 1 : importer l'icône `Ban`**

Dans l'import `lucide-react` (l.8-11), ajoute `Ban` :

```tsx
import {
  FileDown, Send, CheckCircle, Pencil, Undo2, Ban, MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
```

- [ ] **Step 2 : ajouter `onCancel` au type des handlers**

```tsx
export interface InvoiceActionHandlers {
  onDownloadPdf: (inv: Invoice) => void;
  onSendEmail: (inv: Invoice) => void;
  onMarkPaid: (inv: Invoice) => void;
  onEdit: (inv: Invoice) => void;
  onCreateAvoir: (inv: Invoice) => void;
  onCancel: (inv: Invoice) => void;
}
```

- [ ] **Step 3 : ajouter l'entrée `cancel` à `ACTION_META`**

```tsx
  avoir: { label: "Créer un avoir", short: "Créer un avoir", icon: Undo2 },
  cancel: { label: "Annuler la facture", short: "Annuler", icon: Ban },
};
```

- [ ] **Step 4 : ajouter `cancel` au dispatch de `run()`**

```tsx
      avoir: () => handlers.onCreateAvoir(invoice),
      cancel: () => handlers.onCancel(invoice),
    };
    dispatch[id]();
```

- [ ] **Step 5 : type-check**

Run: `npx tsc --noEmit`
Expected: PASS pour `InvoiceActionsMenu.tsx` et `finances-display.ts`. Reste UNE erreur attendue : `TabFinances.tsx` ne fournit pas encore `onCancel` à `InvoiceSection` (prop requise) — résolu en Task 3. (Si tu veux un vert intermédiaire, enchaîne Task 3 avant de committer.)

- [ ] **Step 6 : commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceActionsMenu.tsx"
git commit -m "feat(facture): entrée 'Annuler la facture' dans le menu d'actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 : TabFinances — confirmation + câblage `onCancel`

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx`

- [ ] **Step 1 : s'assurer des imports `Dialog`**

En haut du fichier, vérifie que ces composants sont importés depuis `@/components/ui/dialog` (le fichier utilise déjà `Dialog`/`DialogContent` pour le formulaire facture). Ajoute ceux qui manquent à l'import existant : `DialogDescription`, `DialogFooter`. `Button` est déjà importé.

```tsx
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
```

- [ ] **Step 2 : ajouter le state `cancelTarget`**

À côté des autres `useState` (vers l.56, `const [invoices, setInvoices] = useState...`), ajoute :

```tsx
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
```

- [ ] **Step 3 : câbler `onCancel` sur `InvoiceSection`**

Dans le `SECTION_CONFIG.map(...)` qui rend `<InvoiceSection ... />` (vers l.888), ajoute la prop `onCancel` à côté de `onCreateAvoir` :

```tsx
              onEdit={handleEditInvoice}
              onCreateAvoir={(inv) => handleCreateInvoice(true, inv)}
              onCancel={(inv) => setCancelTarget(inv)}
```

- [ ] **Step 4 : ajouter le Dialog de confirmation**

Juste avant le `Dialog` existant du formulaire facture (ou à la fin du JSX retourné, au même niveau), ajoute :

```tsx
      <Dialog open={cancelTarget !== null} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler cette facture ?</DialogTitle>
            <DialogDescription>
              {cancelTarget
                ? `La facture restera dans le registre, marquée « Annulée », et son numéro est conservé.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Retour
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!cancelTarget) return;
                const id = cancelTarget.id;
                setCancelTarget(null);
                await handleUpdateStatus(id, "cancelled");
              }}
            >
              Annuler la facture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 5 : type-check + tests**

Run: `npx tsc --noEmit`
Expected: PASS (zéro erreur — `onCancel` est désormais fourni partout).

Run: `npx vitest run src/lib/utils/__tests__/finances-display.test.ts`
Expected: PASS.

- [ ] **Step 6 : commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx"
git commit -m "feat(facture): bouton Annuler + confirmation (Dialog) câblé sur le statut cancelled

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 : Stats — exclure les annulées du `total_invoiced`

**Files:**
- Modify: `src/app/api/formations/[id]/invoices/route.ts`

- [ ] **Step 1 : modifier le calcul (GET stats, ~l.50)**

Remplace :

```ts
    const total_invoiced = realInvoices.reduce((sum, i) => sum + Number(i.amount), 0);
```

par :

```ts
    const total_invoiced = realInvoices
      .filter((i) => i.status !== "cancelled")
      .reduce((sum, i) => sum + Number(i.amount), 0);
```

(`total_paid`/`total_pending`/`total_late` filtrent déjà par statut précis, donc déjà exempts des annulées.)

- [ ] **Step 2 : type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3 : commit**

```bash
git add "src/app/api/formations/[id]/invoices/route.ts"
git commit -m "fix(facture): exclure les factures annulées du total facturé

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 : vérification globale

**Files:** aucun (gates + test manuel)

- [ ] **Step 1 : type-check complet** — Run: `npx tsc --noEmit` → PASS, zéro erreur.
- [ ] **Step 2 : suite de tests** — Run: `npx vitest run` → PASS.
- [ ] **Step 3 : test manuel (entité C3V, local `npm run dev`)** :
  - [ ] Sur une facture `pending`/`sent`/`late`/`paid` : le menu « ⋯ » montre **« Annuler la facture »**.
  - [ ] Clic → **Dialog de confirmation** ; « Retour » ne change rien ; « Annuler la facture » → toast « Statut mis à jour », la facture passe au badge **« Annulée »** (barré) et la liste se rafraîchit.
  - [ ] Sur une facture **`cancelled`** : plus aucune action sauf le PDF (ni Annuler, ni Envoyer, ni Marquer payée).
  - [ ] Le bandeau **Total facturé** ne compte plus la facture annulée.
- [ ] **Step 4 : pas de commit** (validation seule).

---

## Self-Review (effectué)

- **Couverture spec :** back-end inchangé (PATCH déjà OK) ; action « Annuler » + confirmation (T2+T3) ; masquée si déjà cancelled + cancelled lecture seule (T1 `menu:[]` + T2 dispatch) ; `onCancel` ajouté au type (T2) ; câblage TabFinances (T3) ; `total_invoiced` exclut cancelled (T4) ; texte de confirmation conforme au spec (T3). ✅
- **Placeholders :** aucun — code complet à chaque step.
- **Cohérence des types :** `cancel` ajouté à `InvoiceActionId` (T1), `ACTION_META`+`dispatch`+`onCancel` (T2), fourni par `TabFinances` (T3) — exhaustivité garantie par les Record typés. `cancelTarget: Invoice | null` cohérent avec le type `Invoice` importé par TabFinances.
