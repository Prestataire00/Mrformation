# Story abby-4.4 : Garantir la non-régression BPF, exports et rapprochements

Status: review

baseline_commit: bd65492f (main après merge PR #362 — abby-4-3 done)

## Story

As a gérant,
I want que mes obligations BPF, mes exports et mes rapprochements ignorent totalement le push,
So that la conformité Abby n'introduise aucun risque dans l'existant (FR-20).

## Acceptance Criteria

### AC-1 — BPF et exports STRICTEMENT identiques avant/après push

**Given** un jeu de factures identique en tout point SAUF les colonnes `abby_*` (les unes NULL = non poussées, les autres renseignées = poussées/payées)
**When** les agrégats BPF (`computeSectionCFromInvoices`, `computeDataGaps`) et la logique d'export s'exécutent
**Then** les résultats sont **au bit près identiques** — le push n'influe sur aucun montant, aucune ligne, aucun classement (AD-6, AD-11)
**And** un test Vitest le verrouille (deux jeux ne différant QUE par les `abby_*` → mêmes agrégats)

### AC-2 — Garde structurelle : aucune colonne `abby_*` dans les selects BPF/export

**Given** les requêtes qui alimentent le BPF, l'export « reports/factures », et tout calcul d'agrégat de facturation
**When** on inspecte leurs `select` strings
**Then** AUCUNE ne contient de token `abby_` — test grep AUTOMATISÉ (pattern du grep AD-2/FR-19), pas une vérification manuelle : c'est LUI qui attrape un futur dev qui ajouterait `abby_state` à un select BPF
**And** le type d'entrée du calculateur (`InvoiceForBPF`) reste sans champ `abby_*` (barrière tsc si quelqu'un tente de les lire)

### AC-3 — Rapprochement inchangé

**Given** le rapprochement existant (par `external_reference` / `reference` via `invoiceDisplayRef`)
**When** une facture poussée est rapprochée
**Then** le mécanisme fonctionne sans AUCUNE modification — `reference` et `external_reference` restent les seules clés (AD-6 : « `reference` et `external_reference` restent intouchées »)
**And** un test prouve que `invoiceDisplayRef` ignore les colonnes `abby_*` (déjà le cas — verrouillé)

### AC-4 — Repro réelle read-only

**Given** les barrières projet (`tsc --noEmit` + vitest)
**When** l'epic est livré
**Then** les deux passent, ET une repro node read-only sur la base prod vérifie qu'AUCUNE colonne `abby_*` ne ressort des requêtes BPF/export réelles (les select strings sont invisibles pour tsc — même méthode que les recettes 3.2/4.x)

## Tasks / Subtasks

- [x] Task 1 — Test d'invariance BPF (AC-1) [TDD]
  - [x] `bpf-calculator.test.ts` (existant) : ajouter un bloc « non-régression push (FR-20) » — construire N factures `InvoiceForBPF`, calculer `computeSectionCFromInvoices` + `computeDataGaps` ; le résultat NE dépend QUE de `{amount, funding_type, invoice_date_confirmed, is_avoir, status}` — prouver qu'il est stable (les `abby_*` ne font pas partie du type, donc structurellement ignorés ; le test documente l'invariant et le fige)
  - [x] Vecteur mixte : un lot où la moitié des factures « seraient poussées » (mêmes montants/funding/dates) → agrégats identiques au lot « non poussé »
- [x] Task 2 — Garde structurelle « aucun abby_ dans un select d'agrégat/export » (AC-2) [TDD]
  - [x] Nouveau `src/lib/abby/__tests__/no-abby-in-bpf-exports.test.ts` couvrant les **6 surfaces d'agrégat/export confirmées propres par l'inventaire** (pas seulement 2) :
    1. `src/lib/services/bpf-report-service.ts` — selects de `fetchBPFData` (l.113-118) et `fetchBPFDataForSession` (l.363)
    2. `src/app/(dashboard)/admin/reports/factures/page.tsx` (l.94)
    3. `src/app/(dashboard)/admin/page.tsx` (l.291, dashboard CA) + type `src/lib/dashboard/revenue.ts` (InvoiceLite)
    4. `src/app/(dashboard)/admin/affacturage/page.tsx` (l.100) + `src/app/api/affacturage/route.ts` (l.73)
  - [x] **Discriminant anti-faux-positif** (règle robuste, pas un grep naïf) : asserter que tout littéral `.select("…")` contenant `amount` ET (`funding_type` OU `reference`) NE contient PAS `abby_`. Cette règle exclut naturellement : le verrou 3.5 (`bpf-report-service.ts:220` = `.select("abby_push_state")`, mono-colonne sans `amount`) et les 2 delete-guards (`sessions.ts:274`, `api/sessions/[id]/route.ts:311` — `abby_push_state` est dans un `.not()`, pas un `.select()`).
  - [x] ⚠️ **Angle mort `select("*")` — à DOCUMENTER, pas à forcer** : `formations/[id]/invoices/route.ts:21` fait `select("*")` (tire physiquement les `abby_*`) et alimente le CA/marge de TabFinances. La garde token ne peut PAS le voir. L'invariant tient fonctionnellement (TabFinances somme `amount`, jamais `abby_state`) — un test fonctionnel le prouve (Task 1 sur les mêmes données), mais la garde structurelle NE protège PAS ce chemin. Le noter explicitement dans un commentaire du test (« surfaces select("*") = sûres fonctionnellement, hors garde structurelle ») pour ne pas donner de fausse confiance
  - [x] Vérifier que `InvoiceForBPF` (bpf-calculator.ts:170) reste `{amount, funding_type, invoice_date_confirmed, is_avoir, status}` + ses frères `InvoiceForDataGaps` (l.216), `SessionBpfInvoice` (l.542), `DepositProgressInvoice` (l.765) sans champ `abby_*` — test qui échoue si un `abby_*` y est ajouté
- [x] Task 3 — Rapprochement / invoiceDisplayRef (AC-3) [TDD]
  - [x] `invoice-display-ref` : test (ou extension de l'existant) prouvant que la référence affichée dérive UNIQUEMENT de `reference`/`external_reference`, jamais d'`abby_invoice_number` — même sur une facture poussée avec un numéro Abby
- [x] Task 4 — Repro réelle + barrières (AC-4)
  - [x] Script node read-only : exécuter les VRAIS select strings de `fetchBPFData` et de l'export factures sur la prod (service_role), asserter qu'aucune clé `abby_` n'apparaît dans les lignes retournées ; documenter le résultat dans les Completion Notes
  - [x] `tsc --noEmit` exit 0 ; suite complète verte ; `npm run build` ; grep AD-2

## Dev Notes

### État constaté (inventaire au grep — l'invariant est DÉJÀ tenu)

- **`fetchBPFData`** (`bpf-report-service.ts:113-118`) : le select facture = `id, amount, funding_type, invoice_date, invoice_date_confirmed, is_avoir, status, parent_invoice_id, external_reference, recipient_name, session_id` — **aucun `abby_*`**. Idem `fetchBPFDataForSession` (l.318+).
- **`computeSectionCFromInvoices`** (`bpf-calculator.ts:184`) : pur, entrée `InvoiceForBPF` = 5 champs sans `abby_*`. `computeDataGaps` idem.
- **Export « reports/factures »** (`page.tsx:94`) : select = `id, session_id, recipient_type, recipient_id, recipient_name, amount, reference, external_reference, status, due_date, is_avoir, created_at, prefix, number` — **aucun `abby_*`**.
- **Rapprochement** : `invoiceDisplayRef` (`invoice-display-ref.ts`) lit `reference`/`external_reference` — jamais `abby_*`.
- **Seule lecture d'`abby_push_state` dans le service BPF** : `updateInvoiceBPF` (verrou 3.5, story précédente) — c'est une GARDE de mutation, pas un calcul. À ne pas confondre (§ Task 2).

**Conclusion** : cette story n'a PAS de code produit à écrire (l'invariant est structurel). Sa valeur = les tests-témoins qui le FIGENT et attrapent une régression future, + la repro réelle. Ne rien « corriger » qui n'est pas cassé.

### Inventaire EXHAUSTIF (fait en validation — 6 selects `abby_` dans tout le repo, AUCUN en agrégat/export)

Les 6 seuls `.select()` contenant `abby_` sont TOUS hors périmètre agrégat/export (résolution push, verrou mutation, Factur-X per-facture) : `invoices/route.ts:232`, `abby-customers.ts:194`, `invoices.ts:50`, `email-attachments-resolver.ts:378`, `abby-push.ts:727`, `bpf-report-service.ts:220` (verrou 3.5). **Aucune surface d'agrégat/export ne lit `abby_*`** → l'invariant FR-20 est confirmé structurel, zéro code métier à corriger.

Surfaces d'agrégat/export vérifiées PROPRES (à couvrir par la garde, § Task 2) : BPF (`fetchBPFData`, `fetchBPFDataForSession`), export `reports/factures`, dashboard CA (`admin/page.tsx` + `revenue.ts`), affacturage (`affacturage/page.tsx` + `api/affacturage/route.ts`). Le dossier `reports/` entier a **zéro occurrence `abby_`** — aucun export « numéro Abby pour info » n'existe.

### Pièges connus

- **Faux positif du grep sur le verrou 3.5** (§ Task 2) : `bpf-report-service.ts` contient légitimement `abby_push_state` dans `updateInvoiceBPF`. La garde doit cibler les selects d'AGRÉGAT, pas le fichier entier.
- **Select strings invisibles pour tsc** : d'où la repro réelle (Task 4).
- **Ne pas ajouter de colonne `abby_*` au type `InvoiceForBPF`** « pour être complet » — ce serait exactement la régression que la story prévient.
- **`amount` négatif des avoirs** : le BPF les gère déjà (is_avoir + signe) — ne rien changer, juste vérifier l'invariance.

### Décisions tranchées (ne pas rouvrir)

1. **Zéro code produit** attendu si l'inventaire confirme l'absence de fuite — cette story est une story de tests-témoins (comme une partie des stories de non-régression). Si l'inventaire RÉVÈLE une fuite `abby_*` dans un export, la corriger devient une tâche supplémentaire documentée (mais improbable vu le grep initial).
2. **La garde structurelle (grep de source) est le livrable central** — un test fonctionnel seul ne suffit pas : il faut le test qui rougit si un futur dev ajoute `abby_state` à un select BPF.
3. **Repro réelle obligatoire** (AC-4) — les select strings ne sont pas typés ; seule une exécution réelle prouve qu'aucune colonne `abby_*` ne ressort.

### Ce qui N'EST PAS dans cette story

- Le lot et les avoirs (Epic 5) ; toute modification du calcul BPF, des exports ou du rapprochement (ils sont corrects). AUCUNE migration. AUCUN changement au verrou 3.5.

### References

- Epics § Story 4.4 ; Spine AD-6 (« `reference` et `external_reference` restent intouchées »), AD-11 (« les colonnes `abby_*` ne sont jamais une source pour BPF, exports ou rapprochements ») ; PRD FR-20
- Code : `bpf-report-service.ts:113-118/318` (selects BPF), `bpf-calculator.ts:170/184/265` (InvoiceForBPF + agrégats), `reports/factures/page.tsx:94` (export), `invoice-display-ref.ts` (rapprochement), `bpf-report-service.ts:220` (verrou 3.5 = exception légitime, ne PAS cibler)
- Précédents de garde grep : `no-abby-email.test.ts` (FR-19, story 4.3), grep AD-2

## Dev Agent Record

### Agent Model Used

claude-fable-5 (session BMAD autonome du 2026-07-21)

### Debug Log References

- Story de tests-témoins : AUCUN code produit modifié (l'invariant FR-20 est structurel). 21 nouveaux tests.
- Barrières : tsc exit 0 ; vitest **2566/2566** ; grep AD-2 propre ; build Next vert ; repro réelle prod OK.

### Completion Notes List

- **Garde structurelle** (`no-abby-in-bpf-exports.test.ts`, livrable central) : sur les 6 surfaces d'agrégat/export, tout `.select("…")` contenant `amount` ne doit PAS contenir `abby_` — le discriminant `amount` exclut naturellement le verrou 3.5 (`.select("abby_push_state")`, sans amount). + sentinelle anti-rot (les 5 fichiers non-type portent bien un select facturation). + garde `select("*")` (les 6 surfaces restent en colonnes explicites) avec l'angle mort de `formations/[id]/invoices/route.ts` documenté (route d'édition, sûre fonctionnellement, hors garde token). + types InvoiceForBPF/InvoiceForDataGaps/SessionBpfInvoice/DepositProgressInvoice/InvoiceLite sans champ abby_.
- **Invariance BPF** (`bpf-calculator.test.ts`) : `computeSectionCFromInvoices` et `computeDataGaps` — un lot « poussé/payé » dont les colonnes `abby_*` sont **gardées attachées et passées telles quelles à la fonction** (cast, PAS de re-projection qui les droperait) ≡ le même lot sans `abby_*`. Les deux entrées diffèrent réellement → si un jour la fonction se mettait à lire `abby_state`, le lot poussé divergerait et le témoin rougirait (détecteur réel, plus tautologique). Vecteur avec avoir négatif + cancelled + non_classifie.
- **Rapprochement** (`invoice-display-ref.test.ts`) : `invoiceDisplayRef` d'une facture poussée renvoie la référence INTERNE, jamais `abby_invoice_number`.
- **Repro réelle read-only** : les VRAIS selects BPF/export/CA exécutés sur la prod (service_role) → 0 colonne `abby_` dans les lignes (les select strings sont invisibles pour tsc).

### File List

- src/lib/abby/__tests__/no-abby-in-bpf-exports.test.ts (nouveau — garde structurelle + types)
- src/lib/__tests__/bpf-calculator.test.ts (modifié — 2 témoins d'invariance FR-20)
- src/lib/utils/__tests__/invoice-display-ref.test.ts (modifié — rapprochement ignore abby_)

## Change Log

- 2026-07-21 : Création de la story (dernière de l'Epic 4). Constat central : l'invariant FR-20 est DÉJÀ structurel (aucun `abby_*` dans les selects BPF/export, `InvoiceForBPF` sans champ abby). Story de tests-témoins : invariance BPF + garde structurelle grep (le livrable clé, attrape les régressions futures) + repro réelle. Piège noté : le verrou 3.5 lit légitimement `abby_push_state` dans updateInvoiceBPF — ne pas le confondre avec un calcul.
- 2026-07-21 : Implémentation complète (21 tests-témoins, 2566 au total, ZÉRO code produit — invariant structurel). Barrières vertes (tsc 0, build, repro prod). Status → review.
- 2026-07-21 : Revue fresh-context — **APPROVED**. Garde structurelle prouvée empiriquement (le reviewer a simulé l'ajout de `abby_state` au select CA → test rouge ; inventaire des 18 lecteurs de `formation_invoices` complet ; angle mort `select("*")` confirmé sûr — TabFinances somme uniquement `amount`). 1 finding Low : le témoin `computeSectionCFromInvoices` était tautologique (le lot poussé re-projeté par `toBpf` droppait les `abby_*` avant l'appel → deux entrées identiques). **Corrigé** (PR de review) : on passe désormais le lot poussé avec `abby_*` attachées (cast, comme le témoin `computeDataGaps` qui, lui, était déjà correct) → les entrées diffèrent réellement, le témoin détecte une future lecture d'`abby_state`. tsc 0, 82 tests verts.
- 2026-07-21 : Validation fresh-context — READY, affirmation « zéro fuite » CONFIRMÉE (6 selects `abby_` au total, aucun en agrégat/export ; dossier reports/ = zéro `abby_`). 2 raffinements majeurs repliés dans la garde AC-2 : (1) périmètre étendu de 2 à 6 surfaces (ajout dashboard CA `admin/page.tsx`+`revenue.ts` et affacturage) — sans quoi la garde ne couvrait que 2 surfaces sur 6 ; (2) angle mort `select("*")` de `formations/[id]/invoices/route.ts:21` (alimente le CA/marge TabFinances, tire physiquement les `abby_*` mais invisible au grep-token) → documenté comme sûr fonctionnellement mais hors garde structurelle. Discriminant anti-faux-positif prescrit (select contenant `amount` ET funding_type/reference) pour exclure le verrou 3.5 et les delete-guards. Frères de InvoiceForBPF confirmés sans abby_. Cas avoir-après-push : BPF agrège via is_avoir+signe, zéro dépendance abby_.
