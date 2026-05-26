# Solidification Questionnaires — P0-5 Auto Qualiopi (Chantier 2c)

> **Chantier 2c sur 2c** — le dernier P0 du sous-système Questionnaires. Résout le bug "automatisations Qualiopi sans lien fonctionnel" identifié dans le deep-dive 2026-05-25.

**Date :** 2026-05-26
**Branche cible :** `feat/questionnaires-volet-d-p0-5` (depuis `main` post-merge Chantier 2b à `85aee65`)
**Effort estimé :** 8-12h (~2 jours de dev + 1 jour validation)
**Pattern :** brainstorming → spec → writing-plans → subagent-driven-development → finishing-a-development-branch (identique aux 9 chantiers précédents)
**Source Chantier 1 :** [docs/superpowers/specs/2026-05-25-questionnaires-solidification-p0-design.md](2026-05-25-questionnaires-solidification-p0-design.md)
**Source Chantier 2a :** [docs/superpowers/specs/2026-05-25-questionnaires-solidification-p1-design.md](2026-05-25-questionnaires-solidification-p1-design.md)
**Source Chantier 2b :** [docs/superpowers/specs/2026-05-26-questionnaires-volet-d-ux-design.md](2026-05-26-questionnaires-volet-d-ux-design.md)
**Deep-dive :** [docs/deep-dive-tab-questionnaires.md](../../deep-dive-tab-questionnaires.md)

---

## 1. Contexte & objectifs

Chantier 1 (P0 critiques mergés `b239757`), Chantier 2a (hygiène mergée `0162ad1`), Chantier 2b (UX pilotage mergée `85aee65`) ont amené la qualité du sous-système Questionnaires de 3/10 à 9/10.

Reste **P0-5** — le dernier bug bloquant en production : les emails envoyés automatiquement par les 2 crons questionnaires (sessions terminées + règles Qualiopi J-3/J0/J+7/J+30) **ne contiennent pas de lien token public utilisable**. L'apprenant reçoit un email qui pointe soit vers le portail learner authentifié (où il n'a probablement pas de compte), soit nulle part du tout (template fallback sans lien).

Cible qualité : **10/10**. C'est le dernier chantier du parcours Questionnaires.

---

## 2. Décisions du brainstorming

| Q | Décision | Rationale |
|---|---|---|
| **Q1 — Périmètre** | **Les 2 crons** : `/api/questionnaires/auto-send` + `/api/formations/automation-rules/run-cron` via `execute-rule.ts` | Les 2 sont en bug actuellement. Traiter les 2 = couverture complète des emails automatiques de questionnaires. |
| **Q2 — Templates customs** | **Variable `{{questionnaire_link}}` + auto-append si absent** | Permet aux clients qui ont customisé leurs templates d'insérer le lien explicitement. Si la variable n'est pas dans le template, auto-append en fin de body pour ne casser personne. Plus sûr que "templates customs inchangés". |
| **Architecture** | Helper partagé `ensureQuestionnaireToken` réutilisé par les 2 crons | DRY, testable isolément, race condition 23505 gérée une seule fois. |
| **Format email** | Lien `/questionnaire/<token>` (route publique sans auth, déjà existante depuis Chantier 1) | Pas d'attachement PDF (un questionnaire vierge en PJ a peu d'intérêt — le lien suffit). |
| **Durée token** | 90 jours (par défaut existant) | Suffisant pour J-3 / J+30. Les tokens expirés sont régénérés à chaque cron run (helper idempotent). |
| **Validation manuelle** | **Stricte avant push prod** : Wissam déclenche les 2 crons via curl + CRON_SECRET sur une session de test avec son email témoin | Risque prod élevé (centaines d'emails partent automatiquement chez les clients). |

---

## 3. Architecture vue d'ensemble

3 livrables indépendants, **code-only (pas de migration SQL)** :

| # | Livrable | Effort |
|---|---|---|
| 1 | **Helper** `src/lib/automation/questionnaire-token-helper.ts` : `ensureQuestionnaireToken` + `buildPublicQuestionnaireUrl` + 3 tests Vitest TDD | 2-3h |
| 2 | **Cron #1 `/api/questionnaires/auto-send`** : 2 lignes modifiées (`/learner/...` → `/questionnaire/<token>` via helper) | 2-3h |
| 3 | **Cron #2 `/api/formations/automation-rules/run-cron`** (via `src/lib/automation/execute-rule.ts`) : détection `document_type` questionnaire + injection token via variable `{{questionnaire_link}}` ou auto-append | 4-6h |

**Total estimé : 8-12h** (~2 jours dev + 1 jour validation).

**Pas de migration SQL** : la table `questionnaire_tokens` existe déjà depuis Chantier 1 (migration `add_questionnaire_public_tokens.sql`).

**Pas de nouvelle route API** : réutilisation des 2 endpoints existants.

### 3.1 — Hors scope Chantier 2c

- Attachement PDF du questionnaire en pièce jointe (questionnaire vierge = peu d'intérêt)
- Feature flag / env var de rollback (pattern non utilisé dans le projet)
- Refactor du moteur d'automatisation (architecture actuelle conservée)
- Tests E2E sur les crons (Playwright non installé, hors stack)

---

## 4. Helper `ensureQuestionnaireToken`

### 4.1 — Signature

**Fichier** : `src/lib/automation/questionnaire-token-helper.ts`

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface EnsureTokenResult {
  token: string;
  expiresAt: string;
  wasCreated: boolean;
}

export async function ensureQuestionnaireToken(
  supabase: SupabaseClient,
  sessionId: string,
  questionnaireId: string,
  learnerId: string,
  entityId: string,
): Promise<EnsureTokenResult>;

export function buildPublicQuestionnaireUrl(token: string): string;
```

### 4.2 — Logique `ensureQuestionnaireToken`

1. **SELECT** : chercher un token existant **non-utilisé** (`used_at IS NULL`) et **non-expiré** (`expires_at > NOW()`) pour `(session_id, questionnaire_id, learner_id)` dans `questionnaire_tokens`
2. **Si trouvé** : retourner `{ token, expiresAt, wasCreated: false }`
3. **Sinon INSERT** : nouveau token UUID auto-généré + `expires_at = NOW() + INTERVAL '90 days'` + `entity_id`
4. **Race condition handling** : si UNIQUE constraint 23505 (autre cron a inséré entre temps), retry SELECT pour récupérer le token existant et retourner `wasCreated: false`

### 4.3 — Logique `buildPublicQuestionnaireUrl`

```ts
export function buildPublicQuestionnaireUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app";
  return `${baseUrl}/questionnaire/${token}`;
}
```

Cohérent avec le code existant `/api/questionnaires/auto-send` (qui utilise `NEXT_PUBLIC_APP_URL` avec le même fallback).

### 4.4 — Tests Vitest TDD (3 tests minimum)

```ts
describe("ensureQuestionnaireToken", () => {
  it("retourne le token existant si actif (wasCreated: false)", () => { ... });
  it("crée un nouveau token si aucun actif n'existe (wasCreated: true)", () => { ... });
  it("ignore les tokens expirés et en crée un nouveau", () => { ... });
});
```

(Le test race condition 23505 est ajouté en bonus si effort le permet.)

### 4.5 — Effort

| Tâche | Heures |
|---|---|
| Helper + 3 tests Vitest TDD failing-first | 1.5-2h |
| Build + tsc + tests verts | 30 min |
| Commit | 15 min |
| **Total Section 4** | **2-3h** |

---

## 5. Cron #1 : `/api/questionnaires/auto-send`

### 5.1 — Périmètre

**Fichier** : `src/app/api/questionnaires/auto-send/route.ts` (158 LOC existant)

Ce cron quotidien :
- Cherche les `questionnaire_sessions` avec `auto_send_on_completion = true`
- Pour chaque session terminée (`end_date <= today`), envoie un email aux apprenants non répondants

**Bug actuel** (ligne ~110-115) : le lien envoyé pointe vers `/learner/questionnaires/<id>?session_id=...` qui nécessite que l'apprenant ait un compte sur le portail learner. Les apprenants externes (entreprises, freelances) ne peuvent pas répondre.

### 5.2 — Modification

```ts
import { ensureQuestionnaireToken, buildPublicQuestionnaireUrl } from "@/lib/automation/questionnaire-token-helper";

// ... existing code ...

for (const enrollment of enrollments) {
  const learner = enrollment.learner as any;
  if (!learner?.email) continue;
  if (respondedIds.has(learner.id)) continue;
  if (alreadySentIds.has(learner.id)) continue;

  // Générer ou réutiliser un token public pour cet apprenant
  const tokenResult = await ensureQuestionnaireToken(
    supabase, session.id, questionnaire.id, learner.id, session.entity_id,
  );
  const link_url = buildPublicQuestionnaireUrl(tokenResult.token);

  const emailBody = `Bonjour ${learner.first_name},\n\nLa formation "${session.title}" est terminée. Nous vous invitons à remplir le questionnaire de satisfaction :\n\n${link_url}\n\nMerci pour vos retours,\nL'équipe formation`;

  await enqueueEmail(supabase, { /* ... existing ... */ });
  sent++;
}
```

### 5.3 — Bénéfice

- **Avant** : lien `/learner/...` → auth requise → apprenants externes bloqués
- **Après** : lien `/questionnaire/<token>` → route publique sans auth → tous les apprenants peuvent répondre

### 5.4 — Effort

| Tâche | Heures |
|---|---|
| Modification 2-3 lignes + import du helper | 30 min |
| Test du flow (helper appelé, lien correct généré) — tests Vitest mock | 30 min |
| Spot check manuel : déclencher le cron via curl sur une session de test, vérifier email reçu + cliquer le lien sans être loggé | 1h |
| Commit | 15 min |
| **Total Section 5** | **2-3h** |

---

## 6. Cron #2 : `run-cron` + `execute-rule.ts`

**La section la plus délicate du chantier** — modifie le moteur d'automatisations qui sert toutes les règles `formation_automation_rules` en prod.

### 6.1 — Périmètre

**Fichier principal** : `src/lib/automation/execute-rule.ts` (296 LOC)

Le cron `/api/formations/automation-rules/run-cron` itère sur les règles déclenchées (date matching) et appelle `executeRuleForSession` pour chaque (rule, session). Cette fonction :
1. Résout les destinataires (`recipients`) via `resolveRecipients`
2. Construit subject + body via `template` (custom) ou `buildFallbackEmail` (fallback)
3. Enqueue l'email via `enqueueEmail` avec retry exponential backoff

**Bug actuel** (ligne ~140-148 — `buildFallbackEmail`) :

```ts
function buildFallbackEmail(
  rule: RuleInfo,
  session: SessionInfo,
  recipient: RecipientInfo,
): { subject: string; body: string } {
  const docLabel = DOCUMENT_TYPE_SUBJECTS[rule.document_type] ?? rule.document_type;
  return {
    subject: `${docLabel} — ${session.title}`,
    body: `Bonjour ${recipient.first_name} ${recipient.last_name},\n\nVeuillez trouver ci-joint votre document : ${docLabel}.\n\nFormation : ${session.title}\n\nCordialement,\nL'équipe de formation`,
  };
}
```

Le body dit "Veuillez trouver ci-joint" mais aucune PJ n'est attachée pour les questionnaires + aucun lien n'est inclus. **Les 4 règles Qualiopi standard envoient des emails inutiles**.

### 6.2 — Détection des règles questionnaire

Ajouter en haut de `execute-rule.ts` :

```ts
/**
 * Document types correspondant à des questionnaires Qualiopi.
 * Pour ces règles, executeRuleForSession injecte un lien token public
 * (via ensureQuestionnaireToken) dans le body de l'email.
 *
 * Liste à confirmer en Task 0 du plan (grep default-packs.ts).
 */
const QUESTIONNAIRE_DOCUMENT_TYPES = new Set<string>([
  "questionnaire_positionnement",
  "questionnaire_satisfaction",
  "questionnaire_satisfaction_company",
  // + autres détectés en Task 0 (ex: questionnaire_satisfaction_froid)
]);

function isQuestionnaireRule(rule: RuleInfo): boolean {
  return QUESTIONNAIRE_DOCUMENT_TYPES.has(rule.document_type);
}
```

### 6.3 — Mapping document_type → questionnaire attribué

Pour récupérer l'ID du questionnaire concret attribué à la session :

```ts
/**
 * Mapping document_type → (table, colonne, valeur).
 * Utilisé pour résoudre quel questionnaire est attribué à la session
 * pour une règle donnée (ex: "questionnaire_positionnement" →
 * formation_evaluation_assignments where evaluation_type='eval_preformation').
 */
const QUESTIONNAIRE_TYPE_TO_ASSIGNMENT: Record<string, {
  table: "formation_evaluation_assignments" | "formation_satisfaction_assignments";
  typeColumn: "evaluation_type" | "satisfaction_type";
  typeValue: string;
}> = {
  questionnaire_positionnement: { table: "formation_evaluation_assignments", typeColumn: "evaluation_type", typeValue: "eval_preformation" },
  questionnaire_satisfaction: { table: "formation_satisfaction_assignments", typeColumn: "satisfaction_type", typeValue: "satisfaction_chaud" },
  questionnaire_satisfaction_company: { table: "formation_satisfaction_assignments", typeColumn: "satisfaction_type", typeValue: "satisfaction_entreprise" },
  // + autres
};

async function resolveQuestionnaireIdForRule(
  supabase: SupabaseClient,
  rule: RuleInfo,
  sessionId: string,
): Promise<string | null> {
  const config = QUESTIONNAIRE_TYPE_TO_ASSIGNMENT[rule.document_type];
  if (!config) return null;

  const { data } = await supabase
    .from(config.table)
    .select("questionnaire_id")
    .eq("session_id", sessionId)
    .eq(config.typeColumn, config.typeValue)
    .limit(1)
    .maybeSingle();

  return data?.questionnaire_id ?? null;
}
```

**Limitation** : si plusieurs questionnaires de même type sont attribués (rare), on prend le premier. Documenté en commentaire.

### 6.4 — Injection du lien dans `executeRuleForSession`

Dans `executeRuleForSession` (ligne ~209-300), après la construction de `subject` + `body` :

```ts
// Logique existante de construction du body (template custom ou fallback)
let subject: string;
let body: string;
if (template) {
  const ctx = { /* ... */ };
  subject = renderTemplate(template.subject, ctx);
  body = renderTemplate(template.body, ctx);
} else {
  ({ subject, body } = buildFallbackEmail(rule, session, recipient));
}

// NEW : si règle questionnaire et destinataire learner, injecter le token
if (isQuestionnaireRule(rule) && recipient.type === "learner") {
  const questionnaireId = await resolveQuestionnaireIdForRule(supabase, rule, session.id);
  if (questionnaireId) {
    const tokenResult = await ensureQuestionnaireToken(
      supabase, session.id, questionnaireId, recipient.id, session.entity_id,
    );
    const questionnaireLink = buildPublicQuestionnaireUrl(tokenResult.token);

    // Si le body contient {{questionnaire_link}}, remplacer (templates customs avancés)
    if (body.includes("{{questionnaire_link}}")) {
      body = body.replaceAll("{{questionnaire_link}}", questionnaireLink);
    } else {
      // Auto-append en fin de body (templates customs basiques + fallback)
      body += `\n\n📝 Lien direct vers le questionnaire :\n${questionnaireLink}`;
    }
  }
}

// Enqueue email (logique existante inchangée)
await enqueueEmail(supabase, {
  to: recipient.email,
  subject,
  body,
  // ... existing fields ...
});
```

### 6.5 — Effort

| Tâche | Heures |
|---|---|
| Constante `QUESTIONNAIRE_DOCUMENT_TYPES` + helper `isQuestionnaireRule` | 30 min |
| Helper `resolveQuestionnaireIdForRule` + 2 tests Vitest | 1.5h |
| Logique d'injection dans `executeRuleForSession` (variable + auto-append) | 1.5h |
| 2 tests Vitest sur la logique d'injection (variable présente, variable absente) | 1h |
| Spot check manuel : déclencher run-cron sur 1 règle Positionnement J-3 + 1 règle Satisfaction J0 | 1.5h |
| Commit (2 commits : helpers + logique d'injection séparés pour faciliter rollback) | 30 min |
| **Total Section 6** | **4-6h** |

---

## 7. Acceptance Criteria

### AC1 — Helper `ensureQuestionnaireToken`
- ✅ `src/lib/automation/questionnaire-token-helper.ts` créé avec `ensureQuestionnaireToken` + `buildPublicQuestionnaireUrl`
- ✅ 3 tests Vitest verts : token existant réutilisé, nouveau token créé, token expiré ignoré
- ✅ Helper idempotent (appel multiple → même token sauf si expiré)
- ✅ Race condition 23505 gérée (retry SELECT)

### AC2 — Cron #1 (`/api/questionnaires/auto-send`)
- ✅ Le lien dans l'email **ne contient plus** `/learner/questionnaires/...`
- ✅ Le lien pointe vers `/questionnaire/<token>` (route publique)
- ✅ Le `<token>` est un UUID valide récupéré depuis `questionnaire_tokens`
- ✅ Spot check : déclencher le cron via curl, vérifier l'email reçu sur compte test, cliquer le lien sans être loggé → page publique accessible

### AC3 — Cron #2 (`run-cron` via `execute-rule.ts`)
- ✅ Détection automatique des règles questionnaire via `QUESTIONNAIRE_DOCUMENT_TYPES`
- ✅ Pour chaque règle questionnaire, génération de token via helper
- ✅ Variable `{{questionnaire_link}}` supportée dans les templates customs (remplacement string)
- ✅ Auto-append en fin de body si la variable n'apparaît pas dans le template
- ✅ Spot check : déclencher run-cron manuellement avec règle Positionnement J-3, vérifier que les emails partent avec le lien token

### AC4 — Qualité générale
- ✅ Suite Vitest verte (521 baseline + ≥ 5 nouveaux tests = ≥ 526)
- ✅ Coverage 100% maintenu sur `questionnaire-scoring.ts` (Chantier 2a)
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run build` succès
- ✅ Aucun nouveau cast `as unknown as`
- ✅ Try/catch dans les helpers + logs structurés

### AC5 — Process
- ✅ Branche `feat/questionnaires-volet-d-p0-5` depuis `main` à `85aee65`
- ✅ ~7-9 commits granulaires (helper, Cron #1, Cron #2 helpers, Cron #2 injection)
- ✅ Aucune migration SQL
- ✅ **Validation manuelle stricte avant push prod** : Wissam déclenche les 2 crons manuellement sur une session de test, vérifie :
  1. L'email arrive sur son adresse témoin
  2. Le lien dans le body est `/questionnaire/<uuid>` (pas `/learner/...`)
  3. Cliquer le lien sans être loggé → page publique accessible
  4. Soumettre une réponse → enregistrée dans `questionnaire_responses`

### AC6 — Sécurité multi-tenant
- ✅ Le helper utilise `entity_id` lors de l'INSERT (table `questionnaire_tokens` a la colonne)
- ✅ Pas de fuite cross-tenant (les tokens sont scopés par `session_id` qui appartient à 1 entité)
- ✅ Les 2 crons utilisent le `service_role` (bypass RLS) — pas de régression
- ✅ Le lien public `/questionnaire/<token>` valide le token via `expires_at` (existant)

---

## 8. Risques résiduels

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Liste `QUESTIONNAIRE_DOCUMENT_TYPES` incomplète | Moyenne | Moyen | Task 0 du plan : grep `default-packs.ts` + BDD pour liste exhaustive |
| Mapping `QUESTIONNAIRE_TYPE_TO_ASSIGNMENT` ne couvre pas un cas legacy | Moyenne | Bas | `resolveQuestionnaireIdForRule` retourne `null` → pas d'injection, mais l'email part quand même (sans lien — c'est le comportement actuel, pas une régression) |
| Cron auto-send envoie 2x si helper buggué | Faible | Haut | Anti-dup `alreadySentIds` existant + helper idempotent. Spot check pre-push validera. |
| Templates customs incompatibles avec auto-append | Moyenne | Bas | Si le template custom ne mentionne pas le questionnaire, l'append en bas est cohérent. Si le template inclut déjà un lien (rare), il y aura 2 liens — l'admin peut migrer son template vers `{{questionnaire_link}}` pour éviter la duplication. |
| Race condition 23505 lors d'INSERT token concurrent | Très faible | Bas | Retry SELECT dans le helper |
| `NEXT_PUBLIC_APP_URL` non défini en prod | Faible | Moyen | Fallback hardcodé `https://mrformationcrm.netlify.app` cohérent avec l'existant |

---

## 9. Validation manuelle stricte (PRE-PUSH)

Workflow obligatoire avant `git push origin main` :

### 9.1 — Setup

1. Créer 1 session de test dans `/admin/formations/<f_id>` avec :
   - `end_date` à aujourd'hui (pour déclencher cron #1)
   - 1 apprenant test avec email = adresse personnelle Wissam
2. Attribuer 1 questionnaire `auto_send_on_completion = true` (pour cron #1)
3. Créer 1 règle automation "Positionnement J-3" (pour cron #2)

### 9.2 — Déclencher Cron #1 (`/api/questionnaires/auto-send`)

```bash
curl -X POST https://localhost:3000/api/questionnaires/auto-send \
  -H "Authorization: Bearer $CRON_SECRET"
```

Vérifier dans la boîte mail Wissam :
- [ ] Email reçu
- [ ] Lien dans le body = `/questionnaire/<uuid>` (pas `/learner/...`)
- [ ] Cliquer le lien sans être loggé → page publique accessible
- [ ] Soumettre une réponse → `questionnaire_responses` insertée

### 9.3 — Déclencher Cron #2 (`run-cron`)

```bash
curl -X POST https://localhost:3000/api/formations/automation-rules/run-cron \
  -H "Authorization: Bearer $CRON_SECRET"
```

Vérifier dans la boîte mail Wissam :
- [ ] Email "Positionnement — <titre session>" reçu
- [ ] Body contient `📝 Lien direct vers le questionnaire :\nhttps://...`
- [ ] Cliquer le lien → page publique accessible
- [ ] Soumettre réponse → enregistrée

### 9.4 — Décision Go/No-go

- ✅ **Go** : si toutes les cases ☐ sont cochées
- ❌ **No-go** : si un test échoue, NE PAS push, debugger

---

## 10. Hors scope (futur ou définitif)

**Hors scope définitif** :
- Attachement PDF du questionnaire en pièce jointe (questionnaire vierge = peu d'intérêt utilisateur)
- Feature flag de rollback (pattern non utilisé dans le projet)
- Refactor du moteur d'automatisation (architecture actuelle conservée)
- Tests E2E sur les crons (Playwright non installé)
- Variable additionnelle `{{questionnaire_pdf_url}}` (PDF généré séparément — pas demandé)

**Futur (si besoin émerge)** :
- Helper `revokeQuestionnaireToken` (marquer `used_at` manuellement depuis l'admin)
- Extension durée d'expiration au-delà de 90j (rare, pas demandé)

---

## 11. Ordre d'exécution (pour writing-plans)

Le plan d'implémentation va suivre l'ordre :

1. **Task 0** — Baseline + branche + investigation `default-packs.ts` (liste exacte des `document_type` questionnaire)
2. **Task 1** — Helper `ensureQuestionnaireToken` + `buildPublicQuestionnaireUrl` + 3 tests Vitest TDD
3. **Task 2** — Modification du Cron #1 (`/api/questionnaires/auto-send`) : remplacer le lien
4. **Task 3** — Helpers `isQuestionnaireRule` + `resolveQuestionnaireIdForRule` dans `execute-rule.ts` + 2 tests
5. **Task 4** — Injection du lien dans `executeRuleForSession` (variable `{{questionnaire_link}}` + auto-append) + 2 tests
6. **Task 5** — Vérification finale acceptance criteria (Vitest + tsc + build)
7. **Task 6** — **STOP** : remettre au PO (Wissam) pour validation manuelle stricte (Section 9)
8. **Task 7** — Après Go : finishing-a-development-branch (merge + push prod)

---

## 12. Self-review

(Effectuée post-rédaction.)

- ✅ **Placeholder scan** : aucun "TBD", "TODO", section incomplète. La liste `QUESTIONNAIRE_DOCUMENT_TYPES` est marquée "à confirmer Task 0" — investigation planifiée, pas un placeholder.
- ✅ **Internal consistency** : helper `ensureQuestionnaireToken` (Section 4) consommé par Cron #1 (Section 5) et Cron #2 (Section 6). Mapping `QUESTIONNAIRE_TYPE_TO_ASSIGNMENT` cohérent avec le pack Qualiopi standard de `default-packs.ts`.
- ✅ **Scope check** : 3 livrables, ~8-12h, code-only — taille appropriée pour 1 chantier. Pas de décomposition nécessaire (P0-5 est unique).
- ✅ **Ambiguity check** : "auto-append en fin de body" explicitement défini (`\n\n📝 Lien direct vers le questionnaire :\n${url}`). Templates customs avec et sans variable `{{questionnaire_link}}` couverts.

---

**FIN DU DESIGN**
