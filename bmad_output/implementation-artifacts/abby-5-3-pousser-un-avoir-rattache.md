# Story abby-5.3 : Pousser un avoir rattaché à sa facture Abby d'origine

Status: done

baseline_commit: 1ca35f18 (main après abby-5-2 done)

## Story

As a gérant,
I want pousser un avoir comme une facture, lié à la facture Abby parente,
So that je compense légalement une facture finalisée au lieu de l'annuler (FR-15).

## Contexte & périmètre (À LIRE EN PREMIER)

**DERNIÈRE story de l'Epic 5 et du module Abby.** Un avoir (`is_avoir=true`, montant stocké NÉGATIF, `parent_invoice_id` → sa facture) se pousse vers Abby via la **MÊME machine à états et le MÊME module `abby-push.ts`** que la facture (AD-23), en **dispatchant sur `is_avoir`** vers la table d'endpoints `asset` : création via `createAsset` sur la facture Abby **parente** (qui copie ses lignes), puis lignes / general-informations / finalize via les endpoints **billing génériques** (qui acceptent un assetId). Résultat : un avoir numéroté `AV-YYYY-NNNN`, dont le PDF référence la parente (« Avoir en référence à la facture n°… ») = le bandeau FR-15.

**Cycle asset VÉRIFIÉ EMPIRIQUEMENT par écriture le 16/07** (recette 1.5, `investigations/abby-verifications-p0-2026-07-13.md:44`) : `createAsset(parentId)` copie les 2/2 lignes de la parente ; `billing.updateLines` accepte l'assetId (avoir partiel possible) ; `asset.updateGeneralInformations` OK ; `billing.finalize` → `AV-2026-0001` ; **PAS de timeline asset** → le checkpoint `details_set` est traversé en **1 seul appel** (« checkpoints fusionnés » AD-23) ; l'étape client est **sautée** (héritée de la parente).

**Ce qui EST livré ici** :
1. **3 wrappers ACL asset** (`createAsset`, `getAsset`, `setAssetGeneralInformations`) dans `client.ts` — aucun n'existe.
2. **Dispatch `is_avoir` sur TOUTE relecture d'état** : `abby-push.ts` (création `asset`, saut client, saut timeline, general-informations asset, `getAsset` à l'avance/reprise/réconciliation) ET `abby-status.ts` (`refreshInvoiceStatus` — « Actualiser le statut » d'un avoir finalisé — via `getAsset`, sinon 404). Helper partagé `readAbbyState`.
3. **Prédicats d'éligibilité avoir** (`eligibility.ts`) : `canPushAvoir` (parente poussée-finalisée, re-vérif serveur) + `canResumeAvoir` (avoir interrompu) + `getAvoirActionReason` (UI).
4. **Préview de l'avoir** : bandeau « Avoir rattaché à {réf parente} (Abby : {N° parent}) », résolution client SAUTÉE (héritée), « sort du client » masqué.
5. **UI** : bouton « Pousser l'avoir » / « Reprendre l'avoir » dans la Zone Abby (actif si parente finalisée, désactivé + tooltip sinon), **jamais de checkbox en Lot** (déjà exclu par `isBatchSelectable`).
6. **Tests machine à états couvrant les DEUX types** (facture ET avoir, reprise incluse — AD-23).

**Ce qui n'est PAS livré** : aucune migration (colonnes `parent_invoice_id`, index UNIQUE `abby_invoice_id`, CHECK `abby_push_state` existent déjà) ; pas de « lot d'avoirs » (l'avoir n'a pas de checkbox — le lot 5.1/5.2 ne concerne que les factures) ; l'enregistrement du paiement d'un avoir reste hors périmètre (`canRecordPaymentInLms` exclut déjà `is_avoir`).

**Contraintes structurelles non négociables** :
- **AD-23** : une SEULE machine à états, deux tables d'endpoints sur `is_avoir`. **Toute** opération (avance, reprise, relecture d'état réel) dispatche sur `is_avoir`. Ne JAMAIS créer une seconde machine à états.
- **AD-8/AD-9** : un `POST /push` = une étape ; verrou CAS re-tamponné, checkpoints conditionnels, `abby_invoice_id` (= l'assetId pour l'avoir) persisté avant tout appel ultérieur. Route `POST /push` INCHANGÉE (la saga lit `is_avoir` en base).
- **AD-5** : garde-fou SIRET `getMe` exactement 1×/saga (à l'acquisition/ré-acquisition) — **AUSSI pour l'avoir** (émission légale).
- **AD-13** : éligibilité avoir dans `eligibility.ts` (un endroit), consommée par l'UI ET **re-vérifiée serveur** (parente finalisée) — jamais un avoir sur une parente non finalisée (Abby rejetterait, et l'`abby_invoice_id` parent serait NULL).
- **AD-17** : montant avoir → **valeur absolue** en centimes (la nature créditrice est portée par le type `asset`). Le mapper `toAbbyInvoiceLines(..., {isAvoir:true})` le fait DÉJÀ.
- Règles projet : jamais de `any`, jamais de `!` non-null, barrières `tsc` + `vitest` ; ⚠️ **les types SDK mentent** (CLAUDE.md module) → valider les noms de méthodes asset en mode test.

## Acceptance Criteria

### AC-1 — Wrappers ACL asset (client.ts)

**Given** l'ACL `src/lib/abby/client.ts` n'expose aucun wrapper asset
**When** on l'étend
**Then** 3 wrappers purs-ACL sont ajoutés : `createAsset(abby, parentInvoiceId): Promise<{id}>` (= `abby.invoice.createAsset({path:{invoiceId: parentInvoiceId}})`, `id` normalisé `String`) ; `getAsset(abby, assetId): Promise<{id; number; state; finalizedAt}>` (= `abby.asset.getAsset({path:{assetId}})`, `number` "" → null, **PAS de `paidAt`** — absent du `ReadAssetDto`) ; `setAssetGeneralInformations(abby, assetId, body)` (= `abby.asset.updateGeneralInformations({path:{assetId}, body})`, `vatMention` JAMAIS envoyé)
**And** mêmes conventions défensives que `getAbbyInvoice` (normalisation, `as never` sur les payloads si le typage SDK l'exige)

### AC-2 — Éligibilité avoir (parente poussée-finalisée)

**Given** `eligibility.ts`
**When** on ajoute le prédicat avoir
**Then** `canPushAvoir(avoir, parent)` = `avoir.is_avoir && avoir.abby_push_state === null && avoir.status !== "cancelled" && parent != null && parent.abby_push_state === "finalized" && parent.abby_invoice_id != null` (fonction PURE, testée) — prédicat **serveur** (buildInvoicePreview + saga re-vérifient `abby_invoice_id`)
**And** `canResumeAvoir(avoir, parent, now)` (pur) — avoir au push INTERROMPU reprenable : `avoir.is_avoir && abby_push_state ∈ états intermédiaires && verrou périmé/null && status ≠ "cancelled" && parent.abby_push_state === "finalized"` (miroir de `isPushResumable` pour l'avoir — SANS lui, un avoir interrompu n'a AUCUN chemin de reprise UI, le `reconcileAndAdvance` serveur AC-4 ne serait jamais déclenché → asset bloqué chez Abby)
**And** un `getAvoirActionReason(avoir, parentPushState)` (pur) renvoie le motif du tooltip du bouton désactivé — signature basée sur `parentPushState: string | null` (dispo sur le type UI `Invoice`, PAS `abby_invoice_id`) : parente jamais poussée/en cours → « La facture d'origine doit d'abord être transmise à Abby. » ; avoir déjà poussé-finalisé → « Déjà transmis à Abby. » ; annulé → « Avoir annulé — non transmissible. » ; sinon `null`
**And** `isPushButtonVisible`/`isBatchSelectable`/`isPushResumable` continuent d'**exclure** les avoirs (aucun bouton push facture ni checkbox lot ni reprise facture sur un avoir — INCHANGÉ, non-régression testée) : le chemin avoir est ENTIÈREMENT porté par les nouveaux prédicats avoir

### AC-3 — Saga avoir : dispatch `is_avoir` (même machine à états)

**Given** un avoir dont la parente est poussée-finalisée, confirmé au dialog
**When** la saga s'exécute (`POST /push`, boucle avance-saga partagée 5.2)
**Then** la MÊME machine à états (`pushing → draft_created → lines_set → details_set → finalized`), le MÊME CHECK, le MÊME verrou CAS, le MÊME garde-fou SIRET (1×) sont utilisés, en **dispatchant sur `is_avoir`** :
- **acquisition** (`null → pushing`) : verrou + `getMe` SIRET, mais **PAS de `ensureCustomerForRecipient`** (client hérité de la parente)
- **création** (`pushing → draft_created`) : `createAsset(client, parent.abby_invoice_id)` au lieu de `createDraftInvoice` ; l'assetId retourné = `abby_invoice_id` de l'avoir (même colonne, même checkpoint, même anti-doublon 23505)
- **lignes** (`draft_created → lines_set`) : `setInvoiceLines` INCHANGÉ (`toAbbyInvoiceLines(..., {isAvoir:true})` → valeur absolue ; repli « 1 ligne = |montant| » de `loadInvoiceLines` réutilisé)
- **détails** (`lines_set → details_set`) : **PAS de `setInvoiceTimeline`** ; uniquement `setAssetGeneralInformations` (1 appel → checkpoint fusionné AD-23)
- **finalisation** (`details_set → finalized`) : `finalizeBilling` INCHANGÉ + relecture via **`getAsset`** (pas `getAbbyInvoice`) → `abby_invoice_number = "AV-YYYY-NNNN"`
**And** le blocage actuel `if (invoice.is_avoir) → abby_invalid_state` (`abby-push.ts:355-363`) est **supprimé** et remplacé par le chemin avoir
**And** la parente est **re-vérifiée serveur** (finalisée + `abby_invoice_id` non null) avant `createAsset` — sinon `abby_invalid_state` (AD-13)

### AC-4 — Reprise & relecture d'état réel de l'avoir (TOUTES les relectures dispatchent)

**Given** un avoir au push interrompu (état intermédiaire, verrou périmé)
**When** la reprise se déclenche (même boucle 3.4/5.2, `reconcileAndAdvance`)
**Then** la relecture d'état réel côté Abby se fait via **`getAsset`** (pas `getAbbyInvoice`) — sinon 404 déclencherait à tort `abby_draft_missing` (l'asset n'est pas une invoice) ; « numéro présent = finalisée » (`ReadAssetDto.number` optionnel) conclut sans réécrire ; la logique de reprise (états intermédiaires, verrou périmé, restart) reste **agnostique** du type
**And** un avoir interrompu est **atteignable depuis l'UI** : `InvoiceRow` affiche « Reprendre l'avoir » (`canResumeAvoir`) → même `onAbbyPush` → dialog → `POST /push` → `reconcileAndAdvance`. Sans ce câblage, la reprise serveur ne serait jamais déclenchée (asset à demi-créé bloqué). `buildInvoicePreview` accepte donc AUSSI un avoir resumable (pas seulement `canPushAvoir`).

### AC-4bis — L'« Actualiser le statut » d'un avoir finalisé dispatche aussi (⚠️ BLOQUANT sinon)

**Given** un avoir FINALISÉ (`abby_push_state="finalized"`) dont le badge est cliquable → dialog détail (Epic 4)
**When** je clique « Actualiser le statut Abby » → `POST /status` → `refreshInvoiceStatus` (`abby-status.ts`)
**Then** la relecture se fait via **`getAsset`** (pas `getAbbyInvoice`) — SINON `getInvoice(assetId)` renvoie **404** → `abby_not_found` → « Introuvable chez Abby » persisté en `abby_last_error` sur CHAQUE avoir légalement émis (défaut grave, DERNIÈRE story = pas de rattrapage)
**And** `refreshInvoiceStatus` n'écrit jamais de `paid_at`/`abby_paid_at` pour un avoir (`ReadAssetDto` n'a pas de `paidAt` ; un avoir n'est pas « payé ») — le mapping d'état ignore le paiement pour un avoir

### AC-5 — Préview & UI de l'avoir

**Given** un avoir dont la parente est poussée-finalisée
**When** j'ouvre sa préview (clic « Pousser l'avoir »)
**Then** le dialog porte le bandeau « **Avoir rattaché à {référence parente} (Abby : {Numéro Abby parent})** » (UX-DR8) ; la résolution du client Abby est **SAUTÉE** (héritée — pas d'appel `resolveRecipient`) ; les totaux affichent le montant en valeur absolue ; le dialog **N'AFFICHE PAS** la ligne « sort du client » (« Sera créé / Existe déjà ») pour un avoir (client hérité — l'affichage serait trompeur) : la présence de `preview.parent` gate le bandeau parente à la place de l'outcome
**And** dans TabFinances, l'avoir porte un bouton « **Pousser l'avoir** » **actif** si la parente est finalisée (avoir jamais poussé), **« Reprendre l'avoir »** si son push est interrompu (`canResumeAvoir`), **désactivé + tooltip focusable** sinon (`getAvoirActionReason`), et **jamais de checkbox en Lot** (`isBatchSelectable` exclut déjà `is_avoir`)

### AC-6 — Machine à états testée sur les DEUX types + barrières

**Given** les barrières projet (`tsc --noEmit` + vitest)
**When** l'incrément est livré
**Then** les deux passent ; **le test de la machine à états couvre facture ET avoir, reprise incluse** (AD-23) : un run avoir complet `NULL → finalized` assertant `createAsset` (pas `createDraftInvoice`), `ensureCustomer` JAMAIS appelé, `setInvoiceTimeline` JAMAIS appelé, `getAsset` (pas `getAbbyInvoice`) à la finalisation/réconciliation, numéro `AV-…` ; test mapper avoir montant négatif → valeur absolue (déjà présent — vérifier)
**And** `npm run build` vert ; grep AD-2 propre ; la suite Epic 3/4/5 reste verte (non-régression facture)
**And** ⚠️ **AUCUNE recette d'ÉCRITURE Abby** en dev (émission légale d'avoir = mutation prod : `abby_invoice_id`, numérotation `AV-…`). ⚠️ **Les types SDK mentent** : les noms `abby.invoice.createAsset` / `abby.asset.getAsset` / `abby.asset.updateGeneralInformations` sont à **valider empiriquement en mode test** (gérant, `scripts/abby-recette-mode-test.mjs`) avant mise en service — le cycle create/lines/GI/finalize est déjà confirmé (1.5, 16/07), mais PAS ces wrappers exacts NI **le PDF de l'avoir** (`billing.downloadPdf(assetId)` — générique, probablement OK mais NON recetté le 16/07). Recette gérant consignée dans Completion Notes, couvrant : (1) push avoir → `AV-…` + états ; (2) **« Actualiser le statut »** de l'avoir finalisé (dispatch `getAsset` → pas de « Introuvable ») ; (3) **PDF Factur-X de l'avoir** (filigrane SPECIMEN + bandeau « Avoir en référence à la facture n°… »).

## Tasks / Subtasks

- [x] Task 1 — Wrappers ACL asset dans `client.ts` (AC-1)
  - [x] `createAsset(abby, parentInvoiceId): Promise<{ id: string }>` → `abby.invoice.createAsset({ path: { invoiceId: parentInvoiceId } })` ; `id: String(data.id)`.
  - [x] `getAsset(abby, assetId): Promise<{ id: string; number: string | null; state: string; finalizedAt: number | null }>` → `abby.asset.getAsset({ path: { assetId } })` ; mêmes normalisations que `getAbbyInvoice` (`number` vide → null, epochs bruts). **NE PAS exposer `paidAt`** (absent de `ReadAssetDto`).
  - [x] `setAssetGeneralInformations(abby, assetId, body: { footerNote?: string }): Promise<void>` → `abby.asset.updateGeneralInformations({ path: { assetId }, body: body as never })`. `vatMention` jamais transmis (QO-1).
  - [x] ⚠️ Vérifier les signatures réelles dans `node_modules/@abby-inc/node/dist/types/client/sdk.gen.d.ts` (`createAsset` l.106, classe `Asset` `getAsset`/`updateGeneralInformations` l.189-197) — le typage SDK est parfois faux à l'exécution, `as never` sur les bodies si besoin (comme les wrappers existants).
- [x] Task 2 — Prédicats d'éligibilité avoir `eligibility.ts` (AC-2, AC-4) [TDD]
  - [x] `canPushAvoir(avoir, parent)` (pur, SERVEUR) : entrée avoir (`is_avoir`, `abby_push_state`, `status`) + parente (`abby_push_state`, `abby_invoice_id`) ou `null`. Voir AC-2. Utilisé par `buildInvoicePreview` + la saga (qui ont `abby_invoice_id`).
  - [x] `canResumeAvoir(avoir, parent, now)` (pur) : avoir interrompu reprenable — `is_avoir && abby_push_state ∈ INTERMEDIATE_STATES && verrou périmé/null && status ≠ "cancelled" && parent?.abby_push_state === "finalized"` (miroir de `isPushResumable`). SANS lui, aucun chemin de reprise UI (AC-4).
  - [x] `getAvoirActionReason(avoir, parentPushState: string | null)` (pur, UI, motifs verbatim) : signature basée sur `parentPushState` (dispo sur le type UI `Invoice` — PAS `abby_invoice_id`, absent de `Invoice`). Motifs : parente non finalisée → « La facture d'origine doit d'abord être transmise à Abby. » ; avoir finalisé → « Déjà transmis à Abby. » ; annulé → « Avoir annulé — non transmissible. » ; sinon `null`.
  - [x] NE PAS toucher `isPushButtonVisible`/`isBatchSelectable`/`isPushResumable` (l'avoir reste exclu — non-régression interdite).
  - [x] Tests `eligibility.test.ts` : `canPushAvoir` (parente finalisée → oui ; parente non finalisée/null/avoir déjà poussé/annulé → non) ; `canResumeAvoir` (état intermédiaire + verrou périmé + parente finalisée → oui ; verrou frais → non ; parente non finalisée → non) ; `getAvoirActionReason` (chaque motif) ; **assertions de non-régression : `isPushButtonVisible`/`isBatchSelectable`/`isPushResumable` restent `false` sur un avoir**. Français.
- [x] Task 3 — Dispatch `is_avoir` dans la saga `abby-push.ts` (AC-3, AC-4) [core]
  - [x] **A** — Supprimer le blocage `if (invoice.is_avoir) → abby_invalid_state` (`:355-363`).
  - [x] **B** — Charger la parente : ajouter `parent_invoice_id` au select + un embed self-référentiel `parent:formation_invoices!parent_invoice_id(abby_invoice_id, abby_invoice_number, reference, abby_push_state)` (ou une requête dédiée si l'embed self-ref pose souci — vérifier au runtime, cast documenté). Étendre `PushInvoiceRow` (`:52-71`).
  - [x] **C** — À l'acquisition (`stepAcquireAndEnsureCustomer`, état `null`) : pour un avoir, la garde d'éligibilité devient `canPushAvoir(invoice, invoice.parent)` (re-vérif serveur AD-13, remplace `isPushButtonVisible`) ; garder verrou + `getMe` SIRET (AD-5) ; **SAUTER `ensureCustomerForRecipient` (`:689`)**.
  - [x] **D** — `stepCreateDraft` (`pushing → draft_created`) : pour un avoir, **SAUTER le lookup `abby_customer_links` (`:725-741`)** ; appeler `createAsset(client, invoice.parent.abby_invoice_id)` au lieu de `createDraftInvoice`. Garde : si `parent.abby_push_state !== "finalized"` ou `parent.abby_invoice_id == null` → `abby_invalid_state` AVANT l'appel. Le checkpoint (`:754`) stocke l'assetId dans `abby_invoice_id` (INCHANGÉ, anti-doublon 23505 réutilisé).
  - [x] **E** — `stepSendLines` (`draft_created → lines_set`) : **INCHANGÉ** (déjà `toAbbyInvoiceLines(..., {isAvoir: invoice.is_avoir})` `:807` + repli `loadInvoiceLines` `:284-293`). Ne rien modifier — c'est le point de réutilisation maximale.
  - [x] **F/G** — `stepSendDetails` (`lines_set → details_set`) : pour un avoir, **NE PAS appeler `setInvoiceTimeline`** ; appeler UNIQUEMENT `setAssetGeneralInformations(client, abbyId, toAbbyGeneralInformations(vatExempt))` (le mapper `toAbbyGeneralInformations` est réutilisé — même `footerNote`). 1 appel → checkpoint `details_set` (fusionné, AD-23).
  - [x] **H** — `stepFinalize` (`details_set → finalized`) : `finalizeBilling` INCHANGÉ ; relecture via **`getAsset`** pour un avoir (au lieu de `getAbbyInvoice`, `:904`). Numéro `AV-…` stocké dans `abby_invoice_number`.
  - [x] **I** — `reconcileAndAdvance` (`:494-578`) : relecture via **`getAsset`** pour un avoir (au lieu de `getAbbyInvoice`, `:521`). Même logique « numéro présent = finalisée ».
  - [x] **Helper de dispatch partagé** : `readAbbyState(client, id, isAvoir)` (dans `client.ts`, à côté de `getAsset`/`getAbbyInvoice`) qui choisit l'endpoint — consommé par `abby-push.ts` (H, I) ET `abby-status.ts` (point J) pour ne pas disperser les `if (is_avoir)`. Sa forme de retour = le sous-ensemble commun `{id, number, state, finalizedAt}` (PAS `paidAt` — absent de l'asset).
  - [x] **J (⚠️ BLOQUANT) — `refreshInvoiceStatus` dans `src/lib/services/abby-status.ts`** : la garde actuelle (`isPushFinalized && abby_invoice_id`, ~`:112-124`) N'EXCLUT PAS `is_avoir` et relit via `getAbbyInvoice` → **404 sur tout avoir finalisé** (« Introuvable » persisté). Corriger : charger `is_avoir`, dispatcher la relecture via `readAbbyState(..., is_avoir)` (→ `getAsset` pour l'avoir) ; NE PAS écrire de `paid_at`/`abby_paid_at` pour un avoir (l'asset n'a pas de `paidAt`). Ajouter `is_avoir` au select de la route status.
  - [x] **PDF de l'avoir (M2)** : `getInvoicePdf` (`abby-status.ts`) utilise `downloadInvoicePdf` = `billing.downloadPdf` (**générique**, accepte a priori un assetId) → aucun changement de code attendu, MAIS non recetté sur asset le 16/07 → à valider en recette (AC-6). Vérifier qu'aucune garde `is_avoir` ne bloque le `/pdf` d'un avoir.
- [x] Task 4 — Préview de l'avoir (AC-5) [service + type + dialog]
  - [x] `AbbyInvoicePreview` (`types/abby.ts`) : ajouter `parent: { displayRef: string; abbyNumber: string | null } | null` (**optionnel/nullable** — aucune casse sur les factures). NE PAS toucher au `recipient.outcome` requis existant.
  - [x] `buildInvoicePreview` (`abby-invoice-preview.ts`) : **brancher explicitement `is_avoir`** — (1) éligibilité : accepter l'avoir si `canPushAvoir(avoir, parent)` **OU** `canResumeAvoir(...)` (aujourd'hui la garde `:127` rejette TOUT avoir → à ouvrir sur ces prédicats) ; (2) charger la parente (`parent_invoice_id` dans `PREVIEW_INVOICE_COLUMNS`) ; (3) **SAUTER `resolveRecipient` (`:222`)** pour l'avoir (client hérité) ; (4) injecter `parent = {displayRef: parent.reference/displayRef, abbyNumber: parent.abby_invoice_number}` ; (5) totaux en valeur absolue (repli déjà `Math.abs`). Pour `recipient.outcome` (champ requis) : poser une valeur neutre documentée (ex. `"linked"`) qui **ne sera PAS affichée** — le dialog masque l'outcome dès que `preview.parent` est présent (cf. ci-dessous).
  - [x] `AbbyPushPreviewDialog` : si `preview.parent` → afficher le bandeau « Avoir rattaché à {parent.displayRef} (Abby : {parent.abbyNumber ?? "—"}) » (UX-DR8) en tête, ET **masquer la ligne « sort du client »** (« Sera créé / Existe déjà ») — trompeuse pour un avoir. Le CTA « Confirmer et finaliser » fonctionne comme pour une facture (même boucle 5.2).
- [x] Task 5 — UI TabFinances / InvoiceRow (AC-5)
  - [x] **`TabFinances` précalcule et passe un booléen** (⚠️ pas d'appel `canPushAvoir` en UI — le type `Invoice` n'a PAS `abby_invoice_id`, donc un appel casserait tsc). Pour chaque avoir : `avoirParentPushState = invoices.find(i => i.id === avoir.parent_invoice_id)?.abby_push_state ?? null` (le parent est dans `invoices` ; introuvable = null → bouton désactivé). Passer `avoirParentPushState` (string|null) via `InvoiceSection` (passe-plat, comme `selectedIds`).
  - [x] `InvoiceRow.AbbyZone` : pour un avoir (`invoice.is_avoir`), calculer un `avoirActionLabel` distinct = « **Pousser l'avoir** » si `avoirParentPushState === "finalized"` **et** avoir jamais poussé ; « **Reprendre l'avoir** » si `canResumeAvoir(...)` ; sinon bouton **désactivé + `Tooltip` focusable** avec `getAvoirActionReason(invoice, avoirParentPushState)` (réutiliser le pattern `span tabIndex={0}` existant). Clic → `onAbbyPush(invoice)` (dialog préview, déjà câblé).
  - [x] ⚠️ Le badge `deriveAbbyBadge` s'applique déjà à l'avoir (mêmes colonnes `abby_*`) — vérifier que le badge d'un avoir finalisé reste cliquable (dialog détail, Epic 4) et que « Actualiser le statut » y fonctionne (point J). Pas de badge « Reprendre » facture sur un avoir (porté par le bouton avoir).
- [x] Task 6 — Tests machine à états (facture + avoir) + barrières (AC-6)
  - [x] `abby-push.test.ts` : **remplacer** le test obsolète « avoir → abby_invalid_state » (`:230-235`) par un **run avoir complet** `NULL → finalized`. Mocker les 3 wrappers asset (`createAsset`, `getAsset`, `setAssetGeneralInformations`) + `readAbbyState` au bloc `vi.mock("@/lib/abby/client")`. `makeDb` doit fournir la ligne PARENTE (champ `parent` sur l'objet renvoyé par `maybeSingle` mocké — retourné verbatim). Assertions : `createAsset` appelé avec `parent.abby_invoice_id` (pas `createDraftInvoice`) ; `ensureCustomerForRecipient` **jamais** appelé ; `setInvoiceTimeline` **jamais** appelé ; `getAsset` (pas `getAbbyInvoice`) à la finalisation ; `abby_invoice_number = "AV-…"`. + 1 test **reprise avoir** (réconciliation via `getAsset`, pas `getAbbyInvoice`). + garde **parente non finalisée → `abby_invalid_state`**.
  - [x] **`abby-status.test.ts` (point J)** : test qu'un avoir finalisé passe `refreshInvoiceStatus` par **`getAsset`** (jamais `getAbbyInvoice` → jamais `abby_not_found`/« Introuvable »), et n'écrit PAS de `paid_at`.
  - [x] `eligibility.test.ts` (Task 2 : `canPushAvoir`/`canResumeAvoir`/`getAvoirActionReason` + non-régression) + `mappers.test.ts` (vérifier le test avoir montant négatif existant `:110-118`).
  - [x] `tsc --noEmit` exit 0 ; suite COMPLÈTE verte (non-régression facture Epic 3/4/5) ; `npm run build` ; grep AD-2.
  - [x] Consigner dans Completion Notes la **recette gérant MODE TEST** (jamais en dev) : (1) push avoir sur facture test finalisée → `AV-…` + 5 états ; (2) « Actualiser le statut » de l'avoir → pas de « Introuvable » (dispatch getAsset OK) ; (3) PDF Factur-X de l'avoir → filigrane SPECIMEN + bandeau « Avoir en référence à la facture n°… ». Valide aussi empiriquement les noms SDK (types mensongers).

## Dev Notes

### Cartographie précise (lue au baseline 1ca35f18)

**Saga `abby-push.ts`** — machine à états : `advancePushStep` (`:315`) → `dispatchStep` (`:450`) switch sur `abby_push_state` : `null`→`stepAcquireAndEnsureCustomer` (`:623`, verrou `.is(null)` + `getMe` SIRET `:685` + `ensureCustomerForRecipient` `:689`) ; `pushing`→`stepCreateDraft` (`:715`, lookup link `:725-741` + `createDraftInvoice` `:744` + checkpoint `abby_invoice_id` `:754`) ; `draft_created`→`stepSendLines` (`:778`, `toAbbyInvoiceLines {isAvoir}` `:807` + `setInvoiceLines` `:817`) ; `lines_set`→`stepSendDetails` (`:836`, `setInvoiceTimeline` `:860` PUIS `setInvoiceGeneralInformations` `:864`, UN checkpoint) ; `details_set`→`stepFinalize` (`:884`, `finalizeBilling` `:903` + `getAbbyInvoice` `:904`). Reprise/réconciliation : `reconcileAndAdvance` (`:494`, SIRET `:517` + `getAbbyInvoice` `:521`). Verrou CAS `restampLock` (`:156`), checkpoint conditionnel `checkpoint` (`:196`), anti-doublon 23505 (`:763`). Blocage avoir actuel : `:355-363`.

**`loadInvoiceLines` (`:257-293`)** : MÊME source et MÊME repli que la préview — sans lignes DB, renvoie 1 ligne `{session.title, 1, Math.abs(amount)}`. **Réutilisable pour l'avoir tel quel** (avoirs LMS = sans lignes, montant négatif). Le mapper `toAbbyInvoiceLines {isAvoir:true}` (`mappers.ts:64-90`) applique `Math.abs` (déjà testé `mappers.test.ts:110-118`).

**ACL `client.ts`** : wrappers existants `createDraftInvoice` (`invoice.createInvoiceByContactOrOrganizationId`), `setInvoiceLines` (`billing.updateLines` — **générique, accepte un assetId**), `setInvoiceTimeline` (`invoice.updateTimeline`), `setInvoiceGeneralInformations` (`invoice.updateInvoiceGeneralInformations`), `finalizeBilling` (`billing.finalize` — **générique, accepte un assetId**), `getAbbyInvoice` (`invoice.getInvoice`, normalise `number` ""→null `:157`). **AUCUN wrapper asset** — 3 à créer (Task 1). SDK (`node_modules/@abby-inc/node/dist/types/client/sdk.gen.d.ts`) : `abby.invoice.createAsset({path:{invoiceId}})` (l.106, réponse `ReadAssetDto` avec `id`+`number?`) ; classe `Asset` (l.189) `getAsset({path:{assetId}})` (l.193, `ReadAssetDto` : `number?`, `state`, `finalizedAt?`, `refundAt?` — **pas de `paidAt`**), `updateGeneralInformations({path:{assetId}, body})` (l.197). **Pas d'`updateTimeline` sur Asset** → confirme AD-23.

**Relation parente** : `formation_invoices.parent_invoice_id UUID REFERENCES formation_invoices(id)` (déjà en base). L'avoir a besoin de `parent.abby_invoice_id` (input `createAsset`) + `parent.abby_invoice_number`/`reference` (bandeau). Piège : parente DOIT être `finalized` (sinon `abby_invoice_id` NULL et Abby rejette).

**Éligibilité `eligibility.ts`** : `isPushButtonVisible` (`:54`) exclut `is_avoir` (commentaire `:51-52` : « Le push d'avoir a son propre prédicat — story 5.3 »). `isBatchSelectable`/`canPushInvoice` idem. Aucun prédicat avoir existant. `canRecordPaymentInLms` exclut aussi `is_avoir` (hors scope).

**UI** : `InvoiceRow.AbbyZone` (`:103-197`) — pour un avoir, `actionLabel` vaut `null` (ni `isPushButtonVisible` ni `isPushResumable`). Badge « AV » violet (`:229-233`). `deriveAbbyBadge` s'applique aux avoirs (mêmes colonnes `abby_*`). Le bouton avoir doit descendre l'info parente depuis `TabFinances` (le parent est dans `invoices`, cf. l'`avoirParent` déjà calculé en TabFinances pour le dialog avoir). `buildInvoicePreview` (`abby-invoice-preview.ts`) : éligibilité (`:127`), `resolveRecipient` (`:222`, à sauter pour avoir), repli ligne unique `Math.abs` (`:170-177`), `PREVIEW_INVOICE_COLUMNS` (`:26`, ajouter `parent_invoice_id`). `AbbyInvoicePreview` (`types/abby.ts:89`) sans champ parent.

**Route push** (`push/route.ts`) : passe `entityId`+`invoiceId`+`{restartFromZero}` seulement → **la saga lit `is_avoir` (et la parente) en base**. **AUCUNE modif route.** La boucle client `runInvoicePushLoop` (5.2) est agnostique → réutilisée telle quelle.

**⚠️ Surface POST-PUSH (Epic 4) — dispatch OBLIGATOIRE aussi (findings validation B1/M2)** : `abby-status.ts` gère l'après-finalisation, atteignable pour un avoir finalisé via le badge cliquable → `AbbyInvoiceDetailDialog` :
- **`refreshInvoiceStatus`** (« Actualiser le statut ») : garde `isPushFinalized && abby_invoice_id` **SANS exclusion `is_avoir`** (contrairement au paiement `.eq("is_avoir", false)`), relit via `getAbbyInvoice` → **404 sur l'avoir** → « Introuvable » persisté. **MUST dispatcher via `readAbbyState(..., is_avoir)` → `getAsset`** (point J, Task 3). Pas de `paid_at` pour un avoir.
- **`getInvoicePdf`** (« Télécharger PDF Factur-X ») + `email-attachments-resolver` : `downloadInvoicePdf` = `billing.downloadPdf` **générique** → accepte a priori un assetId, **aucune modif de code attendue**, mais NON recetté sur asset (M2, recette AC-6).
- **`canRecordPaymentInLms`** exclut déjà `is_avoir` (`abby-status.ts` `.eq("is_avoir", false)`) → paiement d'avoir hors scope, correct.

**Type UI `Invoice` (`finances-display.ts`)** : porte les colonnes `abby_*` **SAUF `abby_invoice_id`** → ne JAMAIS appeler `canPushAvoir` (qui teste `parent.abby_invoice_id`) côté UI (casserait tsc, règle « ni any ni ! »). L'UI passe un `avoirParentPushState: string|null` précalculé ; le serveur (`buildInvoicePreview` + saga, qui ont `abby_invoice_id`) porte la garde `abby_invoice_id != null` (AD-13, re-vérif serveur).

**Piège SDK** : dans `sdk.gen.d.ts`, `createAsset` existe sur la classe `Invoice` (l.106) — NE PAS confondre avec `Advance.createAsset` (l.187, autre contrôleur). Le wrapper doit appeler `abby.invoice.createAsset`, pas `abby.advance.*`.

### Ce que la story NE fait PAS

- Pas de seconde machine à états (AD-23) — un seul module, dispatch `is_avoir`.
- Pas de migration (colonnes/index/CHECK existent).
- Pas de modif de la route push, ni de `push-loop.ts`, ni de `mappers.ts` (`toAbbyInvoiceLines`/`toAbbyGeneralInformations` déjà avoir-aware), ni de `setInvoiceLines`/`finalizeBilling` (génériques).
- Pas de lot d'avoirs (pas de checkbox — `isBatchSelectable` exclut `is_avoir`, inchangé).
- Pas d'enregistrement de paiement d'avoir.
- Pas de `restartFromZero` particulier — la reprise avoir = même mécanisme (getAsset au lieu de getInvoice).

### Pièges (relevés à la cartographie)

1. **`getAsset` vs `getAbbyInvoice`** : la relecture (finalize `:904` ET réconciliation `:521`) DOIT viser l'endpoint asset pour un avoir — un `getInvoice` sur un assetId renvoie 404 → déclencherait à tort `abby_draft_missing` (`:526`).
2. **`ReadAssetDto` sans `paidAt`** — `getAsset` ne prétend pas en lire (un avoir n'est pas « payé »).
3. **Parente non finalisée** = push avoir bloqué EN AMONT (prédicat UI + garde serveur `stepCreateDraft` avant `createAsset`) — `abby_invoice_id` parent NULL sinon.
4. **Numérotation `AV-…`** vient de `finalize` puis `getAsset().number` — à confirmer en mode test.
5. **Index UNIQUE `abby_invoice_id`** partagé facture/avoir : l'assetId a un id distinct de la parente → pas de collision ; l'anti-doublon 23505 protège aussi l'avoir.
6. **`resolveRecipient` en préview** à sauter pour l'avoir (client hérité) — sinon appel Abby inutile + `outcome` non pertinent.
7. **Types SDK mensongers** (`downloadPdf`/`service_delivery` l'ont prouvé) — valider `createAsset`/`getAsset`/`updateGeneralInformations` en mode test avant mise en service. Le CYCLE est déjà confirmé (1.5), pas ces wrappers exacts.
8. **`AbbyZone` sans contexte parente** — l'info « parente finalisée » descend de `TabFinances`.

### Tests — cadre projet

- **Barrières = `tsc` + `vitest`**. Cœur testable : `canPushAvoir`/`getAvoirIneligibilityReason` (purs) + le **run saga avoir** dans `abby-push.test.ts` (SDK mocké via `vi.mock("@/lib/abby/client")` — ajouter les 3 wrappers asset). Le test machine à états couvre **facture ET avoir** (AD-23).
- Non-régression : toute la suite facture (Epic 3/4/5) reste verte après le dispatch.
- Jamais de `any`, jamais de `!`. Noms de tests en français.
- ⚠️ Écriture Abby (émission légale) = geste gérant mode test, JAMAIS en dev/E2E.

### Références

- Epic : `epics-abby-facturation-electronique.md` § Story 5.3 (l.668-695), FR-15.
- Architecture : `ARCHITECTURE-SPINE.md` AD-23 (l.176-180, saga avoir), AD-17 (l.140-144, valeur absolue), AD-8/AD-9 (checkpoints), AD-13 (éligibilité), AD-5 (SIRET).
- Vérif empirique cycle asset : `investigations/abby-verifications-p0-2026-07-13.md:36-53` (CONFIRMÉ PAR ÉCRITURE 16/07).
- UX : `EXPERIENCE.md` UX-DR8 (bandeau avoir).
- Stories sœurs : `abby-3-3` (saga facture), `abby-3-4` (reprise), `abby-1-5` (vérif cycle asset).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (session BMAD dev-story du 2026-07-23)

### Debug Log References

- Barrières : `tsc --noEmit` exit 0 ; `vitest` **2623/2623** ; `npm run build` exit 0 ; grep AD-2 propre ; **aucune migration** (le `.sql` non suivi du repo n'est pas de cette story).
- Non-régression FACTURE : `abby-push.test.ts` 42/42 (le swap getAbbyInvoice→readAbbyState préserve le comportement facture) ; `abby-status.test.ts` 29/29 ; `abby-invoice-preview.test.ts` 21/21.
- Embed self-référentiel `parent:formation_invoices!parent_invoice_id(...)` typecheck OK (cast documenté, objet OU null au runtime).

### Completion Notes List

- **Task 1 — ACL asset** (`client.ts`) : `createAsset` (`abby.invoice.createAsset`, pas `advance`), `getAsset` (`abby.asset.getAsset`, SANS `paidAt`), `setAssetGeneralInformations` (`abby.asset.updateGeneralInformations`) + helper **`readAbbyState(abby, id, isAvoir)`** partagé (dispatch getAsset/getAbbyInvoice, `paidAt=null` pour l'avoir). Signatures SDK confirmées dans `dist/types/client/sdk.gen.d.ts`. tsc valide `abby.asset`.
- **Task 2 — éligibilité** (`eligibility.ts`) : `canPushAvoir` (serveur, parente finalisée + `abby_invoice_id`), `canResumeAvoir` (avoir interrompu, miroir `isPushResumable`), `getAvoirActionReason` (UI, sur `parentPushState`). `isPushButtonVisible`/`isBatchSelectable`/`isPushResumable` INCHANGÉS (excluent l'avoir). 18 tests + non-régression.
- **Task 3 — saga** (`abby-push.ts`, points A→J) : blocage avoir supprimé ; chargement parente (embed) ; `stepAcquire` = éligibilité `canPushAvoir` + getMe SIRET + **saut `ensureCustomer`** ; `stepCreateDraft` = **saut lookup client + `createAsset(parent.abby_invoice_id)`** (garde parente finalisée re-vérifiée) ; `stepSendLines` INCHANGÉ ; `stepSendDetails` = **saut timeline + `setAssetGeneralInformations`** ; finalize + réconciliation via `readAbbyState(..., is_avoir)`. **Point J** : `refreshInvoiceStatus` (`abby-status.ts`) relit aussi via `readAbbyState` → un avoir finalisé n'affiche plus « Introuvable » (bug B1) et n'écrit jamais de `paid_at`.
- **Task 4 — préview** : `AbbyInvoicePreview.parent` (nullable) ; `buildInvoicePreview` branche `is_avoir` (éligibilité `canPushAvoir`/`canResumeAvoir`, **saut `resolveRecipient`**, injection `parent`, `outcome` neutre) ; dialog affiche le bandeau « Avoir rattaché à … » et **masque le « sort du client »** dès `preview.parent`.
- **Task 5 — UI** : `TabFinances` précalcule `avoirParentStateById` (jamais `canPushAvoir` côté UI — `Invoice` n'a pas `abby_invoice_id`) passé via `InvoiceSection` → `InvoiceRow`. `AbbyZone` unifié (label/active/tooltip) : « Pousser l'avoir » / « Reprendre l'avoir » / désactivé+tooltip.
- **Task 6 — tests + barrières** : run avoir complet `NULL → finalized` (createAsset pas createDraftInvoice, ensureCustomer/timeline jamais appelés, `readAbbyState(..., true)`, numéro `AV-…`) + reprise avoir (réconciliation via getAsset, pas de recréation) + garde parente non finalisée + point J (avoir finalisé → getAsset, pas de « Introuvable », pas de paid_at). ⚠️ **Recette d'écriture Abby NON exécutée** (émission légale, mutation prod) — recette gérant MODE TEST à faire : (1) push avoir → `AV-…` ; (2) « Actualiser le statut » de l'avoir ; (3) PDF Factur-X de l'avoir (SPECIMEN + bandeau parente). Valide aussi les noms SDK.

### File List

- src/lib/abby/client.ts (modifié — `createAsset`/`getAsset`/`setAssetGeneralInformations`/`readAbbyState`)
- src/lib/abby/eligibility.ts (modifié — `canPushAvoir`/`canResumeAvoir`/`getAvoirActionReason`)
- src/lib/abby/__tests__/eligibility.test.ts (modifié — 18 tests avoir + non-régression)
- src/lib/services/abby-push.ts (modifié — dispatch is_avoir A→I, saga avoir)
- src/lib/services/abby-status.ts (modifié — point J : refreshInvoiceStatus via readAbbyState)
- src/lib/services/abby-invoice-preview.ts (modifié — branche avoir, bandeau parente, saut résolution)
- src/lib/types/abby.ts (modifié — `AbbyInvoicePreview.parent`)
- src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceRow.tsx (modifié — bouton avoir)
- src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceSection.tsx (modifié — passe-plat `avoirParentStateById`)
- src/app/(dashboard)/admin/formations/[id]/_components/finances/AbbyPushPreviewDialog.tsx (modifié — bandeau avoir + masquage sort client)
- src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx (modifié — calcul `avoirParentStateById`)
- src/lib/services/__tests__/abby-push.test.ts (modifié — run avoir + reprise + mocks asset)
- src/lib/services/__tests__/abby-status.test.ts (modifié — point J)
- src/lib/services/__tests__/abby-invoice-preview.test.ts (modifié — champ `parent` au toEqual)

## Change Log

- 2026-07-23 : Revue fresh-context — **APPROVED** (3 risques critiques propres : non-régression facture, dispatch is_avoir exhaustif, garde parente finalisée). Reco du reviewer : smoke-test read-only de l'embed self-ref. **CE SMOKE-TEST A RÉVÉLÉ UN BUG BLOQUANT** : PostgREST renvoie `parent:formation_invoices!parent_invoice_id(...)` en **TABLEAU**, pas en objet → `invoice.parent.abby_push_state` = undefined → tout push d'avoir refusé à tort (« facture d'origine non transmise »), même parente finalisée. Le code échouait FERMÉ (aucune émission malformée) mais la feature était inopérante ; les tests passaient car le mock fournissait un objet — piège « select strings invisibles pour tsc/vitest ». **Corrigé** : helper `firstOrNull` normalise l'embed (tableau→objet) dans abby-push.ts ET abby-invoice-preview.ts ; fixtures de test passés en TABLEAU pour refléter la prod et verrouiller la régression. + commentaire obsolète corrigé. tsc 0, 2623 tests, build vert.
- 2026-07-23 : Implémentation complète (dev-story). 6 tasks, saga avoir via cycle asset (dispatch is_avoir A→J), 3 wrappers ACL + helper readAbbyState partagé, éligibilité avoir (push + reprise), préview + bandeau parente, UI bouton avoir. Point J (B1) résolu : refreshInvoiceStatus relit un avoir via getAsset. 2623 tests (dont run avoir NULL→finalized, reprise avoir, point J, non-régression facture) ; tsc 0 ; build vert ; aucune migration ; route push inchangée. Recette d'écriture Abby (avoir mode test) NON exécutée = geste gérant. Status → review.
- 2026-07-23 : Validation fresh-context — **READY** après 7 correctifs. (BLOQUANT B1) point de dispatch OUBLIÉ : `refreshInvoiceStatus` (`abby-status.ts`, « Actualiser le statut ») relit via `getAbbyInvoice` sans exclusion `is_avoir` → 404 « Introuvable » sur CHAQUE avoir finalisé → ajout du point J (dispatch `getAsset`) + AC-4bis + test + helper partagé `readAbbyState`. (Majeur M2) PDF de l'avoir (`billing.downloadPdf(assetId)` générique, non recetté sur asset) → ajouté à la recette + Dev Notes. (Majeur M3) aucun chemin de reprise UI pour un avoir interrompu (`isPushResumable`+`canPushAvoir` l'excluent tous deux) → `canResumeAvoir` + bouton « Reprendre l'avoir » + `buildInvoicePreview` accepte un avoir resumable (AC-4). (m4) préview : brancher explicitement `is_avoir` (la garde rejetait tout avoir) + masquer le « sort du client » (outcome trompeur). (m5) type UI `Invoice` sans `abby_invoice_id` → l'UI passe `avoirParentPushState` précalculé, jamais `canPushAvoir`. (m6) chemin SDK corrigé (`dist/types/client/`). (m7 optionnel) event audit avoir distinct — laissé optionnel. Confirmés SOLIDES : signatures SDK exactes (`invoice.createAsset`/`asset.getAsset`/`asset.updateGeneralInformations`, `ReadAssetDto` sans `paidAt`), dispatch A→I fidèle, lignes réutilisées (avoirs = 0 ligne → repli `Math.abs`), double garde parente finalisée, run avoir testable.
- 2026-07-22 : Création de la story (DERNIÈRE de l'Epic 5 et du module Abby). L'avoir réutilise la MÊME machine à états `abby-push.ts` (AD-23), dispatch `is_avoir` sur 9 points (A→I) : suppression du blocage, chargement parente, éligibilité avoir (parente finalisée, re-vérif serveur), saut client, `createAsset(parentAbbyId)`, lignes INCHANGÉES (repli + mapper déjà avoir-aware), saut timeline + `setAssetGeneralInformations`, `getAsset` à la finalisation ET à la réconciliation. 3 wrappers ACL asset à créer (aucun n'existe). Préview : bandeau parente + résolution client sautée. UI : bouton « Pousser l'avoir » (parente finalisée) sans checkbox lot. Cycle asset CONFIRMÉ par écriture 16/07 ; wrappers SDK exacts à valider en mode test (types SDK mensongers). Aucune migration, route push inchangée, `mappers.ts`/`setInvoiceLines`/`finalizeBilling` réutilisés. Test machine à états couvre facture ET avoir (AD-23).
