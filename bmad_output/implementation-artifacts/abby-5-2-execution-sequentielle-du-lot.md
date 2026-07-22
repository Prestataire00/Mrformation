# Story abby-5.2 : Exécuter le lot séquentiellement, les erreurs n'arrêtent rien

Status: review

baseline_commit: 294a924f (main après abby-5-1 done)

## Story

As a gérant,
I want une exécution facture par facture avec un récap final actionnable,
So that un échec isolé ne bloque jamais le reste de la session (FR-14).

## Contexte & périmètre (À LIRE EN PREMIER)

**Cette story CÂBLE le CTA « Confirmer et pousser (N) » que la 5.1 avait livré DÉSACTIVÉ.** À la confirmation du récapitulatif consolidé (5.1), le lot s'exécute : chaque facture éligible passe par **exactement** la même boucle avance-saga que le push unitaire (story 3.3), **strictement séquentiellement**, et **une erreur n'arrête jamais le lot**. À la fin, un récap actionnable montre succès/échecs par ligne avec « Reprendre le push » sur chaque échec.

**Ce qui EST livré ici** :
1. **Factorisation** de la boucle avance-saga unitaire (aujourd'hui inline dans `AbbyPushPreviewDialog.runPushLoop`) dans un module partagé `src/lib/abby/push-loop.ts` — pour que lot et unitaire exécutent **le même code** (AD-14 : le lot est une composition de pushes unitaires).
2. **Refactor du dialog unitaire** pour consommer ce module (parité stricte, zéro régression du push unitaire de l'Epic 3).
3. **Exécution du lot** dans `AbbyBatchPushDialog` : boucle `for await` sur les factures `ready`, une facture à la fois, chacune avançant sa saga jusqu'à `finalized` ou échec ; les erreurs n'arrêtent pas le lot.
4. **Progression ligne à ligne** annoncée en `aria-live` (facture k/N, étape s/5).
5. **Récap final actionnable** : « X finalisées · Y à reprendre », statut par ligne (numéro Abby si finalisée, motif si échec), bouton **« Reprendre le push »** par ligne en échec (reprise unitaire 3.4 = re-jouer la boucle pour cette seule facture).
6. Rafraîchissement de TabFinances + **purge de la sélection** à la fin du lot.

**Ce qui n'est PAS livré** : les avoirs (5.3). Aucune nouvelle route serveur, aucune migration.

**Contraintes structurelles non négociables** :
- **AD-14** : orchestration **CLIENT-SIDE**, **jamais `Promise.all`**, **aucune route batch serveur**. Les factures s'exécutent **strictement séquentiellement** (une saga complète finie avant de démarrer la suivante).
- **AD-8** : un `POST /api/abby/invoices/[id]/push` = UNE étape ; le client boucle jusqu'à `done`. La reprise (3.4) = la MÊME boucle (le serveur infère l'état). Route et saga INCHANGÉES (réutilisées).
- **AD-9/AD-10** : verrou 2 min, checkpoints, garde-fou SIRET, idempotence, unicité `abby_invoice_id` — TOUT est **côté serveur** (le client ne fait qu'appeler la route). « Chaque facture suit exactement les règles du push unitaire » = appeler la même route via le même orchestrateur.
- **AD-22** : l'exécution est déclenchée par un **geste explicite** (clic « Confirmer et pousser »), jamais au montage.
- Règles projet : jamais de `any`, jamais de `!` non-null, barrières `tsc` + `vitest`.

## Acceptance Criteria

### AC-1 — Boucle avance-saga partagée (factorisation, parité unitaire)

**Given** la boucle avance-saga vit aujourd'hui inline dans `AbbyPushPreviewDialog.runPushLoop` (l.128-197)
**When** on factorise
**Then** un module `src/lib/abby/push-loop.ts` expose `runInvoicePushLoop(invoiceId, opts)` qui exécute la saga d'UNE facture jusqu'à un résultat terminal, **sans aucune dépendance UI ni toast** (orchestration pure : fetch + `getResumeStep` + rapport d'étape par callback)
**And** le dialog unitaire consomme ce module et se comporte **exactement** comme avant (succès + toast, `abby_draft_missing` → « Repartir de zéro ? », erreur, état inattendu, reprise) — parité prouvée (aucune régression Epic 3)
**And** le module ne fait **aucun** `Promise.all`, **aucune** route batch (AD-14) et réutilise la route `POST /push` INCHANGÉE

### AC-2 — Exécution séquentielle, les erreurs n'arrêtent rien

**Given** le récapitulatif consolidé (5.1) confirmé (CTA désormais ACTIF)
**When** je clique « Confirmer et pousser (N) »
**Then** le client exécute les N factures `ready` **une par une** (`for await`, jamais `Promise.all` — AD-14) ; chaque facture parcourt sa saga complète via `runInvoicePushLoop` (mêmes règles serveur : verrou, checkpoints, garde-fou SIRET, validation — FR-9..FR-12)
**And** si la facture k **échoue** (réseau, `abby_validation`, `abby_draft_missing`, verrou, état inattendu), le lot **CONTINUE** avec k+1 — jamais d'arrêt
**And** le dialog est **verrouillé** pendant l'exécution (pas de fermeture jusqu'à la fin — comme le push unitaire pendant sa saga)

### AC-3 — Progression ligne à ligne (aria-live)

**Given** l'exécution en cours
**When** chaque facture avance
**Then** la ligne de la facture courante affiche son étape (« Étape s/5 — … ») et l'avancement global (« Facture k/N ») est annoncé en `aria-live="polite"` (UX-DR7)
**And** chaque facture terminée fige son statut (numéro Abby si finalisée, motif si échec) avant que la suivante démarre

### AC-4 — Récap final actionnable

**Given** toutes les factures traitées
**When** le lot se termine
**Then** le récap final affiche « **X** finalisée(s) · **Y** à reprendre » (calculé par une fonction PURE testée) et, par ligne, le statut : numéro Abby (finalisée) ou motif (échec)
**And** chaque ligne en échec porte un bouton **« Reprendre le push »** qui re-joue `runInvoicePushLoop` pour CETTE seule facture (reprise unitaire 3.4 : le serveur infère l'état intermédiaire et poursuit) puis met à jour sa ligne
**And** à la fin du lot, TabFinances est rafraîchi (badges à jour) et la sélection est **purgée**

### AC-5 — Barrières & repro

**Given** les barrières projet (`tsc --noEmit` + vitest)
**When** l'incrément est livré
**Then** les deux passent ; les helpers PURS (`classifyPushHttpResponse`, `summarizeBatchExecution`) et l'orchestrateur `runInvoicePushLoop` (fetch mocké) sont **testés** ; `npm run build` vert ; grep AD-2 propre
**And** `abby-push.test.ts` (service saga) + le nouveau `push-loop.test.ts` (orchestrateur) restent/deviennent **verts** (non-régression de la factorisation). ⚠️ **Il n'existe AUCUN test de dialog** dans le repo (`find src -name "*.test.tsx"` = vide) : la parité UI du dialog unitaire (toast de succès, aria-live d'étape, bascule `confirmRestart`, étape initiale, verrou) n'est couverte par AUCUN test — `tsc`/`build` ne détectent pas une régression comportementale.
**And** ⚠️ **AUCUNE recette d'ÉCRITURE Abby** (le push mute la prod : `abby_invoice_id`, `abby_push_state`, numérotation légale). Deux recettes MANUELLES en **mode test** (gestes du gérant, comme la recette 3.3), consignées dans Completion Notes, jamais en E2E/script : (1) **push unitaire** — vérifier la parité après factorisation (succès + toast, reprise, « Repartir de zéro » sur draft_missing) ; (2) **lot** — sélectionner plusieurs factures, confirmer, vérifier l'exécution séquentielle + progression + récap final + « Reprendre » sur un échec provoqué.

## Tasks / Subtasks

- [x] Task 1 — Module partagé `src/lib/abby/push-loop.ts` (AC-1) [TDD]
  - [x] `type PushLoopOutcome = { kind: "finalized"; number: string | null } | { kind: "draft_missing"; message: string } | { kind: "error"; message: string }`. (`draft_missing` distinct car le dialog unitaire propose « Repartir de zéro » dessus ; le lot le traite comme un échec « à reprendre ».)
  - [x] `classifyPushHttpResponse(ok, json): { step: AbbyPushStepOutcome } | { terminal: PushLoopOutcome }` — helper **PUR** (pas de fetch) : `ok && "step" in json && step.done` → terminal finalized(number) ; `ok && "step" in json && !done` → `{step}` (continuer) ; `!ok` avec `error.code==="abby_draft_missing"` → terminal draft_missing ; sinon `!ok`/pas de step → terminal error(message). Testé exhaustivement.
  - [x] `runInvoicePushLoop(invoiceId, opts?: { restartFromZero?: boolean; onStep?: (step: number) => void }): Promise<PushLoopOutcome>` : boucle `for (;;)` `POST /api/abby/invoices/${invoiceId}/push` (body `{restartFromZero:true}` sur le **1er** appel uniquement si demandé) ; à chaque réponse, `classifyPushHttpResponse` → terminal (return) ou `{step}` (calcule `getResumeStep(step.state)` ; si `=== 1` → terminal error ; sinon `onStep(next)` et continue) ; `catch` réseau → terminal error. **AUCUN** setState/toast ici. **JAMAIS** `Promise.all`.
    - [x] ⚠️ **L'orchestrateur N'ÉMET PAS l'étape INITIALE** via `onStep` (contrat volontaire, à documenter en tête de fichier) : `onStep` ne rapporte que l'étape SUIVANTE après chaque POST. **C'est l'APPELANT qui pose l'étape de départ** (cf. Task 2 & 3) — sans quoi l'affichage « Étape 1/5 » et le verrou du 1er POST disparaîtraient (régression Epic 3 non couverte par les tests).
    - [x] ⚠️ **Messages d'erreur repris À L'IDENTIQUE** de l'inline actuel (parité stricte, `AbbyPushPreviewDialog.tsx:184/192-193`) : état inattendu → `"État de push inattendu — rechargez la page."` ; réseau → `"Le push a été interrompu (réseau). Vous pourrez le reprendre."` ; fallback `!ok` sans message → `"Le push a échoué."`.
    - [x] Pas de paramètre `shouldAbort` (le dialog est verrouillé pendant l'exécution — aucun appelant n'en a besoin ; éviter une branche morte non testée).
  - [x] `summarizeBatchExecution(outcomes: PushLoopOutcome[]): { finalizedCount: number; failedCount: number; total: number }` — PUR, testé (« X finalisées · Y à reprendre » ; `failedCount` = tout ce qui n'est pas `finalized`, i.e. `draft_missing` + `error`).
  - [x] Tests `src/lib/abby/__tests__/push-loop.test.ts` : `classifyPushHttpResponse` sur done/continue/draft_missing/error ; `runInvoicePushLoop` avec **fetch mocké** (`global.fetch = vi.fn()` — pattern établi du repo, cf. `src/lib/utils/__tests__/batch-doc-send.test.ts:44`) : (a) 3 étapes puis done → finalized+numéro ; (b) draft_missing → outcome draft_missing ; (c) 422 error → outcome error (message verbatim) ; (d) throw réseau → outcome error (message réseau verbatim) ; (e) `restartFromZero` → body `{restartFromZero:true}` envoyé au **1er** POST seulement ; (f) `onStep` appelé aux bons paliers (jamais l'étape initiale) ; **(g) réponse `ok` avec `step.state` inattendu (`getResumeStep → 1`) → terminal error « état inattendu », boucle STOPPÉE (pas de boucle infinie)** ; `summarizeBatchExecution` (lot mixte, tout finalisé, tout échec, vide). Français.
- [x] Task 2 — Refactor `AbbyPushPreviewDialog` sur `runInvoicePushLoop` (AC-1) [parité, non-régression]
  - [x] Dans `runPushLoop(restartFromZero)` : **CONSERVER le `setPush({kind:"pushing", step: initialStep})` AVANT l'appel** à l'orchestrateur, avec `initialStep = restartFromZero ? 2 : (preview?.resume?.fromStep ?? 1)` (inchangé, l.130-131) — l'orchestrateur ne connaît pas l'étape de départ, l'appelant la pose (sinon régression : bouton non `disabled` au 1er POST, « Étape 1/5 » + aria-live disparus, reprise n'affiche plus `fromStep`). PUIS remplacer la boucle inline par `const outcome = await runInvoicePushLoop(invoiceId, { restartFromZero, onStep: (s) => setPush({kind:"pushing", step:s}) })` et **mapper** l'`outcome` sur l'état UI existant : `finalized` → `setPush({kind:"success", number})` + toast « Facture finalisée dans Abby » (verbatim actuel) ; `draft_missing` → `setPush({kind:"confirmRestart", message})` ; `error` → `setPush({kind:"pushError", message})`. Appeler `onPushed()` à chaque terminal (comme aujourd'hui). Focus/verrou du dialog inchangés.
  - [x] ⚠️ **Zéro changement de comportement** : succès, toast, « Repartir de zéro ? » sur draft_missing, message d'erreur, reprise, aria-live d'étape, verrou pendant push. `abby-push.test.ts` (service) reste vert ; la parité UI du dialog n'a AUCUN test (recette manuelle unitaire obligatoire, cf. AC-5).
- [x] Task 3 — Exécution du lot dans `AbbyBatchPushDialog` (AC-2, AC-3, AC-4) [UI, orchestration séquentielle]
  - [x] Phase d'exécution : ajouter un état par facture `BatchExecState = {kind:"queued"} | {kind:"pushing"; step:number} | {kind:"finalized"; number:string|null} | {kind:"draft_missing"; message} | {kind:"error"; message}` et une phase globale `"recap" | "executing" | "done"`.
  - [x] `handleExecute` : sur clic du CTA (ACTIF quand `!isResolving && summary.readyCount > 0 && phase==="recap"`), passer phase `executing` ; **boucle `for` séquentielle** sur les entrées `ready` uniquement (les `blocked`/`error` de préview ne sont PAS poussées) ; pour chacune : marquer **`{kind:"pushing", step: 1}`** (facture de lot = toujours *jamais poussée* → départ étape 1, aucune reprise en lot — l'orchestrateur n'émet pas l'étape initiale), `await runInvoicePushLoop(inv.id, { onStep: (s) => set state pushing/step })`, figer le terminal, **continuer quoi qu'il arrive** ; annoncer « Facture k/N » + étape en `aria-live`. En fin de boucle : phase `done`, appeler `onPushed()` (refetch + purge sélection).
  - [x] ⚠️ **Ref `mounted` dédiée** (distincte du `stale` de l'effet previews `[invoices]`, qui gère une autre fermeture) : gardée avant tout `setState`/`onStep` de la phase d'exécution ET des reprises du récap ; remise à `false` au démontage. Évite un remap incohérent si le dialog se ferme pendant une reprise du récap.
  - [x] **Verrou du dialog pendant l'exécution** (comme le push unitaire) : `onOpenChange`/escape/pointerDownOutside bloqués tant que `phase==="executing"`.
  - [x] Récap final (`phase==="done"`) : bandeau « X finalisée(s) · Y à reprendre » via `summarizeBatchExecution` ; par ligne : numéro Abby (finalisée) ou motif (échec) ; **bouton « Reprendre le push »** sur chaque ligne non finalisée → remet la ligne en `{kind:"pushing", step:1}` puis `await runInvoicePushLoop(inv.id, { onStep })` pour cette SEULE facture (jamais en parallèle), met à jour sa ligne, puis `onPushed()` (refetch). Un **état « reprise en cours » par ligne** désactive son bouton pendant l'opération (empêche le double-submit → deux sagas concurrentes sur la même facture). ⚠️ Cas `draft_missing` : la reprise simple re-échouera (brouillon disparu) — afficher le motif et **renvoyer vers le flux unitaire** de la ligne (le badge « Interrompue » de TabFinances propose « Repartir de zéro » via 3.4) ; NE PAS déclencher `restartFromZero` silencieusement en lot (effacement de contenu = geste consenti unitaire).
  - [x] CTA : en `recap` = « Confirmer et pousser ({readyCount}) » ACTIF (retire l'aide « prochaine mise à jour ») ; en `executing` = désactivé + libellé de progression ; en `done` = remplacé par « Fermer » (→ `onClose`).
- [x] Task 4 — Câblage TabFinances (AC-4)
  - [x] `AbbyBatchPushDialog` : remplacer la prop `onConfirmed` par `onPushed: () => void`. Dans `TabFinances`, passer `onPushed={() => { fetchData(); setBatchSelected(new Set()); }}` (refetch badges + purge sélection). `onClose` inchangé.
  - [x] Vérifier que la barre « Pousser la sélection vers Abby (N) » et `selectedInvoices` (5.1) restent corrects après purge (la sélection vidée → barre disparaît).
- [x] Task 5 — Barrières + repro (AC-5)
  - [x] `tsc --noEmit` exit 0 ; **suite complète verte (dont Epic 3)** ; `npm run build` ; grep AD-2.
  - [x] Repro read-only : confirmer que la route `POST /push` et son contrat (`AbbyPushStepOutcome`, codes) sont INCHANGÉS (aucune modif serveur dans le diff). **NE JAMAIS exécuter un vrai push** (mutation prod) — la recette du lot est un geste gérant en mode test (documenté dans Completion Notes, pas exécuté ici).

## Dev Notes

### État constaté (fichiers lus au baseline 294a924f)

- **`AbbyPushPreviewDialog.tsx`** (l.128-199) : `runPushLoop(restartFromZero)` fait aujourd'hui, inline : `for(;;)` `POST /push` (body restart au 1er appel), gestion `!res.ok`/pas de step → si `abby_draft_missing` `setPush(confirmRestart)` sinon `setPush(pushError)` + `onPushed()` ; `step.done` → `setPush(success, number)` + toast + `onPushed()` ; sinon `nextStep = getResumeStep(step.state)`, `nextStep===1` → `setPush(pushError, "état inattendu")`, sinon `setPush(pushing, nextStep)` ; `catch` → `setPush(pushError, "interrompu réseau")`. **C'est EXACTEMENT ce qui doit passer dans `runInvoicePushLoop` (sans le setPush/toast) puis être re-mappé sur l'UI.** `initialStep = restartFromZero ? 2 : (preview?.resume?.fromStep ?? 1)`.
- **Contrat push** (`types/abby.ts:149`) : `AbbyPushStepOutcome = { state: AbbyPushState; done: boolean; abbyInvoiceNumber?: string }`. Route (`push/route.ts`) : `{step}` (200) ou `{error}` — `abby_invalid_state`/`abby_draft_missing`→409, `abby_not_found`→404, autre code→422, sinon 500. `logAudit abby_invoice_finalized` posé serveur au `done`. **Ne rien changer côté serveur.**
- **`getResumeStep`** (`eligibility.ts`) : `pushing→2, draft_created→3, lines_set→4, details_set→5, sinon 1`. Déjà testé. Réutiliser tel quel.
- **`AbbyBatchPushDialog.tsx`** (5.1) : résout N previews séquentielles, construit `rows: BatchRow[]` (`ready`/`blocked`/`error`/`loading`), `summarizeBatchPreviews`, CTA **désactivé**. Les entrées `ready` portent `invoiceId` — c'est la liste à exécuter. Le flag `stale` + le `useEffect [invoices]` existent déjà (garder). Ajouter l'état d'exécution SANS casser la résolution des previews (phases distinctes : d'abord résoudre les previews `recap`, puis `executing` au clic).
- **`TabFinances.tsx`** : monte `<AbbyBatchPushDialog invoices={batchDialogInvoices} onClose={…} onConfirmed={…} />` (5.1). `batchSelected: Set` + `setBatchSelected`. Changer `onConfirmed` → `onPushed`.
- **`summarizeBatchPreviews`** (`batch.ts`, 5.1) : réutilisé pour le récap AVANT exécution. La 5.2 ajoute `summarizeBatchExecution` (récap APRÈS) — deux fonctions distinctes.

### Ce que la story NE fait PAS

- **Pas de route/service serveur** — la saga, le verrou, les checkpoints, le garde-fou SIRET, la numérotation existent déjà (Epic 3) et sont réutilisés INCHANGÉS.
- **Pas de `Promise.all`** — séquentiel strict (AD-14). Une saga finie avant la suivante.
- **Pas d'avoirs** (5.3). Pas de migration.
- **Pas de `restartFromZero` en lot** — l'effacement de contenu reste un geste consenti du flux unitaire (draft_missing renvoyé vers la ligne).
- Ne PAS re-tester par une vraie écriture Abby (mutation prod). Recette = geste gérant mode test.

### Tests — cadre projet

- **Barrières = `tsc` + `vitest`**. Cœur testable : `classifyPushHttpResponse` + `summarizeBatchExecution` (purs) et `runInvoicePushLoop` (**fetch mocké** via `global.fetch = vi.fn()` — pattern établi du repo, `src/lib/utils/__tests__/batch-doc-send.test.ts:44` ; `vi.stubGlobal` existe aussi). Le câblage des dialogs est vérifié par `tsc` + `npm run build` + parité de la suite Epic 3 + **recette manuelle** (aucun test de dialog dans le repo).
- **Non-régression critique** : après la factorisation (Task 2), TOUS les tests existants du push unitaire/saga doivent rester verts. Lancer `abby-push.test.ts` + toute la suite.
- Jamais de `any`, jamais de `!`. Noms de tests en français.

### Décisions de livraison

1. **Factoriser AVANT de câbler le lot** — garantit « chaque facture suit exactement les règles du push unitaire » par **partage de code**, pas par duplication (AD-14). La factorisation est la vraie valeur d'architecture de la 5.2.
2. **Erreurs isolées, jamais d'arrêt** — chaque facture est indépendante (décision UX validée, Flow 3) ; un échec fige sa ligne et le lot continue. Le récap final rend chaque échec actionnable (« Reprendre »).
3. **`draft_missing` en lot → renvoi unitaire** — repartir de zéro efface `abby_invoice_id` (contenu), un acte consenti ; on ne le fait jamais silencieusement dans une boucle de lot. La ligne pointe vers le flux unitaire (3.4).
4. **Verrou du dialog pendant l'exécution** — comme le push unitaire : aucune fermeture tant que la saga du lot tourne (évite un état à moitié poussé invisible).

### Références

- Epic : `epics-abby-facturation-electronique.md` § Story 5.2 (l.647-666), FR-14 (l.60).
- Architecture : `ARCHITECTURE-SPINE.md` AD-8 (avance-saga), AD-14 (composition client-side), AD-9/AD-10 (verrou/checkpoints/idempotence), AD-22.
- UX : `EXPERIENCE.md` § multi-sélection (l.55), Flow 3 (l.126-131 : « 5 finalisées · 1 interrompue », « Reprendre le push » par échec).
- Stories sœurs : `abby-5-1-multi-selection-et-recap-consolide.md` (le dialog + previews), `abby-3-3-executer-le-push-saga-progression.md` (la saga unitaire), `abby-3-4-reprendre-un-push-interrompu.md` (reprise).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (session BMAD dev-story du 2026-07-22)

### Debug Log References

- Barrières : `tsc --noEmit` exit 0 ; `vitest` **2602/2602** (17 nouveaux `push-loop.test.ts`) ; `npm run build` exit 0 ; grep AD-2 propre.
- Non-régression saga : `src/lib/services/__tests__/abby-push.test.ts` **40/40 verts** après la factorisation.
- **Aucune modif serveur** : route `POST /push` + saga + types INCHANGÉS (vérifié `git status`).

### Completion Notes List

- **Task 1 — `push-loop.ts`** : `runInvoicePushLoop` extrait À L'IDENTIQUE de l'inline unitaire (mêmes messages verbatim : brouillon manquant, « Le push a échoué. », « État de push inattendu — rechargez la page. », « …interrompu (réseau)… »). `classifyPushHttpResponse` (pur) + `summarizeBatchExecution` (pur). ⚠️ L'orchestrateur N'ÉMET PAS l'étape initiale (contrat documenté) — `onStep` ne rapporte que l'étape suivante. 17 tests : classify (6), boucle fetch-mockée (a→g dont « état inattendu » qui STOPPE, restartFromZero au 1er POST seul, onStep=[2,3,4,5] jamais 1), summarize (4).
- **Task 2 — refactor unitaire** : `AbbyPushPreviewDialog.runPushLoop` **conserve** le `setPush(pushing, initialStep)` AVANT l'appel (`restartFromZero?2:resume.fromStep??1`), puis délègue à `runInvoicePushLoop` et mappe l'outcome sur l'UI existante (finalized→success+toast verbatim ; draft_missing→confirmRestart ; error→pushError ; `onPushed()` une fois). Import `AbbyPushStepOutcome`/`getResumeStep` retirés (portés par push-loop). Parité prouvée par la suite saga (40 tests) + tsc.
- **Task 3 — exécution du lot** (`AbbyBatchPushDialog`) : phases `recap|executing|done` ; `handleExecute` = boucle `for` SÉQUENTIELLE sur les entrées `ready` (départ étape 1, jamais de reprise en lot), une saga finie avant la suivante, **un échec n'arrête jamais** ; dialog VERROUILLÉ pendant `executing` (onOpenChange/escape/pointer/interact + `[&>button]:hidden`) ; progression `Push k/N` + `Étape s/5` en `aria-live` ; récap `done` = « X finalisées · Y à reprendre » (`summarizeBatchExecution`) + statut par ligne (numéro / motif) ; **« Reprendre le push »** par ligne en `error` (re-joue la boucle, anti-double-clic via `resumingIds`), `draft_missing` = pas de reprise silencieuse → renvoi vers le flux unitaire (« Repartir de zéro »). Jeton `runTokenRef` par lot = neutralise les setState si le dialog change de sélection/ferme.
- **Task 4 — TabFinances** : `onConfirmed`→`onPushed = () => { fetchData(); setBatchSelected(new Set()) }` (badges à jour + purge). La barre disparaît après purge.
- **Task 5 — barrières** : tsc 0, vitest 2602, build vert, AD-2 propre, route push non modifiée. ⚠️ **Recette d'écriture Abby NON exécutée** (mutation prod : `abby_invoice_id`/numérotation légale) — 2 recettes manuelles mode test à faire par le gérant : (1) parité du push UNITAIRE après factorisation ; (2) LOT (sélection → confirmer → exécution séquentielle + progression + récap + « Reprendre » sur échec provoqué). Aucun test de dialog n'existe (`*.test.tsx` = vide) → la parité UI repose sur ces recettes.

### File List

- src/lib/abby/push-loop.ts (nouveau — orchestrateur partagé + helpers purs)
- src/lib/abby/__tests__/push-loop.test.ts (nouveau — 17 tests)
- src/app/(dashboard)/admin/formations/[id]/_components/finances/AbbyPushPreviewDialog.tsx (modifié — consomme `runInvoicePushLoop`, parité)
- src/app/(dashboard)/admin/formations/[id]/_components/finances/AbbyBatchPushDialog.tsx (modifié — exécution séquentielle + récap final + reprise)
- src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx (modifié — `onPushed` = refetch + purge)

## Change Log

- 2026-07-22 : Revue fresh-context — **APPROVED**. Parité du push unitaire CONFIRMÉE ligne à ligne (setPush initialStep avant l'appel, toast+description verbatim, onPushed exactement une fois), fidélité de `runInvoicePushLoop` (messages verbatim, réponse malformée sans throw), séquentialité AD-14 (for await, jamais Promise.all), jeton d'annulation sain, verrou d'exécution sans échappatoire, comptages cohérents. 1 finding Mineur retenu (gravité) : `handleExecute` sans garde de ré-entrance → ajout `if (phase !== "recap") return;` (symétrique à handleResume, évite une double boucle → double finalisation de factures légales). Mineur 2 (execSummary transitoire en reprise) = cosmétique, non corrigé.
- 2026-07-22 : Implémentation complète (dev-story). 5 tasks. Boucle avance-saga factorisée dans `push-loop.ts` (partagée unitaire + lot), dialog unitaire refactoré à parité (saga service 40 tests verts), exécution séquentielle du lot (jamais Promise.all, erreurs n'arrêtent pas, verrou dialog, aria-live k/N, récap final « X finalisées · Y à reprendre » + « Reprendre » par échec), TabFinances onPushed (refetch + purge). 17 tests-cœur (2602 au total), tsc 0, build vert, AD-2 propre, route push INCHANGÉE. Recettes d'écriture Abby (parité unitaire + lot) = gestes gérant mode test, NON exécutées. Status → review.
- 2026-07-22 : Validation fresh-context — **READY** après 6 correctifs. (Majeur 1) L'orchestrateur `runInvoicePushLoop` n'émet PAS l'étape initiale via `onStep` — c'est l'APPELANT qui la pose : Task 2 conserve `setPush(pushing, initialStep)` AVANT l'appel (`restartFromZero?2:resume.fromStep??1`), Task 3 démarre chaque facture de lot à `step:1` (jamais de reprise en lot) ; sans ça, régression Epic 3 non testée (bouton non disabled au 1er POST, « Étape 1/5 » disparue). (Majeur 2) AUCUN test de dialog n'existe (`*.test.tsx` = vide) → AC-5/Dev Notes corrigés (plus de fausse mention « test du dialog ») + 2 recettes manuelles mode test obligatoires (parité unitaire + lot). (Mineurs) messages d'erreur repris verbatim ; `shouldAbort` retiré (branche morte non testée) ; cas « état inattendu » (`getResumeStep→1`) ajouté aux tests ; ref `mounted` dédiée + anti-double-clic par ligne au récap ; pattern mock fetch affirmé (`global.fetch = vi.fn()`, cf. batch-doc-send). Cœur d'archi (factorisation partagée, séquentialité AD-14, contrat serveur inchangé, purge cohérente) confirmé solide.
- 2026-07-22 : Création de la story (2ᵉ de l'Epic 5). Câble le CTA désactivé de la 5.1. Décision d'architecture centrale : **factoriser** la boucle avance-saga unitaire (`AbbyPushPreviewDialog.runPushLoop`, inline l.128-197) dans `src/lib/abby/push-loop.ts` (`runInvoicePushLoop` + helpers purs) et faire consommer les DEUX dialogs (unitaire refactoré à parité + lot) — garantit « chaque facture = règles du push unitaire » par partage de code (AD-14), pas duplication. Exécution séquentielle stricte (jamais `Promise.all`), erreurs isolées (le lot continue), récap final actionnable (« Reprendre le push » par échec = reprise 3.4 re-jouée). Garde-fous : aucune route/service serveur (saga/verrou/SIRET/numérotation réutilisés INCHANGÉS), pas de `restartFromZero` silencieux en lot (draft_missing → renvoi unitaire), verrou du dialog pendant l'exécution, non-régression Epic 3 obligatoire. Cœur testable : helpers purs + orchestrateur fetch-mocké. Aucune recette d'écriture Abby (mutation prod) — geste gérant mode test.
