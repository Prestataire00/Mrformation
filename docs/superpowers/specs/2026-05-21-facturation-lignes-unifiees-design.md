---
title: Génération des lignes de facture — logique unifiée Inter/Intra
date: 2026-05-21
status: design validé (révisé après découverte du rendu PDF existant)
author: brainstorming (Claude Opus 4.7) + Wissam
---

# Génération des lignes de facture — logique unifiée Inter/Intra

## 1. Contexte & problème

Le module Facturation (espace formation) génère les lignes d'une facture à
**quatre endroits différents et divergents** :

1. `src/lib/utils/invoice-builder.ts` → `buildInvoiceLinesForCompany()` — le
   helper « propre » (Intra → 1 ligne ; Inter → 1 ligne/apprenant).
2. `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx` →
   `buildAutoLines()` — la version du dialogue de création manuelle, avec un
   *fallback legacy* qui recalcule différemment.
3. `src/app/api/formations/[id]/invoices/auto-generate/route.ts` →
   `buildInvoicePreview()` — l'auto-génération à la clôture de session
   (utilise le helper pour les entreprises ; **lignes vides** pour les
   financeurs ; fallback par apprenant si aucune entreprise).
4. `src/lib/services/invoices.ts` → `cascadeSessionPriceToPendingInvoices()`
   — recalcule les lignes des factures entreprise « pending » quand le prix
   de session change (appelée depuis `ResumePriceHours.tsx`).

Conséquences (confirmées par la revue de code du 2026-05-21,
`bmad_output/implementation-artifacts/code-review-facturation-2026-05-21.md`) :

- Le dialogue manuel et l'auto-génération peuvent produire des **lignes
  différentes** pour la même situation.
- **Bug M3** : en Inter, le split divise par `learners.length` (nombre
  d'enrollments) alors que les lignes sont produites sur
  `learners.filter(e => e.learner)` — si un enrollment a un `learner` null,
  la somme des lignes ≠ montant.
- **Bug M4** : l'auto-génération arrondit le prix par apprenant côté route
  sans absorber le reste → la somme des factures ≠ `total_price`.

Sur l'affichage des apprenants : le PDF affiche **déjà** la liste des
apprenants — `renderFormationDetails` (`invoice-pdf-export.ts`) imprime une
ligne `Apprenant(s) : NOM Prénom, …` alimentée par `InvoicePdfData.sessionLearners`,
que `buildInvoicePdfData` calcule depuis les apprenants de la formation. Deux
petits défauts seulement :
- cette ligne s'affiche aussi sur les factures **Inter**, où les lignes
  nominatives la rendent **redondante** ;
- la colonne `formation_invoices.participants_note` (écrite par
  l'auto-génération) n'est lue **nulle part** → donnée morte.

**Objectif** : une **logique unique** de génération des lignes, sans bug,
appliquée partout pareil. Le comportement métier (Intra → 1 ligne ; Inter →
1 ligne/participant) est validé — on le fiabilise, on ne le change pas. La
liste des apprenants reste affichée via le mécanisme existant (`sessionLearners`),
mais **uniquement en Intra**.

## 2. La règle métier

Le **type de formation** (Inter / Intra), dérivé du nombre d'entreprises
rattachées via `getFormationKind()` (`formation-companies.ts`), pilote le
format des lignes pour les destinataires « groupe » (entreprise + financeur).
Le destinataire « apprenant » est toujours à 1 ligne.

| Destinataire | Intra (1 entreprise) | Inter (2+ entreprises) |
|---|---|---|
| **Entreprise** | 1 ligne `Formation : <titre>`, prix = montant de l'entreprise. | 1 ligne par apprenant **de cette entreprise**, prix = montant entreprise ÷ N. |
| **Financeur** | 1 ligne `Formation : <titre>`, prix = montant accordé. | 1 ligne par apprenant **de la session**, prix = montant financeur ÷ N. |
| **Apprenant** | 1 ligne `Formation : <titre> — NOM Prénom`, prix = montant. | identique à Intra. |

**Split Inter** : équitable, arrondi à 2 décimales par ligne, le reste
d'arrondi est **absorbé sur la dernière ligne** → la somme des lignes égale
le montant exactement.

**Liste des apprenants** : affichée via la ligne `Apprenant(s) : …` du bloc
détails formation du PDF — **uniquement en Intra** (en Inter, les lignes
nominatives suffisent).

## 3. Architecture

### 3.1. La fonction `buildInvoiceLines` — source de vérité unique

Dans `src/lib/utils/invoice-builder.ts`. **Fonction pure** (aucun accès DB,
aucun effet de bord) → utilisable côté client ET serveur, testable
unitairement. C'est un **formateur** : (type de formation + destinataire +
montant) → lignes de facture.

```ts
interface InvoiceLineDraft {
  description: string;
  quantity: number;     // toujours 1
  unit_price: number;
}

interface InvoiceRecipient {
  type: "company" | "financier" | "learner";
  id: string;           // client_id | formation_financiers.id | learner.id
  amount: number;       // montant total à facturer à ce destinataire (HT)
}

interface InvoiceBuildResult {
  lines: InvoiceLineDraft[];
  amountHT: number;     // somme des lignes, arrondie — = amount
}

function buildInvoiceLines(
  formation: Session,
  recipient: InvoiceRecipient,
): InvoiceBuildResult
```

Le **montant** est fourni par l'appelant (cf. §3.3) — ça découple « quel
montant » (spécifique au type) de « comment formater » (la règle métier).

`buildInvoiceLinesForCompany()` est **remplacé** par `buildInvoiceLines()`
(supprimer l'ancien nom). `calculateInvoiceTotals()` du même fichier n'est
**pas touché** (hors scope, cf. §9).

### 3.2. Contrat de `buildInvoiceLines` (comportement exhaustif)

Soit `kind = getFormationKind(formation)`, `titre = formation.title ||
"Formation"`, `desc = "Formation : " + titre`, `nom(e) =
"<last_name en MAJ> <first_name>"`.

**`type === "learner"`** :
- Chercher l'apprenant dans `formation.enrollments` (`e.learner?.id === id`).
- 1 ligne : `description = desc + " — " + nom` (ou `desc` seul si introuvable),
  `quantity = 1`, `unit_price = amount`.

**`type === "company"` ou `"financier"`** :
- Déterminer les participants :
  - `company` → `getLearnersForCompany(formation, id)`.
  - `financier` → `formation.enrollments ?? []` (tous les apprenants de la
    session — un financeur n'est pas rattaché à une entreprise).
- `realParticipants = participants.filter(e => e.learner)`.
- **Cas Inter** (`kind === "inter"` ET `realParticipants.length >= 1`) :
  - `n = realParticipants.length`, `base = round2(amount / n)`,
    `reste = round2(amount - round2(base * n))`.
  - `n` lignes : `description = desc + " — " + nom`, `quantity = 1`,
    `unit_price = base` (et `round2(base + reste)` pour la **dernière** ligne).
- **Sinon** (Intra, `unset`, ou 0 participant réel) :
  - 1 ligne : `description = desc`, `quantity = 1`, `unit_price = amount`.

`amountHT = round2(Σ quantity × unit_price)`. La fonction **ne lève jamais
d'exception** : tout cas dégénéré (0 participant, montant 0, `learner` null)
produit une sortie cohérente à 1 ligne.

### 3.3. Les appelants

**A. `TabFinances.tsx` (dialogue de création/édition manuelle)**
- Supprimer `buildAutoLines()` et son *fallback legacy*.
- Le pré-remplissage des lignes (`prefillInvoiceLines`, `handleRecipientSelect`)
  appelle `buildInvoiceLines(formation, { type, id, amount })`. Montant fourni :
  - `company` → `getAmountForCompany(formation, id) ?? 0` ;
  - `financier` → `amount_granted ?? amount ?? 0` du `formation_financiers` ;
  - `learner` → suggestion : `total_price ÷ nb d'apprenants de la session` si
    > 1 sinon `total_price` (préserve la suggestion actuelle ; l'admin reste
    libre d'éditer).
- Les `lines` renvoyées remplissent le formulaire (mêmes champs qu'aujourd'hui).
- `buildInvoicePdfData` : `sessionLearners` n'est renseigné **que si
  `getFormationKind(formation) === "intra"`** ; tableau vide en Inter/unset →
  la ligne `Apprenant(s) :` du PDF disparaît automatiquement sur les factures
  Inter (le rendu PDF teste déjà `sessionLearners.length > 0`).

**B. `auto-generate/route.ts` (auto-génération à la clôture)**
- `buildInvoicePreview()` : pour chaque facture prévue (entreprise, financeur,
  ou apprenant en repli), `lines` vient de
  `buildInvoiceLines(formation, { type, id, amount })`.
  - entreprise → `getAmountForCompany`.
  - financeur → `amount_granted ?? amount` (**changement** : aujourd'hui
    lignes vides ; désormais formaté selon Inter/Intra).
  - repli sans entreprise → 1 facture `type: "learner"` par apprenant,
    `amount = pricePerLearner`.
- Le champ `participantsNote` / la colonne `participants_note` ne sont plus
  alimentés (donnée morte — cf. §1). Retirer le `updates.participants_note`
  du POST.

**C. `invoices.ts` → `cascadeSessionPriceToPendingInvoices`**
- Remplacer `buildInvoiceLinesForCompany(formation, recipient_id)` par
  `buildInvoiceLines(formation, { type: "company", id: recipient_id, amount })`.
- Montant : `getAmountForCompany(formation, recipient_id)`. Si `null` (montant
  entreprise non défini), pousser dans `report.errors` et `continue` — c'est
  ce que faisait le `try/catch` autour de l'ancien helper (qui levait une
  exception) ; le nouveau builder ne lève jamais, donc la validation du
  montant passe explicitement dans le `cascade`.
- Ne traite que les factures `recipient_type === "company"` (inchangé).

### 3.4. Aucun changement du rendu PDF

`invoice-pdf-export.ts` n'est **pas modifié**. La ligne `Apprenant(s) :` est
déjà conditionnée par `sessionLearners.length > 0` ; il suffit que
`buildInvoicePdfData` ne renseigne `sessionLearners` qu'en Intra (cf. §3.3.A).

## 4. Modèle de données

**Aucune migration SQL.** La colonne `formation_invoices.participants_note`
existe toujours mais n'est plus écrite (donnée morte assumée — sa suppression
éventuelle est hors scope). Le champ libre `formation_invoices.notes` reste
inchangé.

## 5. Bugs corrigés

- **M3** — le split Inter divise par `realParticipants.length` (apprenants
  réels), pas par le nombre brut d'enrollments.
- **M4** — pour les factures entreprise et financeur, l'arrondi est géré dans
  `buildInvoiceLines` (absorption du reste sur la dernière ligne) → somme des
  lignes exacte ; l'auto-génération n'arrondit plus de son côté pour ces
  types. (Le repli « 1 facture par apprenant » des formations sans entreprise
  garde un arrondi par facture — cf. §9.)

## 6. Cas limites

- **0 apprenant réel** (entreprise/financeur) → 1 ligne globale, pas
  d'exception.
- **Enrollment avec `learner` null** → exclu des participants et du diviseur.
- **Montant non divisible** (ex. 1000 ÷ 3) → 333,33 / 333,33 / 333,34.
- **`kind === "unset"`** (0 entreprise) → traité comme Intra (1 ligne).
- **Apprenant introuvable** (`learner` type, id absent des enrollments) →
  1 ligne avec `desc` seul (sans nom).

## 7. Tests

Tests unitaires Vitest sur `buildInvoiceLines`, dans
`src/lib/utils/__tests__/invoice-builder.test.ts` (adapter l'existant — les
blocs `calculateInvoiceTotals` restent intacts) :

- Intra entreprise : 1 ligne globale, `amountHT` = montant.
- Intra financeur : 1 ligne globale (participants = apprenants de la session).
- Inter entreprise : N lignes nominatives, somme = montant exactement.
- Inter financeur : N lignes sur tous les apprenants de la session.
- Apprenant : 1 ligne nominative.
- Cas limites §6 : 0 apprenant, `learner` null (somme exacte — non-régression
  M3), montant non divisible (somme exacte — non-régression M4), apprenant
  introuvable, `unset`.

La suite complète doit rester verte.

## 8. Périmètre — fichiers touchés

- `src/lib/utils/invoice-builder.ts` — `buildInvoiceLines` (réécriture de
  `buildInvoiceLinesForCompany`).
- `src/lib/utils/__tests__/invoice-builder.test.ts` — tests adaptés.
- `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx` —
  suppression de `buildAutoLines`, appel du builder, `sessionLearners`
  Intra-only dans `buildInvoicePdfData`.
- `src/app/api/formations/[id]/invoices/auto-generate/route.ts` — appel du
  builder pour les 3 types, retrait du `participants_note`.
- `src/lib/services/invoices.ts` — `cascadeSessionPriceToPendingInvoices`
  migré vers `buildInvoiceLines`.
- `src/lib/services/__tests__/invoices.test.ts` — le mock de
  `buildInvoiceLinesForCompany` devient `buildInvoiceLines`.

**Pas touchés** : `invoice-pdf-export.ts`, `invoices/route.ts`. **Pas de
migration SQL.**

## 9. Hors scope

- Le calcul TVA/HT/TTC (`calculateInvoiceTotals`, duplication TVA) — defer D6
  de la revue de code, traité séparément.
- Le modèle de co-financement financeur/entreprise (defer D4) — la règle
  « qui paie quoi » n'est pas modifiée ; on ne change que le **format des
  lignes**, pas les montants décidés en amont.
- L'import de factures externes (`import/route.ts`) — une facture importée
  n'a pas de lignes générées.
- La suppression de la colonne morte `participants_note` (migration séparée
  si souhaitée un jour).
- Le repli « 1 facture par apprenant » de l'auto-génération (formations sans
  entreprise rattachée) : chaque facture apprenant est arrondie indépendamment ;
  la dérive inter-factures résiduelle (< 1 centime par facture) n'est pas
  corrigée — cas limite rare.

## 10. Anti-régression

- L'admin peut toujours **éditer manuellement** les lignes pré-remplies : le
  builder ne fait que produire la suggestion initiale.
- Les factures `learner` créées manuellement gardent le comportement actuel
  (1 ligne).
- Les factures déjà émises ne sont pas recalculées.
- Les blocs de test `calculateInvoiceTotals` existants restent verts.
