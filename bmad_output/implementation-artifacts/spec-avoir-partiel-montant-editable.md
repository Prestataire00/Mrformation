---
title: 'Avoir partiel — montant éditable à la création'
type: 'feature'
created: '2026-07-03'
status: 'done'
baseline_commit: '4c38643a3934483425dca1ed7382920f50439f79'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Loris ne peut pas créer un **avoir partiel**. Dans `TabFinances.tsx`, cliquer « Avoir » sur une facture crée directement un avoir au **montant PLEIN** du parent (`amount = -Math.abs(parentInvoice.amount)`), sans champ éditable ; et passer par « créer une facture » avec un montant négatif est bloqué (`amount <= 0`). Cas réel : C3V, avoir AV-26-1.

**Approach:** À la création d'un avoir, ouvrir un **petit dialog** avec un **champ montant éditable** (défaut = montant de la facture parent, modifiable), valider `0 < montant ≤ montant parent`, puis créer avec `amount = -abs(montant saisi)`. La route POST `/api/formations/[id]/invoices` accepte déjà `amount` — changement front + validation. Bonus (séparable) : l'avoir **hérite du `funding_type` du parent** (au lieu de `null`) pour se soustraire de la bonne ligne du Cadre C.

## Boundaries & Constraints

**Always:** `entity_id` inchangé (déjà géré par la route) ; zéro `any` ; validation du montant via un **helper/schéma Zod pur et testé** (`0 < montant ≤ parent`, gestion virgule/point) ; shadcn/ui pour le dialog ; le montant stocké reste **négatif** (`-abs(saisi)`) ; l'avoir garde `parent_invoice_id`, `is_avoir=true`, préfixe `AV`.

**Ask First:** inclure ou non l'héritage `funding_type` du parent (bonus). Défaut proposé : **inclus** (1 ligne, corrige la répartition Cadre C). Retirer si l'humain préfère un scope strict « montant ».

**Never:** ne pas autoriser un avoir > montant parent, ni ≤ 0 ; ne pas dé-bloquer les factures normales à montant négatif (garder le garde-fou `amount<=0`) ; pas de migration ; rester sur `main`, ne pas toucher les fichiers non liés.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Avoir partiel | facture parent 1000€, saisie 300 | avoir créé `amount = -300`, `funding_type` = celui du parent, ref `AV-…` | — |
| Défaut plein | clic « Avoir », pas de modif | champ pré-rempli à 1000 → avoir `-1000` | — |
| Montant > parent | parent 1000€, saisie 1200 | bouton « Créer » désactivé + message « ≤ 1000 € » | pas de création |
| Montant ≤ 0 / vide | saisie 0, -5, vide, « abc » | bouton désactivé + message | pas de création |
| Virgule décimale | saisie « 299,50 » | interprété 299.50 → avoir `-299.5` | — |

</frozen-after-approval>

## Code Map

- `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx` -- création d'avoir : `handleCreateInvoice(isAvoir, parentInvoice)` (~L424, `amount` ~L438), déclencheur `onCreateAvoir` (~L893), état `invoiceForm` (~L66)
- `src/lib/validations/` (ou `src/lib/utils/`) -- **créer** un helper/schéma pur `parseAvoirAmount(input, parentAmount)` (validation + parse)
- `src/lib/__tests__/` -- **créer** le test vitest du helper
- `src/app/api/formations/[id]/invoices/route.ts` -- (vérif seulement) le POST accepte déjà `amount` → aucun changement attendu

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/validations/avoir.ts` (ou utils) -- `parseAvoirAmount(input: string, parentAmount: number)` → `{ ok: true, amount: number } | { ok: false, error: string }` : normalise virgule→point, exige `0 < montant ≤ parentAmount`, arrondi 2 décimales -- pur, réutilisable, testable
- [ ] `src/lib/__tests__/avoir.test.ts` -- couvre la matrice I/O (partiel, plein, >parent, ≤0/vide/non-numérique, virgule)
- [ ] `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx` -- (a) état `avoirTarget: Invoice | null` + `avoirAmountInput: string` ; (b) `onCreateAvoir` (L893) ouvre le dialog (`setAvoirTarget(inv)`, `setAvoirAmountInput(String(inv.amount))`) au lieu de créer direct ; (c) **dialog avoir** (shadcn `Dialog`) : réf parent (lecture seule), `Input` montant éditable, message d'erreur via `parseAvoirAmount`, bouton « Créer l'avoir » désactivé si invalide ou `savingInvoice` ; (d) `handleCreateInvoice` accepte le montant validé → `amount = isAvoir ? -Math.abs(montantValidé) : invoiceSubtotal` (garde le garde-fou `!isAvoir && amount<=0`) ; (e) `funding_type: isAvoir ? (parentInvoice?.funding_type ?? null) : invoiceForm.funding_type || null` ; ferme le dialog + refresh au succès -- le montant éditable
- [ ] `src/app/api/formations/[id]/invoices/route.ts` -- vérifier (lecture) que `amount` négatif est bien persisté pour un avoir ; aucun changement si OK

**Acceptance Criteria:**
- Given une facture de 1000 €, when je clique « Avoir » et saisis 300, then un avoir de -300 € est créé (funding_type du parent), et il apparaît dans la liste.
- Given le dialog avoir ouvert, when je ne change rien, then le montant est pré-rempli au montant plein du parent.
- Given je saisis un montant > parent ou ≤ 0, when je regarde le bouton, then « Créer l'avoir » est désactivé avec un message clair ; aucune création.
- Given je saisis « 299,50 », when je valide, then l'avoir vaut -299,50 €.

## Design Notes

L'avoir est aujourd'hui créé sans dialog (bouton → `handleCreateInvoice(true, inv)` direct). On introduit un dialog **dédié** (ne pas réutiliser le gros dialog facture avec ses lignes) : réf parent + un seul champ montant. Le garde-fou `amount<=0` des factures normales reste (on ne débloque PAS les factures négatives — seul l'avoir passe par le chemin `isAvoir`). `funding_type` hérité du parent = correction de la répartition Cadre C (cf. deferred-work « avoirs »), séparable si l'humain le refuse au checkpoint.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur
- `npx vitest run src/lib/__tests__/avoir.test.ts` -- expected: helper vert ; suite complète inchangée

**Manual checks (if no CLI):**
- C3V : sur une facture existante, clic « Avoir » → dialog montant pré-rempli ; saisir un partiel < total → avoir créé au bon montant négatif, `funding_type` = celui de la facture ; tenter > total ou 0 → bouton désactivé.

## Suggested Review Order

**Validation (cœur)**

- Helper pur : parse + bornes `0 < montant ≤ parent` (strip milliers FR, format strict)
  [`avoir.ts:40`](../../src/lib/validations/avoir.ts#L40)
- Tests (matrice : partiel, plein, >parent, ≤0, « 1 000 », « 300xyz »)
  [`avoir.test.ts:4`](../../src/lib/validations/__tests__/avoir.test.ts#L4)

**Création**

- `handleCreateInvoice` : montant validé, `-abs`, funding hérité du parent, garde-fou factures négatives conservé
  [`TabFinances.tsx:428`](../../src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx#L428)

**UI**

- Clic « Avoir » ouvre le dialog (pré-rempli au montant plein)
  [`TabFinances.tsx:912`](../../src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx#L912)
- Dialog avoir : erreur live + bouton désactivé si invalide/en cours
  [`TabFinances.tsx:1002`](../../src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx#L1002)
