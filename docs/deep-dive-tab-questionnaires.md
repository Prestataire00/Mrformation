# Deep-dive — Sous-système « Questionnaires de formation »

> Périmètre : `TabQuestionnaires` + chaîne de génération PDF + tokens publics + saisie admin + relance + agrégats Qualiopi.
> Périmètre total : 23 fichiers, **~3 580 LOC** lus intégralement.
> Date : 25 mai 2026
> Pattern de référence (la nouvelle barre) : `TabConventionDocs` post-solidification (epic F2.x).

---

## 1. Cartographie fonctionnelle

### 1.1 Schéma textuel du flow

```
                           ┌──────────────────────────────────────┐
                           │ /admin/questionnaires  (banque)       │
                           │  - CRUD questionnaires + questions    │
                           │  - upsert questionnaire_sessions      │  ← path historique
                           └──────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ FICHE FORMATION → TabQuestionnaires (UI unifiée Évaluation + Satisfaction)│
│                                                                             │
│  STAGES (4) × itemTypes (8 au total) :                                     │
│   - before  : eval_preformation, auto_eval_pre                              │
│   - during  : eval_pendant                                                  │
│   - after   : eval_postformation, auto_eval_post, satisfaction_chaud        │
│   - follow_up: satisfaction_froid, satisfaction_entreprise (target=company) │
│                                                                             │
│  handleAssign() ────► INSERT formation_evaluation_assignments               │
│                  OU   INSERT formation_satisfaction_assignments             │
│                  ❌ N'écrit PAS dans questionnaire_sessions                 │
└────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
       ┌────────────────────────┬────────────────────────┬────────────────────┐
       │                        │                        │                    │
       ▼                        ▼                        ▼                    ▼
[Génération tokens]      [Relance email]          [Saisie admin]       [QR PDF batch]
POST /api/formations/    POST /api/              POST /api/admin/      questionnaire-qr-
[id]/questionnaire-      questionnaires/         questionnaires/        pdf-export.ts
tokens                   relaunch                fill-for-learner       (jsPDF + qrcode)
       │
       ▼
INSERT questionnaire_tokens (UUID, 90j)
       │
       ▼
URL public /questionnaire/[token] ◄─── GET  /api/questionnaire/public-submit
                                       (rate-limit 30/min IP)
       │
       ▼
Apprenant remplit + submit ◄─── POST /api/questionnaire/public-submit
                                (rate-limit 10/min IP)
       │
       ▼
INSERT questionnaire_responses (responses JSONB)
UPDATE questionnaire_tokens.used_at + response_id

                                            ╔══════════════════════════════════╗
                                            ║ RESTITUTION (côté admin / PDF)   ║
                                            ╠══════════════════════════════════╣
                                            ║ load-evaluation-results.ts        ║
                                            ║   ► lit questionnaire_sessions    ║ ❌
                                            ║ load-session-aggregates.ts        ║
                                            ║   ► lit questionnaire_sessions    ║ ❌
                                            ║ /learner/questionnaires           ║
                                            ║   ► lit questionnaire_sessions    ║ ❌
                                            ║ /api/questionnaires/auto-send     ║
                                            ║   ► lit questionnaire_sessions    ║ ❌
                                            ╚══════════════════════════════════╝
                                                            │
                                                            ▼
                                            (Découplage CRITIQUE — cf. §3.2.1)
```

### 1.2 Tableau evaluation_type / satisfaction_type / STAGE / Template PDF / doc_type batch

| STAGE | itemType (UI) | category | DB column | type DB | target | Template PDF servir | doc_type batch |
|---|---|---|---|---|---|---|---|
| before | eval_preformation | evaluation | `evaluation_type` | `eval_preformation` | learner | resultats_evaluations (par apprenant) | resultats_evaluations |
| before | auto_eval_pre | evaluation | `evaluation_type` | `auto_eval_pre` | learner | resultats_evaluations | resultats_evaluations |
| during | eval_pendant | evaluation | `evaluation_type` | `eval_pendant` | learner | resultats_evaluations | resultats_evaluations |
| after | eval_postformation | evaluation | `evaluation_type` | `eval_postformation` | learner | resultats_evaluations | resultats_evaluations |
| after | auto_eval_post | evaluation | `evaluation_type` | `auto_eval_post` | learner | resultats_evaluations | resultats_evaluations |
| after | satisfaction_chaud | satisfaction | `satisfaction_type` | `satisfaction_chaud` | learner | reponses_satisfaction_session (par session) | reponses_satisfaction_session |
| follow_up | satisfaction_froid | satisfaction | `satisfaction_type` | `satisfaction_froid` | learner | reponses_satisfaction_session | reponses_satisfaction_session |
| follow_up | satisfaction_entreprise | satisfaction | `satisfaction_type` | `satisfaction_entreprise` | company | reponses_satisfaction_session | reponses_satisfaction_session |

**Types DB additionnels (CHECK constraint `formation_satisfaction_assignments`)** non exposés dans TabQuestionnaires :
- `quest_financeurs`, `quest_formateurs`, `quest_managers`, `quest_entreprises`, `autres_quest`
- Note : `target_type` accepte `learner|trainer|manager|financier|company` mais TabQuestionnaires n'expose que `learner|company`.

**Note critique sur le mapping** : le mapping `satisfaction_entreprise` (UI) vers `satisfaction_type` DB est OK, mais l'enum CHECK ne contient PAS la valeur `satisfaction_entreprise` (cf. `add-satisfaction-tab.sql:9-13`). Vérification :
- Migration : `'satisfaction_chaud', 'satisfaction_froid', 'quest_financeurs', 'quest_formateurs', 'quest_managers', 'quest_entreprises', 'autres_quest'`
- UI envoie : `satisfaction_entreprise`
- ➡️ **BUG CRITIQUE** : tout INSERT avec `satisfaction_type=satisfaction_entreprise` lèvera une violation CHECK constraint. cf. §3.1.

---

## 2. Inventaire détaillé par fichier

### 2.1 Composants UI (740 LOC)

#### `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx` (395 LOC)
**Rôle** : composant unifié Évaluation + Satisfaction présentant 4 étapes chronologiques avec attribution des questionnaires de la banque et fonctions associées (relance, QR PDF, saisie admin).

**Top issues** :
- TabQuestionnaires.tsx:62-64 — typage `Array<Record<string, unknown>>` sur tous les états (evalAssignments, satisAssignments, responses) — anti-pattern majeur, casts répétés ensuite.
- TabQuestionnaires.tsx:71-84 — `fetchData` : 4 queries en `Promise.all` mais **2 sur 4 sans filtre entity_id explicite** :
  - `formation_evaluation_assignments` filtre uniquement par `session_id`, pas par `entity_id` (peu critique car RLS protège, mais défense en profondeur cassée — pattern observé partout dans TabConventionDocs depuis solidification).
  - `formation_satisfaction_assignments` même problème.
  - `questionnaire_responses` même problème.
- TabQuestionnaires.tsx:79-82 — `if (qR.data)` etc. : aucun handling d'erreur PostgREST, pas de toast. Les erreurs disparaissent.
- TabQuestionnaires.tsx:177 — `onRefresh={async () => { await fetchData(); await onRefresh(); }}` — bon pattern await mais erreur silencieuse (pas de try/catch).
- TabQuestionnaires.tsx:185 — `function ItemDetail({ ... }: Record<string, unknown> & { stage; item })` — anti-pattern : prop typing via cast verbeux, casts internes répétés (lignes 190-197).
- TabQuestionnaires.tsx:202-217 — `handleAssign` : `t({...})` (toast) au lieu de `toast({...})` ; try/catch mais le cas de retour `error` PostgREST inclus dans `throw error` n'a pas de typage strict.
- TabQuestionnaires.tsx:208-210 — `ins.evaluation_type = item.type; ins.learner_id = null;` côté évaluation ; `ins.satisfaction_type = item.type; ins.target_type = item.target || "learner";` côté satisfaction. **Bug** : `satisfaction_type=satisfaction_entreprise` n'est pas dans l'enum DB (cf. §3.1).
- TabQuestionnaires.tsx:219-227 — `handleRemove` : **PAS de try/catch, pas de gestion d'erreur**. Si le DELETE échoue, le toast "Questionnaire retiré" s'affiche quand même.
- TabQuestionnaires.tsx:264-273 — handler de relance inline (109 chars). `body: { session_id, learner_ids: pending.map(...).filter(Boolean) }` mais `learner_ids` est récupéré via `(e as Record<string, unknown>).learner as Record<string, string>).id` — chaîne de casts à 2 étages.
- TabQuestionnaires.tsx:272 — `catch { t({ title: "Erreur", variant: "destructive" }); }` — **catch vide qui mange l'erreur** sans description.
- TabQuestionnaires.tsx:274-301 — handler QR codes : pas de loading state visible (le bouton ne désactive pas pendant le téléchargement). `setQrDialog` reçoit la 1ère URL mais le PDF contient TOUS — UX confuse : le QR affiché à l'écran n'est jamais celui de l'apprenant qu'on veut.
- TabQuestionnaires.tsx:291-294 — `setQrDialog({ open: true, url: firstUrl, title: `${qTitle} (${tokens.length} QR)`, qrDataUrl });` — le titre est `(${tokens.length} QR)` qui prête à confusion : le QR affiché n'est que celui du **premier** apprenant.
- TabQuestionnaires.tsx:297-299 — `const { exportQuestionnaireQRPdf } = await import("@/lib/questionnaire-qr-pdf-export"); const doc = await exportQuestionnaireQRPdf(...); doc.save(...)` — **génération PDF côté client** au lieu de serveur (anti-pattern : pas de cache, pas de log Qualiopi, perf médiocre sur grosse session).
- TabQuestionnaires.tsx:316-324 — gros pavé de commentaires expliquant la logique « adminFilled = filled_by_admin set mais fill_mode forcé à learner » — fait référence au demande client Loris. **Pattern fragile** : la distinction admin/learner se cache derrière un seul champ, et la logique métier est entrelacée avec un commentaire-règle de 6 lignes.
- TabQuestionnaires.tsx:325 — `${learner.last_name?.toUpperCase()} ${learner.first_name}` — affichage qui ignore que les deux peuvent être null (chaîne `"undefined undefined"` possible).
- TabQuestionnaires.tsx:359-379 — Dialog QR code monté DANS le composant `ItemDetail` qui est lui-même monté dans un Dialog parent → **Dialog imbriqués** = bug d'accessibilité Radix (cf. doc Radix Dialog).
- TabQuestionnaires.tsx:381-392 — `AdminFillQuestionnaireDialog` avec `open={!!adminFillTarget}` à l'intérieur du même Dialog parent → idem Dialog imbriqué.
- TabQuestionnaires.tsx:88-99 — `getAssignments / getStats` : la fonction `getStats` boucle `assignments.reduce((s, a) => s + responses.filter(...).length, 0)` — N×M sur chaque render — pas catastrophique car arrays petits, mais pas mémoïsé.
- TabQuestionnaires.tsx:104 — pendant le loading rien n'indique sur quelle session on est, l'utilisateur peut croire que le tab est vide.
- TabQuestionnaires.tsx:101-103 — `totalSlots = 8` (codé en dur via STAGES) ; le pourcentage `Math.round((totalConfigured / totalSlots) * 100)` est sémantiquement **incorrect** : si l'organisme ne fait que de l'évaluation post (2 items), 6 slots seront toujours "à configurer" → 25% éternellement même quand 100% du nécessaire est en place.
- TabQuestionnaires.tsx:198 — `qs.filter(q => q.type === "evaluation" || q.type === "survey" || q.type === item.category)` — **gros bug logique** : `item.category === "evaluation"` matchera `q.type === "evaluation"` (OK), mais `item.category === "satisfaction"` ne sera trouvé que via la 3e clause. La 2e clause `q.type === "survey"` permet de "réutiliser" un survey pour les deux → comportement confus et probablement involontaire.

#### `src/components/questionnaires/AdminFillQuestionnaireDialog.tsx` (345 LOC)
**Rôle** : dialog permettant à un admin de saisir les réponses d'un questionnaire à la place d'un apprenant (substitution invisible côté UI selon demande client Loris).

**Top issues** :
- AdminFillQuestionnaireDialog.tsx:67-72 — `supabase.from("questionnaires").select("id, title").eq("id", questionnaireId).single()` — **pas de filtre entity_id**. RLS protège mais défense en profondeur cassée.
- AdminFillQuestionnaireDialog.tsx:76-80 — `.from("questions").select(...)` — pas de filtre entity_id (passe par questionnaire_id, ce qui est correct vu le schéma mais fragile).
- AdminFillQuestionnaireDialog.tsx:84-94 — `expanded = expandObjectivesQuestions(expanded as unknown as BaseQuestion[], sessionData as never)` — **double cast brutal** `as unknown as` puis `as never`. La signature de `expandObjectivesQuestions` accepte `Pick<Session, "program" | "training">`, le cast `as never` masque toute violation de contract.
- AdminFillQuestionnaireDialog.tsx:96-118 — Récupération réponse existante via `fetch(/api/admin/questionnaires/fill-for-learner?...)` puis `await res.json()` — **pas de check `res.ok`** : si l'API renvoie 500, on assigne `existing = undefined` silencieusement.
- AdminFillQuestionnaireDialog.tsx:103-117 — Logique fork : `existing.fill_mode === "learner"` → `blocked=true`. Mais en raison de la "demande Loris" qui force `fill_mode='learner'` même pour les saisies admin (cf. `fill-for-learner/route.ts:81`), cette condition **bloque potentiellement** une modification admin précédente. La condition réelle "vraiment apprenant" est `fill_mode='learner' && filled_by_admin === null`, jamais codée ici → **incohérence majeure de logique métier**.
  - Conséquence : dialog ouvert sur un apprenant pour qui un admin a déjà rempli → l'apprenant_data.filled_by_admin set → côté serveur on autorise update (logique fill-for-learner:63), MAIS côté UI le composant n'envoie pas car `blocked=true` selon `existing.fill_mode === "learner"`.
  - Or si `existing.filled_by_admin` est non null, alors filling devrait être autorisé. La condition côté UI ne lit pas `filled_by_admin`.
  - Mitigation actuelle : TabQuestionnaires détecte `adminFilled` puis appelle le dialog quand même → mais à l'ouverture, le dialog passe en mode "blocked" et l'admin voit "Répondu par l'apprenant — Les réponses de l'apprenant ne peuvent pas être écrasées" alors qu'il s'agit d'une saisie admin précédente. **Bug critique de cohérence UX**.
- AdminFillQuestionnaireDialog.tsx:142-159 — `handleSubmit` : pas de try/catch sur `buildResponsesPayload`. Si l'helper throw, on n'aurait pas de toast.
- AdminFillQuestionnaireDialog.tsx:160-161 — `const data = await res.json(); if (!res.ok) throw new Error(data.error);` — bon pattern mais `data.error` peut être undefined → message d'erreur peu utile.
- AdminFillQuestionnaireDialog.tsx:163 — `toast({ title: data.action === "updated" ? ... })` — relit `data.action` après le throw — OK.
- AdminFillQuestionnaireDialog.tsx:166-170 — `catch (err) { toast({...}); }` — bonne pratique, mais `err instanceof Error ? err.message : "Erreur"` n'expose pas le code HTTP côté serveur (peu utile pour debug).
- AdminFillQuestionnaireDialog.tsx:251 — `Star.fill="yellow-400"` rendu via `text-yellow-400 fill-yellow-400` — OK mais la valeur affichée `{responses[question.id]}/5` ligne 254 peut afficher `0/5` si on a juste cliqué puis annulé (n'arrive pas en pratique mais robustesse fragile).
- AdminFillQuestionnaireDialog.tsx:218 — `<SelectItem value="admin_paper">J&apos;ai reçu les réponses par papier</SelectItem>` — le mode `admin_paper` n'a aucun impact côté serveur (cf. `fill-for-learner/route.ts:95 void fill_mode`), c'est de la cosmétique mensongère.
- AdminFillQuestionnaireDialog.tsx:325-331 — Badge "Modification d'une saisie admin précédente" jamais affiché en pratique car `existingId` n'est set que si `existing && !blocked` → blocked=true par lecture lazy de `fill_mode='learner'` → existingId reste null → badge perdu. **Bug d'incohérence avec §AdminFillDialog:103-117**.

### 2.2 Routes API génération PDF (924 LOC sur 7 fichiers)

#### `src/app/api/documents/generate-reponses-evaluations/route.ts` (107 LOC)
**Rôle** : génère 1 PDF "Réponses aux évaluations" (simplifié) pour 1 session — auth admin+entity, charge session+aggregates, render template+footer, retourne base64.

**Top issues** :
- generate-reponses-evaluations:30-40 — bloc auth identique aux 6 autres routes (cf. §3.4.1 duplication).
- generate-reponses-evaluations:47-49 — `.from("sessions").select("*, training:trainings(*)").eq("id", body.sessionId).eq("entity_id", profile.entity_id).single()` — bon filtre entity_id.
- generate-reponses-evaluations:54-57 — `Promise.all([loadEntitySettings, loadSessionAggregates])` — OK.
- generate-reponses-evaluations:74-82 — `cacheInputs` inclut `session_updated_at` mais **PAS l'horodatage de la dernière réponse** → si l'apprenant répond après le 1er PDF, le PDF en cache ne sera pas régénéré. **Bug de fraîcheur cache** : le PDF affichera l'ancien snapshot.
- generate-reponses-evaluations:60-63 — `context.session = session as unknown as Session` — cast forcé sans validation runtime.

#### `src/app/api/documents/generate-reponses-evaluations-mock/route.ts` (151 LOC)
**Rôle** : mock route renvoyant un PDF avec des données factices Managers Proximité (UNICIL).

**Top issues** :
- generate-reponses-evaluations-mock:26 — `_request: NextRequest` — le request n'est pas utilisé, OK convention `_`.
- generate-reponses-evaluations-mock:40-48 — `mockSession as unknown as Session` — cast.
- generate-reponses-evaluations-mock:50-112 — **gros bloc data dur en codé (62 lignes)** copié-collé entre les 3 mocks (cf. §3.4.1).
- generate-reponses-evaluations-mock:25-36 — bloc auth identique aux 6 autres.
- Doc_type cache `reponses_evaluations_mock` distinct → cache séparé du vrai (OK).

#### `src/app/api/documents/generate-reponses-satisfaction/route.ts` (106 LOC)
**Rôle** : génère 1 PDF "Réponses satisfaction apprenants" (vue admin session) — 99% identique à `generate-reponses-evaluations` au switch template près.

**Top issues** :
- generate-reponses-satisfaction:13-17 — utilise `REPONSES_SATISFACTION_HTML` & `REPONSES_SATISFACTION_FOOTER_TEMPLATE`.
- generate-reponses-satisfaction:71 — `docType: "reponses_satisfaction"` mais le registry et BATCH_SEND_ENDPOINTS utilisent `reponses_satisfaction_session` (cf. §3.4.3).
- generate-reponses-satisfaction:74-81 — même problème de cache `session_updated_at` que générer-réponses-évaluations.
- Duplication structurelle : ~95% identique à `generate-reponses-evaluations/route.ts` (cf. §3.4.1).

#### `src/app/api/documents/generate-reponses-satisfaction-mock/route.ts` (151 LOC)
**Rôle** : mock avec mêmes données factices que `generate-reponses-evaluations-mock`.

**Top issues** :
- **Données mock identiques à 100%** au mock évaluations (cf. lignes 50-112 ↔ generate-reponses-evaluations-mock:50-112) — duplication pure.
- generate-reponses-satisfaction-mock:121 — `docType: "reponses_satisfaction_mock"`.
- Aucune valeur ajoutée par rapport au mock évaluations.

#### `src/app/api/documents/generate-resultats-evaluations/route.ts` (125 LOC)
**Rôle** : génère un PDF résultats par apprenant — auth admin+entity, charge session+enrollment+learner+evaluationResults, render et retourne base64.

**Top issues** :
- generate-resultats-evaluations:59-67 — `.from("enrollments").select("id, learner:learners(*)").eq("session_id", ...).eq("learner_id", ...).maybeSingle()` — **PAS de filtre entity_id sur enrollments** ; OK structurellement car session_id déjà vérifié, mais défense en profondeur cassée.
- generate-resultats-evaluations:65 — `if (!enrollment || !(enrollment as { learner?: unknown }).learner)` — cast.
- generate-resultats-evaluations:68 — `const learner = (enrollment as unknown as { learner: Learner }).learner;` — double cast.
- generate-resultats-evaluations:91-100 — `cacheInputs.session_updated_at` mais **PAS l'horodatage de la réponse apprenant** — si l'apprenant complète une éval après la 1ère génération, le PDF en cache ne reflètera pas la dernière saisie. **Bug fraîcheur cache** (idem reponses_*).
- generate-resultats-evaluations:117 — `evaluationsCount: evaluationResults.length` retourné — utile pour debug client.

#### `src/app/api/documents/generate-resultats-evaluations-batch/route.ts` (158 LOC)
**Rôle** : itère sur tous les apprenants inscrits, génère 1 PDF par apprenant via Promise.allSettled, retourne un ZIP avec _erreurs.txt soft-fail.

**Top issues** :
- generate-resultats-evaluations-batch:36 — `slugify` regex `/[̀-ͯ]/g` (U+0300–036F) — pattern accepté mais difficile à lire (devrait être `/[̀-ͯ]/g`).
- generate-resultats-evaluations-batch:65-67 — `.from("enrollments").select("learner:learners(*)").eq("session_id", body.sessionId)` — **PAS de filtre status** : récupère les annulés, retirés, en attente. À comparer avec `loadRecipientsByOwnerType` qui filtre `status in (registered, confirmed, completed)` → incohérence.
- generate-resultats-evaluations-batch:72-73 — `.map((e) => e.learner).filter(...)` — flatten OK.
- generate-resultats-evaluations-batch:83-118 — boucle async sans concurrence limit ; `Promise.allSettled(tasks)` lance tout en parallèle, peut surcharger Chromium si session a 30+ apprenants.
- generate-resultats-evaluations-batch:142 — `JSZip.generateAsync({ type: "nodebuffer" })` puis `toString("base64")` ligne 145 — un ZIP de 30 PDFs peut peser 10-30 MB → base64 encoded c'est 13-40 MB en JSON → risque memory + timeout serverless Netlify (10s).

#### `src/app/api/documents/generate-resultats-evaluations-mock/route.ts` (126 LOC)
**Rôle** : mock avec Patrick ATTLAN et 3 évaluations factices (2 acquises, 1 non acquise).

**Top issues** :
- generate-resultats-evaluations-mock:39-46 — `mockLearner as Learner` — cast.
- generate-resultats-evaluations-mock:48-55 — `mockSession as unknown as Session` — double cast.
- Données mock cohérentes (3 évals).
- Aucun bug bloquant.

### 2.3 Routes API envoi email batch (174 LOC — 3 fichiers)

#### `src/app/api/documents/send-reponses-evaluations-batch-email/route.ts` (58 LOC)
**Rôle** : thin-wrapper qui délègue à `batchSendDocsEmail(supabase, entityId, sessionId, "reponses_evaluations", profileId)`.

**Top issues** :
- send-reponses-evaluations-batch-email:43 — `"reponses_evaluations"` aligné avec `SYSTEM_TEMPLATES_BY_DOC_TYPE[]` et `BATCH_SEND_ENDPOINTS_BY_DOC_TYPE`.
- Code identique à 100% aux 2 autres routes (cf. §3.4.2) — modulo le docType.
- Aucun bug propre.

#### `src/app/api/documents/send-reponses-satisfaction-batch-email/route.ts` (58 LOC)
**Top issues** :
- send-reponses-satisfaction-batch-email:43 — `"reponses_satisfaction_session"` — attention au suffix `_session` non aligné avec `generate-reponses-satisfaction/route.ts:71` qui utilise `reponses_satisfaction` (sans suffix). **Risque de cache miss** si le PDF générique a été mis en cache via une autre route.

#### `src/app/api/documents/send-resultats-evaluations-batch-email/route.ts` (58 LOC)
**Top issues** :
- send-resultats-evaluations-batch-email:43 — `"resultats_evaluations"` — OK.
- Code identique à 100% aux 2 autres routes.

### 2.4 Tokens publics & submit public (447 LOC)

#### `src/app/api/formations/[id]/questionnaire-tokens/route.ts` (91 LOC)
**Rôle** : génère N tokens publics (1 par apprenant inscrit) pour un questionnaire — vie 90 jours, idempotent (re-réutilise les tokens actifs existants).

**Top issues** :
- questionnaire-tokens:11 — `const { questionnaire_id } = await request.json();` — pas de validation Zod.
- questionnaire-tokens:39 — `for (const enr of enrollments || []) { ... }` — N+1 query sur `questionnaire_tokens` (1 select existing + 1 insert par apprenant). Pour 30 apprenants = 60 queries séquentielles → 5-10s.
- questionnaire-tokens:71-85 — handling race condition `error.code === '23505'` (unique violation) OK mais log `console.error` sans propagation.
- questionnaire-tokens:82 — `console.error("[questionnaire-tokens] insert failed", error.message);` — autre que le code 23505, l'erreur est journalisée mais l'apprenant est silently skipé → l'admin ne saura pas que certains tokens n'ont pas été créés.
- questionnaire-tokens:34 — `.in("status", ["registered", "confirmed", "completed"])` — cohérent avec automation.

#### `src/app/api/questionnaire/public-submit/route.ts` (149 LOC)
**Rôle** : GET token validation + POST submit response, sans auth utilisateur, rate-limit IP. Service role key utilisée car endpoint anonyme.

**Top issues** :
- public-submit:5-11 — `getServiceSupabase()` instantié **à chaque GET/POST** : 0 réutilisation. Pas grave fonctionnellement.
- public-submit:14-15 — `getClientIp` ne lit que `x-forwarded-for` (1er) → bypass facile en local dev. En prod Netlify c'est OK (1 seul proxy).
- public-submit:20 — rate limit GET = 30 req/min — laxiste pour énumération mais raisonnable.
- public-submit:25 — `if (!token) return NextResponse.json({ valid: false });` — pas de status 400, le client traitera comme un token invalide normal.
- public-submit:28-32 — `from("questionnaire_tokens").select(...).eq("token", token).maybeSingle()` — pas de filtre entity_id. **Acceptable** car le token UUID est la clé d'autorisation (idem signatures publiques).
- public-submit:44-49 — `Promise.all([{ data: questionnaire }, { data: questions }, { data: learner }, { data: session }])` — 4 queries en parallèle, bonne perf.
- public-submit:78 — rate limit POST = 10 req/min — adapté.
- public-submit:82-87 — `const { token, responses } = await request.json();` — pas de validation Zod.
- public-submit:103-118 — Pour les `program_objectives` :
  - lit `rawQuestions` à nouveau (déjà fait en GET — pas réutilisable car endpoints différents).
  - re-charge `sessionData` (program+training objectives).
  - re-importe `expandObjectivesQuestions` et `buildResponsesPayload` dynamiquement.
  - **3 queries séquentielles** ajoutées à chaque POST.
- public-submit:120-131 — INSERT `questionnaire_responses` sans `fill_mode` ni `filled_by_admin` (intentionnel : c'est l'apprenant qui répond, defaults DB OK).
- public-submit:138-142 — UPDATE token `used_at` sans transaction avec l'INSERT ligne 122 → si l'INSERT réussit mais l'UPDATE échoue, le token reste utilisable une 2e fois. **Pas de rollback**.
- public-submit:133 — `console.error("[public-submit] insert failed:", respErr);` — log sans contexte (pas de session_id, learner_id).
- public-submit:97 — `if (tokenData.used_at) return NextResponse.json({ error: "Déjà répondu" }, { status: 410 });` — pas d'option pour l'apprenant de **modifier** sa réponse (pas un bug, c'est un choix produit, mais à signaler car risque support).

#### `src/app/questionnaire/[token]/page.tsx` (207 LOC)
**Rôle** : page publique React qui charge le token via GET, affiche les questions, soumet via POST.

**Top issues** :
- page.tsx:43-55 — `useEffect` async sans cleanup ; si l'utilisateur change rapidement, race condition possible. Faible impact.
- page.tsx:46 — `fetch(\`/api/questionnaire/public-submit?token=${token}\`)` — token brut dans URL, OK (équivalent QR code).
- page.tsx:49 — `catch { setError(...) }` — **catch vide partiel** : on perd l'erreur originale.
- page.tsx:66-69 — validation manuelle des champs requis : pas de Zod. Compatible avec le serveur mais double code.
- page.tsx:80-81 — `const data = await res.json(); if (!res.ok) throw new Error(data.error);` — bon.
- page.tsx:104 — `if (!info?.valid)` : la branche `expired || used` montre le bon message mais pas de retry / contact admin.
- page.tsx:138 — `info.questions.map((q, idx)` — pas de virtualisation, OK pour <50 questions.
- page.tsx:188-193 — pour `program_objectives` non expansé, affiche "Aucune action requise" — pareil comme côté admin.
- Pas de protection CSRF mais OK car endpoint anonyme et POST exige le token.
- Pas de UX "Modifier ma réponse" — par design.

### 2.5 Relance + saisie admin (203 LOC)

#### `src/app/api/questionnaires/relaunch/route.ts` (57 LOC)
**Rôle** : envoie un email de rappel aux apprenants non répondants via `enqueueEmails`.

**Top issues** :
- relaunch:7 — `requireRole(["super_admin", "admin"])` — OK.
- relaunch:16-20 — `.from("sessions").select("id, title, entity_id").eq("id", session_id).single()` — **PAS de filtre entity_id** dans la query (passe par RLS) ; le scope multi-tenant est protégé par RLS donc OK structurellement mais défense en profondeur cassée.
- relaunch:24-28 — `.from("learners").select("id, first_name, email").in("id", learner_ids)` — **PAS de filtre entity_id** ; risque IDOR contourné par RLS uniquement. Si RLS down (incident), un admin entité A pourrait envoyer un email à un apprenant entité B.
- relaunch:33-34 — `baseUrl` valeur par défaut hardcodée `"https://mrformationcrm.netlify.app"` — fragile.
- relaunch:36-47 — payloads filtrés par `l.email` ; bon.
- relaunch:42-46 — `recipient_type: "learner" as const` — typage OK.
- relaunch:50 — `enqueueEmails(auth.supabase, payloads)` — `inserted` retourné mais pas `skipped`. Le toast client affiche `${d.sent}` (cf. TabQuestionnaires:271) — incohérence de nommage (la route retourne `enqueued`, le client attend `sent`). **Le toast affiche `undefined` envoyé(s)`** lorsque l'API renvoie `enqueued`.
- relaunch:55 — `console.error("[relaunch]", err);` puis `NextResponse.json({ error: "Erreur serveur" }, { status: 500 });` — message générique.

#### `src/app/api/admin/questionnaires/fill-for-learner/route.ts` (146 LOC)
**Rôle** : permet à l'admin de saisir/modifier une réponse à la place de l'apprenant ; bloque si apprenant déjà répondu vraiment.

**Top issues** :
- fill-for-learner:5-11 — Service role client.
- fill-for-learner:24 — `const supabase = getServiceSupabase();` — bypass RLS pour les writes.
- fill-for-learner:27-32 — `.from("enrollments").select("id, session_id").eq("learner_id", learner_id).eq("session_id", session_id).maybeSingle()` — **PAS de filtre entity_id** (bypass RLS via service role). Le check entity vient ligne 38-46 via `sessions.entity_id !== auth.profile.entity_id` — **CORRECT**.
- fill-for-learner:48-55 — check existing OK.
- fill-for-learner:57-89 — Si `existing.filled_by_admin` n'est pas null → autorise UPDATE. Sinon (vraiment apprenant) → **409 Conflict**. Logique côté serveur correcte.
- fill-for-learner:75-83 — UPDATE qui force `fill_mode: "learner"` et set `filled_by_admin` + `filled_by_admin_at` — pattern Loris.
- fill-for-learner:95 — `void fill_mode;` — paramètre du body ignoré. Cohérent avec le commentaire mais **API confuse** : le client envoie un champ qui n'est pas utilisé.
- fill-for-learner:96-110 — INSERT new response avec `fill_mode: "learner"` et `filled_by_admin: auth.profile.id` — bonne traçabilité DB.
- fill-for-learner:113 — `if (insertErr) throw insertErr;` — la `try` au-dessus catch ça, OK.
- fill-for-learner:117 — `console.error("[fill-for-learner]", err);` puis `error: "Erreur lors de l'enregistrement"` — message générique.
- fill-for-learner:122-146 — GET endpoint : retourne la réponse existante. **PAS d'auth check sur l'entity du learner** : un admin entité A peut lire la réponse d'un learner entité B s'il devine les UUIDs (faible mais réel).
  - Le filtre via `.eq("learner_id", ...)` ne croise PAS `entity_id`. Service role bypass RLS.
  - **BUG SÉCURITÉ MAJEUR** : IDOR potentiel sur le GET.
- fill-for-learner:145 — `Alias 'answers' pour cohérence avec le payload POST` : commentaire OK mais c'est ce schéma qui crée la confusion avec `responses` (col DB) vs `answers` (payload).

### 2.6 Services métier (539 LOC)

#### `src/lib/services/load-evaluation-results.ts` (159 LOC)
**Rôle** : pour 1 (session, learner), calcule le score de chaque questionnaire de type evaluation attaché via `questionnaire_sessions`, ainsi que le statut acquis/non_acquis.

**Top issues** :
- load-evaluation-results:78-83 — `.from("questionnaire_sessions").select("questionnaire_id, questionnaires:questionnaires!inner(id, title, type)").eq("session_id", sessionId)` — **dépend de questionnaire_sessions** au lieu de `formation_evaluation_assignments`. **BUG ARCHITECTURAL CRITIQUE** (cf. §3.2.1).
- load-evaluation-results:85-88 — cast `as unknown as ... []`.
- load-evaluation-results:96-108 — `Promise.all([questions, response])` par questionnaire — N+1.
- load-evaluation-results:49-70 — `isCorrect()` :
  - multiple_choice : `Number(userAnswer) === Number(correct)` — accepte string number et num.
  - yes_no : `Boolean(userAnswer) === Boolean(correct)` — **bug subtil** : `Boolean("oui") === Boolean(true)` est `true === true`, OK ; mais `Boolean("non") === Boolean(false)` est `true === false` → toujours faux pour "non". L'apprenant qui répond "non" verra toujours sa réponse marquée comme incorrecte. Idem pour les yes_no côté UI qui store "oui"/"non" (strings non vides → toujours `true`).
  - text/short_answer : comparaison lowercase trim — OK.
- load-evaluation-results:20 — `PASSING_SCORE_PCT = 70` hardcodé, pas configurable par questionnaire ou entity.
- load-evaluation-results:134-144 — `scorableCount === 0` → status="complete" (no score) — OK.

#### `src/lib/services/load-session-aggregates.ts` (380 LOC)
**Rôle** : charge en parallèle :
1. Satisfaction aggregates (1 ligne/question des questionnaires type='satisfaction'),
2. KPIs Qualiopi (taux complétion, satisfaction, acquisition),
3. Évaluations agrégés (1 ligne par questionnaire type='evaluation').

**Top issues** :
- load-session-aggregates:79-91 — `loadSatisfactionAggregates` : lit `questionnaire_sessions` (cf. §3.2.1).
- load-session-aggregates:224-233 — `loadQualiopiIndicators` : lit `questionnaire_sessions` aussi.
- load-session-aggregates:305-309 — `loadEvaluationAggregates` : idem.
- load-session-aggregates:161-185 — défense en profondeur OK pour `loadQualiopiIndicators` (récupère `sessions.entity_id` d'abord).
- load-session-aggregates:50 — `PASSING_SCORE_PCT = 70` dupliqué avec `load-evaluation-results.ts:20`.
- load-session-aggregates:52-67 — `isCorrect()` **dupliqué** intégralement avec `load-evaluation-results.ts:49-70`.
- load-session-aggregates:217-221 — `satisfactionResponses = ratingQuestions[0].responseCount;` — prend le responseCount de la PREMIÈRE question rating — mais chaque question peut avoir un nombre différent ! Trompeur : on rapporte par exemple "10 réponses" alors qu'en réalité c'est juste le count de la 1ère question.
- load-session-aggregates:262-274 — boucle scorable+correct dans une boucle apprenant — OK.
- load-session-aggregates:300-302 — `if (acquisitionRate)` final n'est compteur de réponses > 0 — OK.

### 2.7 Helpers (198 LOC)

#### `src/lib/expand-objectives-question.ts` (147 LOC)
**Rôle** : expand de la balise `program_objectives` en N questions virtuelles de rating (1 par objectif du programme).

**Top issues** :
- expand-objectives-question:40-47 — `extractObjectives` : split par `/\r?\n|•|^-\s+/m`. Le `^-\s+` avec flag `m` matche tirets en début de ligne — peut casser sur du Markdown avec `- item`.
- expand-objectives-question:73-82 — Si `!formation` : conserve la balise en `is_required=false` et ajoute un texte « les objectifs s'afficheront ici à la distribution » — bonne UX preview.
- expand-objectives-question:87-93 — Si `objectives.length === 0` : conserve la balise avec texte « aucun objectif défini sur le programme de cette formation — section ignorée » — bon.
- expand-objectives-question:96-109 — Expansion : `id: \`${q.id}::obj_${i}\`` — IDs virtuels stables ; `order_index: q.order_index + i / 1000` — risque de **collision avec questions suivantes** si le programme a >1000 objectifs (improbable).
- expand-objectives-question:128-147 — `buildResponsesPayload` snapshot des objectifs dans `_objectives_snapshot` — bonne pratique pour audit.

#### `src/lib/questionnaire-qr-pdf-export.ts` (51 LOC)
**Rôle** : génère un PDF jsPDF avec QR codes (6 par page), un par apprenant inscrit.

**Top issues** :
- questionnaire-qr-pdf-export:20 — boucle synchrone `for (let i = 0; ...)` avec `await QRCode.toDataURL` à chaque tour — séquentiel, lent (~50ms/QR). 30 apprenants = 1.5s. Pourrait paralléliser.
- questionnaire-qr-pdf-export:35 — `${tok.learner.last_name?.toUpperCase()} ${tok.learner.first_name}` — risque `"undefined undefined"` si learner null.
- questionnaire-qr-pdf-export:46 — `url.length > 55 ? url.slice(0, 52) + "..."` — troncature affichée sous le QR, OK.
- Pas de validation des inputs.

### 2.8 Templates HTML (355 LOC)

#### `src/lib/templates/reponses-evaluations.ts` (110 LOC)
**Rôle** : template HTML "Réponses aux évaluations" — variante simplifiée (2 tableaux : satisfaction + évaluations agrégées).

**Top issues** :
- Aucune balise `[%Cachet de l'organisme%]` resolver dépendance externe : OK.
- Pas d'info session (apprenant, dates, etc.) — bon : c'est la variante simplifiée.

#### `src/lib/templates/reponses-satisfaction-session.ts` (133 LOC)
**Rôle** : template "Réponses satisfaction apprenants" — complet (suivi qualité KPIs Qualiopi + 2 tableaux).

**Top issues** :
- reponses-satisfaction-session:105-110 — bloc session-info `Nom de la formation`, `Date de début`, `Date de fin`, `Lieu`, `Durée` — bon.
- Identique en structure CSS à `reponses-evaluations.ts` à 90%.

#### `src/lib/templates/resultats-evaluations.ts` (112 LOC)
**Rôle** : template "Résultats des évaluations" (par apprenant) — 1 tableau évaluations + statut acquis/non_acquis.

**Top issues** :
- Aucune.

### 2.9 Migrations SQL (5 fichiers)

#### `add-evaluation-tab.sql`
**Rôle** : crée `formation_evaluation_assignments` + RLS.
**Issues** :
- evaluation_type CHECK fermé : `eval_preformation | eval_pendant | eval_postformation | auto_eval_pre | auto_eval_post`. **PAS** d'autre type. Cohérent avec UI.
- RLS policy `fea_entity_access` initial remplacé par `fix_evaluation_assignments_rls.sql` plus tard (split en 4 policies SELECT/INSERT/UPDATE/DELETE).

#### `add-satisfaction-tab.sql`
**Rôle** : crée `formation_satisfaction_assignments` + RLS.
**Issues** :
- **BUG CRITIQUE** : satisfaction_type CHECK = `satisfaction_chaud | satisfaction_froid | quest_financeurs | quest_formateurs | quest_managers | quest_entreprises | autres_quest` ; **manque `satisfaction_entreprise`** que TabQuestionnaires.tsx:46 utilise. INSERT violera CHECK constraint en runtime.
- RLS policy `fsa_entity_access` non splittée (contrairement à FEA) — incohérence migrations.
- target_type CHECK : `learner | trainer | manager | financier | company` — UI n'expose que learner et company.

#### `add_admin_questionnaire_fill.sql`
**Rôle** : ajoute 4 colonnes à `questionnaire_responses` : `filled_by_admin`, `filled_by_admin_at`, `fill_mode`, `admin_notes`.
**Issues** :
- `fill_mode` CHECK : `learner | admin_for_learner | admin_paper`. Mais le code (`fill-for-learner/route.ts:81`) force toujours à `learner`. Les 2 autres valeurs sont **mortes** (jamais insérées). Bug logique caché.
- Index partiel `WHERE filled_by_admin IS NOT NULL` — bon pour audit.

#### `add_questionnaire_public_tokens.sql`
**Rôle** : crée `questionnaire_tokens` + RLS admin.
**Issues** :
- `expires_at` default `NOW() + 90 days` — OK.
- Unique partial index `(session_id, questionnaire_id, learner_id) WHERE used_at IS NULL` — évite les doublons tokens actifs.
- RLS `admins_manage_questionnaire_tokens` : full access pour tout user dont `profile.entity_id = tokens.entity_id` — **inclut les learners** (un learner peut donc lister tous les tokens de son entité, voire les supprimer). **Faille de sécurité majeure**.

#### `fix_evaluation_assignments_rls.sql`
**Rôle** : split RLS en 4 policies pour FEA.
**Issues** :
- Aucune restriction par role (`auth.user_role() = 'admin'` n'est PAS testé) — n'importe quel user authentifié de l'entité peut écrire dans `formation_evaluation_assignments`. **Faille majeure** : un learner peut attribuer/supprimer des évaluations.

---

## 3. État des lieux par catégorie

### 3.1 Bugs critiques sécurité multi-tenant

#### 3.1.1 RLS `formation_evaluation_assignments` sans check de rôle
Migration `fix_evaluation_assignments_rls.sql:6-41` — Les 4 policies SELECT/INSERT/UPDATE/DELETE filtrent par `session.entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())` **sans check de rôle**.

```sql
CREATE POLICY "fea_entity_insert" ON formation_evaluation_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT s.id FROM sessions s
      WHERE s.entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())
    )
  );
```

→ Un `learner` ou `trainer` ou `client` de l'entité peut INSERT/UPDATE/DELETE ces lignes. Severité : P0.

#### 3.1.2 RLS `formation_satisfaction_assignments` même problème
Migration `add-satisfaction-tab.sql:27-37` — Policy `fsa_entity_access` FOR ALL sans rôle. Idem § ci-dessus.

#### 3.1.3 RLS `questionnaire_tokens` autorise n'importe quel rôle
Migration `add_questionnaire_public_tokens.sql:26-28` :
```sql
CREATE POLICY "admins_manage_questionnaire_tokens"
  ON questionnaire_tokens FOR ALL TO authenticated
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));
```
→ Un learner peut lister tous les tokens de son entité, donc lire potentiellement ceux d'autres apprenants → ouverture de leur questionnaire avec leur identité.
→ Un learner peut DELETE des tokens → DoS sur le présentiel QR.
Severité : P0.

#### 3.1.4 IDOR potentiel sur `GET /api/admin/questionnaires/fill-for-learner`
fill-for-learner:122-146 — Le GET utilise `getServiceSupabase()` (bypass RLS), `requireRole(["super_admin","admin"])` OK pour le rôle, mais **ne vérifie pas que `learner_id` appartient à l'entité de l'admin**. Un admin entité A pourrait lire une réponse d'un learner entité B en tapant le bon `learner_id`.

Snippet :
```ts
// fill-for-learner:134-142
const { data } = await supabase
  .from("questionnaire_responses")
  .select("id, responses, fill_mode, filled_by_admin, ...")
  .eq("questionnaire_id", questionnaire_id)
  .eq("learner_id", learner_id)
  .eq("session_id", session_id)
  .maybeSingle();
// ⚠️ Pas de check entity_id ; service role bypass RLS.
```
Severité : P0 si on accepte que `super_admin` n'est pas censé cross-entité (à confirmer avec Wissam).

#### 3.1.5 `relaunch/route.ts` ne filtre pas par entity
`relaunch:24-28` — `.from("learners").select(...).in("id", learner_ids)` — service role bypass RLS implicite via `requireRole` (qui retourne `auth.supabase` = utilisateur authentifié), MAIS aucune vérification que les learner_ids appartiennent à `session.entity_id`. Côté UI les IDs viennent du formation actuelle mais un admin malveillant peut forger un POST.

#### 3.1.6 Défense en profondeur cassée dans 9 fetches Supabase
Les fetches suivants n'ajoutent **PAS** de `.eq("entity_id", entityId)` (RLS protège, mais pattern observé dans TabConventionDocs après solidification = systématique) :
- TabQuestionnaires.tsx:74-77 (4 queries).
- AdminFillQuestionnaireDialog.tsx:68-77 (2 queries).
- generate-resultats-evaluations:60-67 (enrollments).
- generate-resultats-evaluations-batch:65-67 (enrollments).
- relaunch:18-20 (sessions), :24-28 (learners).
- questionnaire-tokens:32-34 (enrollments), :44-52 (tokens).
- fill-for-learner:27-32 (enrollments), :49-55 (responses).

Severité : P2 (RLS rattrape ; mais pattern de solidification absent).

### 3.2 Bugs critiques fonctionnels

#### 3.2.1 Découplage architectural total `formation_*_assignments` ↔ `questionnaire_sessions`
**Le bug le plus grave du sous-système.**

- TabQuestionnaires écrit dans `formation_evaluation_assignments` ET `formation_satisfaction_assignments` (cf. TabQuestionnaires:206-211).
- `load-evaluation-results.ts:78-83`, `load-session-aggregates.ts:79-91 / 224-233 / 305-309`, `learner/questionnaires/page.tsx:99-102`, `auto-send/route.ts:48-51` lisent depuis `questionnaire_sessions`.
- Aucun trigger SQL, aucun service applicatif ne synchronise les deux.

Conséquences concrètes :
1. **Le PDF "Résultats des évaluations"** ne trouvera **aucune** évaluation pour les attributions faites uniquement via TabQuestionnaires → renvoie « Aucune évaluation complétée pour cette formation ».
2. Le PDF "Réponses satisfaction" idem → tableau "Aucune réponse de satisfaction enregistrée".
3. La **page learner /learner/questionnaires** n'affichera RIEN à l'apprenant pour les questionnaires attribués via TabQuestionnaires → l'apprenant ne sait pas qu'il a des choses à remplir.
4. L'**auto-send cron** ne tournera pas pour ces questionnaires (jamais déclenché).
5. Les **KPIs Qualiopi** (acquisitionRate, satisfactionRate, satisfactionResponses, evaluationCount) calculés via `loadQualiopiIndicators` sont **systématiquement 0/null** pour les sessions configurées via le nouveau workflow.

Severité : **P0 BLOQUANT EN PRODUCTION**.

#### 3.2.2 `satisfaction_entreprise` viole la CHECK constraint DB
TabQuestionnaires.tsx:46 propose un itemType de type `satisfaction_entreprise`. Cet enum n'est pas dans la liste de l'enum `add-satisfaction-tab.sql:9-13`. INSERT lèvera une violation de contrainte CHECK.

Snippet TabQuestionnaires:46 :
```ts
{ category: "satisfaction", type: "satisfaction_entreprise", label: "Satisfaction entreprise", ... target: "company" },
```
Snippet add-satisfaction-tab.sql:9-13 :
```sql
satisfaction_type TEXT NOT NULL CHECK (satisfaction_type IN (
    'satisfaction_chaud', 'satisfaction_froid',
    'quest_financeurs', 'quest_formateurs', 'quest_managers',
    'quest_entreprises', 'autres_quest'
)),
```
Et puis le handler:
```ts
// TabQuestionnaires:210
else { ins.satisfaction_type = item.type; ins.target_type = item.target || "learner"; }
```

Severité : **P0 BLOQUANT** (try/catch en place mais utilisateur voit "Erreur" sans pouvoir comprendre).

#### 3.2.3 `yes_no` toujours marqué incorrect
load-evaluation-results.ts:58-60 ET load-session-aggregates.ts:60-62 :
```ts
if (question.type === "yes_no" || question.type === "true_false") {
  return Boolean(userAnswer) === Boolean(correct);
}
```
`userAnswer` est la string `"oui"` ou `"non"` (cf. AdminFillQuestionnaireDialog:291-301 ET questionnaire/[token]/page.tsx:178-185). `Boolean("non")` est `true` (string non vide). Donc :
- Apprenant répond "oui" → `Boolean("oui") === Boolean(true)` → `true === true` → marqué correct (par chance, si correct_answer est `true`).
- Apprenant répond "non" → `Boolean("non") === Boolean(false)` → `true === false` → marqué incorrect (toujours).

→ **Toute question yes_no est mal scorée**. Conséquence : taux acquisition Qualiopi faussé.

Severité : **P0**.

#### 3.2.4 Incohérence côté UI dans AdminFillQuestionnaireDialog
cf. §AdminFillQuestionnaireDialog.tsx:103-117 — le composant détecte `existing.fill_mode === "learner"` et bascule en `blocked=true`. Mais le serveur force toujours `fill_mode='learner'` (même pour les saisies admin). Conséquence : ouvrir le dialog sur un apprenant pour qui un admin a précédemment saisi → l'admin voit "Répondu par l'apprenant — Les réponses de l'apprenant ne peuvent pas être écrasées" → impossible de modifier sa propre saisie précédente via l'UI.

Severité : **P0 UX bloquante** (la fonctionnalité "Modifier" affichée dans TabQuestionnaires:347-351 ouvre un dialog qui interdit la modification).

#### 3.2.5 Toast `Rappels envoyés` affiche `undefined envoyé(s)`
TabQuestionnaires:271 attend `d.sent` ; relaunch:52 retourne `enqueued`. Aucun match → `d.sent === undefined` → `${undefined} envoyé(s)`.

Severité : P1 UX dégradée.

#### 3.2.6 Cache PDF jamais invalidé par nouvelle réponse
generate-reponses-evaluations / generate-reponses-satisfaction / generate-resultats-evaluations utilisent `cacheInputs.session_updated_at` comme clé de fraîcheur. Mais l'INSERT dans `questionnaire_responses` (public-submit, fill-for-learner) **ne met pas à jour** `sessions.updated_at`. Conséquence : un PDF généré 1 fois est servi à l'identique même si des réponses sont ajoutées plus tard.

Severité : **P1** (très visible : « pourquoi mes PDFs ne se mettent pas à jour ? »).

#### 3.2.7 Génération PDF QR codes côté CLIENT
TabQuestionnaires:297-299 — `await import("@/lib/questionnaire-qr-pdf-export")` puis `exportQuestionnaireQRPdf` qui utilise jsPDF et qrcode dans le navigateur.

- Pas de cache server-side.
- Pas de log Qualiopi.
- Pas de propagation aux autres admins.
- Perf médiocre pour 30+ apprenants (mais surtout : asymétrique par rapport à tous les autres documents qui passent par DocumentGenerationService).

Severité : **P1**.

### 3.3 Bugs majeurs (robustesse)

#### 3.3.1 Catch vides / silencieux (4 occurrences)
- TabQuestionnaires:272 — `catch { t({ title: "Erreur", variant: "destructive" }); }` — catch sans variable, message générique.
- TabQuestionnaires:301 — `catch (err) { t({ title: "Erreur QR", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" }); }` — OK.
- page.tsx:49 — `catch { setError("Impossible de charger le questionnaire"); }` — catch vide (sans err).
- Pas d'autres catch vides détectés.

#### 3.3.2 `handleRemove` sans try/catch (TabQuestionnaires:219-227)
```ts
const handleRemove = async () => {
  if (!current) return;
  setSaving(true);
  const table = item.category === "evaluation" ? "formation_evaluation_assignments" : "formation_satisfaction_assignments";
  await sb.from(table).delete().eq("id", current.id);
  t({ title: "Questionnaire retiré" });
  await (onRefresh as () => Promise<void>)();
  setSaving(false);
};
```
→ Si DELETE échoue, `t({ title: "Questionnaire retiré" })` s'affiche mais la donnée est toujours là. Pas de toast d'erreur.

Severité : P1.

#### 3.3.3 `await onRefresh` mal géré
TabQuestionnaires:177 — `onRefresh={async () => { await fetchData(); await onRefresh(); }}` — bonne séquence mais aucun try/catch. Si `fetchData` lève, `onRefresh` est skip.

#### 3.3.4 N+1 queries dans `questionnaire-tokens`
questionnaire-tokens:39 — boucle séquentielle SELECT existing + INSERT par apprenant. Pour 30 apprenants = 60 RTT (5-10s). Devrait :
1. SELECT toutes les existing en batch via `.in("learner_id", learner_ids)`.
2. INSERT en batch les manquantes via `.insert(rows)` avec onConflict.

#### 3.3.5 N+1 queries dans `loadEvaluationResults` et `loadEvaluationAggregates`
load-evaluation-results:93-108 et load-session-aggregates:321-326 — 1 paire de queries (questions + responses) par questionnaire. 5 questionnaires = 10 queries.

#### 3.3.6 Casts dangereux récapitulatifs
- TabQuestionnaires.tsx — 28 casts `as Record<string, unknown>` ou `as unknown as ...` recensés via lecture intégrale (lignes 91, 97, 142, 174, 188, 192, 193, 194, 195, 196, 197, 209, 215, 222, 224, 239, 266, 268, 275, 276, 287, 313, 322, 386, 390 ...).
- AdminFillQuestionnaireDialog.tsx — 8 casts (lignes 83, 92, 100, 145, 254, etc.).
- Services — `as unknown as ... []` répété 5× dans `load-session-aggregates.ts` et 3× dans `load-evaluation-results.ts`.

#### 3.3.7 Pas de transaction atomique sur public-submit
public-submit:120-142 — INSERT réponse + UPDATE token séparés. Si l'UPDATE échoue (RLS denial, network), le token reste utilisable une 2e fois → l'apprenant peut soumettre 2 réponses pour la même formation.

→ Devrait être une fonction RPC PostgreSQL avec transaction.

Severité : P1.

#### 3.3.8 Race condition entre `auto-send` et `public-submit`
Si un cron auto-send tourne pendant qu'un apprenant submit, le check `respondedIds` ligne 110 peut être stale → email envoyé même si l'apprenant vient de répondre. Pas grave (anti-doublon email_history rattrape).

#### 3.3.9 `getStats` non mémoïsé (TabQuestionnaires:93-99)
Recomputé à chaque render pour chaque item — O(STAGES × items × responses) à chaque render. Pas grave en pratique (arrays petits) mais easy fix avec useMemo.

#### 3.3.10 `console.error` sans toast (8 occurrences)
- public-submit:134 — `console.error` insert failed → renvoie 500 mais log non corrélé.
- public-submit:147 — `console.error` global catch → idem.
- relaunch:54 — idem.
- fill-for-learner:117 — idem.
- questionnaire-tokens:82 — `console.error` insert failed (race) → silently skipped.
- auto-send:147 — idem.
- learner/questionnaires/page.tsx:79 — `console.error` learner fetch error sans toast.
- ItemDetail handler relaunch (TabQuestionnaires:272) → toast mais erreur perdue.

### 3.4 Dette technique

#### 3.4.1 Duplication massive des routes generate-* (5 fichiers × ~120 LOC)
Les routes :
- `generate-reponses-evaluations/route.ts` (107 LOC)
- `generate-reponses-evaluations-mock/route.ts` (151 LOC)
- `generate-reponses-satisfaction/route.ts` (106 LOC)
- `generate-reponses-satisfaction-mock/route.ts` (151 LOC)
- `generate-resultats-evaluations/route.ts` (125 LOC)
- `generate-resultats-evaluations-mock/route.ts` (126 LOC)

Sont à **95-99% identiques** entre elles :
- Bloc auth (lignes 30-40) **identique** → 7 × 11 LOC = 77 LOC duplicated.
- Bloc `Promise.all([loadEntitySettings, loadSessionAggregates])` (lignes 54-57) **identique 3×**.
- Bloc `engine = createDefaultEngine(); service = new DocumentGenerationService(...)` (lignes 67-91) **identique 7×**.
- Données mock satisfaction (62 LOC) **dupliquées entre les 2 mocks réponses-*** — identiques.
- Réponse `NextResponse.json({ pdfBase64, cacheHit, engineUsed, fileSizeBytes, latencyMs, ... })` répétée.

Estimation conservative : **~500 LOC duplicated** entre les 7 routes. Refacto possible : un service `generateQuestionnaireDoc(supabase, sessionId, docType, options)`.

#### 3.4.2 Duplication parfaite des 3 routes send-*-batch-email
- `send-reponses-evaluations-batch-email/route.ts` (58 LOC)
- `send-reponses-satisfaction-batch-email/route.ts` (58 LOC)
- `send-resultats-evaluations-batch-email/route.ts` (58 LOC)

**Identiques à 100% modulo le docType string**. Auth + batchSendDocsEmail. C'est **par design** (thin-wrappers) — pas un bug, mais on peut faire mieux : route paramétrée `/api/documents/send-batch-email/[docType]` ou factory.

Pattern observé identique avec les routes `convocation`, `attestation_*`, etc. → cohérent avec la convention existante. Mais ça représente 21 × 58 = ~1200 LOC de boilerplate dans le repo.

#### 3.4.3 Naming inconsistency `reponses_satisfaction` vs `reponses_satisfaction_session`
- `generate-reponses-satisfaction/route.ts:71` → `docType: "reponses_satisfaction"`.
- `send-reponses-satisfaction-batch-email/route.ts:43` → `"reponses_satisfaction_session"`.
- `batch-email-handler.ts:288` → `reponses_satisfaction_session`.
- `batch-doc-send.ts:28` → `reponses_satisfaction_session`.
- `TabConventionDocs.tsx:104,144,184,225` → `reponses_satisfaction_session`.

→ Le PDF généré via `generate-*` est cachable sous la clé `reponses_satisfaction`. Le PDF généré via `send-*-batch-email` est cachable sous `reponses_satisfaction_session`. **Cache miss systématique entre les 2 voies**.

Severité : P2 (perf dégradée mais pas bug fonctionnel).

#### 3.4.4 RLS policies dupliquées dans 2 styles
- `add-evaluation-tab.sql:24-32` : 1 policy FOR ALL (style v1).
- `fix_evaluation_assignments_rls.sql:7-41` : 4 policies SELECT/INSERT/UPDATE/DELETE (style v2).
- `add-satisfaction-tab.sql:29-37` : 1 policy FOR ALL (style v1 — **PAS migré v2**).

→ Incohérence : la satisfaction n'a pas reçu son fix RLS. La policy FOR ALL fonctionne mais ne permet pas une régression-test fine.

#### 3.4.5 Tables hors schema.sql canonique
`questionnaire_tokens`, `formation_evaluation_assignments`, `formation_satisfaction_assignments`, `questionnaire_responses.filled_by_admin` et autres colonnes ne sont **pas** dans `supabase/schema.sql`. Le canonical n'est plus à jour → onboarding dev fragile.

#### 3.4.6 Doc-types `questionnaire_satisfaction*` orphelins dans automation
`automation/default-packs.ts:43,52,61,70` propose 4 doc_types `questionnaire_positionnement`, `questionnaire_satisfaction`, `questionnaire_satisfaction_client`, `questionnaire_satisfaction_froid` mais **`execute-rule.ts` ne handle aucun de ces 4 doc_types dans `buildAttachmentsForRecipient` (cf. switch lignes 101-132)**. Conséquence : les règles créées via le pack Qualiopi standard envoient un email **sans pièce jointe** et **sans lien questionnaire** pour ces 4 types → règles cosmétiques.

Severité : **P0 — Qualiopi non respecté**. Les automatisations questionnaire ne fonctionnent pas du tout.

#### 3.4.7 Constantes redondantes
- `PASSING_SCORE_PCT = 70` dans `load-evaluation-results.ts:20` ET `load-session-aggregates.ts:50`.
- `isCorrect()` dupliquée intégralement entre les deux services.
- `STAGES` array hardcodé uniquement dans TabQuestionnaires (OK car contexte propre, mais reusable potentiel).
- `EMAIL_SUBJECT_LABELS` et `FILENAME_LABELS` dans batch-email-handler.ts:253-330 (78 LOC, 39 doc_types × 2 maps).

#### 3.4.8 Mock data dupliquées
Les 2 mocks `generate-reponses-evaluations-mock/route.ts:50-112` et `generate-reponses-satisfaction-mock/route.ts:50-112` ont **exactement** les mêmes 62 lignes de données factices. À déduplicer en `src/lib/mocks/managers-proximite-session.ts`.

#### 3.4.9 `fill_mode` quasi-mort
- Migration ajoute `admin_for_learner | admin_paper` mais **jamais** inséré (cf. fill-for-learner:81,105).
- Le selector UI (AdminFillQuestionnaireDialog:215-220) propose les 2 options mais ce n'est que cosmétique.
- L'enum mort pollue la migration et confond le dev qui veut comprendre.

#### 3.4.10 Logique métier inline (~330 LOC)
- TabQuestionnaires:202-217 `handleAssign` (15 LOC) → devrait être dans `src/lib/services/questionnaires.ts`.
- TabQuestionnaires:219-227 `handleRemove` (9 LOC) → idem.
- TabQuestionnaires:264-273 handler relance (10 LOC) → idem.
- TabQuestionnaires:274-302 handler QR codes (28 LOC) → idem.

→ Le composant fait 395 LOC dont ~80 LOC de logique métier qui n'a rien à faire dans un .tsx.

### 3.5 UX / « piloter la partie questionnaire »

#### 3.5.1 Vue d'ensemble manquante / fragmentée
- Le hero (TabQuestionnaires:108-117) affiche 3 KPIs : `Configurés (X/8)`, `Réponses (N)`, `Complétion (%)`. Mais le `% complétion = configured/totalSlots` est **mensonger** car il assume que TOUS les 8 slots sont nécessaires (cf. §TabQuestionnaires:101-103). Une formation qui ne fait que 2 stages aura un mauvais score d'office.
- Pas de KPI "Apprenants n'ayant rien rempli", pas de KPI "Délais moyens de réponse", pas de KPI Qualiopi (acquisitionRate, satisfactionRate) **alors que ces données existent et sont calculées par loadQualiopiIndicators**.
- Pas d'indicateur "Cette formation est-elle prête pour audit Qualiopi ?" (style red/green dot par étape critique).

#### 3.5.2 Pas de tri/filtrage des apprenants par statut de réponse
La liste apprenants (TabQuestionnaires:308-356) est :
- Pas triable par statut (répondu / en attente).
- Pas filtrable.
- Pas paginée → si 30+ apprenants, scroll cauchemardesque dans un dialog max-h-60.

#### 3.5.3 Boutons cosmétiques
- AdminFillQuestionnaireDialog:218 — `admin_paper` n'a aucun effet serveur (cf. fill-for-learner:95). Bouton cosmétique.
- Mode selector dans AdminFill (215-220) — sélection ignorée par le serveur.

#### 3.5.4 Flows manquants
1. **Modifier un questionnaire envoyé** : aucun bouton "Re-publier" si l'admin change le questionnaire dans la banque. Les tokens existants continuent de pointer vers l'ancienne version.
2. **Changer la deadline** : `expires_at` hardcodé à 90 jours, aucun champ UI.
3. **Marquer "non applicable" pour 1 apprenant** : pas de feature → l'apprenant compte comme non-répondant pour les KPIs Qualiopi.
4. **Désactiver un questionnaire pour 1 apprenant** : pas de feature (formation_evaluation_assignments accepte `learner_id` pour cas individuel, jamais utilisé par l'UI).
5. **Renvoyer un QR à 1 apprenant** : pas dispo, il faut régénérer le PDF complet.
6. **Voir les réponses non-anonymes d'un apprenant donné** : pas de bouton "Voir la fiche réponse" — uniquement le bouton "Saisir/Modifier" qui ouvre le dialog d'édition.
7. **Comparer avant/après formation** : pas d'écran qui rapproche `auto_eval_pre` et `auto_eval_post` pour mesurer la progression.
8. **Exporter en Excel** : pas dispo → seulement PDF.
9. **Brouillon d'envoi en masse** : si l'admin veut envoyer manuellement à tous les apprenants, il ne peut que cliquer "Relancer non-répondants" (qui exclut les répondants par construction).
10. **Voir la liste des tokens actifs** : pas de UI → l'admin ne peut pas révoquer un token compromis.
11. **Logs Qualiopi par questionnaire** : pas d'historique "Envoyé le ?, Rappelé le ?, Répondu le ?".

#### 3.5.5 Comparaison avec un admin Qualiopi attend
| Besoin Qualiopi | Présent ? | Commentaire |
|---|---|---|
| Voir taux de satisfaction global | ❌ (calculé mais non affiché dans Tab) | loadQualiopiIndicators OK mais inutilisé par TabQuestionnaires |
| Voir taux d'acquisition | ❌ | idem |
| Identifier les apprenants en retard | ❌ | uniquement via dialog ouverture |
| Voir l'historique d'envoi | ❌ | pas dans le tab |
| Exporter pour audit | Partiel | PDF mais pas Excel, pas regroupé |
| Tracer qui a répondu en mode admin | ❌ (côté UI invisible par demande Loris) | conflit avec Qualiopi qui demande la traçabilité |
| Prouver qu'un questionnaire a été envoyé à J-7 | ❌ | aucune trace temporelle dans TabQuestionnaires |

### 3.6 Performance

#### 3.6.1 N+1 queries dans `questionnaire-tokens/route.ts`
Cf. §3.3.4. Pour 30 apprenants : 60 RTT séquentielles.

#### 3.6.2 N+1 queries dans `loadEvaluationResults`
Cf. §3.3.5. 1 paire (questions + responses) par questionnaire.

#### 3.6.3 Génération PDF QR codes côté CLIENT
Cf. §3.2.7. jsPDF + qrcode toDataURL en boucle sync = lent et bloque le thread UI.

#### 3.6.4 ZIP base64 in JSON pour batch résultats
generate-resultats-evaluations-batch:144-146 — base64 JSON sur 10-40 MB → risque timeout Netlify (10s functions limit) si >20 apprenants. Devrait streamer ou via signed URL S3.

#### 3.6.5 PostgREST 4 queries en parallèle dans TabQuestionnaires
TabQuestionnaires:73-78 — `Promise.all([qR, eR, sR, rR])` — OK perf-wise. Mais pas mémoïsé si l'utilisateur change rapidement de tab.

#### 3.6.6 Cache PDF pollué par mauvaise clé
Cf. §3.2.6 et §3.4.3. Le cache PostgREST stocke des PDFs périmés.

---

## 4. Couplage transverse

### 4.1 Qualiopi
- `loadQualiopiIndicators` (load-session-aggregates:161-296) calcule 4 KPIs : `totalLearners`, `completionRate` (présence), `satisfactionRate` (moyenne ratings × 20), `acquisitionRate` (% acquis évals).
- Ces KPIs **dépendent de `questionnaire_sessions`** → **invalidés par §3.2.1**.
- Le tab TabQuestionnaires **ne consomme jamais loadQualiopiIndicators directement** → l'admin doit générer un PDF pour voir les KPIs Qualiopi.
- Le tab TabQualiopi (cf. tabQualiopi.tsx — pas en scope) **consomme probablement** ces indicateurs (à vérifier dans le deep-dive Qualiopi).

### 4.2 Automatisations (formation_automation_rules)
- Pack Qualiopi standard (`default-packs.ts:21-83`) propose 6 règles dont 4 questionnaires :
  - `questionnaire_positionnement` J-3.
  - `questionnaire_satisfaction` J0 (on_session_completion).
  - `questionnaire_satisfaction_client` J+7 (companies).
  - `questionnaire_satisfaction_froid` J+30.
- **Aucun des 4 doc_types n'est handle par `buildAttachmentsForRecipient` (execute-rule.ts:101-132)**. Conséquence : les emails partent **sans pièce jointe ni lien** vers le questionnaire.
- Le `DOCUMENT_TYPE_SUBJECTS` (execute-rule.ts:17) ne contient que `questionnaire_satisfaction`, manquent les 3 autres → fallback `rule.document_type` brut dans le sujet de l'email = subject « questionnaire_positionnement — XYZ » crade.

### 4.3 TabConventionDocs (BATCH_SEND_ENDPOINTS)
- Les 3 doc_types `reponses_evaluations`, `reponses_satisfaction_session`, `resultats_evaluations` sont bien dans :
  - `BATCH_SEND_ENDPOINTS_BY_DOC_TYPE` (batch-doc-send.ts:27-29).
  - `SYSTEM_TEMPLATES_BY_DOC_TYPE` (templates/registry.ts:397-414).
  - `EMAIL_SUBJECT_LABELS` (batch-email-handler.ts:287-289).
  - `FILENAME_LABELS` (batch-email-handler.ts:327-329).
  - Style CSS (TabConventionDocs.tsx:103-105,143-145,183-185,224-226).
- **Le branchement docx_fidelity custom** est supporté via batchSendDocsEmail:393-451 — l'admin peut uploader un Word personnalisé pour ces 3 doc_types et il sera utilisé à la place du HTML système.
- ✅ Globalement bien intégré côté TabConventionDocs.

### 4.4 Email queue (enqueueEmails)
- `relaunch:50` utilise `enqueueEmails` (batch).
- `auto-send:118` utilise `enqueueEmail` (singleton).
- Cohérence OK.
- Anti-doublon : `auto-send:96-103` via `email_history` `ilike '%title%' && status='sent'` — fragile si le titre change.

---

## 5. Synthèse honnête

### 5.1 Estimation fonctionnelle
**Le sous-système est fonctionnel à ~40%** :
- ✅ La banque de questionnaires `/admin/questionnaires` fonctionne (out-of-scope).
- ✅ La saisie publique via token (QR) fonctionne pour un flow learner standard (rating, multi-choice, text).
- ❌ **Aucun PDF de restitution ne contient les données** des questionnaires attribués via TabQuestionnaires (cf. §3.2.1).
- ❌ **Aucun indicateur Qualiopi ne reflète** ces attributions (cf. §3.2.1).
- ❌ **Aucune automatisation ne fonctionne** pour les 4 doc_types questionnaire (cf. §3.4.6).
- ❌ Le `yes_no` est **toujours marqué incorrect** (cf. §3.2.3).
- ❌ L'enum `satisfaction_entreprise` est **incompatible avec la DB** (cf. §3.2.2).
- ❌ Le portail learner ne voit **rien** quand l'admin attribue via TabQuestionnaires (cf. §3.2.1).
- ❌ La modification d'une saisie admin précédente est **bloquée par l'UI** (cf. §3.2.4).

### 5.2 Top 5 risques résiduels

1. **(P0)** Découplage `formation_*_assignments` ↔ `questionnaire_sessions` rend l'attribution via le NOUVEAU workflow invisible aux PDFs, KPIs Qualiopi, portail learner, auto-send.
2. **(P0)** RLS permissive sur `formation_evaluation_assignments`, `formation_satisfaction_assignments` et `questionnaire_tokens` autorise n'importe quel rôle authentifié (learners inclus) à insert/update/delete.
3. **(P0)** `satisfaction_entreprise` lève une CHECK constraint violation au runtime.
4. **(P0)** Toutes les questions `yes_no` sont mal scorées → taux acquisition Qualiopi faussé.
5. **(P0)** Automatisations `questionnaire_*` documentent envoyent des emails vides (sans PJ ni lien).

### 5.3 Comparaison qualité vs TabConventionDocs post-solidification

| Critère | TabConventionDocs (post-solid) | TabQuestionnaires (actuel) |
|---|---|---|
| Filtres entity_id explicites systématiques | ✅ | ❌ (RLS uniquement) |
| Type safety strict | ✅ (interfaces dédiées) | ❌ (Record<string, unknown>) |
| Try/catch + toast exhaustifs | ✅ | ⚠️ (3 catch vides ou silencieux) |
| Helpers documents-store mutualisés | ✅ (4 helpers) | ❌ (0 helper) |
| await onRefresh systématique | ✅ | ⚠️ (parfois) |
| Sections sous-composées (refonte > 1500 LOC) | ✅ (sections/ folder) | n/a (395 LOC seulement) |
| docx_fidelity supporté | ✅ | ✅ (via batch-email-handler) |
| Tests unitaires | ✅ | ⚠️ (1 test load-session-aggregates seulement) |
| Cohérence schéma (FEA/FSA dans schema.sql) | ✅ | ❌ (hors canonical) |

**Score qualité TabQuestionnaires : 3/10** (vs TabConventionDocs post-solid à 8/10).

---

## 6. Plan d'action de solidification proposé

### Volet A — Sécurité multi-tenant (P0 / 8-12h)

**Bugs/dettes adressés** : §3.1.1, §3.1.2, §3.1.3, §3.1.4, §3.1.5, §3.1.6.

Actions :
- A1. Migration `tighten_fea_fsa_tokens_rls.sql` : ajouter `auth.user_role() IN ('admin', 'super_admin')` aux 4 policies FEA + 1 policy FSA + 1 policy questionnaire_tokens.
- A2. fill-for-learner GET : ajouter check entity_id via cross-table query (learner.entity_id == auth.profile.entity_id).
- A3. relaunch : ajouter `.eq("entity_id", session.entity_id)` sur la query learners pour défense en profondeur.
- A4. Ajouter `.eq("entity_id", entityId)` sur les 9 fetches listés §3.1.6.
- A5. Tests RLS (vitest + entity-isolation pattern) : pour chaque table, 1 test "learner ne peut pas insert FEA", 1 test "learner ne peut pas delete tokens".
- A6. Documenter dans `CLAUDE.md` que `formation_evaluation_assignments`, `formation_satisfaction_assignments`, `questionnaire_tokens` doivent toujours filtrer par entity_id.

Estimation : **10h**. Priorité **P0**.

### Volet B — Type safety (P1 / 4-6h)

**Bugs/dettes adressés** : §3.3.6.

Actions :
- B1. Créer `src/lib/types/questionnaires.ts` avec `EvaluationAssignment`, `SatisfactionAssignment`, `QuestionnaireResponse` (incl. `fill_mode`, `filled_by_admin`), `QuestionnaireToken`.
- B2. Typage strict du state TabQuestionnaires et ItemDetail (supprimer `Record<string, unknown>`).
- B3. Helper `safeCastSession(unknown): Session` pour mutualiser le pattern `as unknown as Session`.
- B4. Retirer les `as never` dans AdminFillQuestionnaireDialog:84-94.
- B5. Activer un eslint rule `@typescript-eslint/no-explicit-any` strict sur ces 23 fichiers (déjà actif globalement ?).

Estimation : **5h**. Priorité **P1**.

### Volet C — Robustesse (P1 / 6-8h)

**Bugs/dettes adressés** : §3.3.1, §3.3.2, §3.3.3, §3.3.4, §3.3.7, §3.3.10.

Actions :
- C1. Wrapper `handleRemove`, `handleAssign`, handler relance, handler QR dans try/catch + toast d'erreur explicite.
- C2. Refactorer `questionnaire-tokens/route.ts` en 2 queries batch (SELECT existing IN learner_ids, INSERT missing avec onConflict).
- C3. Transformer le INSERT+UPDATE de `public-submit/route.ts` en RPC PostgreSQL atomique (`fn_submit_questionnaire_response`).
- C4. Fix `auto-send/route.ts:61` — `as any` → typage propre via interface.
- C5. Fix log corrélation : `console.error("[X]", { session_id, learner_id, err })` partout.
- C6. Tests vitest sur public-submit (token used, expired, valid + race condition).

Estimation : **7h**. Priorité **P1**.

### Volet D — UX pilotage (P0/P1 / 12-18h)

**Bugs/dettes adressés** : §3.2.4, §3.2.5, §3.5.1, §3.5.2, §3.5.3, §3.5.4 (sous-set), §3.5.5.

Actions :
- D1. Fix logique `blocked` dans AdminFillQuestionnaireDialog (utiliser `fill_mode='learner' && filled_by_admin === null`).
- D2. Fix `Rappels envoyés` toast (relaunch retourne `sent: inserted` au lieu d'`enqueued`).
- D3. Ajouter dans le hero les KPIs Qualiopi calculés via loadQualiopiIndicators : `satisfactionRate`, `acquisitionRate`, `evaluationCount`, `satisfactionResponses`.
- D4. Le KPI "Complétion" doit être `configured / configuredOrApplicable` au lieu de `/totalSlots`.
- D5. Liste apprenants : tri par statut (répondu/attente), filtre par statut, recherche par nom.
- D6. Bouton "Désactiver pour cet apprenant" (utilise FEA.learner_id NOT NULL).
- D7. Bouton "Renvoyer un QR à 1 apprenant" + "Re-générer tokens" (force expiration ancien + create nouveau).
- D8. Section "Historique d'envoi" par questionnaire avec dates (depuis email_history).
- D9. Bouton "Voir réponse" (read-only) à côté de "Saisir/Modifier".
- D10. Comparaison `auto_eval_pre` vs `auto_eval_post` (page séparée ou modal).
- D11. Export Excel via xlsx d'un questionnaire (toutes les réponses).
- D12. Retirer le selector "Mode" cosmétique dans AdminFillDialog (ou wire au serveur).

Estimation : **15h**. Priorité **P0 sur D1-D3, P1 sur D4-D12**.

### Volet E — Refacto architectural (P0 / 16-24h)

**Bugs/dettes adressés** : §3.2.1, §3.2.2, §3.2.3, §3.2.6, §3.4.1, §3.4.3, §3.4.5, §3.4.6, §3.4.7, §3.4.8, §3.4.9, §3.4.10.

Actions :
- E1. **CRITIQUE** Trigger SQL `sync_formation_assignments_to_questionnaire_sessions` AFTER INSERT/DELETE sur FEA et FSA → upsert/delete questionnaire_sessions.
   - OU : refactorer `loadEvaluationResults`, `loadSessionAggregates`, `learner/questionnaires/page.tsx`, `auto-send/route.ts` pour lire `formation_evaluation_assignments` + `formation_satisfaction_assignments` (recommandation : trigger DB pour minimiser la diff).
- E2. **CRITIQUE** Migration `fix_satisfaction_entreprise_enum.sql` : ajouter `satisfaction_entreprise` au CHECK de `formation_satisfaction_assignments.satisfaction_type`.
- E3. **CRITIQUE** Fix `isCorrect` yes_no : comparer string `"oui"`/`"non"` à `correct_answer` (probablement `true`/`false` → mapper).
- E4. Fix cache PDF : tringle `sessions.updated_at` après INSERT dans `questionnaire_responses` (trigger DB OU dans le service).
   - Alternative : inclure `response_count_at_session_t` dans cacheInputs.
- E5. Factorer les 7 routes `generate-*` en 1 service `generateQuestionnaireDoc(...)` exposé par 3 routes minces.
- E6. Factorer `isCorrect` et `PASSING_SCORE_PCT` dans un seul fichier `src/lib/services/questionnaire-scoring.ts`.
- E7. Dédupliquer les données mock dans `src/lib/mocks/managers-proximite-session.ts`.
- E8. Ajouter `satisfaction_entreprise` aux migrations satisfaction (ou retirer de l'UI).
- E9. Retirer le mode `admin_paper` / `admin_for_learner` morts (ou les implémenter côté serveur).
- E10. Wire automation : implémenter les 4 cases `questionnaire_*` dans `execute-rule.ts:buildAttachmentsForRecipient`.
   - Chaque case doit générer un token public + email avec lien `/questionnaire/[token]`.
- E11. Document `schema.sql` canonical : ajouter les 3 nouvelles tables et les 4 colonnes admin fill.
- E12. Extraire `handleAssign`, `handleRemove`, handler relance, handler QR dans `src/lib/services/questionnaires.ts`.

Estimation : **20h**. Priorité **P0 sur E1-E4 et E10, P1 sur le reste**.

### Volet F — Tests (P1 / 6-10h)

**Bugs/dettes adressés** : §5.3.

Actions :
- F1. Tests vitest sur :
  - `expandObjectivesQuestions` (case sans programme, case 0 objectifs, case N objectifs).
  - `buildResponsesPayload` (snapshot incluant _objectives_snapshot).
  - `isCorrect` toutes les branches type x correct_answer (incl. yes_no fixé).
  - `loadEvaluationResults` après §E1 (lit FEA au lieu de questionnaire_sessions).
- F2. Tests vitest entity-isolation :
  - learner ne peut pas INSERT FEA.
  - learner ne peut pas DELETE questionnaire_tokens.
  - admin entité A ne peut pas GET fill-for-learner d'un learner entité B.
- F3. Tests E2E Playwright (déjà framework dispo) :
  - Flow complet : admin attribue, génère QR PDF, apprenant scanne, soumet, admin voit la réponse dans le PDF résultats.
  - Flow saisie admin : admin saisit pour apprenant, modifie, débloque/bloque correctement.
- F4. Tests API : public-submit token expired, used, valid + idempotence.

Estimation : **8h**. Priorité **P1**.

### Récapitulatif estimation

| Volet | Heures | Priorité |
|---|---|---|
| A — Sécurité | 10h | P0 |
| B — Type safety | 5h | P1 |
| C — Robustesse | 7h | P1 |
| D — UX pilotage | 15h | P0/P1 |
| E — Refacto archi | 20h | P0/P1 |
| F — Tests | 8h | P1 |
| **TOTAL** | **65h** | |

---

## 7. Conclusion exécutive

Le sous-système Questionnaires présente la plus grande dette technique observée parmi les 5 deep-dives précédents. Il s'agit d'un sous-système **partiellement développé en parallèle** de la banque de questionnaires historique, sans avoir migré les consommateurs de données. La conséquence pratique est sévère : **un admin qui utilise exclusivement TabQuestionnaires pour configurer ses questionnaires ne verra ni KPIs Qualiopi, ni résultats PDF, et les apprenants ne recevront rien sur leur portail**.

Les 5 P0 (§5.2) sont **bloquants en production** et doivent être traités avant tout autre chantier. Le Volet E (refacto architectural) est le pivot — il déverrouille les KPIs Qualiopi, les PDFs et le portail learner.

Le chantier complet (~65h) ramènerait la qualité de TabQuestionnaires au niveau TabConventionDocs (8/10) en ~2 semaines/dev.
