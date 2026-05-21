# Génération unifiée des lignes de facture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les 4 logiques divergentes de génération des lignes de facture par une fonction pure unique `buildInvoiceLines`, corriger les bugs M3 (diviseur) et M4 (arrondi), et n'afficher la liste des apprenants sur le PDF qu'en Intra.

**Architecture:** Une fonction pure `buildInvoiceLines(formation, recipient)` dans `invoice-builder.ts` devient la source de vérité. On l'ajoute d'abord à côté de l'ancien helper (Task 1), on migre les 3 appelants un par un (Tasks 2-4), puis on supprime l'ancien helper (Task 5). À chaque tâche : `tsc` clean + suite verte → commit.

**Tech Stack:** TypeScript strict, Next.js 14, Vitest. Branche : `feat/facturation-lignes-unifiees`.

**Spec :** `docs/superpowers/specs/2026-05-21-facturation-lignes-unifiees-design.md`

**Règle métier (rappel) :** `learner` → 1 ligne nominative. `company`/`financier` en **Inter** → 1 ligne par participant (split équitable, reste sur la dernière). `company`/`financier` en **Intra**/`unset`/0 participant → 1 ligne globale. `buildInvoiceLines` ne lève jamais d'exception.

---

## File Structure

- `src/lib/utils/invoice-builder.ts` — `buildInvoiceLines` (nouvelle fonction, remplace `buildInvoiceLinesForCompany`).
- `src/lib/utils/__tests__/invoice-builder.test.ts` — tests de `buildInvoiceLines`.
- `src/app/api/formations/[id]/invoices/auto-generate/route.ts` — appelant n°1.
- `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx` — appelant n°2 (dialogue manuel) + `sessionLearners` Intra-only.
- `src/lib/services/invoices.ts` — appelant n°3 (`cascadeSessionPriceToPendingInvoices`).
- `src/lib/services/__tests__/invoices.test.ts` — test du cascade.

---

## Task 1 : `buildInvoiceLines` — la fonction unifiée + ses tests

**Files:**
- Modify: `src/lib/utils/invoice-builder.ts`
- Modify: `src/lib/utils/__tests__/invoice-builder.test.ts`

On AJOUTE `buildInvoiceLines` à côté de `buildInvoiceLinesForCompany` (gardé jusqu'à Task 5) — `tsc` reste vert, les appelants existants ne bougent pas encore.

- [ ] **Step 1 : Écrire les tests de `buildInvoiceLines`**

Dans `src/lib/utils/__tests__/invoice-builder.test.ts`, ajouter `buildInvoiceLines` à l'import existant (ligne 2-5) :

```ts
import {
  buildInvoiceLinesForCompany,
  buildInvoiceLines,
  calculateInvoiceTotals,
} from "@/lib/utils/invoice-builder";
```

Puis ajouter, **juste avant** la ligne `// calculateInvoiceTotals` (≈ ligne 200), ce bloc de tests :

```ts
// ──────────────────────────────────────────────
// buildInvoiceLines — fonction unifiée
// ──────────────────────────────────────────────

describe("buildInvoiceLines", () => {
  it("learner : 1 ligne nominative", () => {
    const enrollments = [makeEnrollment("e-1", "l-1", "client-A", "Dupont", "Jean")];
    const formation = makeSession({ title: "Sécurité", enrollments });
    const result = buildInvoiceLines(formation, { type: "learner", id: "l-1", amount: 800 });
    expect(result.lines).toEqual([
      { description: "Formation : Sécurité — DUPONT Jean", quantity: 1, unit_price: 800 },
    ]);
    expect(result.amountHT).toBe(800);
  });

  it("learner introuvable : 1 ligne sans nom", () => {
    const formation = makeSession({ title: "Sécurité", enrollments: [] });
    const result = buildInvoiceLines(formation, { type: "learner", id: "absent", amount: 500 });
    expect(result.lines).toEqual([
      { description: "Formation : Sécurité", quantity: 1, unit_price: 500 },
    ]);
  });

  it("entreprise INTRA (1 entreprise) : 1 ligne globale", () => {
    const fc = makeFormationCompany("fc-1", "client-A", 5000);
    const enrollments = [
      makeEnrollment("e-1", "l-1", "client-A", "Dupont", "Jean"),
      makeEnrollment("e-2", "l-2", "client-A", "Martin", "Marie"),
    ];
    const formation = makeSession({ title: "Sécurité", formation_companies: [fc], enrollments });
    const result = buildInvoiceLines(formation, { type: "company", id: "client-A", amount: 5000 });
    expect(result.lines).toEqual([
      { description: "Formation : Sécurité", quantity: 1, unit_price: 5000 },
    ]);
    expect(result.amountHT).toBe(5000);
  });

  it("entreprise INTER (2+ entreprises) : 1 ligne par apprenant de l'entreprise", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", 3000);
    const fcB = makeFormationCompany("fc-2", "client-B", 5000);
    const enrollments = [
      makeEnrollment("e-1", "l-1", "client-A", "Dupont", "Jean"),
      makeEnrollment("e-2", "l-2", "client-A", "Martin", "Marie"),
      makeEnrollment("e-3", "l-3", "client-A", "Durand", "Paul"),
      makeEnrollment("e-4", "l-4", "client-B", "Autre", "Emma"),
    ];
    const formation = makeSession({ title: "Sécurité", formation_companies: [fcA, fcB], enrollments });
    const result = buildInvoiceLines(formation, { type: "company", id: "client-A", amount: 3000 });
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0].description).toBe("Formation : Sécurité — DUPONT Jean");
    expect(result.amountHT).toBe(3000);
  });

  it("INTER : reste d'arrondi absorbé sur la dernière ligne (somme exacte)", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", 1000);
    const fcB = makeFormationCompany("fc-2", "client-B", 500);
    const enrollments = [
      makeEnrollment("e-1", "l-1", "client-A", "A", "A"),
      makeEnrollment("e-2", "l-2", "client-A", "B", "B"),
      makeEnrollment("e-3", "l-3", "client-A", "C", "C"),
      makeEnrollment("e-4", "l-4", "client-B", "X", "X"),
    ];
    const formation = makeSession({ formation_companies: [fcA, fcB], enrollments });
    const result = buildInvoiceLines(formation, { type: "company", id: "client-A", amount: 1000 });
    expect(result.lines).toHaveLength(3);
    const total = result.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    expect(total).toBeCloseTo(1000, 2);
    expect(result.amountHT).toBeCloseTo(1000, 2);
  });

  it("M3 — INTER avec un enrollment sans learner : diviseur = apprenants réels, somme exacte", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", 900);
    const fcB = makeFormationCompany("fc-2", "client-B", 100);
    const broken = { ...makeEnrollment("e-x", "l-x", "client-A", "X", "X"), learner: null } as unknown as Enrollment;
    const enrollments = [
      makeEnrollment("e-1", "l-1", "client-A", "A", "A"),
      makeEnrollment("e-2", "l-2", "client-A", "B", "B"),
      makeEnrollment("e-3", "l-3", "client-A", "C", "C"),
      broken,
      makeEnrollment("e-4", "l-4", "client-B", "X", "X"),
    ];
    const formation = makeSession({ formation_companies: [fcA, fcB], enrollments });
    const result = buildInvoiceLines(formation, { type: "company", id: "client-A", amount: 900 });
    expect(result.lines).toHaveLength(3); // l'enrollment cassé est exclu
    const total = result.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    expect(total).toBeCloseTo(900, 2);
  });

  it("financeur INTER : 1 ligne par apprenant de la SESSION (toutes entreprises)", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", 3000);
    const fcB = makeFormationCompany("fc-2", "client-B", 5000);
    const enrollments = [
      makeEnrollment("e-1", "l-1", "client-A", "Dupont", "Jean"),
      makeEnrollment("e-2", "l-2", "client-B", "Autre", "Emma"),
    ];
    const formation = makeSession({ formation_companies: [fcA, fcB], enrollments });
    const result = buildInvoiceLines(formation, { type: "financier", id: "fin-1", amount: 2000 });
    expect(result.lines).toHaveLength(2);
    expect(result.amountHT).toBe(2000);
  });

  it("financeur INTRA : 1 ligne globale", () => {
    const fc = makeFormationCompany("fc-1", "client-A", 4000);
    const enrollments = [makeEnrollment("e-1", "l-1", "client-A", "Dupont", "Jean")];
    const formation = makeSession({ formation_companies: [fc], enrollments });
    const result = buildInvoiceLines(formation, { type: "financier", id: "fin-1", amount: 4000 });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].description).toBe("Formation : Formation X");
  });

  it("0 entreprise (unset) : traité comme Intra → 1 ligne globale", () => {
    const enrollments = [makeEnrollment("e-1", "l-1", null, "Dupont", "Jean")];
    const formation = makeSession({ enrollments });
    const result = buildInvoiceLines(formation, { type: "company", id: "client-A", amount: 1200 });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].unit_price).toBe(1200);
  });

  it("INTER mais 0 apprenant réel pour l'entreprise : 1 ligne globale, pas d'exception", () => {
    const fcA = makeFormationCompany("fc-1", "client-A", 1000);
    const fcB = makeFormationCompany("fc-2", "client-B", 2000);
    const enrollments = [makeEnrollment("e-1", "l-1", "client-B", "X", "X")];
    const formation = makeSession({ formation_companies: [fcA, fcB], enrollments });
    const result = buildInvoiceLines(formation, { type: "company", id: "client-A", amount: 1000 });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].unit_price).toBe(1000);
  });
});
```

Ajouter `Enrollment` à l'import de types en tête de fichier si absent — il est déjà importé (`import type { Session, Enrollment, FormationCompany, Learner } from "@/lib/types";`).

- [ ] **Step 2 : Lancer les tests → échec attendu**

Run: `npx vitest run src/lib/utils/__tests__/invoice-builder.test.ts`
Expected: FAIL — `buildInvoiceLines is not exported` (ou `is not a function`).

- [ ] **Step 3 : Implémenter `buildInvoiceLines`**

Dans `src/lib/utils/invoice-builder.ts` :

1. Ajouter `getFormationKind` à l'import depuis `formation-companies` (ligne 2-7) :

```ts
import {
  getLearnersForCompany,
  getAmountForCompany,
  isIntraFormation,
  getCompaniesForFormation,
  getFormationKind,
} from "@/lib/utils/formation-companies";
```

2. Ajouter `Enrollment` à l'import de types (ligne 1) :

```ts
import type { Session, Enrollment } from "@/lib/types";
```

3. Ajouter, **après** `buildInvoiceLinesForCompany` (après sa ligne `}` de fin, ≈ ligne 97) :

```ts
export interface InvoiceRecipient {
  type: "company" | "financier" | "learner";
  id: string;
  amount: number;
}

/**
 * Génère les lignes d'une facture selon le type de formation et le
 * destinataire. Fonction PURE — source de vérité unique. Cf. spec
 * docs/superpowers/specs/2026-05-21-facturation-lignes-unifiees-design.md
 *
 * - learner                    → 1 ligne nominative.
 * - company/financier, Inter   → 1 ligne par participant (split équitable,
 *                                 reste d'arrondi absorbé sur la dernière).
 * - company/financier, Intra / unset / 0 participant → 1 ligne globale.
 *
 * Ne lève jamais d'exception : tout cas dégénéré produit 1 ligne cohérente.
 */
export function buildInvoiceLines(
  formation: Session,
  recipient: InvoiceRecipient,
): InvoiceBuildResult {
  const titre = formation.title || "Formation";
  const desc = `Formation : ${titre}`;
  const nom = (e: Enrollment): string =>
    `${e.learner!.last_name?.toUpperCase() ?? ""} ${e.learner!.first_name ?? ""}`.trim();

  // ── Apprenant : 1 ligne nominative ──
  if (recipient.type === "learner") {
    const enr = (formation.enrollments ?? []).find((e) => e.learner?.id === recipient.id);
    const description = enr?.learner ? `${desc} — ${nom(enr)}` : desc;
    return {
      lines: [{ description, quantity: 1, unit_price: recipient.amount }],
      participantsNote: null,
      amountHT: round2(recipient.amount),
    };
  }

  // ── Entreprise / Financeur ──
  const participants =
    recipient.type === "company"
      ? getLearnersForCompany(formation, recipient.id)
      : (formation.enrollments ?? []);
  const realParticipants = participants.filter((e) => e.learner);

  // INTER avec ≥ 1 apprenant réel → 1 ligne par participant.
  if (getFormationKind(formation) === "inter" && realParticipants.length >= 1) {
    const n = realParticipants.length;
    const base = round2(recipient.amount / n);
    const reste = round2(recipient.amount - round2(base * n));
    const lines: InvoiceLineDraft[] = realParticipants.map((e, idx) => ({
      description: `${desc} — ${nom(e)}`,
      quantity: 1,
      unit_price: idx === n - 1 ? round2(base + reste) : base,
    }));
    return {
      lines,
      participantsNote: null,
      amountHT: round2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)),
    };
  }

  // INTRA / unset / 0 participant → 1 ligne globale.
  return {
    lines: [{ description: desc, quantity: 1, unit_price: recipient.amount }],
    participantsNote: null,
    amountHT: round2(recipient.amount),
  };
}
```

Note : `buildInvoiceLines` renvoie `participantsNote: null` car le type `InvoiceBuildResult` partagé avec l'ancien `buildInvoiceLinesForCompany` le contient encore — il sera retiré en Task 5. `isIntraFormation` reste importé (utilisé par l'ancien helper, retiré en Task 5).

- [ ] **Step 4 : Lancer les tests → succès attendu**

Run: `npx vitest run src/lib/utils/__tests__/invoice-builder.test.ts`
Expected: PASS — tous les tests (anciens `buildInvoiceLinesForCompany` + nouveaux `buildInvoiceLines` + `calculateInvoiceTotals`).

- [ ] **Step 5 : Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/utils/invoice-builder.ts src/lib/utils/__tests__/invoice-builder.test.ts
git commit -m "feat(facturation): buildInvoiceLines — fonction unifiee de generation des lignes"
```

---

## Task 2 : Migrer l'auto-génération (`auto-generate/route.ts`)

**Files:**
- Modify: `src/app/api/formations/[id]/invoices/auto-generate/route.ts`

- [ ] **Step 1 : Mettre à jour les imports**

Remplacer la ligne `import { buildInvoiceLinesForCompany } from "@/lib/utils/invoice-builder";` par :

```ts
import { buildInvoiceLines } from "@/lib/utils/invoice-builder";
```

Ajouter `getAmountForCompany` à l'import `formation-companies` existant :

```ts
import {
  getCompaniesForFormation,
  validateCompanyExport,
  getAmountForCompany,
} from "@/lib/utils/formation-companies";
```

- [ ] **Step 2 : Retirer `participantsNote` de `PreviewItem`**

Dans l'interface `PreviewItem`, supprimer la ligne `participantsNote: string | null;`.

- [ ] **Step 3 : Financeurs — utiliser le builder**

Dans la boucle `for (const fin of financiers)`, remplacer le bloc `preview.push({ ... lines: [], participantsNote: null })` par :

```ts
    const finBuilt = buildInvoiceLines(formation, {
      type: "financier",
      id: fin.id,
      amount: finAmount,
    });
    preview.push({
      recipientType: "financier",
      recipientId: fin.id,
      recipientName: fin.name,
      amount: finAmount,
      detail: `Financeur ${fin.type || ""}`.trim(),
      lines: finBuilt.lines,
    });
```

- [ ] **Step 4 : Entreprises — utiliser le builder**

Dans la boucle `for (const fc of companies)`, remplacer le bloc qui appelle `buildInvoiceLinesForCompany` et `preview.push(...)` par :

```ts
    for (const fc of companies) {
      const amount = getAmountForCompany(formation, fc.client_id) ?? 0;
      const built = buildInvoiceLines(formation, {
        type: "company",
        id: fc.client_id,
        amount,
      });
      const cname = fc.client?.company_name || "Entreprise";
      preview.push({
        recipientType: "company",
        recipientId: fc.client_id,
        recipientName: cname,
        amount: built.amountHT,
        detail: financeurTotal > 0 ? `Co-financement (financeurs ${financeurTotal}€)` : "",
        lines: built.lines,
      });
    }
```

- [ ] **Step 5 : Fallback apprenant — utiliser le builder**

Dans la boucle `for (const e of enrollmentList)`, remplacer le bloc `preview.push({ recipientType: "learner", ... })` par :

```ts
    const learnerAmount = Math.round(pricePerLearner * 100) / 100;
    const learnerBuilt = buildInvoiceLines(formation, {
      type: "learner",
      id: learner.id,
      amount: learnerAmount,
    });
    preview.push({
      recipientType: "learner",
      recipientId: learner.id,
      recipientName: fullName,
      amount: learnerAmount,
      detail: "Particulier",
      lines: learnerBuilt.lines,
    });
```

- [ ] **Step 6 : Retirer l'écriture de `participants_note`**

Dans le POST, le bloc d'UPDATE post-RPC : supprimer la ligne `if (item.participantsNote) updates.participants_note = item.participantsNote;`. Le commentaire « La RPC ne couvre pas participants_note ni auto_generated » devient « … ni auto_generated » — mettre à jour le commentaire en retirant la mention `participants_note`.

- [ ] **Step 7 : Typecheck + tests**

Run: `npx tsc --noEmit -p tsconfig.json` → aucune erreur.
Run: `npx vitest run` → 401 tests passent (aucun test ne couvre cette route, mais on vérifie la non-régression globale).

- [ ] **Step 8 : Commit**

```bash
git add "src/app/api/formations/[id]/invoices/auto-generate/route.ts"
git commit -m "feat(facturation): auto-generate utilise buildInvoiceLines (3 types)"
```

---

## Task 3 : Migrer le dialogue manuel (`TabFinances.tsx`)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx`

- [ ] **Step 1 : Mettre à jour les imports**

Remplacer `import { buildInvoiceLinesForCompany } from "@/lib/utils/invoice-builder";` par :

```ts
import { buildInvoiceLines } from "@/lib/utils/invoice-builder";
```

Ajouter `getAmountForCompany` à l'import `formation-companies` existant (`getFormationKind, getLearnersForCompany` sont déjà importés) :

```ts
import { getFormationKind, getLearnersForCompany, getAmountForCompany } from "@/lib/utils/formation-companies";
```

- [ ] **Step 2 : Remplacer `buildAutoLines`**

Remplacer **toute** la fonction `buildAutoLines` (de `const buildAutoLines = (recipientType...` jusqu'à son `};` de fin) par cet adaptateur — il calcule le montant selon le type, appelle `buildInvoiceLines`, et formate en lignes du formulaire (chaînes, décimale virgule) :

```ts
  /**
   * Construit les lignes auto du formulaire via le builder unifié
   * `buildInvoiceLines`. Le montant est dérivé du type de destinataire ;
   * la sortie numérique du builder est formatée en chaînes (décimale
   * virgule) pour les champs du formulaire. L'admin reste libre d'éditer.
   */
  const buildAutoLines = (recipientType: string, recipientId?: string): { description: string; quantity: string; unit_price: string }[] => {
    let amount = 0;
    if (recipientType === "company" && recipientId) {
      amount = getAmountForCompany(formation, recipientId) ?? 0;
    } else if (recipientType === "financier" && recipientId) {
      const fin = (formation.formation_financiers || []).find((f) => f.id === recipientId);
      amount = Number(fin?.amount_granted) || Number(fin?.amount) || 0;
    } else {
      // learner (ou type/id incomplet) : suggestion = total_price ÷ nb apprenants.
      const realCount = (formation.enrollments || []).filter((e) => e.learner).length;
      const total = formation.total_price || 0;
      amount = realCount > 1 ? total / realCount : total;
    }
    const { lines } = buildInvoiceLines(formation, {
      type: recipientType === "company" || recipientType === "financier" ? recipientType : "learner",
      id: recipientId ?? "",
      amount,
    });
    return lines.map((l) => ({
      description: l.description,
      quantity: String(l.quantity),
      unit_price: l.unit_price.toFixed(2).replace(".", ","),
    }));
  };
```

Les 2 appels existants `buildAutoLines(...)` (dans `prefillInvoiceLines` et `handleRecipientSelect`) sont inchangés — même signature.

- [ ] **Step 3 : `sessionLearners` Intra-only dans `buildInvoicePdfData`**

Dans `buildInvoicePdfData`, repérer le calcul de `sessionLearners` :

```ts
    const sessionLearners = learnerEnrollments
      .filter((e) => e.learner)
      .map((e) => `${e.learner!.last_name?.toUpperCase()} ${e.learner!.first_name}`);
```

Le remplacer par (la liste n'apparaît sur le PDF qu'en Intra — en Inter les lignes nominatives suffisent) :

```ts
    // La liste « Apprenant(s) » n'apparaît sur le PDF qu'en Intra ; en Inter
    // les lignes nominatives la rendent redondante (cf. spec §3.3/§3.4).
    const sessionLearners = getFormationKind(formation) === "intra"
      ? learnerEnrollments
          .filter((e) => e.learner)
          .map((e) => `${e.learner!.last_name?.toUpperCase()} ${e.learner!.first_name}`)
      : [];
```

- [ ] **Step 4 : Typecheck + tests**

Run: `npx tsc --noEmit -p tsconfig.json` → aucune erreur.
Run: `npx vitest run` → 401 tests passent.

- [ ] **Step 5 : Commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx"
git commit -m "feat(facturation): TabFinances utilise buildInvoiceLines + apprenants PDF Intra-only"
```

---

## Task 4 : Migrer le cascade (`invoices.ts`) + son test

**Files:**
- Modify: `src/lib/services/invoices.ts`
- Modify: `src/lib/services/__tests__/invoices.test.ts`

- [ ] **Step 1 : Adapter le test du cascade**

Dans `src/lib/services/__tests__/invoices.test.ts` :

Remplacer le `vi.mock` (lignes 5-11) par un mock de `buildInvoiceLines` :

```ts
// Mock du builder unifié — on contrôle sa sortie pour tester le cascade.
vi.mock("@/lib/utils/invoice-builder", () => ({
  buildInvoiceLines: vi.fn(),
}));

import { buildInvoiceLines } from "@/lib/utils/invoice-builder";
```

Remplacer `fakeFormation` (ligne 71) par une session qui porte les entreprises avec montant — ainsi le vrai `getAmountForCompany` renvoie un nombre (sinon le cascade pousserait tout en `errors`) :

```ts
const fakeFormation = {
  id: "s1",
  title: "Test",
  formation_companies: [
    { id: "fc1", session_id: "s1", client_id: "c1", amount: 1000, email: null, reference: null, created_at: "2026-01-01" },
    { id: "fc2", session_id: "s1", client_id: "c2", amount: 1000, email: null, reference: null, created_at: "2026-01-01" },
    { id: "fc3", session_id: "s1", client_id: "c3", amount: 1000, email: null, reference: null, created_at: "2026-01-01" },
  ],
} as unknown as Session;
```

Dans le `describe`, remplacer chaque `buildInvoiceLinesForCompany` par `buildInvoiceLines` :
- `vi.mocked(buildInvoiceLinesForCompany).mockReset()` → `vi.mocked(buildInvoiceLines).mockReset()`.
- les 3 `vi.mocked(buildInvoiceLinesForCompany).mockReturnValue({ lines: [...], participantsNote: null, amountHT: N })` → `vi.mocked(buildInvoiceLines).mockReturnValue({ lines: [...], participantsNote: null, amountHT: N })` (garder `participantsNote: null` — le type le contient encore jusqu'à Task 5).
- `expect(buildInvoiceLinesForCompany).toHaveBeenCalledTimes(2)` → `expect(buildInvoiceLines).toHaveBeenCalledTimes(2)`.
- `expect(buildInvoiceLinesForCompany).not.toHaveBeenCalled()` → `expect(buildInvoiceLines).not.toHaveBeenCalled()`.

- [ ] **Step 2 : Lancer le test → échec attendu**

Run: `npx vitest run src/lib/services/__tests__/invoices.test.ts`
Expected: FAIL — `invoices.ts` exporte/appelle encore `buildInvoiceLinesForCompany`, le mock ne correspond plus.

- [ ] **Step 3 : Migrer `cascadeSessionPriceToPendingInvoices`**

Dans `src/lib/services/invoices.ts` :

Remplacer l'import ligne 3 par :

```ts
import { buildInvoiceLines } from "@/lib/utils/invoice-builder";
import { getAmountForCompany } from "@/lib/utils/formation-companies";
```

Remplacer le bloc `// pending + company → rebuild lines` (le `try { built = buildInvoiceLinesForCompany(...) } catch { ... }`) par :

```ts
    // pending + company → rebuild lines via le builder unifié.
    // Le builder ne lève pas : on valide le montant ici (l'ancien helper
    // levait une exception sur montant nul, capturée par le try/catch).
    const amount = getAmountForCompany(formation, invoice.recipient_id);
    if (amount === null) {
      report.errors.push({
        invoiceId: invoice.id,
        message: "Montant de l'entreprise non défini",
      });
      continue;
    }
    const built = buildInvoiceLines(formation, {
      type: "company",
      id: invoice.recipient_id,
      amount,
    });
```

(La variable `built` n'est plus `let built;` déclarée avant le try — elle est désormais un `const` issu de l'appel direct. Supprimer la ligne `let built;` si elle subsiste.)

- [ ] **Step 4 : Lancer le test → succès attendu**

Run: `npx vitest run src/lib/services/__tests__/invoices.test.ts`
Expected: PASS — les 5 tests du cascade.

- [ ] **Step 5 : Typecheck + suite complète**

Run: `npx tsc --noEmit -p tsconfig.json` → aucune erreur.
Run: `npx vitest run` → 401 tests passent.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/services/invoices.ts src/lib/services/__tests__/invoices.test.ts
git commit -m "feat(facturation): cascade utilise buildInvoiceLines"
```

---

## Task 5 : Supprimer l'ancien `buildInvoiceLinesForCompany`

**Files:**
- Modify: `src/lib/utils/invoice-builder.ts`
- Modify: `src/lib/utils/__tests__/invoice-builder.test.ts`
- Modify: `src/lib/services/__tests__/invoices.test.ts`

Plus aucun appelant ne référence `buildInvoiceLinesForCompany` (vérifié Tasks 2-4) — on le supprime.

- [ ] **Step 1 : Supprimer la fonction et nettoyer le type**

Dans `src/lib/utils/invoice-builder.ts` :
- Supprimer entièrement la fonction `buildInvoiceLinesForCompany` (de sa ligne `export function buildInvoiceLinesForCompany(` jusqu'à son `}` de fin).
- Dans l'interface `InvoiceBuildResult`, supprimer la ligne `participantsNote: string | null;`.
- Dans `buildInvoiceLines`, supprimer les 3 occurrences de `participantsNote: null,` dans les objets retournés.
- Nettoyer les imports `formation-companies` désormais inutilisés : `getAmountForCompany`, `isIntraFormation`, `getCompaniesForFormation` ne sont plus utilisés par le fichier (vérifier — `buildInvoiceLines` n'utilise que `getLearnersForCompany` et `getFormationKind`). Garder uniquement `getLearnersForCompany, getFormationKind`.

- [ ] **Step 2 : Supprimer les tests de l'ancien helper**

Dans `src/lib/utils/__tests__/invoice-builder.test.ts` :
- Retirer `buildInvoiceLinesForCompany` de l'import.
- Supprimer les 3 `describe` : `"buildInvoiceLinesForCompany — INTRA"`, `"buildInvoiceLinesForCompany — INTER"`, `"buildInvoiceLinesForCompany — Erreurs"`.
- Garder les `describe` `"buildInvoiceLines"` et `"calculateInvoiceTotals"`.

- [ ] **Step 3 : Nettoyer le mock de `invoices.test.ts`**

Dans `src/lib/services/__tests__/invoices.test.ts`, les 3 `vi.mocked(buildInvoiceLines).mockReturnValue({ ... })` contiennent encore `participantsNote: null,` — le retirer des 3 objets (le type `InvoiceBuildResult` ne contient plus ce champ depuis le Step 1).

- [ ] **Step 4 : Typecheck + suite complète**

Run: `npx tsc --noEmit -p tsconfig.json` → aucune erreur.
Run: `npx vitest run` → la suite passe (compte légèrement réduit : ~11 anciens tests retirés, 10 nouveaux ajoutés en Task 1).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/utils/invoice-builder.ts src/lib/utils/__tests__/invoice-builder.test.ts
git commit -m "refactor(facturation): retrait de buildInvoiceLinesForCompany (remplace)"
```

---

## Task 6 : Vérification finale

- [ ] **Step 1 : Typecheck global** — Run: `npx tsc --noEmit -p tsconfig.json`. Expected: aucune erreur.
- [ ] **Step 2 : Suite complète** — Run: `npx vitest run`. Expected: toute la suite verte.
- [ ] **Step 3 : Recherche de résidus** — Run: `grep -rn "buildInvoiceLinesForCompany\|buildAutoLines\b" src/`. Expected: `buildInvoiceLinesForCompany` → 0 résultat ; `buildAutoLines` → uniquement sa définition + 2 appels dans `TabFinances.tsx`.

---

## Vérification manuelle (après déploiement)

- Formation **Intra** (1 entreprise) : créer une facture entreprise → 1 ligne globale ; le PDF affiche la ligne « Apprenant(s) : … ».
- Formation **Inter** (2+ entreprises) : créer une facture entreprise → 1 ligne par apprenant de cette entreprise ; le PDF **n'affiche pas** « Apprenant(s) : … ».
- Facture **financeur** sur formation Inter : 1 ligne par apprenant de la session.
- Auto-génération à la clôture d'une session : factures entreprise + financeur correctement lignées.
- Changer le prix d'une session ayant une facture entreprise `pending` : les lignes se recalculent (cascade).
