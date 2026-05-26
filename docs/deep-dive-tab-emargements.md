# Deep Dive — Sous-onglet « Émargement » (TabEmargements + TabAbsences)

> **Audit BMAD exhaustif** — Lecture intégrale de chaque fichier IN-SCOPE.
> Date : 2026-05-26 · Périmètre estimé : ~4 200 LOC (effectif : 4 488 LOC lues).
> Pattern identique aux 6 deep-dives précédents.

---

## 0. Synthèse exécutive (250 mots)

Le sous-onglet « Émargement » est un **gros bloc fonctionnel de ~4 500 LOC** comprenant :
deux composants UI rendus en cascade (TabEmargements 1144 + TabAbsences 375),
1 SignaturePad partagé (178), 17 routes API (+1 service `load-signatures` + 1 helper batch),
4 pages publiques/dashboards de signature (3 064 LOC cumulés), 3 templates HTML PDF,
4 migrations SQL critiques (slot-aware, evidence eIDAS-light, fix unique constraint).

**Verdict global** : fonctionnel à **~78 %**. Le cœur (capture signature →
stockage → export PDF Qualiopi) marche. Mais **5 risques résiduels majeurs** :

1. **RLS `signing_tokens_public_read TO anon USING (true)`** — énumération
   massive des tokens possible (P0 sécurité).
2. **5 occurrences de `(e: any)` / `(t: any)`** dans pages sign formateur et
   admin signatures (viole règle absolue n°1 du CLAUDE.md).
3. **6 catch vides ou silencieux** dans TabEmargements (3 vraiment vides,
   3 sans toast user-facing).
4. **`(enrollments || []).filter((e: { signer_type: string }) => …)` répété 7×**
   et **13 `as unknown as` dans 6 routes batch** — type safety érodée.
5. **TabEmargements 1144 LOC, monolithique** — pas de sections/, 8 handlers
   inline, 3 dialogs imbriqués, 1 page legacy `/admin/signatures` 1279 LOC
   qui duplique 80 % de la logique.

**Plan d'action total estimé : ~110 heures** (5 volets A-F, dont 16 h P0
sécurité multi-tenant et 32 h P1 refacto). Comparé à TabConventionDocs
post-solidification (note 8/10), TabEmargements est **~6/10** : fonctionnel
mais avec des dettes structurelles et 1 trou de sécurité RLS critique.

---

## 1. Cartographie fonctionnelle

### 1.1 Flow émargement (ASCII)

```
┌─ ADMIN (TabEmargements) ────────────────────────────────────────────────┐
│  formation_time_slots créés via TabPlanning                              │
│                                                                          │
│  ┌──────────────┐    ┌────────────────┐    ┌────────────────────────┐  │
│  │ "Préparer"   │    │ "Suivre"       │    │ "Exporter"             │  │
│  │              │    │                │    │                        │  │
│  │ → Mode prés. │    │ → Live page    │    │ → PDF collectif        │  │
│  │ → QR indiv.  │    │  (poll 3s)     │    │ → PDF par entreprise   │  │
│  │ → Email QR   │    │ → Signer       │    │ → Planning hebdo signé │  │
│  │ → PDF QR     │    │   à la main    │    │ → Feuille vierge       │  │
│  └──────┬───────┘    │   (admin)      │    └──────────┬─────────────┘  │
│         │            │ → Cocher tous  │               │                 │
│         │            │  (bulk sign)   │               │                 │
│         │            └────────┬───────┘               │                 │
└─────────┼─────────────────────┼───────────────────────┼─────────────────┘
          │                     │                       │
          ▼                     ▼                       ▼
   POST /api/emargement/  POST /api/signatures   POST /api/documents/
        slots                                       generate-from-template
   (mode "individual"   ─ INSERT signatures        (doc_type =
    ou "session")        atomique avec UNIQUE        feuille_emargement_
   → INSERT signing_     (session_id, signer_id,     collectif /
     tokens (1 / paire    signer_type, time_         _individuel /
     slot×personne ou     slot_id) ; 23505 = 409     planning_hebdo_signe)
     1 / slot)           ─ slot-aware             → resolveDocumentVariables
                                                  → Puppeteer (PDFShift)
          │
          ▼
┌─ PUBLIC : /emargement/[token] ─────────────────────────────────┐
│  Page mobile-first :                                            │
│   - GET /api/emargement?token=… valide token                    │
│     (rate limit 60/min/IP)                                      │
│   - Mode "individual" → auto-select learner/trainer             │
│   - Mode "session"   → liste apprenants, sélection nom          │
│   - SignaturePad (canvas SVG path-strokes)                      │
│   - POST /api/emargement/sign (rate limit 10/min/IP)            │
│     ↳ retry expo 3× sur 5xx / timeout                           │
│     ↳ INSERT signatures (UNIQUE 23505 = succès silencieux)      │
│     ↳ INSERT signature_evidence (eIDAS-light)                    │
│     ↳ UPDATE signing_tokens.used_at (individual only)           │
└─────────────────────────────────────────────────────────────────┘

┌─ LEARNER PORTAL : /learner/sessions/[id]/sign ─────────────────┐
│  Signature directe via session auth (sans token).              │
│  POST /api/signatures (auth requise, learner)                  │
└─────────────────────────────────────────────────────────────────┘

┌─ TRAINER PORTAL : /trainer/sessions/[id]/sign ─────────────────┐
│  Trainer signe son créneau + voit les présences learners.      │
│  POST /api/signatures (auth requise, trainer)                  │
└─────────────────────────────────────────────────────────────────┘

┌─ ADMIN ABSENCES (TabAbsences) ─────────────────────────────────┐
│  Liste absences justifiée/non/excusée par apprenant×créneau.   │
│  Bouton "Détection auto" : POST /api/sessions/[id]/auto-       │
│   absences → diff signatures vs (slots × learners) → INSERT    │
│   formation_absences batched.                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Tables × Owner × Couplage

| Table | Owner | Lignes principales | Couplage |
|-------|-------|--------------------|----------|
| `signatures` | session_id (FK → sessions, **entity via FK**) | signer_id, signer_type, signature_data (SVG), time_slot_id, ip_address, user_agent, signature_method, document_hash | RLS via session.entity_id ; `signatures_learner_insert` policy buggée (signer_id = auth.uid() au lieu de learner.id) |
| `signing_tokens` | session_id + entity_id explicite | token UUID v4, token_type (session/individual), signer_type (learner/trainer), learner_id, trainer_id, time_slot_id, expires_at, used_at, token_purpose, client_id, document_id, quote_id | **RLS `signing_tokens_public_read` USING (true) TO anon — bypass total** |
| `formation_absences` | session_id (FK) | learner_id, time_slot_id, date, reason, status (justified/unjustified/excused), notes | RLS via "any profile of session's entity" (pas role-scoped) |
| `signature_evidence` | signature_id (FK) | evidence_type, timestamp, data (JSONB), ip_address, user_agent | RLS lecture limitée à l'entité ; INSERT autorisé TO anon WITH CHECK (true) |
| `document_signatures` | document_id + session_id | signer_type (learner/company/trainer), signer_id, signer_name, signer_email, signature_data (SVG), ip_address | RLS via session.entity_id ; UNIQUE (document_id, signer_type, signer_id) |
| `formation_time_slots` | session_id | start_time, end_time, slot_order, title | Pas d'entity_id direct, transite via session_id |
| `formation_trainers` | session_id | trainer_id | Pas d'entity_id direct |
| `enrollments` | session_id | learner_id, client_id, status | Idem |

---

## 2. Inventaire détaillé par fichier

### Composants UI principaux (1519 LOC)

| Fichier | LOC | Rôle |
|---------|-----|------|
| `src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx` | 1144 | Hub onglet émargement admin : QR generator, mode présentation, sign on behalf, bulk sign, exports PDF (collectif, individuel, par entreprise, vierge, planning hebdo). |
| `src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx` | 375 | Liste absences + ajout manuel + détection automatique. Rendu en cascade sous TabEmargements (pas de sub-tabs). |

#### TabEmargements.tsx — Top issues

- **L7-10** : import `Send`, `Copy` jamais utilisés. Hygiène imports.
- **L82** : `useState<string | null>(null)` pour `filterClientId` — bonne pratique.
- **L101-115** : `generateQRImages` génère **côté client** via librairie `qrcode`, image en data URL pour chaque token, **N×M** d'opérations bloquantes potentiellement (séquentielle pas Promise.all).
- **L162-176** : `handleGenerateAllTokens` — `catch {}` ligne 171 NON vide (toast OK) mais perd l'erreur réelle (pas de `console.error`).
- **L186-187** : `tokens = await res.json()` puis test `!res.ok || !tokens?.slots` — OK mais on parse même en cas d'erreur réseau.
- **L234-235** : `catch {}` ligne 234 sans `console.error` — debug impossible en prod.
- **L292-312** : envoi email aux formateurs → **for loop séquentielle** avec `catch {}` ligne 309 qui ignore complètement les échecs sans toast ni log.
- **L355-356** : `catch {}` ligne 355 sans `console.error` — debug impossible.
- **L364-374** : `handleDeleteSignature` filtre par `session_id` mais **pas par entity_id** (passage par RLS uniquement, défense en profondeur manquante).
- **L405-422** : `handleBulkSign` envoie **N×M** requêtes individuelles séquentielles, `catch {}` ligne 419 ignore silencieusement (commentaire "continue on error"), pas de retry.
- **L412** : envoie `signature_data: "admin_bulk"` (chaîne magique, pas un vrai SVG) — **bizarrerie** : la route POST `/api/signatures` valide pourtant le format SVG côté sanitization. À vérifier si ça passe sanitizeSignatureSvg.
- **L532** : `totalExpected = timeSlots.length * (enrollments.length + trainers.length)` — calcul correct slot-aware.
- **L546-547** : `slotSignatures.find(s => s.signer_id === personId && s.signer_type === signerType)` — O(N) per row, **complexité O(slots × persons²)** pour rendu page entière.
- **L595** : `incompleteDialog` rendu en dernier (modal du hook) — OK.
- **L598-626** : Filtre par entreprise INTER bien implémenté (story 3.4).
- **L662-693, L706-712, L737-743** : URL en dur dans `<a href="…">` pour les liens internes au lieu d'utiliser `<Link>` de Next.js — perd la navigation client-side.
- **L765-825** : Bloc `<details>` "Actions avancées" duplique tous les boutons hero — inutile (legacy "gardé pour compatibilité"). À supprimer.
- **L956-963** : IIFE arrow rendu inline dans le DialogHeader pour afficher le label de créneau — illisible.
- **L1003-1046** : panneau debug verbose **affiché côté UI client** quand `enrollments_count === 0`, expose des secrets (entity_id, errors SQL). **À masquer en prod**.
- **L1067, L1100** : 2 `console.warn` côté client à enlever en prod.

#### TabAbsences.tsx — Top issues

- **L72-89** : `handleAdd` n'attend pas `onRefresh()` (fire-and-forget L88).
- **L82-83** : `setSaving(false)` AVANT le check error → pendant le toast d'erreur, le bouton est déjà ré-actif (race possible).
- **L92-105** : `handleDelete` filtre par `id` ET `session_id` mais **pas par entity_id** (défense en profondeur manquante).
- **L141-151** : `handleUpdateStatus` filtre uniquement par `id`, **sans session_id ni entity_id** — un attaquant qui devine un id d'absence peut potentiellement changer son status (compte sur RLS seul).
- **L145** : Pas de `await onRefresh()` (fire-and-forget L149).
- **L192** : `(absence as FormationAbsence & { learner?: ... }).learner` — cast inline répété, devrait vivre dans le type.
- **L66-90** : `handleAdd` ne valide pas que `learnerId` ∈ enrollments de la session — un attaquant avec l'UI peut soumettre un learner d'une autre session (RLS bloque côté DB mais erreur peu explicite).

### Composants signature partagés (178 LOC)

| Fichier | LOC | Rôle |
|---------|-----|------|
| `src/components/signatures/SignaturePad.tsx` | 178 | Canvas SVG path-strokes. Touch + mouse events. Génère du SVG inline (`<svg><path …/></svg>`). |

#### SignaturePad.tsx — Top issues

- **L32** : `canvasRef.current!` non-null assertion — risqué si ref pas encore montée (rare mais possible avec key change rapide).
- **L78-86** : `handleValidate` — génère du SVG via concaténation de strings, **risque XSS interne** (le `strokeColor` est interpolé sans escape, défaut `#1d4ed8`). En pratique l'usage ne passe pas d'input user mais c'est une bombe à retardement si le composant est réutilisé avec un prop dynamique.
- **L84** : `viewBox="0 0 400 128"` en dur → si le canvas est redimensionné par CSS responsive, la signature résultante est étirée/distordue. Pas pris en compte.
- **L9-16** : Pas de prop `onChange` (capture en cours), seulement `onSign` (validation finale) et `onClear`. Pas de bouton "Recommencer" pendant la signature.

### Services (56 LOC)

| Fichier | LOC | Rôle |
|---------|-----|------|
| `src/lib/services/load-signatures.ts` | 56 | Charge signatures d'une session, retourne 3 structures (signaturesById, signaturesBySlotPerson, signedLearnerIds, totalCount). Utilisé par les routes generate-* PDF. |

#### load-signatures.ts — Top issues

- **L26-29** : Pas de filtre `entity_id` — passe par session_id only. **Anti-pattern de défense en profondeur**.
- **L34-39** : Typage manuel `(rows ?? []) as { … }[]` — devrait utiliser le type Supabase généré.
- **Pas d'erreur retournée** — si la query échoue, on retourne des Maps vides silencieusement (les signatures n'apparaîtront pas dans le PDF sans notification).

### Routes API — Émargement public (947 LOC)

| Fichier | LOC | Rôle | Auth |
|---------|-----|------|------|
| `src/app/api/emargement/route.ts` | 377 | GET valide un token (public), POST génère tokens (admin/trainer). | GET public (rate limited 60/min/IP), POST `requireRole` |
| `src/app/api/emargement/slots/route.ts` | 411 | POST génère 1 token par slot × personne (`individual`) ou 1 token par slot (`session`). GET liste tokens groupés par slot. | `requireRole(admin/super_admin/trainer)` |
| `src/app/api/emargement/sign/route.ts` | 216 | POST publique : soumet une signature avec token (apprenant/formateur via QR). Sanitize SVG, UNIQUE constraint, signature_evidence. | Public, rate limit 10/min/IP |
| `src/app/api/emargement/live-status/route.ts` | 153 | GET polling 3s : pour chaque slot retourne token session + statuts learners/trainers. | `requireRole(admin/super_admin/trainer)` |
| `src/app/api/emargement/post-session-eval/route.ts` | 139 | POST envoie le questionnaire d'auto-évaluation post-formation à tous les apprenants non-répondants. | `requireRole(admin/super_admin/trainer)` |
| `src/app/api/signatures/route.ts` | 196 | GET liste signatures session ; POST insère une signature (admin/trainer/learner authentifié) ; DELETE par id. | `requireRole` |

#### emargement/route.ts — Top issues

- **L29, L47** (et idem dans toutes les routes émargement) : `createServiceClient()` — **service_role utilisé en routes publiques**. Mitigé par rate limiting + validation token, mais ça contourne complètement le RLS, donc la moindre faille de validation = bypass total.
- **L67-74** : appel **séparé** à `trainings` (N+1, devrait être joint à la query session).
- **L88-95** : `eq("time_slot_id", tokenData.time_slot_id)` — OK.
- **L122-135** : query supplémentaire `sigsForSigner` — pour le mode session, `tokenSignerId` est `null`, on skip. Bon design.
- **L189** : `Array.isArray(e.learner) ? e.learner[0] : e.learner` — guard PostgREST !1 vs 1, idiome répété 5× dans le fichier.
- **L218-219** : query learner par `tokenData.learner_id` UNIQUEMENT pour récupérer le nom — pourrait être joint au query token initial.
- **L248** : `console.error` — sans envoi à Sentry/log centralisé.
- **L286-289** : query `existingQuery.single()` AVANT INSERT — race condition (entre check et insert quelqu'un peut créer un autre token), mitigé par UNIQUE index mais non documenté.

#### emargement/slots/route.ts — Top issues

- **L46-72** : pour la query GET, **trois queries séparées** (slots, then tokens, then learners + trainers). N+1 partiel — bénin car limits faibles (10-30 slots × 20 learners) mais à factoriser.
- **L113** : `slot_ids` accepté mais pas validé (peut être n'importe quel array, pas vérifié contre la session).
- **L210-216** : `console.log` debug en prod — à enlever.
- **L219** : `Record<string, ...>` indexé par slot.id — design correct.
- **L240-322** : pour chaque (slot × learner) → 1 SELECT + 1 INSERT OR UPDATE séquentiel — **N×M** queries (typique 5 slots × 10 learners = 50-100 queries sequential). Très lent (~3-5 s en prod). Devrait être un BULK UPSERT.
- **L407** : `insert_errors.slice(0, 5)` — limite raisonnable mais le compteur total n'est pas exposé.
- **Pas de protection** contre régénération massive (un admin pourrait spammer cette route et créer des milliers de tokens).

#### emargement/sign/route.ts — Top issues

- **L18-21** : rate limit 10/min par IP — OK pour mobile mais agressif pour une classe entière sur même Wi-Fi (NAT). Pas de protection par token (un attaquant peut quand même hammer 10 signatures/min avec un IP rotation).
- **L74-93** : flow trainer vs learner vs session **complexe** — 3 branches imbriquées. Risque erreur logique.
- **L94-107** : pour token session, **revalidation enrollment** — bon design anti-tampering.
- **L117-131** : INSERT atomique avec catch 23505 — bon design (idempotent).
- **L168-176** : INSERT `signature_evidence` après INSERT signature — **pas dans la même transaction** (impossible avec REST). Si le serveur crash entre, on a une signature sans evidence.
- **L181-184** : UPDATE `used_at` non transactionnel non plus.
- **L210** : `console.error` — sans Sentry/structured logging.

#### emargement/live-status/route.ts — Top issues

- **L67, L83** : 2 `as unknown as Array<…>` pour caster les résultats PostgREST — symptôme de typage manquant.
- **L94** : `slotIds = slots.map(s => s.id)` puis `in("time_slot_id", slotIds)` — OK, query unique.
- **Pas de cache HTTP** — polling toutes les 3 sec, 20 utilisateurs simultanés = 400 req/min, sans throttling.

#### signatures/route.ts — Top issues

- **L76, L91** : `eq("learner_id", userId)` et `eq("trainer_id", userId)` — **incorrect** : `userId` est `auth.uid()` = `profiles.id`, mais `enrollments.learner_id` = `learners.id` (FK différente). Les learners sont liés à un profile via `learners.profile_id` PAS `learners.id = profiles.id`. **C'est très probablement un bug** : un learner authentifié ne peut jamais réussir cette check (sauf hasard cosmique où `learner.id === profile.id`).
- **L104-106** : pour admin sign on behalf, `bodySignerId || userId` — OK mais expose un risque (admin malveillant peut signer pour n'importe qui).
- **L186-189** : DELETE par `id` seul, **sans entity_id** (RLS only). Défense en profondeur manquante.

### Routes API — Documents (1294 LOC)

| Fichier | LOC | Rôle |
|---------|-----|------|
| `src/app/api/documents/generate-emargement/route.ts` | 161 | POST génère 1 feuille collectif pour 1 entreprise (bodyArgs sessionId + clientId). Cache PDF. |
| `src/app/api/documents/generate-emargement-individuel/route.ts` | 145 | POST génère 1 feuille individuelle pour 1 apprenant. |
| `src/app/api/documents/generate-emargements-batch/route.ts` | 220 | POST batch fail-soft : 1 PDF par entreprise → ZIP avec `_erreurs.txt`. |
| `src/app/api/documents/generate-emargements-individuels-batch/route.ts` | 202 | POST batch fail-soft : 1 PDF par apprenant → ZIP. |
| `src/app/api/documents/send-emargements-individuels-batch-email/route.ts` | 138 | POST génère + envoie 1 email/apprenant avec PDF en attach. Délégué à `executeBatchEmailSend`. |
| `src/app/api/documents/send-feuille-emargement-vierge-batch-email/route.ts` | 58 | Thin wrapper, délègue à `batchSendDocsEmail`. |
| `src/app/api/documents/sign-request/route.ts` | 204 | POST admin demande signature document (convention, charte, etc.) à 1 signataire. Création signing_token. |
| `src/app/api/documents/sign-status/route.ts` | 133 | GET public : statut d'un token document. Rate limit 30/min/IP. |
| `src/app/api/documents/sign/route.ts` | 233 | POST public : soumet signature document. Idempotent (23505 OK). |
| `src/app/api/documents/signature-request-batch/route.ts` | 379 | POST batch création N tokens + envoie N emails Resend. F3 mass signature. |
| `src/app/api/documents/process-sign-reminders/route.ts` | 154 | POST cron-only (Bearer CRON_SECRET). Scan docs en attente signature, envoie relances J+3 / J+7 / J+14. |
| `src/app/api/sessions/[id]/auto-absences/route.ts` | 201 | POST scan slots × learners → INSERT absences manquantes. |

#### generate-emargement/route.ts — Top issues

- **L72** : `.eq("entity_id", profile.entity_id)` — bon.
- **L112-113** : `session as unknown as Session` + `client as unknown as Client` — casts dangereux 2× sur la même ligne d'un context resolver. Symptôme : le select Supabase ne matche pas `Session`/`Client` types (relations imbriquées différentes).
- Pas de gestion d'erreur granulaire si `loadSignaturesBySessionId` plante.

#### generate-emargement-individuel/route.ts — Top issues

- **L84** : `if (!enrollment || !(enrollment as { learner?: unknown }).learner)` — cast inline répété.
- **L90, L95** : 2 `as unknown as` — idem.
- **L116-119** : `custom_variables: { present: …, signed_count: … }` — bon design pour cache invalidation.
- Pas de check `.eq("entity_id", ...)` sur la query enrollment (passe par RLS).

#### generate-emargements-batch/route.ts — Top issues

- **L47** : `.replace(/[̀-ͯ]/g, "")` — regex avec caractères combinants Unicode. Lisible/maintenable ?
- **L131, L177** : `(link as unknown as { client: Client | null }).client` répété 2× — devrait vivre dans un type.
- **L130-168** : `Promise.allSettled(tasks)` — bon design fail-soft (1 PDF qui plante n'arrête pas les autres).
- **L194-200** : `_erreurs.txt` à la racine du ZIP — UX correcte.

#### generate-emargements-individuels-batch/route.ts — Top issues

- Mirror exact du précédent mais pour learners. **Code dupliqué à 80 %** entre les 2 routes batch. Le `slugify`, la boucle Promise.allSettled, le ZIP packaging sont identiques. Devraient partager un helper.
- **L104** : `as unknown as { learner: Learner | null }[]` — 2× sur la même ligne.

#### send-emargements-individuels-batch-email/route.ts — Top issues

- **L67** : `as unknown as` répété.
- **L78-120** : Utilise correctement `executeBatchEmailSend` du helper centralisé batch-email-handler.ts — **bonne pratique récente**.
- **L86** : Email texte (plain) avec `${learner.first_name ?? ""}` — si first_name est null, génère "Bonjour ,\n" (espace avant virgule). Cosmétique.

#### send-feuille-emargement-vierge-batch-email/route.ts — Top issues

- Thin-wrapper exemplaire (58 LOC). Aucune dette.

#### sign-request/route.ts (signature DOCUMENT, pas émargement) — Top issues

- **L70-86** : création signing_token avec `token_purpose = "document_signature"` — OK.
- **L81** : `signer_type: doc.owner_type === "company" ? "learner" : doc.owner_type` — **comportement bizarre** : signataire d'une convention entreprise est typé "learner". Workaround historique ?
- **L113-119** : 3 `as unknown as Array<Record<string, unknown>>` — typage perdu sur la session.
- **L117-119** : 3 `as Record<string, string>` — encore.
- **L132** : `generatePdfFromFragment(htmlContent, docLabel)` — peut échouer silencieusement (L139 catch + comment "PDF optional").
- **L174-188** : `serviceDb` créé séparément pour `email_history` — pourquoi ? auth.supabase devrait suffire (admin role).
- **L201** : sanitizeError OK mais pas de logEvent vs sign/route.ts qui en a un.

#### sign-status/route.ts — Top issues

- **L96** : `(docRow?.metadata as { signer_name?: string; signer_email?: string } | null)` — cast nécessaire car metadata est JSONB.
- **L130** : `console.error` sans Sentry.
- Bonne séparation quote vs document tokens.

#### sign/route.ts — Top issues

- **L65-72** : INSERT `quote_signatures` puis UPDATE `crm_quotes` — **pas dans une transaction**, race possible (idempotent grâce à UNIQUE).
- **L121-143** : adapter shape `documents` → legacy `doc` object — verbeux.
- **L132** : `(docRow.metadata as { signer_email?: string; … } | null)` — cast JSONB.
- **L181-188** : UPDATE document status="signed" hors transaction.

#### signature-request-batch/route.ts — Top issues

- **L48** : `ALLOWED_DOC_TYPES = new Set(Object.keys(DOC_LABELS))` — OK design.
- **L122-126** : `(session as unknown as { formation_companies?: …}).formation_companies` — cast nécessaire car PostgREST.
- **L176-178** : 3 `as unknown as` consécutifs pour companies, trainers, enrollments. **Symptôme d'un select trop complexe** qui devrait être splitté en queries simples.
- **L189-325** : `tasks` Promise.allSettled — fail-soft OK.
- **L218-220** : si pas d'email, `throw new Error("Pas d'email")` — message peu descriptif (manque ownerName).
- **L262** : `try/catch` autour de l'update doc, **silencieux** sans throw (logique de fail-soft mais erreur perdue).
- **L308** : idem pour log email_history.
- **L327** : `Promise.allSettled` — OK.

#### process-sign-reminders/route.ts — Top issues

- **L30-34** : Bearer CRON_SECRET — bon design.
- **L42-68** : query + filter côté app — pourrait être push dans SQL avec `WHERE metadata->>'requires_signature' = 'true'`.
- **L73-87** : 2 queries N+1 (`sessions` puis `entities`).
- **L96-100** : logique 3/7/14 days en if/else — devrait être un tableau de tuples.
- **L132** : `catch { sent = false; }` — perd la cause d'erreur (pas de log).
- **L138-146** : metadata update atomique seulement si sent=true.

#### sessions/[id]/auto-absences/route.ts — Top issues

- **L11** : `requireRole(["super_admin", "admin"])` — pas de trainer.
- **L17-30** : check entity_id explicite — bon.
- **L74** : `enrollments.map((e) => e.learner_id)` — OK.
- **L92-93** : Set lookup O(1) — bon.
- **L143-150** : bulk insert avec `reason: "Absence détectée automatiquement"` — pas de field "auto-detected" pour distinguer.
- **L154-167** : `insert(absencesToInsert)` — 1 seul appel batch. Bon.
- **Pas de tx** mais c'est OK (1 seul INSERT).

### Pages publiques + dashboards (3 064 LOC)

| Fichier | LOC | Rôle |
|---------|-----|------|
| `src/app/sign/[token]/page.tsx` | 229 | Page publique signature DOCUMENT (convention, etc.). |
| `src/app/emargement/[token]/page.tsx` | 527 | Page publique signature ÉMARGEMENT (token QR). Mobile-first. |
| `src/app/emargement/layout.tsx` | 11 | Wrapper layout centré. |
| `src/app/(dashboard)/learner/sessions/[id]/sign/page.tsx` | 395 | Page apprenant authentifié, signature par slot. |
| `src/app/(dashboard)/trainer/sessions/[id]/sign/page.tsx` | 443 | Page formateur authentifié, signature par slot + visibilité learners. |
| `src/app/(dashboard)/admin/signatures/page.tsx` | 1279 | **Page admin DÉPRÉCIÉE/REDONDANTE** : duplique 80 % de TabEmargements (SignaturePad inline ré-écrit, dialogs séparés, etc.). |
| `src/app/(dashboard)/admin/formations/[id]/emargement-live/page.tsx` | 316 | Mode présentation : QR géant + liste live des signés. |

#### sign/[token]/page.tsx — Top issues

- **L66** : `body: JSON.stringify({ token, signature_data: signatureData, signer_name: status?.signer_name })` — OK mais signer_name vient du **status retour de l'API** (donc pas user input), correct anti-tampering.
- **L160-176** : `(status as unknown as Record<string, unknown>).type === "quote"` — **cast brutal** car le type SignStatus interface ne prévoit pas `type`. Erreur de typage de l'interface SignStatus elle-même.
- **L163-167, L172-175** : 5× `as Record<string, unknown>` — typage cassé.
- **L84** : `status?.entity_slug?.includes("c3v")` — branding hardcodé.

#### emargement/[token]/page.tsx — Top issues

- **L96-99** : Si `!res.ok` on set un error et return. Mais pas de retry. Acceptable car GET seulement.
- **L143-150** : check `svgData.length < 100 || !svgData.includes("path")` — sanity check basique.
- **L153-156** : guard 500 KB. Bon.
- **L161-222** : **logique retry exponentielle 3 attempts** — bon design, manque dans les autres pages.
- **L247-252** : refresh post-sign pour afficher slots restants. Bon UX.
- **L67** : pas de validation `formatTimeFr` si dateStr null (rare car validé en amont).

#### learner/sessions/[id]/sign/page.tsx — Top issues

- **L87** : `const lId = learnerData?.id || user.id` — **fallback dangereux** : si learner introuvable, on utilise `user.id` (profile.id) comme learner_id. Ça crée des signatures avec un signer_id qui n'existe pas dans `learners`. Données polluées.
- **L101-108** : casts Array.isArray répétés.
- **L122-127** : query `signatures` filtre par signer_id = lId — défense en profondeur faible.
- **L302** : `dangerouslySetInnerHTML={{ __html: sanitizeSignatureSvg(sig.signature_data) }}` — bonne pratique (sanitize au rendu).
- Aucun `await onRefresh` — pas pertinent car page autonome.

#### trainer/sessions/[id]/sign/page.tsx — Top issues

- **L99** : `const tId = trainerData?.id || user.id` — **même fallback dangereux** qu'en learner.
- **L147** : `(enrollments || []).map((e: any) => …)` — **violation règle absolue n°1** : type `any`.
- **L173** : idem, 2e occurrence.
- **L222-225** : pas de retry sur fetch.
- **L312** : `dangerouslySetInnerHTML` avec sanitize — OK.
- Pas de gestion d'erreur (toast) si `setSession` reçoit null.

#### admin/signatures/page.tsx — Top issues

- **L91-231** : **SignaturePad RÉÉCRIT EN INLINE** dans cette page (140 LOC) au lieu d'importer `@/components/signatures/SignaturePad`. **Duplication critique**.
- **L583-599** : 5× `(s: any)` / `(t: any)` — **violation règle absolue n°1** types.
- **L264-288** : query sessions filtre `.eq("entity_id", entityId!)` — bon.
- **L309-317** : 2 queries séparées sessions/signatures + 2 queries learners/trainers pour enrich — N+1 partiel.
- **L373-377** : check existence signature avant INSERT, **race condition** (entre check et insert).
- **L386-419** : INSERT direct **côté client** dans `signatures` (pas via /api/signatures) — contourne l'audit log + signature_evidence. **Anti-pattern**.
- **L422-444** : DELETE direct côté client — idem.
- Cette page **devrait être supprimée** ou refondue pour rediriger vers TabEmargements de chaque formation. C'est un legacy résiduel.

#### emargement-live/page.tsx — Top issues

- **L94** : `new Date(s.slot.start_time).getTime() <= now` — auto-switch sur le créneau actuel. Bon UX.
- **L150-164** : empty state si pas de tokens — propose génération. Bon.
- **Pas de cleanup interval si l'utilisateur quitte la page** : OK car React 18 cleanup useEffect.
- **L107-118** : génération tokens fail silently (catch + setError).

### Templates HTML (606 LOC + 124)

| Fichier | LOC | Rôle |
|---------|-----|------|
| `src/lib/templates/emargement-collectif.ts` | 205 | Template HTML feuille collective (tableau par semaine). |
| `src/lib/templates/emargement-individuel.ts` | 158 | Template HTML feuille individuelle (cards par créneau). |
| `src/lib/templates/feuille-emargement-vierge.ts` | 177 | Template HTML feuille vierge (mêmes colonnes que collectif, signatures vides). |
| `src/lib/templates/planning-hebdo-signe.ts` | 124 | Template HTML planning hebdo paysage. |

#### Templates — Top issues

- Layout cohérent inter-templates (réutilisent les classes CSS et placeholders [%Var%]). Bonne base.
- Pas de version compacte mobile ; bon car PDF Qualiopi A4 seulement.
- **`[%Tableau de signature entreprise compact%]`** etc. — variables custom traitées par `resolve-variables.ts` (out-of-scope mais point de couplage).
- L19-167 (collectif) : 80 % CSS in-template, lisible.
- Pas de `font-display: swap` ou fallback — peut causer FOIT.

### Migrations SQL (216 LOC pour les 4 in-scope)

| Fichier | LOC | Rôle |
|---------|-----|------|
| `supabase/migrations/add-slot-aware-emargement.sql` | 27 | Ajoute time_slot_id + signer_type + trainer_id à signing_tokens ; UNIQUE partial index sur (session, signer, type, slot). |
| `supabase/migrations/add_signature_evidence.sql` | 41 | Ajoute colonnes IP/UA/method à signatures ; crée signature_evidence ; RLS read entité + **INSERT public anon avec WITH CHECK (true)**. |
| `supabase/migrations/fix_emargement_signature_bug.sql` | 79 | Drop ancienne contrainte unique, recrée partial index, fix RLS super_admin + trainer policy lookup via profile_id. |
| `supabase/migrations/fix_signatures_unique_slot_aware.sql` | 19 | Duplicata partiel du fix : 2 UNIQUE index (avec/sans slot). |
| `supabase/migrations/add-formation-tabs-4-5-6.sql` | 64 | Crée formation_absences (RLS via session→profile entity_id, **pas role-scoped**) + ajoute time_slot_id à signatures. |
| `supabase/migrations/add_document_signing.sql` | 50 | Étend signing_tokens (document_id + token_purpose) ; crée document_signatures avec RLS via session→profile. |
| `supabase/migrations/add_missing_rls_policies.sql` | 55 | **CRITIQUE** : `signing_tokens_public_read` USING (true) TO anon — bypass total. |

---

## 3. État des lieux par catégorie

### 3.1 Bugs critiques sécurité multi-tenant

#### CRIT-1 — RLS `signing_tokens_public_read` TO anon USING (true)

**Fichier** : `supabase/migrations/add_missing_rls_policies.sql:36-38`

```sql
CREATE POLICY "signing_tokens_public_read" ON signing_tokens
  FOR SELECT TO anon
  USING (true);
```

**Impact** : Un anonyme (clé anon publique) peut lire **TOUTE la table signing_tokens** : tous les tokens, expires_at, used_at, session_id, learner_id, trainer_id, entity_id, document_id. Permet :
- Énumération exhaustive des tokens valides → signature pour autrui.
- Cartographie des sessions de toutes les entités (qui forme qui, quand).
- Identification des learners (learner_id leak).

**Mitigation actuelle** : aucune. Le `enrollment_id` est exposé. Le rate limit est sur `/api/emargement/sign` mais PAS sur le client supabase-js direct (les anon peuvent query via PostgREST direct).

**Sévérité** : P0 critique. Doit être restreint à `USING (token = current_setting('request.jwt.claims', true)::json->>'token')` ou similaire, ou retiré complètement (les routes API service_role n'en ont pas besoin).

#### CRIT-2 — RLS `signature_evidence_insert` TO anon USING (true)

**Fichier** : `supabase/migrations/add_signature_evidence.sql:39-41`

```sql
CREATE POLICY "signature_evidence_insert" ON signature_evidence
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);
```

**Impact** : N'importe quel anon peut polluer la table `signature_evidence` avec n'importe quoi (signature_id arbitraire, IP forgée, payloads JSONB malveillants). Peut être utilisé pour DoS storage ou pour invalider la valeur juridique de la preuve.

**Mitigation** : devrait être restreint à `WITH CHECK (EXISTS (SELECT 1 FROM signing_tokens WHERE used_at IS NULL))` ou similaire, ou retiré (route API fait l'INSERT via service_role).

**Sévérité** : P0 critique pour traçabilité légale.

#### CRIT-3 — RLS `signatures_learner_insert` bug : signer_id = auth.uid()

**Fichier** : `supabase/schema.sql:968-970` (pas corrigé dans fix_emargement_signature_bug.sql, voir note L77)

```sql
CREATE POLICY "signatures_learner_insert" ON signatures
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'learner' AND signer_type = 'learner' AND signer_id = auth.uid());
```

**Impact** : `auth.uid()` retourne `profiles.id`. Mais `signer_id` doit être `learners.id`. Sauf hasard ou alias profile.id === learner.id (vérifié dans `learner/sessions/[id]/sign/page.tsx:87` où on prend `learnerData?.id || user.id` comme fallback). **La page learner contourne le bug en utilisant le fallback `user.id`**, ce qui crée des signatures avec un signer_id potentiellement invalide côté FK.

**Sévérité** : P1. Soit corriger la policy en `signer_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())`, soit changer le data model.

#### CRIT-4 — Service role utilisé en routes publiques sans defense-in-depth

**Fichiers** : `src/app/api/emargement/route.ts:7-14`, `src/app/api/emargement/slots/route.ts:6-13`, `src/app/api/emargement/sign/route.ts:7-14`, `src/app/api/emargement/live-status/route.ts:20-27`, `src/app/api/emargement/post-session-eval/route.ts:6-13`, `src/app/api/documents/sign/route.ts:7-12`, `src/app/api/documents/sign-status/route.ts:5-10`.

**Pattern répété 7×** : `createServiceClient()` bypass RLS. Mitigation par token UUID v4 (entropie OK) + rate limit. Mais sans defense-in-depth applicative explicite (eq entity_id), la moindre erreur de validation = bypass.

**Sévérité** : P1 (acceptable si rigoureux, mais à auditer ligne par ligne).

#### CRIT-5 — TabAbsences.handleUpdateStatus sans session_id ni entity_id

**Fichier** : `src/app/(dashboard)/admin/formations/[id]/_components/TabAbsences.tsx:141-151`

```ts
const handleUpdateStatus = async (id: string, newStatus: string) => {
  const { error } = await supabase
    .from("formation_absences")
    .update({ status: newStatus })
    .eq("id", id);
```

Filtre seulement par `id`. La RLS de `formation_absences` est `entity-of-session-of-row` mais **n'est pas role-scoped** (any profile de l'entity). Si un trainer/learner authentifié peut accéder à cette route (peu probable mais possible si le menu n'est pas masqué), il peut modifier les status.

**Sévérité** : P1.

### 3.2 Bugs critiques fonctionnels

#### FUNC-1 — `signature_data: "admin_bulk"` dans handleBulkSign

**Fichier** : `src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx:411-417`

```ts
body: JSON.stringify({
  session_id: formation.id,
  signature_data: "admin_bulk",  // ← Pas un SVG !
  ...
}),
```

La route `/api/signatures` POST :
- `sanitized_signature = sanitizeSignatureSvg("admin_bulk")` → `sanitize-html` retourne `"admin_bulk"` (texte conservé car pas de tag).
- L51 : `if (!sanitized_signature || typeof sanitized_signature !== "string")` → "admin_bulk" passe.
- INSERT signatures avec `signature_data = "admin_bulk"`.

**Conséquence** : Les exports PDF appellent `loadSignaturesBySessionId` qui charge `signature_data`. Le template (emargement-collectif) interpole ces SVG dans le tableau Qualiopi. **La feuille Qualiopi finale contient le texte littéral "admin_bulk"** au lieu d'une vraie signature. **Bug visible côté client**, casse la valeur juridique.

**Sévérité** : P0 production (Qualiopi). Devrait au minimum générer un SVG vide ou un placeholder visible "Signé administrativement".

#### FUNC-2 — Fallback `tId/lId = user.id` en cas de learner/trainer introuvable

**Fichiers** :
- `src/app/(dashboard)/learner/sessions/[id]/sign/page.tsx:87`
- `src/app/(dashboard)/trainer/sessions/[id]/sign/page.tsx:99`

```ts
const lId = learnerData?.id || user.id;
const tId = trainerData?.id || user.id;
```

Si l'utilisateur n'est pas correctement lié à un learner/trainer, on utilise `user.id` (profile.id) comme signer_id. Cela crée des signatures avec un signer_id qui **ne référence aucun enregistrement learners/trainers** (FK orpheline). Quand on fait `loadSignaturesBySessionId` → `signaturesById.set(signer_id, …)` → la map a une clé invalide → le PDF ne trouvera pas la signature pour le bon learner.

**Sévérité** : P1. Devrait throw un toast `"Compte non rattaché à un apprenant/formateur, contactez le support"` et bloquer la signature.

#### FUNC-3 — admin/signatures page SignaturePad réécrit en inline

**Fichier** : `src/app/(dashboard)/admin/signatures/page.tsx:91-231`

Cette page définit son propre `SignaturePad` (140 LOC) qui duplique `src/components/signatures/SignaturePad.tsx`. Les deux ont divergé :
- L'inline ne gère pas le touch (mobile cassé).
- L'inline n'a pas la prop `strokeColor`.
- L'inline n'a pas la sanitization stroke length > 2 systématique.

**Sévérité** : P2 dette technique. La page est legacy mais pas marquée deprecated.

#### FUNC-4 — Casts dangereux 13× dans 6 routes batch

Voir grep dump section 2 — 13 occurrences `as unknown as` dans les routes generate-emargements-* et signature-request-batch. Symptôme typique : `select("*, training:trainings(*), ...")` PostgREST retourne un union potentiel learner|learner[] sans typage. La solution propre est de typer manuellement les retours OU d'utiliser le générateur Supabase.

**Sévérité** : P2 dette, mais à chaque cast il y a un risque de bug silencieux si la shape change.

#### FUNC-5 — `(e: any)` × 5 dans trainer/sessions/sign + admin/signatures

Voir grep dump :
- `src/app/(dashboard)/trainer/sessions/[id]/sign/page.tsx:147` et `:173`.
- `src/app/(dashboard)/admin/signatures/page.tsx:583, :588, :594`.

**Sévérité** : P1 (viole règle absolue n°1 du projet).

### 3.3 Bugs majeurs (robustesse)

#### MAJ-1 — 6 catch dans TabEmargements (3 vraiment vides côté logique)

| Ligne | Contexte | Issue |
|-------|----------|-------|
| 171 | handleGenerateAllTokens | toast OK, mais pas de `console.error` → debug prod impossible |
| 234 | handleExportPdf | toast OK, mais pas de `console.error` |
| 309 | handleSendToTrainer inner loop | **VIDE complet** + comment "continue" — perte silencieuse de N échecs email |
| 321 | handleSendToTrainer outer | toast OK, pas de console.error |
| 355 | handleAdminSign | toast OK, pas de console.error |
| 419 | handleBulkSign inner loop | **VIDE complet** + comment "continue on error" — perte silencieuse |

**Sévérité** : P1. Ajouter `console.error` minimum partout, transformer les vides en pseudo-loggers (mode dev) ou collecter les erreurs pour affichage final.

#### MAJ-2 — TabAbsences `onRefresh()` fire-and-forget

**Fichier** : `TabAbsences.tsx:88, 128, 149`

3 occurrences `onRefresh()` non-await. Risque : l'UI affiche un état stale entre la mutation et le refetch.

#### MAJ-3 — `console.warn` côté client en prod

**Fichier** : `TabEmargements.tsx:1067, 1100`

2 `console.warn` exposés côté client si un token n'a pas de `person` joint. Devrait au minimum être gardé par un flag dev.

#### MAJ-4 — Panneau debug exposé côté UI client en prod

**Fichier** : `TabEmargements.tsx:1003-1046`

Quand `enrollments_count === 0`, on affiche un bloc debug avec :
- `session_id` (déjà visible mais ok)
- `profile.entity_id` (**LEAK !**)
- Erreurs SQL brutes (`enrollments_error`, `insert_errors` avec code/message/details/hint)

Devrait être gated par `NODE_ENV === "development"` ou par un toggle admin.

**Sévérité** : P1 information leak.

#### MAJ-5 — Race conditions check-then-act sur signatures

**Fichiers** :
- `signatures/route.ts:109-130` — query existing avant INSERT
- `emargement/slots/route.ts:240-300` — same pattern × N learners
- `admin/signatures/page.tsx:386-419` — same pattern côté client

Mitigation OK grâce au UNIQUE constraint slot-aware (23505 = succès silencieux), mais le code applicatif ne le sait pas explicitement → on fait 2× les queries pour rien.

#### MAJ-6 — N×M queries dans emargement/slots/route.ts POST

**Fichier** : `src/app/api/emargement/slots/route.ts:224-322`

Pour 5 slots × 10 learners × 2 trainers = 60 paires → 120 queries séquentielles (1 SELECT + 1 INSERT/UPDATE par paire). Sur réseau 50 ms latence = 6 secondes. **Bloquant** pour l'admin qui clique "Générer QR".

Solution : 1 SELECT all existing tokens + diff côté app + 1 BULK INSERT.

#### MAJ-7 — Polling 3s sur emargement-live sans backoff

**Fichier** : `src/app/(dashboard)/admin/formations/[id]/emargement-live/page.tsx:34, 67`

Polling fixe 3 sec. Pour 20 utilisateurs simultanés = 400 req/min sur live-status. Pas de backoff si pas de changement, pas de Server-Sent Events.

#### MAJ-8 — Pas de transaction signature + evidence + token update

**Fichier** : `emargement/sign/route.ts:117-184`

3 mutations séquentielles :
1. INSERT signatures
2. INSERT signature_evidence
3. UPDATE signing_tokens.used_at

Si crash entre 1 et 2 → signature sans preuve. Si crash entre 2 et 3 → token réutilisable. Devrait être une fonction Postgres RPC.

### 3.4 Dette technique

#### DETTE-1 — TabEmargements 1144 LOC monolithique

Pas de sections/. 8 handlers async dans le même fichier. 3 dialogs imbriqués. Devrait être splitté :
- `TabEmargements.tsx` (container, ~200 LOC)
- `sections/EmargementHero.tsx` (hero row, ~100)
- `sections/EmargementWorkflowCards.tsx` (3 cards préparer/suivre/exporter, ~200)
- `sections/EmargementSlotList.tsx` (liste slots + person rows, ~250)
- `sections/EmargementDialogs.tsx` (3 dialogs, ~400)
- `hooks/useEmargementActions.ts` (handlers extraits, ~250)

**Comparable** : TabConventionDocs (2042 LOC) **a déjà** une sections/ partielle ; TabQuestionnaires (485 LOC) est plus mince.

**Effort estimé** : 12-16h.

#### DETTE-2 — admin/signatures page (1279 LOC) duplique TabEmargements

Cette page legacy fait à 80 % la même chose que TabEmargements (par session au lieu de fiche formation). Inclut **son propre SignaturePad inline**. Une partie de la logique (`createSignature`, `removeSignature` côté client) est anti-pattern (devrait passer par /api/signatures).

**Action** : la déprécier (redirect vers `/admin/formations` ou supprimer).

**Effort** : 4-6h (suppression + tests régression).

#### DETTE-3 — Code dupliqué entre generate-emargements-batch et generate-emargements-individuels-batch

Les deux routes (220 + 202 = 422 LOC) partagent ~80 % de logique :
- `slugify` (identique)
- Auth profile/role check (identique)
- session select + Promise.allSettled (similaire)
- ZIP packaging (identique)
- `_erreurs.txt` (identique)

**Action** : extraire un helper `lib/services/batch-pdf-generation.ts` qui prend `(rows, generatePdfFn, slugifyName)` → ZIP.

**Effort** : 6-8h.

#### DETTE-4 — `loadSignaturesBySessionId` pourrait gérer les erreurs

Renvoie des Maps vides en cas d'erreur Supabase silencieuse. Devrait `throw` ou retourner `Result<…, Error>`.

**Effort** : 2-3h.

#### DETTE-5 — sanitize-svg cast types

Le helper est OK mais utilisé inconsistemment :
- `signatures/route.ts:50` : sanitize côté API ✓
- `emargement/sign/route.ts:39` : sanitize côté API ✓
- `documents/sign/route.ts:32` : sanitize côté API ✓
- Côté UI : `learner/sessions/sign/page.tsx:302`, `trainer/sessions/sign/page.tsx:312`, `admin/signatures/page.tsx:955` font tous sanitize au rendu ✓

**Bon design defense-in-depth**. Pas de dette ici.

#### DETTE-6 — Pas de tests pour TabEmargements ni TabAbsences

Cherché `find src/app -name "*.test.*" -path "*emargement*"` → seulement les snapshots de templates. Pas de tests UI pour les 1519 LOC.

**Effort** : 16-24h pour tests E2E Playwright des flows principaux.

#### DETTE-7 — Constantes magiques

- `expiresAt = 30 * 24 * 60 * 60 * 1000` (emargement/slots) — devrait être un export `TOKEN_TTL_DAYS = 30`.
- `expiresAt = 24 * 60 * 60 * 1000` (emargement/route.ts L269) — incohérent (24h vs 30 jours pour des tokens similaires).
- `POLL_INTERVAL_MS = 3000` (emargement-live) — magique.
- `MAX_ATTEMPTS = 3`, `TIMEOUT_MS = 8000` (emargement/[token]/page) — devraient être config.

#### DETTE-8 — Logging incohérent

- `signatures/route.ts` utilise `logAudit` ✓
- `documents/sign/route.ts` utilise `logEvent` ✓
- `emargement/sign/route.ts` utilise **`console.error/info`** seulement — pas d'audit, pas de logEvent.
- `process-sign-reminders/route.ts` utilise **`console.error`** seul.

Devrait être uniformisé.

### 3.5 UX / "piloter l'émargement"

#### UX-1 — TabAbsences rendu en cascade sans tab indépendant

`page.tsx:415-418` rend TabEmargements ET TabAbsences dans le même TabsContent value="emargement". Scroll vertical long, pas de navigation rapide. **Pourrait être 2 sous-onglets** (Émargement / Absences) pour une UX plus claire.

#### UX-2 — 3 cards "Préparer/Suivre/Exporter" + bloc `<details>` "Actions avancées" qui duplique

Les 3 cards (L649-762) sont un bon onboarding. Mais le `<details>` (L766-825) duplique tous les boutons. **Confusion** : si je veux exporter le PDF, je dois aller dans "Exporter" OU dans "Actions avancées" ? Pourquoi 2 chemins ?

**Action** : supprimer `<details>` (les power users trouveront tout dans les 3 cards).

#### UX-3 — Mode présentation manque les présents/absents en temps réel **par formateur**

`emargement-live` montre learners signés/en attente, mais **n'affiche pas si le formateur a signé son créneau**. Or c'est aussi requis Qualiopi.

#### UX-4 — Détection automatique d'absences sans review intermédiaire

`TabAbsences.handleAutoDetect` insère directement. **Pas de prévisualisation** des absences qui seront créées. Si un slot a tous les learners présents sauf 1 qui a un retard de scan, on crée une absence non justifiée injustement.

#### UX-5 — Pas de bouton "Tout marquer présent sur tous les slots"

Pour les sessions où le formateur a "fait l'appel" sur tableau papier post-formation, l'admin doit cliquer "Cocher tous" sur chaque slot (N clicks). Devrait y avoir un raccourci global.

#### UX-6 — Bouton "Imprimer feuille vide" sans option "1 par jour"

Le template `feuille_emargement_vierge` génère 1 PDF avec tous les jours. Si la formation dure 5 jours, l'admin imprime 1 PDF de N pages. Pas d'option "1 PDF par jour".

#### UX-7 — Pas d'indication "QR expire dans X jours" dans le QR dialog

`qrSlotTokens` retourne `expires_at` mais l'affichage L1003-1129 ne le montre pas. Si l'admin réutilise un PDF généré il y a 2 mois, les QR sont expirés sans avertissement.

### 3.6 Performance

#### PERF-1 — generateQRImages séquentiel côté client

`TabEmargements.tsx:101-115` génère les QR un par un dans une boucle for. Pour 50 tokens × 200ms chacun = **10 secondes blocking** côté client. Devrait être `Promise.all`.

#### PERF-2 — emargement/slots POST N×M queries (cf MAJ-6)

#### PERF-3 — load-session-aggregates → loadQualiopiIndicators charge signatures à chaque pageload

`loadQualiopiIndicators` (out-of-scope mais consommé par TabEmargements via formation prop) query `signatures` à chaque chargement de fiche formation. Pas de cache.

#### PERF-4 — Polling 3s emargement-live non-conditionnel

Cf MAJ-7.

#### PERF-5 — admin/signatures page : 4 queries séquentielles avant rendu

L264-355 : sessions → signatures → learners → trainers. Devrait être 1 query batch + jointures.

---

## 4. Couplage transverse

### 4.1 Qualiopi (`loadQualiopiIndicators.completionRate`)

`src/lib/services/load-session-aggregates.ts:181-194`

```ts
const { data: signatures } = await supabase
  .from("signatures").select("signer_id")
  .eq("session_id", sessionId).eq("signer_type", "learner");
const completionRate = totalLearners > 0
  ? (signedLearnerIds.size / totalLearners) * 100 : 0;
```

**Couplage fort** : signatures ⟶ Qualiopi completionRate ⟶ score qualité affiché dans TabQualiopi (vu chantier 2). Le bug `signature_data: "admin_bulk"` (FUNC-1) **n'impacte pas le completionRate** (qui compte distinct signer_id, peu importe le data). C'est cohérent.

Par contre, le `completionRate` compte 1 signature par learner sans tenir compte des slots — **un learner qui signe 1 slot sur 5 = compté 100% présent**. Devrait probablement être `signatures-distinct-by-slot / (learners × slots)`.

### 4.2 Automatisations (règle "Feuille d'émargement collective J+1")

`src/lib/automation/execute-rule.ts:201-204` : la règle `feuille_emargement_collectif` mappe vers un descriptor `{ type, payload: { session_id, client_id } }` traité par l'email queue (`email-queue.ts`). Le cron `process-sign-reminders` ne touche QUE les signatures **de documents** (convention, etc.), pas les signatures de présence.

**Couplage** : règle automation ⟶ descriptor ⟶ resolver dans `email-attachments-resolver.ts:36` qui mappe `feuille_emargement_collectif → "Feuille-Emargement-Collective"`.

### 4.3 TabConventionDocs (BATCH_SEND_ENDPOINTS)

`src/lib/utils/batch-doc-send.ts:17` : `feuille_emargement → "send-emargements-individuels-batch-email"`. **Couplage** : TabConventionDocs peut envoyer en masse les feuilles individuelles via cette route, sans passer par TabEmargements.

### 4.4 Email queue (enqueueEmail)

Les routes `send-emargements-individuels-batch-email` et `send-feuille-emargement-vierge-batch-email` passent via `executeBatchEmailSend` / `batchSendDocsEmail` qui finissent dans `email_history` + envoi Resend (pas via enqueue).

### 4.5 eIDAS / signature qualifiée

`signature_evidence` (migration `add_signature_evidence.sql`) collecte :
- `evidence_type`
- timestamp
- data JSONB
- IP, user_agent

Ce n'est **PAS eIDAS qualifié** (QES). C'est de la **signature électronique simple** + horodatage logiciel. La valeur juridique est limitée mais acceptable pour une feuille d'émargement Qualiopi.

Le `signature_method` peut être `handwritten` / `typed` / `click_to_sign` — mais le code ne génère QUE `handwritten`. Les autres modes ne sont pas implémentés.

---

## 5. Synthèse honnête

### Verdict global

Le module Émargement est **fonctionnel à ~78 %** avec :
- **2 bugs critiques sécurité** (RLS signing_tokens + signature_evidence INSERT public) — P0.
- **1 bug critique fonctionnel** (signature_data "admin_bulk" dans PDF Qualiopi) — P0.
- **5 bugs majeurs** (any types, catch vides, debug panel exposé, race conditions) — P1.
- **7 dettes techniques** (monolithe 1144 LOC, page admin/signatures dupliquée, N×M queries) — P2.

### Top 5 risques résiduels

1. **RLS `signing_tokens_public_read TO anon USING (true)`** — bypass total, énumération massive.
2. **`signature_data: "admin_bulk"` dans feuille Qualiopi** — PDF de production peut contenir le texte littéral "admin_bulk" à la place d'une signature dessinée.
3. **Fallback `tId/lId = user.id`** dans pages learner/trainer sign — signatures avec signer_id orphelin.
4. **Panneau debug verbose** exposé côté UI client en prod (entity_id, errors SQL).
5. **Page `/admin/signatures` legacy** (1279 LOC) dupliquant TabEmargements, avec son propre SignaturePad inline cassé sur mobile.

### Comparaison qualité vs barres post-solidification

| Critère | TabEmargements | TabConventionDocs (chantier 3) | TabQuestionnaires (chantier 2c) |
|---------|---------------|-------------------------------|--------------------------------|
| Structure / sections | Monolithe 1144 LOC | Sections partielles 2042 LOC | Plat 485 LOC OK |
| Types (any, casts) | 5 any + 13 `as unknown as` | ~3 any + casts contrôlés | 0 any |
| Catch vides | 6 (3 vraiment vides) | 2 (toast présent) | 0 |
| `await onRefresh` systématique | Mixte | Oui | Oui |
| Defense in depth entity_id | Partielle | Bonne | Bonne |
| Tests | 0 | Snapshots templates | Snapshots + tests handlers |
| RLS sain | **Non** (CRIT-1, CRIT-2, CRIT-3) | Oui | Oui |
| **Note globale** | **6/10** | 8/10 | 10/10 |

---

## 6. Plan d'action de solidification proposé

### Volet A — Sécurité multi-tenant (P0) — 16 h

Adresse : CRIT-1, CRIT-2, CRIT-3, CRIT-4, CRIT-5.

| # | Action | Effort |
|---|--------|--------|
| A1 | Restreindre `signing_tokens_public_read` (whitelist by `token = ?param`) ou retirer + ne plus query depuis client | 4 h |
| A2 | Restreindre `signature_evidence_insert` à `authenticated` + WITH CHECK valide signature_id | 2 h |
| A3 | Fix policy `signatures_learner_insert` : `signer_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())` | 2 h |
| A4 | Audit ligne par ligne des 7 routes service_role pour confirmer validation token rigoureuse | 4 h |
| A5 | `handleUpdateStatus` TabAbsences : ajouter `.eq("session_id", formation.id)` + entity_id | 1 h |
| A6 | Migration SQL packagée + déploiement en prod via Dashboard + rollback plan | 3 h |

### Volet B — Type safety (P1) — 14 h

Adresse : FUNC-4, FUNC-5, DETTE-5 (parties).

| # | Action | Effort |
|---|--------|--------|
| B1 | Remplacer les 5 `(e: any)` / `(t: any)` par les types Supabase générés | 4 h |
| B2 | Factoriser le pattern PostgREST `Array.isArray(rel) ? rel[0] : rel` dans un helper `unwrapRelation<T>(x)` | 2 h |
| B3 | Retirer les 13 `as unknown as` en typant correctement les select Supabase (utiliser .returns<T>() ou narrowing) | 6 h |
| B4 | Étendre interface SignStatus dans sign/[token]/page.tsx pour inclure le champ `type` (quote vs document) | 2 h |

### Volet C — Robustesse (P1) — 16 h

Adresse : FUNC-1, FUNC-2, MAJ-1, MAJ-2, MAJ-3, MAJ-4, MAJ-5, MAJ-8.

| # | Action | Effort |
|---|--------|--------|
| C1 | Fix FUNC-1 : générer un SVG placeholder "Signé administrativement" pour handleBulkSign | 2 h |
| C2 | Fix FUNC-2 : throw + toast si learnerData/trainerData null, masquer la page sign | 2 h |
| C3 | Ajouter `console.error` aux 6 catch (transformer 2 vides en pseudo-loggers) | 1 h |
| C4 | `await onRefresh()` systématique dans TabAbsences (3 occurrences) | 1 h |
| C5 | Gating `process.env.NODE_ENV === "development"` du panneau debug TabEmargements:1003-1046 + retirer 2 console.warn | 2 h |
| C6 | RPC Postgres `sign_emargement(token, svg)` atomique INSERT signatures + INSERT signature_evidence + UPDATE token | 6 h |
| C7 | Standardiser le logging (utiliser `logEvent`/`logAudit` partout, plus de console.* en prod) | 2 h |

### Volet D — UX pilotage (P1) — 18 h

Adresse : UX-1 → UX-7.

| # | Action | Effort |
|---|--------|--------|
| D1 | Splitter TabEmargements / TabAbsences en 2 sous-onglets (Tabs) | 3 h |
| D2 | Supprimer le bloc `<details>` "Actions avancées" duplicatif | 1 h |
| D3 | Mode présentation : ajouter ligne "Formateur signé : oui/non" | 2 h |
| D4 | Détection auto absences : ajouter prévisualisation modal avant insert | 4 h |
| D5 | Bouton global "Marquer tous présents sur tous les slots" | 3 h |
| D6 | Option "1 PDF par jour" pour feuille vierge | 3 h |
| D7 | Afficher `expires_at` dans le QR dialog avec badge couleur si proche expiration | 2 h |

### Volet E — Refacto architectural (P2) — 32 h

Adresse : DETTE-1, DETTE-2, DETTE-3, DETTE-4.

| # | Action | Effort |
|---|--------|--------|
| E1 | Splitter TabEmargements 1144 → 5 sous-composants `sections/` + 1 hook `useEmargementActions` | 12 h |
| E2 | Déprécier `/admin/signatures` (1279 LOC) : redirect vers `/admin/formations` ou supprimer | 6 h |
| E3 | Factoriser helper `lib/services/batch-pdf-generation.ts` partagé entre generate-emargements-batch et generate-emargements-individuels-batch | 6 h |
| E4 | `loadSignaturesBySessionId` retourne `Result<…, Error>` avec gestion d'erreur | 3 h |
| E5 | Extraire constantes magiques (TOKEN_TTL_DAYS, POLL_INTERVAL_MS, etc.) dans `lib/constants/emargement.ts` | 2 h |
| E6 | Optimisation N×M queries dans emargement/slots POST (1 SELECT + 1 BULK INSERT) | 3 h |

### Volet F — Tests (P2) — 14 h

Adresse : DETTE-6.

| # | Action | Effort |
|---|--------|--------|
| F1 | Tests unitaires Vitest pour `loadSignaturesBySessionId` (entity_id, slot-aware) | 2 h |
| F2 | Tests unitaires pour `sanitizeSignatureSvg` (couverture déjà en place, étendre) | 1 h |
| F3 | Tests E2E Playwright flow public : QR generate → scan → sign | 4 h |
| F4 | Tests E2E flow admin : bulk sign + export PDF + vérifier signature présente | 4 h |
| F5 | Tests E2E TabAbsences : auto-détection + UPDATE status | 3 h |

### Récapitulatif effort

| Volet | Heures | Priorité |
|-------|--------|----------|
| A — Sécurité multi-tenant | 16 h | P0 |
| B — Type safety | 14 h | P1 |
| C — Robustesse | 16 h | P1 |
| D — UX pilotage | 18 h | P1 |
| E — Refacto architectural | 32 h | P2 |
| F — Tests | 14 h | P2 |
| **TOTAL** | **110 h** | |

**Recommandation de séquencement** : A + C en parallèle (équipe sécu + équipe app) → B + D → E + F. Étape jalons à 32 h (sécu + robustesse), 64 h (UX + types), 110 h (refacto + tests).

---

## Annexe — Fichiers IN-SCOPE lus (récapitulatif)

**Composants UI** (1519) : TabEmargements.tsx, TabAbsences.tsx.
**Signature partagée** (178) : SignaturePad.tsx.
**Services** (56) : load-signatures.ts.
**Routes API émargement public** (1276) : emargement/route.ts, emargement/slots/route.ts, emargement/sign/route.ts, emargement/live-status/route.ts, emargement/post-session-eval/route.ts, signatures/route.ts.
**Routes API documents** (1294) : generate-emargement, generate-emargement-individuel, generate-emargements-batch, generate-emargements-individuels-batch, send-emargements-individuels-batch-email, send-feuille-emargement-vierge-batch-email, sign-request, sign-status, sign, signature-request-batch, process-sign-reminders, auto-absences.
**Pages** (3064) : sign/[token]/page.tsx, emargement/[token]/page.tsx, emargement/layout.tsx, learner/sign, trainer/sign, admin/signatures/page.tsx, emargement-live/page.tsx.
**Templates HTML** (664) : emargement-collectif, emargement-individuel, feuille-emargement-vierge, planning-hebdo-signe.
**Helpers** (175) : sanitize-svg.ts, batch-doc-signature-request.ts, batch-doc-send.ts (partiel).
**Migrations SQL** (216 + ~60 vérification schema.sql) : add-slot-aware-emargement, add_signature_evidence, fix_emargement_signature_bug, fix_signatures_unique_slot_aware, add-formation-tabs-4-5-6, add_document_signing, add_missing_rls_policies.

**Total effectif** : ~4 488 LOC lues intégralement (vs estimation initiale 3 500-4 000).
