# Deep-Dive — Onglet Qualiopi (TabQualiopi)

> **Date** : 2026-05-25
> **Branche** : main (post-déploiement Automatisations)
> **Cible** : `src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx` et tout ce qui le sert
> **Méthode** : BMAD `document-project` — deep-dive exhaustif, lecture intégrale des fichiers critiques, état des lieux honnête (pas de fluff, pas de patchwork).

---

## 1. Vue d'ensemble

L'onglet Qualiopi est le 8ᵉ tab de la fiche formation détaillée (`/admin/formations/[id]`). Son rôle :

1. **Afficher un score de conformité Qualiopi** (0–100 %) calculé à la volée à partir des données de la formation (documents signés/envoyés, taux de complétion des questionnaires, sous-traitance).
2. **Lister une checklist de critères** (auto + manuels), groupés en 3 catégories (Documents & Conventions / Questionnaires & Évaluations / Sous-traitance).
3. **Permettre un « audit blanc IA »** via Claude Haiku, qui simule un audit Qualiopi et renvoie verdict + findings + plan d'action.
4. **Persister le score** dans `sessions.qualiopi_score` pour qu'il s'affiche en badge dans les listes de formations et la page « Suivi qualité ».

Il y a aussi une **page connexe** `/admin/reports/qualite` avec une vue « Qualiopi » par les 7 critères du référentiel (1 carte par critère + score agrégé), et une API `qualiopi-check-proof` pour vérifier la conformité d'une preuve documentaire (PDF/image) via IA.

**État synthétique : fonctionnel à 70 %, avec 4 bugs critiques, 6 bugs majeurs, et de la dette structurelle non négligeable.**

---

## 2. Architecture

### 2.1 Couches

```
┌──────────────────────────────────────────────────────────────┐
│  UI : TabQualiopi.tsx (526L, monolithique)                   │
│  ├─ Score global + barre de progression                      │
│  ├─ Bloc « Auditeur IA »                                     │
│  ├─ 3 sections checklist (Documents / Évaluations / S/T)     │
│  └─ Boutons « Traiter » → navigation full-reload             │
└──────────────────────────────────────────────────────────────┘
                          │
            ┌─────────────┼─────────────┬─────────────┐
            ▼             ▼             ▼             ▼
       Supabase       API IA       sessions.notes  sessions.qualiopi_score
       (lecture)      (POST)       (JSON manuel)   (update)
            │             │
            │             ▼
            │       Claude Haiku
            │       (qualiopi-mock-audit)
            │       (qualiopi-check-proof)
            ▼
       formation_convention_documents [⚠ legacy]
       documents                       [✓ unifiée]
       questionnaire_responses
       formation_evaluation_assignments
       formation_satisfaction_assignments
       formation_elearning_assignments
       enrollments
```

### 2.2 Fichiers concernés (inventaire exhaustif)

| Fichier | LOC | Rôle |
|---|---|---|
| [src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx](src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx) | 526 | Composant principal — monolithique |
| [src/app/(dashboard)/admin/formations/[id]/page.tsx](src/app/(dashboard)/admin/formations/[id]/page.tsx) | 479 | Page parente qui rend l'onglet |
| [src/app/(dashboard)/admin/reports/qualite/page.tsx](src/app/(dashboard)/admin/reports/qualite/page.tsx) | 678 | Page « Suivi qualité » — vue Qualiopi par critère |
| [src/app/(dashboard)/admin/trainings/page.tsx](src/app/(dashboard)/admin/trainings/page.tsx) | 690 | Liste formations — affiche `qualiopi_score` en badge |
| [src/app/api/ai/qualiopi-mock-audit/route.ts](src/app/api/ai/qualiopi-mock-audit/route.ts) | 109 | POST — audit blanc IA (formation OU global) |
| [src/app/api/ai/qualiopi-check-proof/route.ts](src/app/api/ai/qualiopi-check-proof/route.ts) | 72 | POST FormData — vérification IA d'une preuve |
| [src/lib/services/load-session-aggregates.ts](src/lib/services/load-session-aggregates.ts) | 345 | `loadQualiopiIndicators(supabase, sessionId)` |
| [src/lib/templates/registry.ts](src/lib/templates/registry.ts) | 476 | Flag `qualiopiBlocking` par template |
| [src/lib/automation/default-packs.ts](src/lib/automation/default-packs.ts) | 166 | Pack `qualiopi-standard` (6 règles) |
| [src/lib/__tests__/qualiopi-score.test.ts](src/lib/__tests__/qualiopi-score.test.ts) | 88 | 4 tests Vitest sur `computeQualiopiScore` |
| [e2e/qualiopi-ia.spec.ts](e2e/qualiopi-ia.spec.ts) | 157 | 11 tests Playwright |
| [supabase/migrations/add_qualiopi_score_column.sql](supabase/migrations/add_qualiopi_score_column.sql) | 6 | `ALTER TABLE sessions ADD COLUMN qualiopi_score` |
| [supabase/migrations/enrich_qualiopi_system.sql](supabase/migrations/enrich_qualiopi_system.sql) | 61 | Tables `qualiopi_snapshots`, `qualiopi_mock_audits`, `qualiopi_proof_checks` |

### 2.3 Tables Supabase impliquées

| Table | RLS | Usage actuel |
|---|---|---|
| `sessions` (colonne `qualiopi_score` + `notes` JSON) | (allow-all en prod ⚠) | Stockage du score + des checks manuels (JSON sérialisé dans `notes`) |
| `documents` (unifiée) | Filtrée applicativement | Source réelle des documents (via `getDocsForSession`) |
| `formation_convention_documents` | ? | Référencé dans le composant via `formation.formation_convention_documents` — c'est en fait un **alias injecté en post-load** par `formations/[id]/page.tsx` qui pointe vers `documents` |
| `formation_evaluation_assignments` | Filtrée | Liste les questionnaires d'évaluation affectés à la formation |
| `formation_satisfaction_assignments` | Filtrée | Idem pour satisfaction |
| `formation_elearning_assignments` | Filtrée | Modules e-learning affectés |
| `questionnaire_responses` | Filtrée | Pour compter les réponses |
| `enrollments` | Filtrée | Apprenants inscrits |
| `qualiopi_snapshots` | ✓ par `entity_id IN profiles` | **Définie mais jamais écrite** (table morte) |
| `qualiopi_mock_audits` | ✓ par `entity_id IN profiles` | Stockage des audits blancs IA |
| `qualiopi_proof_checks` | ✓ par `entity_id IN profiles` | Stockage des vérifs de preuves IA |
| `quality_scores` | Filtrée par `entity_id` | Vue pré-calculée utilisée par la page « Suivi qualité » (path principal) |

---

## 3. Comment ça marche aujourd'hui

### 3.1 Chargement de l'onglet

1. `formations/[id]/page.tsx` charge la session avec `formation_evaluation_assignments`, `formation_satisfaction_assignments`, etc. ([page.tsx:77-102](src/app/(dashboard)/admin/formations/[id]/page.tsx#L77-L102)).
2. **En parallèle**, il appelle `getDocsForSession(supabase, formationId)` qui requête la table **`documents`** (unifiée).
3. Il **injecte** le résultat dans la prop sous le nom `formation_convention_documents` ([page.tsx:115-118](src/app/(dashboard)/admin/formations/[id]/page.tsx)) — c'est un alias historique. `TabQualiopi` croit lire l'ancienne table mais lit en réalité la nouvelle.
4. Le composant reçoit la formation enrichie + un callback `onRefresh` (qu'il n'utilise JAMAIS — code mort).

### 3.2 Construction de la checklist

8 items « auto » sont calculés dans `items` ([TabQualiopi.tsx:129-220](src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx#L129-L220)) :

| ID | Logique | Source |
|---|---|---|
| `convention_signed` | Au moins 1 doc `convention_entreprise` avec `is_signed=true` | `formation.formation_convention_documents` |
| `convocation_sent` | TOUS les docs `convocation` avec `is_sent=true` | idem |
| `convention_intervention_signed` | Au moins 1 doc `convention_intervention` avec `is_signed=true` | idem |
| `eval_preformation` | % de réponses au questionnaire pré | `questionnaire_responses` (N+1 query) |
| `eval_postformation` | % de réponses au questionnaire post | idem |
| `satisfaction_learner` | % de réponses au questionnaire satisfaction | idem |
| `certificat_sent` | TOUS les docs `certificat_realisation` avec `is_sent=true` | docs |
| `support_cours` | Au moins 1 assignment e-learning | `formation_elearning_assignments` |

Si `is_subcontracted === true` :
- `docs_formation_sent` (auto) — au moins 1 doc envoyé au formateur
- `docs_post_formation_received` (**manuel** — checkbox)

### 3.3 Calcul du score

```ts
// Lignes 223-236 — version "composant"
let totalWeight = 0;
let achieved = 0;
for (const item of items) {
  totalWeight += 1;
  if (item.type === "auto_percent") achieved += (item.percent || 0) / 100;
  else if (item.value) achieved += 1;
}
return Math.round((achieved / totalWeight) * 100);
```

Le score est **persisté en BDD** via un `useEffect` ([ligne 242-245](src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx#L242-L245)) :
```ts
useEffect(() => {
  if (loading || score === 0) return;
  supabase.from("sessions").update({ qualiopi_score: score }).eq("id", formation.id);
}, [score, ...]);
```

### 3.4 Audit blanc IA

Le bouton « Lancer un audit blanc » fait un `POST /api/ai/qualiopi-mock-audit` avec `{ mode: "formation", session_id }`.

Côté API ([qualiopi-mock-audit/route.ts](src/app/api/ai/qualiopi-mock-audit/route.ts)) :
1. Auth `requireRole(["super_admin", "admin"])` ✓
2. Rate limit 10/h/user ✓
3. Lecture de la session + lecture de la table `documents` (où `source_table='sessions' AND source_id=session_id`)
4. Construction d'un mini-contexte JSON (convention_signed, convocation_sent, has_eval_pre, has_eval_post)
5. Appel `claudeChat` (Claude Haiku) avec prompt système « auditeur Qualiopi certifié COFRAC »
6. `JSON.parse` brut de la réponse (avec replace `/```json|```/g`)
7. Insertion dans `qualiopi_mock_audits`
8. Retour du résultat au front

### 3.5 Vérification de preuves documentaires

L'API `qualiopi-check-proof` accepte un FormData avec `file`, `critere_num`, `document_type`, `session_id`. Elle envoie le fichier (PDF base64 ou image) à Claude Haiku avec un prompt « vérifie la conformité au critère N », et stocke le résultat dans `qualiopi_proof_checks`.

⚠️ **Cette API n'est pas utilisée par TabQualiopi.tsx**. Elle est consommable mais aucun bouton dans l'UI ne l'appelle. Fonctionnalité partiellement orpheline (couverte uniquement par e2e test, jamais par UI).

### 3.6 Page Suivi Qualité (`/admin/reports/qualite`)

Vue parallèle, indépendante de TabQualiopi :
- Charge `quality_scores` (table pré-calculée) avec fallback sur calcul live depuis `sessions` + `questionnaire_responses`
- Toggle « Tableau » / « Qualiopi »
- En vue Qualiopi : 7 cartes (1 par critère), score agrégé = moyenne des moyennes des indicateurs
- Exports Excel + PDF
- ✓ Filtre `entity_id` correctement appliqué aux 2 queries principales

---

## 4. État des lieux — ce qui marche, ce qui ne marche pas

### 4.1 ✅ Ce qui fonctionne réellement

- **Score visuel** (badge + barre de progression + code couleur vert/orange/rouge) — UI cohérente
- **Persistance du score** dans `sessions.qualiopi_score` (utilisé par les listes formations)
- **Audit blanc IA** côté formation — flux end-to-end fonctionnel, rate-limité, persisté
- **Audit blanc IA** côté global — fonctionnel
- **RLS Qualiopi** strict (3 tables protégées par `entity_id IN profiles`) — défense en profondeur OK
- **Tests** : 4 unit + 11 e2e — couverture minimale mais existante
- **Page Suivi Qualité** : entity_id filter en place, 2 stratégies de chargement (pré-calculé / fallback live)
- **Pack `qualiopi-standard`** (6 règles d'automatisation) — défini et utilisable

### 4.2 🔴 BUGS CRITIQUES

#### B1 — Deux scores Qualiopi divergents pour la même formation
Le composant ([TabQualiopi.tsx:223-236](src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx#L223-L236)) calcule sur 8–10 items avec **% de réponses réelles** aux questionnaires. La fonction exportée `computeQualiopiScore` ([ligne 497-526](src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx#L497-L526)) — utilisée par la liste formations — calcule sur 8 items fixes avec **+0.5 si `assigned` seulement** (sans regarder les réponses).

→ Conséquence : le badge sur la liste affiche **un score différent** de celui de l'onglet. Pour une même formation, on peut voir 50 % en liste et 80 % en détail. Confusion utilisateur garantie.

#### B2 — `loadQualiopiIndicators` lit `enrollments` et `signatures` SANS filtre `entity_id`
[load-session-aggregates.ts:152-163](src/lib/services/load-session-aggregates.ts#L152-L163) :
```ts
const { data: enrollments } = await supabase.from("enrollments")
  .select("learner_id").eq("session_id", sessionId);
const { data: signatures } = await supabase.from("signatures")
  .select("signer_id").eq("session_id", sessionId).eq("signer_type", "learner");
```
Sur un environnement où la RLS est `allow_all` (cas constaté en prod selon la mémoire), un appelant peut lire les `enrollments`/`signatures` d'autres entités si l'app passe un `sessionId` étranger. Le `sessionId` est sécurisé en amont, mais la défense en profondeur exigée par CLAUDE.md (« CHAQUE requête Supabase DOIT filtrer par entity_id, aucune exception ») est violée.

#### B3 — `qualiopi_score` n'est pas typé dans l'interface `Session`
[formations/[id]/page.tsx:139](src/app/(dashboard)/admin/formations/[id]/page.tsx#L139) :
```ts
qualiopi: (formation as unknown as { qualiopi_score?: number }).qualiopi_score || 0,
```
Cast `as unknown as` = banc d'essai pour erreurs de runtime. Le type `Session` (`src/lib/types/`) n'a jamais été mis à jour après l'ajout de la colonne. Viole la règle absolue CLAUDE.md « Jamais de type `any` ».

#### B4 — L'audit IA voit un état différent de celui affiché à l'utilisateur
La route mock-audit ([qualiopi-mock-audit/route.ts:25-30](src/app/api/ai/qualiopi-mock-audit/route.ts#L25-L30)) lit la table `documents` :
```ts
auth.supabase.from("documents")
  .select("doc_type, status")
  .eq("source_table", "sessions").eq("source_id", session_id)
```
Et reconstruit `is_signed`/`is_sent` à partir du champ `status`. Or `TabQualiopi` reçoit déjà ces docs via la prop (alias `formation_convention_documents`). Tant que `getDocsForSession()` et la route requêtent la **même table avec la même logique de mapping `status` → flags**, ça marche. Si elles divergent (par exemple, si une régression côté worker oublie de set `status='signed'` au moment d'une vraie signature), l'audit IA pourrait dire « convention signée » alors que l'UI dit « non signée », ou inversement.

→ Le risque ne se matérialise pas aujourd'hui (le mapping est cohérent), mais il y a une **duplication silencieuse** de la logique de dérivation `is_signed`/`is_sent` à 2 endroits : le mapping de `getDocsForSession` et celui de la route. Premier candidat à factoriser.

### 4.3 🟠 BUGS MAJEURS

#### M1 — `qualiopi_score` update sans gestion d'erreur
[TabQualiopi.tsx:244](src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx#L244) — `supabase.from("sessions").update({ qualiopi_score: score })` sans `await`, sans `.catch`, sans toast. Si la query échoue (RLS, réseau), le score local est vu mais la BDD reste désynchronisée. La liste formations affiche un score périmé sans que personne ne le sache.

#### M2 — `sessions.notes` utilisé comme JSON store, sans transaction
[TabQualiopi.tsx:248-271](src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx#L248-L271) — `handleManualToggle` lit `notes`, parse JSON, mute la clé `qualiopi_manual`, ré-écrit. Deux problèmes :
- **Race condition** : si deux admins toggle en même temps, le dernier écrase le premier.
- **Champ partagé** : `sessions.notes` est un champ texte général. Si une autre feature écrit aussi du JSON dedans (ou du texte libre), tout peut se casser. Mieux vaudrait une vraie colonne `qualiopi_manual JSONB`.

#### M3 — Le bouton « Traiter » fait un full page reload
[TabQualiopi.tsx:317-321](src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx#L317-L321) — `window.location.href = url.toString()` au lieu de `router.replace()`. Perd l'état React, scroll au top, refetch complet. Frustrant pour l'utilisateur qui veut corriger un item et revenir.

#### M4 — N+1 queries dans `fetchResponseCounts`
[TabQualiopi.tsx:74-105](src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx#L74-L105) — pour chaque assignment de questionnaire (potentiellement 5–10 par formation), une requête `count` séquentielle. À chaque ouverture de l'onglet, ~10 round-trips Supabase. Lent en réseau, et le résultat n'est pas mémoïsé entre navigations.

#### M5 — `qualiopi_snapshots` est une table morte
Définie par [enrich_qualiopi_system.sql:6-20](supabase/migrations/enrich_qualiopi_system.sql#L6-L20) avec son index, sa RLS, etc. **Aucun code ne fait `.insert()` dedans.** La fonctionnalité « historique des scores » n'est pas implémentée. À soit construire, soit drop.

#### M6 — `qualiopi-check-proof` (vérif de preuves IA) n'a pas d'UI
La route est complète et testée e2e. Mais aucun composant ne l'appelle. Fonctionnalité bâtie, jamais branchée. Soit on l'expose (bouton « Vérifier ce document » sur les docs), soit on retire.

### 4.4 🟡 DETTE & WARNINGS

- **Prop `onRefresh` jamais utilisée** dans TabQualiopi → code mort à supprimer ([ligne 14](src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx#L14)).
- **Pas de validation Zod** sur le body des routes IA — repose entièrement sur le contrat avec Claude. Si le LLM répond du JSON invalide → 500 silencieux.
- **`isCorrect()` dans load-session-aggregates** ([ligne 52-67](src/lib/services/load-session-aggregates.ts#L52-L67)) — cast `as { correct_answer?: unknown }` sans guards. Runtime brittle si `options` est malformé.
- **Promise.all sans `.catch`** dans `loadQualiopiIndicators` ([lignes 202-211](src/lib/services/load-session-aggregates.ts#L202-L211)) — une seule erreur réseau réduit tout le calcul à null.
- **Cast implicite** sur `resp.questionnaire` dans la page Suivi Qualité — fragile si Supabase change la shape.
- **Pas de test unitaire** sur :
  - le score *composant* (seul le `computeQualiopiScore` exporté est testé)
  - les routes IA (uniquement e2e qui ne vérifie que la protection auth)
  - `loadQualiopiIndicators`
- **Le score composant et `computeQualiopiScore` ne partagent aucune logique** — implémentations totalement dupliquées et divergentes (cf B1).
- **`auditResult.findings.slice(0, 3)`** ([ligne 407](src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx#L407)) — l'audit complet n'est jamais accessible à l'utilisateur, seulement 3 findings non-conformes. Le reste est perdu (sauf en BDD).
- **Pas d'AbortController** sur le fetch IA — si l'utilisateur change d'onglet pendant l'audit (5–15s), warning React sur setState après unmount.
- **Persist du score** ne se déclenche pas si `score === 0` ([ligne 243](src/app/(dashboard)/admin/formations/[id]/_components/TabQualiopi.tsx#L243)). Donc une formation qui passe de 50 % à 0 % ne voit jamais sa BDD mise à jour à 0 — elle reste figée à 50 %.

### 4.5 🔵 OBSERVATIONS UX

- **8 items pour un référentiel à 32 indicateurs** : la checklist est volontairement light. C'est défendable (« niveau organisme » vs « niveau audit COFRAC ») mais à documenter.
- **Aucune indication** sur ce que devraient être les manual checks pour un super-admin / formateur (qui voit quoi ?).
- **L'audit blanc IA ne montre que 3 findings non-conformes** — pas d'accès à l'audit complet ni à l'historique (qui est pourtant en BDD).
- **Pas de lien** vers la page Suivi Qualité depuis l'onglet, ni inversement.
- **Pas de breadcrumb** des critères : on ne sait pas à quel critère Qualiopi (1–7) chaque item de la checklist se rapporte.

---

## 5. Cartographie des risques et priorité

| # | Sévérité | Risque | Effort | Bénéfice |
|---|---|---|---|---|
| B1 | 🔴 critique | Deux scores divergents en UI → perte de confiance | M | Très haut |
| B2 | 🔴 critique | Multi-tenant : enrollments/signatures sans entity_id filter | S | Sécurité défense en profondeur |
| B3 | 🔴 critique | `qualiopi_score` non typé dans Session (any-like) | S | Robustesse + CLAUDE.md compliance |
| B4 | 🔴 critique | Duplication logique `status` → `is_signed`/`is_sent` | S | Maintenabilité, évite régressions silencieuses |
| M1 | 🟠 majeur | Update score sans error handling | XS | Cohérence visible des badges |
| M2 | 🟠 majeur | `sessions.notes` JSON sans transaction | M | Robustesse race conditions |
| M3 | 🟠 majeur | Bouton « Traiter » full reload | XS | UX |
| M4 | 🟠 majeur | N+1 queries `fetchResponseCounts` | S | Perf |
| M5 | 🟠 majeur | Table `qualiopi_snapshots` morte | S–M | Soit feature historique, soit drop |
| M6 | 🟠 majeur | API `qualiopi-check-proof` non branchée à l'UI | S–M | Valeur utilisateur dispo |
| D1–D8 | 🟡 dette | (cf §4.4) | XS–S chacun | Hygiène |

---

## 6. Pistes de chantier (à valider)

### Piste A — Unifier le calcul du score (B1)
Extraire `computeQualiopiScore` dans `src/lib/services/qualiopi-score.ts` avec **une seule** implémentation qui prend un `Session` enrichi (avec optionnellement les `responseCounts` déjà chargés). Le composant et la liste appellent la même fonction, avec une signature comme :
```ts
computeQualiopiScore(formation, options?: { responseCounts?: Record<string, {total, done}> })
```
Quand les `responseCounts` sont absents, fallback sur "+0.5 si assigned" (logique liste).

### Piste B — Sécuriser load-session-aggregates (B2)
Ajouter `entity_id` aux queries `enrollments`/`signatures`. Récupérer l'entity_id de la session une fois en début de fonction, le réutiliser dans tous les `.eq("entity_id", ...)`.

### Piste C — Typer `qualiopi_score` (B3)
Ajouter `qualiopi_score?: number | null` à l'interface `Session` (`src/lib/types/`). Supprimer le cast `as unknown as`. Audit transverse : chercher tous les `as unknown as` dans le module Qualiopi et corriger.

### Piste D — Factoriser le mapping `status` → flags (B4)
Créer `src/lib/utils/document-status.ts` exportant `mapStatusToFlags(status: string) → { is_signed, is_sent, is_confirmed }`. `getDocsForSession` et `qualiopi-mock-audit` l'utilisent toutes les deux.

### Piste E — Persistance + manual checks robustes (M1, M2)
- Wrapper l'update `qualiopi_score` dans un `try/await/catch + toast` (le silencer n'est pas une option).
- Créer une vraie colonne `sessions.qualiopi_manual JSONB DEFAULT '{}'` via migration. Migrer les `notes` JSON existants. Retirer le code de sérialisation/désérialisation dans `notes`.

### Piste F — UX et perf (M3, M4)
- Remplacer `window.location.href` par `router.replace(...)` (Next.js navigation).
- Batcher les counts via une seule query agrégée (RPC Supabase ou `select` avec `group by questionnaire_id`) au lieu de N requêtes séquentielles.

### Piste G — Décider du sort de `qualiopi_snapshots` (M5)
Deux choix :
- **Construire** : un cron quotidien qui insert une snapshot par session active (utile pour graphiques d'évolution + audit défense).
- **Dropper** : DROP TABLE, retrait des références.
Le brief utilisateur tranchera.

### Piste H — Brancher `qualiopi-check-proof` à l'UI (M6)
Sur le tab « Documents » de la fiche formation, ajouter un bouton « 🤖 Vérifier la conformité IA » par document. Modal qui upload le fichier + sélectionne le critère + affiche le résultat. Stocker dans `qualiopi_proof_checks`. Afficher l'historique dans une section dédiée de TabQualiopi.

### Piste I — Tests (D6)
- Tests unitaires sur la nouvelle `computeQualiopiScore` unifiée
- Tests unitaires sur `loadQualiopiIndicators` (avec mocks Supabase)
- Tests d'intégration sur les routes IA (mock Claude, vérifier la persistance)

### Piste J — Documentation UX (B observations)
- Ajouter un tooltip par item de la checklist : « Critère Qualiopi 2.5 — indicateur 7 »
- Lien vers la page Suivi Qualité depuis l'onglet, et inversement
- Vue "audit complet" accessible depuis le bloc audit (pas seulement les 3 premiers findings)

---

## 7. Liste finale (priorisée) à valider avec Wissam

**Quick wins** (1 PR, < 1 j de dev) :
- Piste B (entity_id filter)
- Piste C (qualiopi_score typé)
- Piste E1 (try/catch sur update score)
- Piste F1 (router.replace au lieu de window.location)

**Chantier de fond** (1 PR, 2–3 j) :
- Piste A (unifier le score) + Piste I (tests)

**Décision produit requise** :
- Piste G (qualiopi_snapshots : construire ou dropper ?)
- Piste H (brancher vérif de preuves à l'UI ?)

**Bonus si temps** :
- Piste D (factoriser status → flags)
- Piste E2 (vraie colonne `qualiopi_manual` JSONB + migration)
- Piste F2 (batcher les counts)
- Piste J (UX/docs)

---

## 8. Annexes — Patterns de code à reproduire / éviter

### À reproduire ✓
- **Auth + rate-limit** sur les routes IA — modèle propre à étendre.
- **RLS strict** sur les 3 tables Qualiopi.
- **`quality_scores` pré-calculée** + fallback live dans la page Suivi Qualité — bon pattern de robustesse.

### À éviter ✗
- Stocker du JSON sérialisé dans un champ texte général (`sessions.notes`).
- Cast `as unknown as { ... }` au lieu d'enrichir l'interface.
- `window.location.href = ...` dans un composant React/Next.js.
- Update Supabase fire-and-forget (sans `await`, sans `.catch`).
- Logique métier dupliquée entre composant et utilitaire « pour les listes ».

---

**Fin du deep-dive.** Préparation du plan d'action à valider avec Wissam après revue de ce document.
