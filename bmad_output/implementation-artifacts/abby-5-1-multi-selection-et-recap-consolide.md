# Story abby-5.1 : Sélectionner plusieurs factures et voir le récapitulatif consolidé

Status: review

baseline_commit: b7e8b459 (main après clôture Epic 4 — abby-4-4 done)

## Story

As a gérant,
I want cocher les factures éligibles d'une formation et voir un récapitulatif unique avant de confirmer,
So that je pousse une session entière en un geste informé (FR-13, moitié de FR-14).

## Contexte & périmètre (À LIRE EN PREMIER)

**Cette story livre la SÉLECTION + le RÉCAPITULATIF, PAS l'exécution.** L'exécution séquentielle du lot (boucle avance-saga facture par facture, récap final actionnable) est la story **5.2**. Comme la 3.2 avait livré la préview avec un CTA « Confirmer et finaliser » **désactivé** (câblé par la saga en 3.3), la 5.1 livre le récapitulatif consolidé avec un CTA **« Confirmer et pousser (N) » désactivé** + aide « L'exécution séquentielle du lot arrive dans la prochaine mise à jour. » — câblé en 5.2. C'est la même livraison progressive assumée qu'en 3.2.

**Ce qui EST livré ici** :
1. Une **case à cocher** sur chaque ligne de facture **éligible au lot** (dans TabFinances uniquement), + un tooltip focusable « pourquoi pas » sur les lignes non éligibles.
2. Une **barre d'action contextuelle** « Pousser la sélection vers Abby (N) », absente tant que 0 sélection.
3. Un **dialog récapitulatif consolidé** qui, à l'ouverture (geste explicite — AD-22), lance **N appels preview séquentiels côté client** (AD-14, AD-21), affiche une ligne par facture (destinataire, total, TVA, sort du client), les totaux du lot, et « X clients seront créés, Y existent déjà ».
4. La garantie **zéro effet de bord** à la fermeture (les previews sont read-only, comme la préview unitaire).

**Ce qui n'est PAS livré (5.2)** : la boucle d'exécution, la progression ligne à ligne du push, le récap final succès/échecs, le « Reprendre le push » par échec. **PAS d'avoirs** (5.3 — ils n'ont pas de case à cocher, cf. leur propre prédicat).

**Contraintes structurelles non négociables** :
- **AD-14** : le lot est une **composition CLIENT-SIDE** — AUCUNE route batch server-side, jamais `Promise.all`. Ici, même les N previews du récap sont **séquentielles**.
- **AD-13** : l'éligibilité au lot est calculée dans `src/lib/abby/eligibility.ts` (un seul endroit), consommée par l'UI. Éligible au lot = **bouton unitaire « Pousser vers Abby » visible ET actif** = `canPushInvoice(invoice, status)` (jamais poussée, non-avoir, non-annulée, connexion active).
- **AD-21** : la préview est **read-only côté Abby ET côté base** (ne persiste ni liaison, ni checkpoint, ni cache) — seule trace tolérée : `last_used_at`/`last_error` par `withAbbyConnection`. Le récap consolide N previews.
- **AD-22** : toute lecture Abby (dont les previews du récap) est déclenchée par un **geste explicite** (le clic sur la barre d'action), jamais au montage.
- **Périmètre** : le lot vit **UNIQUEMENT dans TabFinances** (factures d'une même formation) — jamais dans la vue globale `reports` (FR-13, décision périmètre). `InvoiceRow`/`InvoiceSection` ne sont utilisés QUE par TabFinances (vérifié) — aucun risque de fuite du lot ailleurs.
- **AUCUNE migration SQL. AUCUNE écriture Abby ou base** (hors télémétrie `withAbbyConnection` déclenchée par les previews).

## Acceptance Criteria

### AC-1 — Cases à cocher sur les seules lignes éligibles

**Given** TabFinances d'une formation dont l'entité a déjà activé sa connexion Abby (Zone Abby visible)
**When** les lignes s'affichent
**Then** seules les lignes **éligibles au lot** (`canPushInvoice(invoice, status)` — même prédicat que le bouton unitaire visible ET actif, AD-13) portent une `Checkbox`
**And** les lignes non éligibles n'ont pas de checkbox mais un **tooltip focusable** (accessible clavier, pas hover-only — UX-DR7) expliquant pourquoi (avoir → poussé depuis sa facture d'origine ; annulée → non transmissible ; poussée-**finalisée** → déjà transmise à Abby ; push **interrompu** → à reprendre depuis la ligne ; connexion inactive → reconnecter)
**And** si l'entité n'a jamais activé sa connexion (Zone Abby masquée), il n'y a **aucune** case à cocher ni barre de lot — l'UI reste strictement identique à l'existant (FR-8)

### AC-2 — Barre d'action contextuelle absente à 0 sélection

**Given** TabFinances avec des lignes éligibles
**When** aucune case n'est cochée
**Then** la barre « Pousser la sélection vers Abby (N) » est **absente** (jamais un bouton désactivé sans explication — UX-DR7 « Lot vide »)
**When** je coche N ≥ 1 factures (à travers les sections apprenants/entreprises/financeurs — la sélection est globale à TabFinances)
**Then** la barre apparaît avec le libellé exact « Pousser la sélection vers Abby (N) » où N = nombre de factures cochées
**And** le lot n'existe **pas** dans la vue `reports` (FR-13) — rien à y ajouter, la Zone Abby n'y a jamais existé ; un test verrouille que le récap/la sélection vivent dans `_components/finances/` (TabFinances) et nulle part sous `reports/`

### AC-3 — Récapitulatif consolidé par N previews séquentielles

**Given** une sélection de N factures
**When** je clique la barre d'action
**Then** un dialog récapitulatif s'ouvre et lance **N appels `GET /api/abby/invoices/[id]/preview` STRICTEMENT SÉQUENTIELS** côté client (jamais `Promise.all` — AD-14 ; déclenchés par le clic — AD-22)
**And** la progression de résolution est visible (« Prévisualisation k/N… », annoncée en `aria-live="polite"`)
**And** une fois résolu, le récap affiche **une ligne par facture** : destinataire (`recipient.name`), total (Total TTC), TVA (taux d'entité ou « Exonérée »), et le sort du client (`to_create` → « Sera créé » ; `linked`/`auto_linkable` → « Existe déjà »)
**And** les **totaux du lot** (Σ HT, Σ TVA, Σ TTC) et le sort consolidé « **X** clients seront créés, **Y** existent déjà » (X = nb `to_create`, Y = nb existants — calculés par une fonction pure testée)
**And** une facture dont la préview échoue (422 `abby_validation` « fiche incomplète », ou erreur) apparaît en ligne avec son **statut d'échec explicite** (jamais silencieusement omise) et est **exclue des totaux et du décompte** — le gérant voit avant de confirmer qu'elle ne partira pas telle quelle
**And** le CTA « Confirmer et pousser (N) » est rendu **DÉSACTIVÉ** avec l'aide « L'exécution séquentielle du lot arrive dans la prochaine mise à jour. » (livraison progressive — câblage 5.2)

### AC-4 — Fermeture sans effet de bord

**Given** le récapitulatif ouvert (previews résolues ou en cours)
**When** je le ferme sans confirmer
**Then** **zéro effet de bord** : aucune écriture Abby, aucune persistance base (mêmes garanties que la préview unitaire — AD-21) ; une résolution en cours est proprement abandonnée (flag `stale`)
**And** ma sélection est **préservée** (je peux rouvrir le récap) ; elle n'est purgée qu'au succès d'un lot (5.2) ou au changement d'entité

### AC-5 — Barrières & repro réelle

**Given** les barrières projet (`tsc --noEmit` + vitest, ESLint cassé)
**When** l'incrément est livré
**Then** les deux passent ; les prédicats d'éligibilité au lot et la fonction pure de consolidation sont **testés** (vitest) ; `npm run build` vert ; grep AD-2 propre
**And** une repro node read-only confirme que N previews séquentielles renvoient bien `outcome` + totaux exploitables (les select strings/reads Abby sont invisibles pour tsc — même méthode que les recettes 3.2/4.x). ⚠️ **Read-only strict** : la préview écrit `last_used_at` via `withAbbyConnection` — la repro reste tolérée (télémétrie), mais NE PAS pousser.

## Tasks / Subtasks

- [x] Task 1 — Prédicats d'éligibilité au lot dans `eligibility.ts` (AC-1) [TDD]
  - [x] `isBatchSelectable(invoice, connectionStatus)` = `canPushInvoice(invoice, connectionStatus)` — alias NOMMÉ (AD-13 : « éligibilité lot = unitaire visible et actif »). Ne PAS dupliquer la logique : composer sur `canPushInvoice` pour que lot et unitaire ne divergent jamais.
  - [x] `getBatchIneligibilityReason(invoice, connectionStatus): string | null` — message du tooltip pour une ligne **non** sélectionnable, dans CET ordre : `is_avoir` → « Un avoir se pousse depuis sa facture d'origine. » ; `status === "cancelled"` → « Facture annulée — non transmissible. » ; **`isPushFinalized({abby_push_state})`** (state `"finalized"`) → « Déjà transmise à Abby. » ; **push interrompu** (`abby_push_state !== null` mais NON finalisé, i.e. un état intermédiaire) → « Push interrompu — reprenez-le depuis cette ligne. » ; sinon connexion non active → `PUSH_DISABLED_TOOLTIP` (constante existante) ; retourne `null` si la ligne EST sélectionnable (pas de tooltip). ⚠️ **Ne PAS confondre finalisée et interrompue** : `InvoiceRow.tsx:71-83` affiche un bouton « Reprendre le push » + badge « Interrompue » sur un push intermédiaire à ~40 px du tooltip — dire « Déjà transmise » y serait faux et contradictoire (ces états existent déjà en prod depuis l'Epic 3). Composer sur le prédicat existant `isPushFinalized`, jamais un test `=== "finalized"` en dur.
  - [x] Tests vitest dans `eligibility.test.ts` : never-pushed + active → selectable, reason null ; avoir → non, reason avoir ; cancelled → non, reason annulée ; **`finalized` → non, reason « Déjà transmise à Abby. »** ; **état intermédiaire (`draft_created`/`lines_set`…) → non, reason « Push interrompu — reprenez-le depuis cette ligne. »** (distinct de finalisée) ; never-pushed + `desactivee`/`en_erreur` → non, reason reconnexion. Français.
- [x] Task 2 — Module pur de consolidation `src/lib/abby/batch.ts` (AC-3) [TDD]
  - [x] Type `BatchPreviewEntry` = `{ invoiceId; displayRef; recipientName; result: {kind:"ready"; outcome; totalHT; tvaAmount; totalTTC; vatExempt; tvaRate} | {kind:"blocked"; message} | {kind:"error"; message} }`.
  - [x] `summarizeBatchPreviews(entries: BatchPreviewEntry[]): BatchRecapSummary` où `BatchRecapSummary` = `{ readyCount; blockedCount; errorCount; toCreateCount; existingCount; totalHT; tvaAmount; totalTTC; vatExempt; tvaRate; hasBlocking }`. Règles : totaux = Σ des `ready` uniquement ; `toCreateCount` = nb `ready` avec `outcome==="to_create"` ; `existingCount` = nb `ready` avec `outcome` `linked`/`auto_linkable` ; `vatExempt`/`tvaRate` pris du 1er `ready` (régime d'entité commun — cohérent car TVA par entité, jamais par facture). ⚠️ **Aucune entrée `ready`** (que des échecs, ou liste vide) → la fonction reste **totale** : `vatExempt=false`, `tvaRate=0`, totaux à `0` (via un `find` avec valeurs par défaut, JAMAIS `entries.find(...)!` — la non-null assertion est interdite). `hasBlocking = blockedCount+errorCount > 0`. Fonction 100 % pure (aucun fetch, aucun Date).
  - [x] Tests vitest `src/lib/abby/__tests__/batch.test.ts` : lot 3 `ready` (2 to_create + 1 existing, assujetti 20 %) → totaux sommés, X=2/Y=1 ; lot mixte avec 1 `blocked` + 1 `error` → exclus des totaux, `hasBlocking=true`, décompte n'inclut pas les échecs ; lot 100 % exonéré → `vatExempt=true`, `tvaAmount=0` ; lot vide de `ready` (que des échecs) → totaux 0, `hasBlocking=true`. Français.
- [x] Task 3 — Sélection + case à cocher dans `InvoiceRow`/`InvoiceSection` (AC-1) [UI, vérif tsc/build]
  - [x] `InvoiceRow` : nouvelle **cellule de tête** (avant la référence, `w-8 shrink-0`) rendue UNIQUEMENT si `isAbbyZoneVisible(abbyConnectionStatus)` (sinon `null` — DOM identique à l'existant si connexion jamais activée). Si `isBatchSelectable(invoice, status)` → `<Checkbox checked={selected} onCheckedChange={() => onToggleSelect(invoice)} aria-label={...}>` ; sinon → un placeholder focusable (`<span tabIndex={0}>` avec `Tooltip` — même pattern accessible que le bouton désactivé de la Zone, l.120-138) affichant `getBatchIneligibilityReason(...)`. Si `abbyConnectionStatus === null` (non résolu) : Skeleton fin ou cellule vide (cohérent avec le Skeleton de la Zone).
  - [x] `InvoiceRow` props ajoutées : `selected: boolean`, `onToggleSelect: (inv: Invoice) => void`. `InvoiceSection` props ajoutées : `selectedIds: Set<string>`, `onToggleSelect` ; passe `selected={selectedIds.has(inv.id)}` à chaque `InvoiceRow`. ⚠️ Ces deux composants ne servent QUE TabFinances — pas de régression ailleurs.
  - [x] NE PAS ajouter de « tout sélectionner » (UX § Interdits : jamais une sélection « tout » incluant des non-éligibles — l'éviter supprime le risque à la racine ; décision documentée).
- [x] Task 4 — Barre d'action + état de sélection dans `TabFinances` (AC-2, AC-4) [UI]
  - [x] `const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set())`. Toggle = clone du Set (immutabilité React). Déclarer AVANT tout effet qui le reset (règle projet post-incident TDZ render-time).
  - [x] Reset de `batchSelected` dans le `useEffect` keyed `entity?.id` existant (là où `abbyPreviewTarget`/`abbyDetailTarget` sont déjà remis à zéro au switch d'entité).
  - [x] `handleToggleBatchSelect(inv)` : ajoute/retire `inv.id`. Passe `selectedIds`/`onToggleSelect` à chaque `<InvoiceSection>`.
  - [x] **Sélection effective** = `batchSelected` **intersecté** avec les factures encore éligibles. ⚠️ **Garde null tsc obligatoire** : `isBatchSelectable`/`canPushInvoice` exigent un `AbbyConnectionStatus` **non-null** (`eligibility.ts:59-64`), or `abbyConnectionStatus` est `AbbyConnectionStatus | null` (`TabFinances.tsx:182`). Dériver donc `const selectedInvoices = abbyConnectionStatus === "active" ? invoices.filter(i => batchSelected.has(i.id) && isBatchSelectable(i, abbyConnectionStatus)) : []` — cohérent (une sélection ne peut exister que connexion active) ET narrow le `| null` (jamais de `!`, jamais de `any` — règles absolues). L'intersection protège aussi d'un id périmé (facture devenue poussée entre-temps → plus `never-pushed` → exclue). La barre s'affiche ssi `selectedInvoices.length > 0`, libellé « Pousser la sélection vers Abby ({N}) ». Placer la barre juste sous la Zone 2 (au-dessus des sections) ou en barre contextuelle collante ; clic → ouvre le dialog récap avec `selectedInvoices`.
- [x] Task 5 — Dialog `AbbyBatchPushDialog` (AC-3, AC-4) [UI, orchestration séquentielle]
  - [x] Nouveau `src/app/(dashboard)/admin/formations/[id]/_components/finances/AbbyBatchPushDialog.tsx`. Props : `invoices: Invoice[] | null` (null = fermé), `onClose`, `onConfirmed` (réservé 5.2 — non câblé ici). Un seul niveau de modal (jamais empilé — UX-DR12).
  - [x] À l'ouverture (`invoices` non null) : `useEffect` avec flag `stale`, boucle `for` **séquentielle** (jamais `Promise.all`) `await fetch(/preview)` par facture ; mappe la réponse en `BatchPreviewEntry` (ok → `ready` avec `outcome`+totaux ; `error.code==="abby_validation"` → `blocked` ; sinon → `error`) ; met à jour l'état **incrémentalement** (chaque facture résolue s'affiche) + compteur `k/N` en `aria-live`. `return () => { stale = true }`.
  - [x] Rendu résolu : table (Destinataire · Total TTC · TVA · Sort) une ligne par entrée, badges « Sera créé »/« Existe déjà »/« Fiche incomplète »/« Erreur » ; bloc totaux via `summarizeBatchPreviews` (Σ HT / Σ TVA si non exonéré / Σ TTC) ; phrase « X clients seront créés, Y existent déjà » ; si `hasBlocking`, un `Alert` non bloquant « K facture(s) ne pourront pas être poussées telles quelles ».
  - [x] Footer : « Annuler » (focus initial, ferme sans effet — AC-4) puis CTA « Confirmer et pousser ({N}) » **désactivé** avec texte d'aide. Réutiliser les conventions du `AbbyPushPreviewDialog` (responsive `max-sm:*`, `onOpenAutoFocus` focus Annuler, scroll interne). Le CTA sera activé et câblé sur la boucle d'exécution en 5.2.
  - [x] Monté dans TabFinances à côté des autres dialogs Abby ; `open` piloté par un state `batchDialogInvoices: Invoice[] | null`.
- [x] Task 6 — Barrières + repro réelle (AC-5)
  - [x] `tsc --noEmit` exit 0 ; suite complète verte ; `npm run build` ; grep AD-2 (`grep -rn "abby_" src/app/api` ou équivalent projet — aucune fuite de secret/colonne chiffrée).
  - [x] Script node read-only : pour 2-3 factures éligibles réelles (compte MR/C3V test), appeler la logique de préview et vérifier que `outcome` + totaux ressortent, la consolidation donne des totaux cohérents. Documenter dans Completion Notes. **Ne jamais pousser.**

## Dev Notes

### État constaté (fichiers lus au baseline b7e8b459)

- **`eligibility.ts`** (AD-13, déjà riche) : `isPushButtonVisible` (= jamais poussée && status≠cancelled && !is_avoir, SANS condition connexion), `canPushInvoice(invoice, status)` (= `isPushButtonVisible` && status connexion `active`). **`canPushInvoice` EST exactement l'éligibilité au lot** → `isBatchSelectable` doit juste l'aliaser (ne pas ré-écrire). `PUSH_DISABLED_TOOLTIP` et `getPushDisabledReason(status)` existent déjà (réutiliser). Interface `AbbyPushEligibilityInput` = `{abby_push_state, status, is_avoir}`.
- **`InvoiceRow.tsx`** : layout `flex items-center gap-3` — ref(`w-24`) · recipient(`flex-1`) · montant(`w-24`) · badge statut(`w-36`) · **Zone Abby(`w-40`, rendue ssi `isAbbyZoneVisible`)** · actions(`w-52`). La Zone gère déjà le pattern tooltip-sur-bouton-désactivé accessible clavier (`<span tabIndex={0}>` autour d'un `<Button disabled>`, l.120-138) — **copier ce pattern** pour le placeholder « non éligible ». `AbbyZone` reçoit `status: AbbyConnectionStatus` (déjà non-null quand rendue).
- **`InvoiceSection.tsx`** : mappe `invoices` → `InvoiceRow`, transmet `abbyConnectionStatus`, `onAbbyPush`, `onAbbyDetail`, `...handlers`. Ajouter `selectedIds`/`onToggleSelect` au même passe-plat.
- **`TabFinances.tsx`** : détient `invoices` (via `GET /api/formations/[id]/invoices` → `fetchData`), `abbyConnectionStatus` (via `GET /api/abby/connections`, useEffect keyed `entity?.id` qui reset déjà `abbyPreviewTarget`/`abbyDetailTarget`), `abbyPreviewTarget`/`abbyDetailTarget` + leurs dialogs (l.1054-1066). Ajouter `batchSelected` + `batchDialogInvoices` sur ce modèle exact. Les 3 sections sont rendues l.1025-1041 — la sélection est **globale aux 3** (spec : « cocher les factures éligibles d'une formation »). Reset au switch d'entité = ligne à ajouter dans le useEffect l.192-215.
- **`AbbyPushPreviewDialog.tsx`** : le modèle du fetch preview (l.79-119) — `GET /api/abby/invoices/${id}/preview` → `{preview: AbbyInvoicePreview}` ou `{error: AbbyPreviewError}` ; `res.ok && "preview" in json` → ready ; `error.code==="abby_validation"` → blocked (+`missingFields`) ; sinon error. **Répliquer cette discrimination** par facture dans la boucle du batch. Conventions dialog (responsive, focus Annuler, `aria-live`) à reprendre.
- **`AbbyInvoicePreview`** (`types/abby.ts:89`) : `recipient.{name,type,outcome}` (`outcome` ∈ `linked|auto_linkable|to_create`), `totals.{totalHT, vatExempt, tvaRate, tvaAmount, totalTTC, exonerationMention}`, `invoice.{id,displayRef,isAvoir}`, `entity.name`, `resume`. **C'est la source exacte** de chaque `BatchPreviewEntry`.
- **Route preview** (`/api/abby/invoices/[id]/preview/route.ts`) : `GET`, sans query param, `resolveActiveEntityId(auth.profile)` résout l'entité serveur, `buildInvoicePreview` enveloppe `withAbbyConnection`. Read-only Abby+base (AD-21), pas de logAudit. Codes → statut : `abby_invalid_state`→409, `abby_not_found`→404, autre code→422, sans code→500.
- **`Checkbox`** shadcn : `src/components/ui/checkbox.tsx` EXISTE (déps `@radix-ui/react-checkbox` présente), déjà utilisé (TabQualiopi, BulkSlotCreator…). Import `import { Checkbox } from "@/components/ui/checkbox"`. Pas de nouveau composant primitif à créer (contrairement à tooltip/alert des stories 3.1/3.2).

### Ce que la story NE fait PAS (garde-fous anti-dérapage)

- **Pas de route batch** (AD-14) — tout est client-side. `summarizeBatchPreviews` est pur (pas de fetch).
- **Pas d'exécution** — le CTA reste désactivé (5.2). Ne PAS câbler de boucle push ici. Ne pas importer `abby-push.ts` côté client.
- **Pas d'avoirs** — un avoir n'a jamais de case à cocher (son prédicat is_avoir le sort de `isBatchSelectable`) ; son tooltip renvoie vers sa facture d'origine. Le push d'avoir = 5.3.
- **Pas de « tout sélectionner »** — décision (UX § Interdits). Cases individuelles uniquement.
- **Pas de migration SQL, pas d'écriture** (hors `last_used_at` télémétrie des previews).
- Ne PAS toucher aux routes/services serveur (préview existante suffit). Ne PAS modifier la vue `reports` (le lot n'y existe pas — FR-13).

### Tests — cadre projet

- **Barrières = `tsc --noEmit` + vitest** (ESLint cassé). Le repo n'a **aucun harnais de test de composant React** (`find src -name "*.test.tsx"` = vide) → NE PAS introduire React Testing Library. Le cœur testable de la 5.1 = les **fonctions pures** : `isBatchSelectable`/`getBatchIneligibilityReason` (eligibility.test.ts) et `summarizeBatchPreviews` (batch.test.ts). La logique du dialog/sélection est vérifiée par tsc + `npm run build` + la recette réelle.
- Jamais de `any` (règle absolue). Réutiliser les types `AbbyInvoicePreview`/`AbbyPreviewError`, `AbbyConnectionStatus`, `Invoice`.
- Noms de tests en français.

### Décisions de livraison

1. **CTA récap désactivé en 5.1** (aide « L'exécution séquentielle du lot arrive dans la prochaine mise à jour. ») — même rationale qu'en 3.2 : un CTA actif qui déclencherait des émissions LÉGALES en lot sans la boucle 5.2 serait dangereux. Désactivé = sûr et honnête ; le récap remplit déjà son rôle (informer avant de confirmer). Dérogation microcopy transitoire assumée, levée en 5.2.
2. **Previews du récap SÉQUENTIELLES** (pas parallèles) — le spec l'exige (« N appels preview séquentiels ») ET chaque préview fait une lecture Abby (résolution client) : séquentiel évite le rate-limit et cohère avec AD-14. Progression `k/N` annoncée.
3. **Lignes en échec affichées, pas masquées** — une facture à fiche incomplète (422) doit être VUE dans le récap (le geste doit être informé) ; exclue des totaux/décompte mais listée avec son motif. Sa correction/relance sera possible à l'exécution (5.2).
4. **Sélection préservée à la fermeture** — le gérant peut fermer le récap, corriger une fiche, rouvrir. Purge uniquement au succès d'un lot (5.2) ou au switch d'entité.

### Références

- Epic : `bmad_output/planning-artifacts/epics-abby-facturation-electronique.md` § Epic 5 / Story 5.1 (l.626-645), FR-13 (l.58), FR-14 (l.60, moitié), UX-DR7 (l.131).
- Architecture : `ARCHITECTURE-SPINE.md` AD-13 (l.116-120), AD-14 (l.122-126), AD-21 (l.164-168), AD-22 (l.170-174).
- UX : `EXPERIENCE.md` § Component Patterns (l.55 multi-sélection), § Interdits (l.79), § Lot vide (l.71), Flow 3 (l.126-131).
- Story sœur (pattern préview + CTA différé) : `abby-3-2-previsualisation-obligatoire.md`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (session BMAD dev-story du 2026-07-22)

### Debug Log References

- Barrières : `tsc --noEmit` exit 0 ; `vitest` **2585/2585** (dont 19 nouveaux : 13 éligibilité + 6 batch) ; `npm run build` exit 0 ; grep AD-2 propre.
- Aucune migration, aucune route/select serveur ajouté (5.1 = 100 % client-side, AD-14).

### Completion Notes List

- **Task 1 — prédicats (eligibility.ts)** : `isBatchSelectable` = alias NOMMÉ de `canPushInvoice` (lot et unitaire ne divergent jamais). `getBatchIneligibilityReason` scinde correctement « Déjà transmise à Abby » (finalisée, via `isPushFinalized`) et « Push interrompu — reprenez-le depuis cette ligne » (état intermédiaire) — le piège de validation. Tests : alignement strict lot↔unitaire sur la matrice complète, + chaque motif (avoir/annulée/finalisée/interrompue/reconnexion). 49 tests dans eligibility.test.ts.
- **Task 2 — consolidation pure (batch.ts)** : `summarizeBatchPreviews` agrège les `ready`, exclut `blocked`/`error` des totaux et du décompte, reste TOTALE sans aucune `ready` (défauts `vatExempt=false/tvaRate=0/0`, jamais de `!`). 6 tests (lot mixte, exonéré, que des échecs, vide).
- **Task 3 — InvoiceRow/InvoiceSection** : cellule de tête `w-8` rendue uniquement si `isAbbyZoneVisible` (DOM identique à l'existant si connexion jamais activée — FR-8) ; `Checkbox` sur les éligibles, placeholder focusable + `Tooltip` (motif) sinon — même pattern accessible clavier que le bouton désactivé de la Zone. Pas de « tout sélectionner » (UX § Interdits).
- **Task 4 — TabFinances** : `batchSelected: Set<string>` + `batchDialogInvoices` déclarés AVANT l'effet qui les reset (TDZ) ; reset au switch d'entité (même useEffect que preview/detail) ; `selectedInvoices` dérivé avec **garde null** (`abbyConnectionStatus === "active" ? … : []`) et intersecté avec `isBatchSelectable` (écarte un id périmé) ; barre « Pousser la sélection vers Abby (N) » absente à 0 sélection.
- **Task 5 — AbbyBatchPushDialog** : à l'ouverture, boucle `for` **séquentielle** (jamais `Promise.all`) sur `GET /preview`, état incrémental + compteur `k/N` en `aria-live` ; discrimination ready/blocked(`abby_validation`)/error répliquée du dialog unitaire ; table (Destinataire · TTC · TVA · Sort) + totaux via `summarizeBatchPreviews` + « X créés, Y existent déjà » + Alert non bloquante si `hasBlocking` ; CTA **désactivé** (aide « L'exécution séquentielle du lot arrive dans la prochaine mise à jour. ») — câblage 5.2 ; flag `stale` = zéro effet de bord à la fermeture (AC-4).
- **Task 6 — repro read-only prod** : sonde service_role (lecture seule) → **200+ factures éligibles au lot** en prod, **29 sessions avec ≥2 factures éligibles** (ex. une session à 5 factures company) → la sélection/barre/récap opèrent sur des données réelles. ⚠️ La re-vérification LIVE du `recipient.outcome` + totaux via la vraie préview N'A PAS été rejouée : elle exige la clé test Abby (supprimée du scratchpad — régénération recommandée) ET 5.1 n'ajoute AUCUN nouveau select/route serveur — la préview et le type `AbbyInvoicePreview` sont réutilisés INCHANGÉS de la 3.2 (déjà validés live à l'époque, et le mapping `resolvePreview` est vérifié par tsc).

### File List

- src/lib/abby/eligibility.ts (modifié — `isBatchSelectable` + `getBatchIneligibilityReason`)
- src/lib/abby/__tests__/eligibility.test.ts (modifié — 13 tests éligibilité lot)
- src/lib/abby/batch.ts (nouveau — `summarizeBatchPreviews` + types, pur)
- src/lib/abby/__tests__/batch.test.ts (nouveau — 6 tests consolidation)
- src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceRow.tsx (modifié — cellule de sélection + `BatchSelectCell`)
- src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceSection.tsx (modifié — passe-plat `selectedIds`/`onToggleSelect`)
- src/app/(dashboard)/admin/formations/[id]/_components/finances/AbbyBatchPushDialog.tsx (nouveau — récap consolidé séquentiel)
- src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx (modifié — état sélection + barre d'action + montage du dialog)

## Change Log

- 2026-07-22 : Implémentation complète (dev-story). 6 tasks livrées, 19 tests-cœur (13 éligibilité + 6 batch), 2585 au total. Prédicats lot (`isBatchSelectable`/`getBatchIneligibilityReason`) + consolidation pure (`summarizeBatchPreviews`) + case à cocher (InvoiceRow/Section) + barre d'action + dialog récap séquentiel (N previews, jamais Promise.all, CTA désactivé → 5.2). Barrières vertes (tsc 0, build, grep AD-2) ; repro read-only prod : 200+ factures éligibles, 29 sessions à ≥2 factures (données réelles). Status → review.
- 2026-07-21 : Validation fresh-context — **READY** après 3 correctifs appliqués. (1) MAJEUR : `getBatchIneligibilityReason` disait « Déjà transmise à Abby. » pour un push INTERROMPU (état intermédiaire non-null mais non finalisé) — faux et contradictoire avec le bouton « Reprendre le push » + badge « Interrompue » de la même ligne (`InvoiceRow.tsx:71-83`, états déjà en prod depuis l'Epic 3) → scindé sur `isPushFinalized` (finalisée → « Déjà transmise » ; interrompue → « Push interrompu — reprenez-le depuis cette ligne. »), AC-1 + test alignés. (2) Mineur : le snippet `selectedInvoices` passait `AbbyConnectionStatus | null` à `isBatchSelectable` (2ᵉ param non-null) → erreur tsc → garde `abbyConnectionStatus === "active" ? … : []` ajoutée. (3) Mineur : `summarizeBatchPreviews` sans entrée `ready` → rendue totale (défauts `vatExempt=false/tvaRate=0/0`, jamais de `!`). Points confirmés solides : éligibilité lot = `canPushInvoice` exact ; `Checkbox` shadcn existe ; `InvoiceRow`/`InvoiceSection` = TabFinances only (le `InvoiceRow` de reports/factures est une interface homonyme sans Zone Abby) ; reset entité au bon useEffect ; aucune route batch / aucun `Promise.all` / aucune écriture ; pas de harnais test composant → cœur testable = fonctions pures.
- 2026-07-21 : Création de la story (première de l'Epic 5, dernier epic P4). Périmètre tranché : **sélection + récapitulatif consolidé uniquement** — l'exécution est la 5.2 (CTA récap désactivé, même livraison progressive qu'en 3.2). Analyse exhaustive au baseline b7e8b459 : `canPushInvoice` EST déjà l'éligibilité au lot (aliaser, ne pas dupliquer — AD-13) ; le fetch preview du dialog unitaire est le modèle de la boucle séquentielle (AD-14/AD-21/AD-22) ; `AbbyInvoicePreview` porte exactement `recipient.outcome` + `totals` à consolider ; `Checkbox` shadcn existe déjà. Cœur testable isolé en fonctions pures (`isBatchSelectable`/`getBatchIneligibilityReason` + `summarizeBatchPreviews`) car le repo n'a pas de harnais de test composant. Garde-fous : aucune route batch, aucun `Promise.all`, aucune écriture, aucun avoir, pas de « tout sélectionner », TabFinances uniquement (jamais reports).
