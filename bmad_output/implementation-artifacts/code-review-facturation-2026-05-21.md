---
type: code-review
scope: Facturation — espace formation
date: 2026-05-21
reviewer: bmad-code-review (Blind Hunter + Edge Case Hunter, Opus)
review_mode: no-spec
files_reviewed: 13
---

# Code review — Facturation de l'espace formation (2026-05-21)

Revue adversariale 2 couches (Blind Hunter sans contexte + Edge Case Hunter avec
accès projet/schéma). Mode `no-spec`. Périmètre : 13 fichiers, ~4 290 lignes —
`TabFinances.tsx`, `ImportInvoiceDialog.tsx`, routes `formations/[id]/invoices/*`,
`invoices/process-reminders`, `affacturage/*`, `ai/parse-invoice`,
`services/invoices.ts`, `utils/invoice-builder.ts`, `invoice-pdf-export.ts`,
`devis-pdf.ts`.

**Bilan : 2 BLOCKER · 9 HIGH · 10 MEDIUM · 6 LOW (= 27 `patch`) · 9 `defer` · 3 écartés.**

> **MàJ 2026-05-21** — Les 2 BLOCKER + 9 HIGH (B1, B2, H1-H9) sont **corrigés** sur la branche `fix/facturation-blocker-high` (`tsc` clean, 400/400 vitest). B1 inclut la migration `supabase/migrations/add_invoice_line_order_index.sql` à exécuter dans Supabase. Les 10 MEDIUM + 6 LOW restent `[ ]` (documentés, non traités).

---

## 🔴 BLOCKER

- [x] [Review][Patch] **B1 — `formation_invoice_lines` n'a aucune colonne d'ordre : l'édition de lignes et le détail PDF sont cassés** `[TabFinances.tsx:543, :749 ; invoices/route.ts:232]` (blind+edge, vérifié schéma) — La table a uniquement `id, invoice_id, description, quantity, unit_price, created_at`. Or `handleEditInvoice` lit `.order("order_index")`, `buildPdfDataWithLines` lit `.order("position")`, et le PATCH insère `order_index: idx`. Les 2 SELECT renvoient une erreur 400 PostgREST (→ `lines` undefined, le PDF retombe sur la ligne unique `amount`, détail perdu) ; l'INSERT du PATCH échoue sur colonne inconnue (→ lignes perdues à chaque édition). **Fix :** migration `ALTER TABLE formation_invoice_lines ADD COLUMN order_index INTEGER DEFAULT 0` + aligner les 3 sites sur `order_index` (ne pas se rabattre sur `created_at` : `NOW()` est constant dans un INSERT batch, l'ordre serait perdu).
- [x] [Review][Patch] **B2 — Numérotation des factures importées non atomique (SELECT MAX + INSERT)** `[invoices/import/route.ts:58-93]` (blind+edge) — La route d'import lit `MAX(global_number)` puis fait un INSERT séparé, au lieu de la RPC atomique `create_invoice_with_atomic_number` (utilisée par `route.ts` et `auto-generate`). Deux imports concurrents → doublon de numéro ou violation de `idx_invoices_global_numbering` (trou comptable, non-conformité). **Fix :** passer par la RPC atomique.

## 🟠 HIGH

- [x] [Review][Patch] **H1 — Import : `amount_ttc` stocké dans `amount` (sémantique HT partout ailleurs)** `[invoices/import/route.ts:86]` (blind+edge) — `amount` est du HT partout (TVA recalculée au rendu PDF). L'import y met un TTC : `total_invoiced` mélange des bases, le PDF recalcule une TVA par-dessus un TTC. **Fix :** stocker `amount_ht`.
- [x] [Review][Patch] **H2 — `affacturage` : UPDATE de factures sans filtre `entity_id`** `[affacturage/[id]/route.ts:45-48 ; affacturage/route.ts:119-126]` (blind+edge) — Passage `paid` / `is_factored` via `.in("id", invoiceIds)` sans `.eq("entity_id", …)`. Un `invoice_id` parasite dans la pivot toucherait une facture d'un autre tenant. **Fix :** ajouter le filtre `entity_id`.
- [x] [Review][Patch] **H3 — Routes `affacturage` : pas de `resolveActiveEntityId` pour un super_admin** `[affacturage/route.ts:14,69 ; affacturage/[id]/route.ts:28]` (edge) — Filtrage par `profile.entity_id` au lieu de l'entité active. Un super_admin sur l'UI C3V lit/crée des lots rattachés à MR FORMATION. **Fix :** utiliser `resolveActiveEntityId` (`src/lib/crm/active-entity.ts`), comme les routes CRM.
- [x] [Review][Patch] **H4 — `handleSendInvoiceEmail` ne résout l'email que pour `company`** `[TabFinances.tsx:771-781]` (blind+edge) — Pour une facture `learner` ou `financier`, `email` reste `null` → toast d'erreur systématique, alors que le bouton « Email » est actif sur les 3 types. **Fix :** résoudre l'email apprenant et financeur.
- [x] [Review][Patch] **H5 — `process-reminders` ignore le type `financier`** `[invoices/process-reminders/route.ts:133-158]` (edge) — La résolution d'email ne couvre que `company`/`learner`. Les factures OPCO (massivement créées par `auto-generate`) ne sont jamais relancées. **Fix :** ajouter la branche `financier`.
- [x] [Review][Patch] **H6 — `process-reminders` : `reminder_count` incrémenté même si l'envoi échoue** `[invoices/process-reminders/route.ts:208-228]` (blind) — `enqueueEmail` n'est ni try/catch ni testé ; le compteur est incrémenté inconditionnellement → la relance ne repartira jamais. **Fix :** n'incrémenter qu'après succès confirmé de l'enqueue.
- [x] [Review][Patch] **H7 — PATCH `/invoices` édite montant/lignes/`status` d'une facture déjà `sent`/`paid`** `[invoices/route.ts:170-236]` (blind+edge) — Le commentaire dit « only for pending » mais aucun code ne le vérifie : un appel direct altère une pièce comptable émise. **Fix :** garde serveur sur `status` (refuser l'édition hors `pending`/`draft`).
- [x] [Review][Patch] **H8 — POST/PATCH `/invoices` : insertion des lignes sans vérif d'erreur ; DELETE-puis-INSERT non transactionnel** `[invoices/route.ts:148, 220-235]` (blind+edge) — Le résultat de l'`insert` n'est jamais lu (facture créée sans lignes, succès renvoyé). Au PATCH, DELETE puis INSERT : si l'INSERT échoue, la facture perd toutes ses lignes. **Fix :** vérifier l'`error` de l'insert et le remonter ; insérer avant de supprimer (ou RPC transactionnelle).
- [x] [Review][Patch] **H9 — `formation_charges` : DELETE/INSERT sans filtre `entity_id`, en appel Supabase inline** `[TabFinances.tsx:643, :666]` (edge) — `handleDeleteCharge`/`handleCreateCharge` violent la règle CLAUDE.md 2 (filtre `entity_id` obligatoire). **Fix :** ajouter `.eq("entity_id", …)` (l'extraction vers un service est en `defer`, voir D8).

## 🟡 MEDIUM

- [ ] [Review][Patch] **M1 — `auto-generate` : double-soumission concurrente → doublons de toutes les factures** `[invoices/auto-generate/route.ts:37-138]` (blind) — Le garde anti-doublon (`invoice_generated` + count) n'est pas atomique : 2 POST simultanés génèrent chacun le jeu complet. **Fix :** poser `invoice_generated=true` en check-and-set atomique avant génération, ou contrainte d'unicité par session.
- [ ] [Review][Patch] **M2 — `auto-generate` : UPDATE `invoice_generated` erreur non vérifiée + sans `entity_id`** `[invoices/auto-generate/route.ts:135-138]` (blind+edge) — Si l'UPDATE échoue, `success: true` est renvoyé quand même, flag incohérent.
- [ ] [Review][Patch] **M3 — `invoice-builder` INTER : `learners.length` compté avant le filtre `e.learner`** `[invoice-builder.ts:68-90]` (blind+edge) — Le diviseur inclut les enrollments sans `learner` → la somme des lignes est inférieure à `amount`. **Fix :** filtrer avant de diviser.
- [ ] [Review][Patch] **M4 — `auto-generate` fallback : arrondi `pricePerLearner` par apprenant → somme ≠ `total_price`** `[invoices/auto-generate/route.ts:284,295]` (edge) — Centimes résiduels perdus (contrairement à `invoice-builder` qui absorbe le reste). **Fix :** absorber le reliquat sur la dernière facture.
- [ ] [Review][Patch] **M5 — `process-reminders` : statut `late` jamais posé si aucun palier de relance n'est dû** `[invoices/process-reminders/route.ts:113-129]` (blind) — Le passage `late` est après `if (!reminderType) continue`. Une facture échue depuis 3 j reste `pending`. **Fix :** marquer `late` indépendamment du palier.
- [ ] [Review][Patch] **M6 — TabFinances : passage `sent` écrit en base côté client, sans `entity_id`, hors route PATCH** `[TabFinances.tsx:804-807]` (blind) — Court-circuite l'audit et la sécurité serveur ; `error` ignorée. **Fix :** passer par la route PATCH.
- [ ] [Review][Patch] **M7 — TabFinances : avoirs multiples possibles sur une même facture** `[TabFinances.tsx:1045-1055]` (blind) — Le bouton « Avoir » reste actif même si un avoir existe déjà → N avoirs cumulés. **Fix :** désactiver si un avoir avec ce `parent_invoice_id` existe.
- [ ] [Review][Patch] **M8 — `parse-invoice` : montants et `vat_rate` de l'IA réinjectés sans validation** `[ai/parse-invoice/route.ts:75-84 ; ImportInvoiceDialog.tsx:60-62]` (blind+edge) — `vat_rate` hors {0,5.5,10,20} casse le `<Select>` ; montants négatifs/strings non détectés. **Fix :** valider/borner la réponse IA (Zod).
- [ ] [Review][Patch] **M9 — `auto-generate` fallback : factures apprenant omises sans warning si `pricePerLearner <= 0`** `[invoices/auto-generate/route.ts:287-304]` (blind) — `continue` silencieux ; le preview affiche 0 facture sans explication. **Fix :** ajouter un warning au preview.
- [ ] [Review][Patch] **M10 — `invoice-pdf-export` : `formatCurrency` — les `.replace(/ /g, " ")` sont des no-ops** `[invoice-pdf-export.ts:99-103]` (blind) — Le caractère source = le caractère cible ; l'espace insécable étroite d'`Intl.NumberFormat` n'est pas remplacée (glyphe manquant dans le PDF). **Fix :** remplacer via ` `/` ` explicites ou `/\s/g`.

## 🟢 LOW

- [ ] [Review][Patch] **L1 — `affacturage` POST : `advance_rate` non borné** `[affacturage/route.ts:55,82]` (edge) — Aucune validation `0 ≤ rate ≤ 100`. **Fix :** clamp + validation.
- [ ] [Review][Patch] **L2 — `affacturage` : factures déjà `paid` affacturables ; `status` du lot sans whitelist** `[affacturage/route.ts:65-82 ; affacturage/[id]/route.ts:17-30]` (blind) — **Fix :** filtrer le statut des factures éligibles ; valider `status` contre un enum.
- [ ] [Review][Patch] **L3 — `devis-pdf` : `formatDateFR` casse sur une date ISO complète ; `formatEUR` n'isole pas `NaN`** `[devis-pdf.ts:75-87]` (blind+edge) — `split("-")` donne `21T10:00:00Z` ; `NaN.toFixed` imprime « NaN.aN EUR ». **Fix :** parser proprement la date, garder `Number.isFinite` dans `formatEUR`.
- [ ] [Review][Patch] **L4 — `devis-pdf` : encodage base64 octet-par-octet (`String.fromCharCode` en boucle)** `[devis-pdf.ts:711-720]` (blind) — Lent / `RangeError` possible sur gros PDF. **Fix :** s'aligner sur `invoice-pdf-export` (`datauristring.split(",")[1]`).
- [ ] [Review][Patch] **L5 — `auto-generate` : `end_date` invalide → `RangeError` 500 opaque** `[invoices/auto-generate/route.ts:59-61]` (edge) — `new Date(end_date)` non validé → `toISOString()` jette. **Fix :** valider la date, message clair.
- [ ] [Review][Patch] **L6 — `parse-invoice` : `content[0].text` supposé texte sans vérifier `type` ; `ImportInvoiceDialog` n'envoie jamais `recipient_postal_code`/`city`** `[ai/parse-invoice/route.ts:75 ; import/route.ts:84-85]` (blind) — **Fix :** chercher le bloc `type==="text"` ; câbler ou retirer les champs code postal/ville.

## ⏸️ defer — réel mais nécessite un travail plus large ou une décision produit

- [x] [Review][Defer] **D1 — `recipient_id: crypto.randomUUID()` à l'import** `[invoices/import/route.ts:81]` — UUID factice ne pointant sur aucun client/apprenant → relances et email impossibles sur les factures importées. Fix correct = faire capturer un vrai destinataire par `ImportInvoiceDialog` (petite feature), ou rendre `recipient_id` nullable + skip gracieux des externes dans `process-reminders`.
- [x] [Review][Defer] **D2 — `affacturage` POST : 3 écritures séquentielles sans transaction** `[affacturage/route.ts:85-130]` — Si l'UPDATE final échoue, lot + pivots existent sans `is_factored`. Atomicité réelle = RPC DB.
- [x] [Review][Defer] **D3 — `affacturage/[id]` : cascade `paid` non réversible** `[affacturage/[id]/route.ts:37-50]` — Repasser un lot en `pending`/`cancelled` ne « dé-paie » pas les factures. Décision produit.
- [x] [Review][Defer] **D4 — `auto-generate` : modèle de co-financement financeur/entreprise** `[invoices/auto-generate/route.ts:231-277]` — Le montant entreprise n'est pas déduit du financeur (`detail` mentionne le co-financement mais facture le plein montant). Double facturation potentielle — à clarifier avec le métier.
- [x] [Review][Defer] **D5 — `invoice-pdf-export` : aucune pagination, débordement A4** `[invoice-pdf-export.ts:431-447]` — Une facture INTER avec beaucoup d'apprenants déborde la page (footer figé « 1 »). Feature layout multi-pages.
- [x] [Review][Defer] **D6 — Calcul TVA dupliqué ×3 + `calculateInvoiceTotals` code mort** `[invoice-builder.ts:99-108]` — Centraliser le calcul TVA/HT/TTC. Refactor.
- [x] [Review][Defer] **D7 — `process-reminders` : pas de verrou de traitement par facture** `[invoices/process-reminders/route.ts]` — Deux runs concurrents du cron peuvent relancer 2×. Architectural.
- [x] [Review][Defer] **D8 — Appels Supabase inline dans `TabFinances`** — Charges, passage `sent`, etc. en `supabase.from(...)` direct dans le composant (viole CLAUDE.md 10 : logique dans `src/lib/services/`). Refactor — extraire vers `src/lib/services/`.
- [x] [Review][Defer] **D9 — `invoice-pdf-export` : avoir avec lignes → lignes positives mais total négatif** `[invoice-pdf-export.ts:250-315]` — Document contradictoire. Edge case rare (les avoirs sont créés avec `lines: []`).

## ✓ Écartés (bruit / non-bug)

- `process-reminders` `daysPastDue` potentiellement négatif — le filtre SQL `lt("due_date", today)` le rend inoffensif tant que les seuils ≥ 1 (l'auteur du finding le reconnaît).
- `TabFinances:875` `formation.total_price &&` traite `0` comme falsy — protégé par le court-circuit, pas de bug réel.
- `invoice-pdf-export` logique TVA-exempt « redondante » — cosmétique de maintenabilité, pas un bug.
