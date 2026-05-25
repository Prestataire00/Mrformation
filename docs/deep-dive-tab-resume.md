# Deep-Dive — Onglet Résumé (TabResume)

> **Date** : 2026-05-25
> **Branche** : main (post-merge Qualiopi)
> **Cible** : `src/app/(dashboard)/admin/formations/[id]/_components/TabResume.tsx` et ses 12 sous-composants `sections/`
> **Méthode** : BMAD `document-project` — deep-dive exhaustif, lecture des composants critiques + audit délégué pour les gros sous-composants.

---

## 1. Vue d'ensemble

L'onglet **Résumé** est le 1ᵉʳ tab (et l'écran par défaut) de la fiche formation détaillée (`/admin/formations/[id]?tab=overview`). C'est la **page la plus utilisée** du module Formation — point d'entrée pour gérer **tout ce qui concerne la session** : manager, lieu, intervenants, apprenants, entreprises, financeurs, prix, heures, description, commentaires, visio, duplication, suppression.

Il **orchestre 12 sous-composants** en 2 colonnes (2/3 + 1/3) :

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Badge INTRA/INTER  ·  ResumeActions (Commencer / Dupliquer / Historique) │
├─────────────────────────────────────────┬───────────────────────────────┤
│  COLONNE GAUCHE (2/3)                   │  COLONNE DROITE (1/3)         │
│                                          │                                │
│  Card "Intervenants"                     │  Card "Lieu & modalités"      │
│  ├─ ResumeManager                        │  ├─ ResumeLocation            │
│  └─ ResumeTrainers                       │  └─ ResumeVisioLink (cond.)   │
│                                          │                                │
│  Card "Participants"                     │  Card "Infos formation"       │
│  ├─ ResumeCompanies                      │  └─ ResumePriceHours          │
│  └─ ResumeLearners                       │                                │
│                                          │  Card "Actions"               │
│  ResumeFinanciers                        │  └─ ResumeDangerZone          │
│  ResumeDescription                       │                                │
│  ResumeComments                          │                                │
└─────────────────────────────────────────┴───────────────────────────────┘
```

**État synthétique : fonctionnel à ~75 %.** 1 bug critique de sécurité multi-tenant, 1 bug critique d'intégrité données (cascade delete redondante), 2 stubs UI, ~10 bugs majeurs (entity_id manquants sur updates, fire-and-forget onRefresh, casts `as unknown as`), de la dette structurelle (zéro test sur les composants, états locaux non re-syncs).

---

## 2. Architecture

### 2.1 Fichiers concernés

| Fichier | LOC | Rôle |
|---|---|---|
| [TabResume.tsx](src/app/(dashboard)/admin/formations/[id]/_components/TabResume.tsx) | 145 | Orchestrateur, layout 2/3 + 1/3 |
| [sections/ResumeActions.tsx](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeActions.tsx) | 121 | Boutons Commencer / Dupliquer / Historique |
| [sections/ResumeManager.tsx](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeManager.tsx) | 74 | Dropdown manager admin |
| [sections/ResumeLocation.tsx](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeLocation.tsx) | 105 | Édition mode + adresse |
| [sections/ResumeTrainers.tsx](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeTrainers.tsx) | 408 | Intervenants + IA matching + heures réalisées |
| [sections/ResumeLearners.tsx](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeLearners.tsx) | 481 | Apprenants + INTRA/INTER + création inline + export CSV |
| [sections/ResumeCompanies.tsx](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeCompanies.tsx) | 393 | Entreprises + auto-calc prix + auto-enroll learners |
| [sections/ResumeFinanciers.tsx](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeFinanciers.tsx) | 417 | OPCO + state machine 6 statuts + accord partiel |
| [sections/ResumePriceHours.tsx](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumePriceHours.tsx) | 485 | Prix + heures + cascade → factures pending |
| [sections/ResumeDescription.tsx](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeDescription.tsx) | 71 | Édition description textarea |
| [sections/ResumeComments.tsx](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeComments.tsx) | 99 | Commentaires internes (add/delete) |
| [sections/ResumeVisioLink.tsx](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeVisioLink.tsx) | 67 | Lien visio + bouton "Envoyer" stub |
| [sections/ResumeDangerZone.tsx](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeDangerZone.tsx) | 76 | Suppression cascade manuelle |
| **Sous-total composants** | **2 942** | |
| [services/formation-companies.ts](src/lib/services/formation-companies.ts) | 151 | addCompanyToSession + sync total_price + cleanup docs |
| [services/enrollments.ts](src/lib/services/enrollments.ts) | 132 | enrollLearner + createLearnerAndEnroll + removeEnrollment |
| [services/invoices.ts](src/lib/services/invoices.ts) | 142 | cascadeSessionPriceToPendingInvoices |
| [services/sessions.ts](src/lib/services/sessions.ts) | 172 | getSessionIdsByClient + helpers |
| [utils/formation-companies.ts](src/lib/utils/formation-companies.ts) | 153 | getFormationKind + isIntraFormation + getLearnersForCompany |
| [utils/hours-source.ts](src/lib/utils/hours-source.ts) | 42 | resolveDisplayedHours (override/computed/legacy) |

### 2.2 Tables Supabase impliquées

| Table | Colonne `entity_id` | RLS | Usage |
|---|---|---|---|
| `sessions` | ✓ | (allow_all en prod ⚠) | Lecture/UPDATE par tous les sous-composants |
| `profiles` | ✓ | filtrée | Lecture des admins pour dropdown Manager |
| `trainers` | ✓ | filtrée | Lecture pour ajout intervenant |
| `learners` | ✓ | filtrée | Lecture pour ajout apprenant |
| `clients` | ✓ | filtrée | Lecture pour ajout entreprise |
| `contacts` | ✓ | filtrée | Lecture pour auto-fill email entreprise |
| `financeurs` | ✓ | filtrée | Lecture pour ajout financeur |
| `formation_trainers` | ❌ (FK session_id CASCADE) | via session | INSERT / DELETE |
| `formation_companies` | ❌ (FK session_id CASCADE) | via session | INSERT / DELETE + UPDATE amount |
| `formation_financiers` | ❌ (FK session_id CASCADE) | via session | INSERT / UPDATE statut / DELETE |
| `formation_comments` | ❌ (FK session_id CASCADE) | via session | INSERT / DELETE |
| `formation_time_slots` | ❌ (FK session_id CASCADE) | via session | DELETE (DangerZone) |
| `enrollments` | ❌ (FK session_id CASCADE) | via session | INSERT (via service) / DELETE |
| `formation_invoices` | ✓ | filtrée | UPDATE via cascadeSessionPriceToPendingInvoices |
| `formation_invoice_lines` | ❌ (FK invoice_id) | transitive | DELETE/INSERT via cascade |
| `documents` | ✓ | filtrée | DELETE cleanup orphelins (removeCompanyFromSession) |

### 2.3 Routes API

**TabResume n'appelle pas directement de route API** (tout passe par Supabase client). 2 exceptions :
- `POST /api/ai/match-trainer` (ResumeTrainers) — suggestion IA intervenant
- `POST /api/learners/{id}/send-welcome` (ResumeLearners) — bulk email bienvenue

---

## 3. Comment ça marche aujourd'hui

### 3.1 Chargement

[page.tsx](src/app/(dashboard)/admin/formations/[id]/page.tsx) (~479 LOC) charge en parallèle :
1. La session avec ~14 relations (training, manager, formation_trainers, enrollments, formation_companies, formation_financiers, formation_comments, formation_time_slots, formation_absences, formation_documents, signatures, formation_evaluation_assignments, formation_satisfaction_assignments, formation_elearning_assignments)
2. Les documents unifiés via `getDocsForSession(supabase, formationId)` (table `documents`)
3. Injecte les docs sous le nom `formation_convention_documents` (alias historique)

Puis rend `<TabResume formation={formation} onRefresh={fetchFormation} />`. La prop `formation` est massive (~96 champs).

### 3.2 Édition d'un champ simple (Description, Location, VisioLink)

Pattern : state local (`useState` init depuis prop) → bouton Modifier → Textarea/Input → bouton Enregistrer → `supabase.from("sessions").update({...}).eq("id", formation.id)` → toast + `onRefresh()`.

⚠️ **3 problèmes systémiques** sur ce pattern :
1. `setEditing(false)` est appelé après l'update, mais le state local (`description`, `mode/location`) n'est **jamais re-init** depuis la prop → si user clique "Annuler" puis re-ouvre l'édition, le draft persiste.
2. `onRefresh()` est appelé **sans `await`** → race condition, le composant peut se re-render avant que la donnée soit rechargée.
3. **`entity_id` manquant** sur l'`.update()` (sauf `ResumeVisioLink` qui le fait correctement). Viole la règle CLAUDE.md.

### 3.3 Gestion des relations multiples (Trainers, Learners, Companies, Financiers)

Pattern : 
1. **Liste** : itère sur `formation.formation_xxx` (depuis la prop pré-chargée) — pas de re-fetch local
2. **Ajout** : dialog avec dropdown + auto-fill (prix suggéré, email primary contact, etc.) → INSERT direct ou via service → toast + `onRefresh()`
3. **Suppression** : confirm dialog → DELETE via service → toast + `await onRefresh()`

**Services utilisés** :
- `enrollLearner`, `createLearnerAndEnroll`, `removeEnrollment` (`enrollments.ts`)
- `addCompanyToSession`, `removeCompanyFromSession`, `syncSessionTotalPrice` (`formation-companies.ts`)
- `cascadeSessionPriceToPendingInvoices` (`invoices.ts`)

**Inline** (pas de service) : `formation_trainers` INSERT/DELETE, `formation_financiers` INSERT/UPDATE/DELETE, `formation_comments` INSERT/DELETE. Pourquoi ces 3 sont inline et pas les autres : héritage historique, pas de raison structurelle.

### 3.4 Logique métier notable

| Sous-composant | Story | Logique |
|---|---|---|
| ResumeLearners | **3.3 INTRA/INTER** | `getFormationKind()` détermine le type selon le nombre d'entreprises (0=unset, 1=intra, 2+=inter). Validation UI bloque l'inscription si entreprise manquante en INTER, auto-fill l'entreprise en INTRA |
| ResumeCompanies | **Auto-fill** | À l'ajout, suggère un montant (somme individual_price, ou répartition total_price) et un email (automation_contact > primary contact > client.email). Auto-inscrit les learners rattachés à l'entreprise. |
| ResumeCompanies | **Réconciliation** | `computeAmountsReconciliation()` compare somme des amounts entreprises vs total_price session. Badge OK / Reste à attribuer / Dépassement |
| ResumeFinanciers | **State machine OPCO** | 6 états : `a_deposer` → `deposee` → `en_cours` → `acceptee`/`partielle`/`refusee`. Chaque transition met à jour dates et montants. Accord partiel détecté auto si `amount_granted < amount` |
| ResumeTrainers | **IA matching** | Bouton "Suggérer (IA)" → POST `/api/ai/match-trainer` → suggestions scorées avec `score`, `reasons_match`, `gaps`. Affiche les 3 meilleurs. |
| ResumeTrainers | **Heures réalisées** | `getTrainerStats()` réconcilie `signatures` (émargement trainer) avec `formation_time_slots` pour calculer heures réelles vs planifiées (badge progress %) |
| ResumePriceHours | **2.1 Source prix** | `getPriceSource()` retourne `catalogue`/`modified`/`custom` — badge couleur |
| ResumePriceHours | **2.2 Cascade prix** | Si prix change (`Math.abs(delta) > 0.01`), appelle `cascadeSessionPriceToPendingInvoices` qui rebuild les lignes des factures `pending` company. Bloque les factures `sent/paid/late`. |
| ResumePriceHours | **2.3 Heures résolues** | `resolveDisplayedHours()` retourne `{ value, source }` — priorité override > computed (somme time_slots) > legacy (session.planned_hours) |
| ResumeActions | **Duplication** | INSERT new session avec ~14 champs copiés (training_id, dates, mode, location, type, prix, etc.). Status → `upcoming`. Redirige vers la nouvelle. |
| ResumeDangerZone | **Suppression** | Boucle DELETE sur 6 sub-tables puis DELETE session — voir §4.2 Bug B2 |

### 3.5 Persistance — patterns d'écriture

3 patterns coexistent :

**A. UPDATE inline avec `.eq("id", id).eq("entity_id", ...)`** (bon pattern) :
- `ResumeVisioLink` ✓
- `ResumeActions.handleStart` ✓
- `ResumeDangerZone.handleDelete` (sur sessions seulement) ✓

**B. UPDATE inline avec UNIQUEMENT `.eq("id", id)`** (mauvais — viole CLAUDE.md) :
- `ResumeDescription.handleSave`
- `ResumeManager.handleSave`
- `ResumeLocation.handleSave`
- `ResumeActions.handleDuplicate` (sur INSERT — moins critique)
- Toutes les transitions de statut `ResumeFinanciers` (5 handlers : handleMarkDeposee, handleMarkEnCours, handleAccordSubmit, handleRefusSubmit, etc.)

**C. UPDATE via service** :
- `ResumePriceHours.handleSave` → `updateSession` + `cascadeSessionPriceToPendingInvoices`

---

## 4. État des lieux — ce qui marche, ce qui ne marche pas

### 4.1 ✅ Ce qui fonctionne réellement

- **Layout 2/3 + 1/3 fluide** + responsive (lg breakpoint)
- **Badge INTRA/INTER auto-détecté** via `getFormationKind` (Story 3.3, bien implémenté)
- **Cascade prix → factures pending** (Story 2.2) — pattern propre via service avec rapport `{ impacted, blocked, skipped, errors }`
- **State machine OPCO** (6 statuts) avec transitions cohérentes et dates auto
- **Heures résolues** avec priorité override/computed/legacy (Story 2.3)
- **Auto-fill entreprise** : prix suggéré + email priorisé (automation_contact > primary > client.email)
- **Auto-enroll learners** lors de l'ajout d'une entreprise (compatible INTRA)
- **IA matching trainer** (`/api/ai/match-trainer`) — feature avancée
- **Export CSV apprenants** avec BOM UTF-8
- **Réconciliation montants** companies vs total_price (badge OK / Reste / Dépassement)
- **Cleanup docs orphelins** lors de `removeCompanyFromSession` (évite `[Nom client]` non résolu dans les PDFs déjà générés)
- **PriceHours** : best-effort patterns + try/catch + services — meilleur composant du lot

### 4.2 🔴 BUGS CRITIQUES

#### B1 — `ResumeCompanies` fetch les `contacts` sans `entity_id` filter
[ResumeCompanies.tsx:65-68](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeCompanies.tsx#L65-L68) :
```ts
const { data: contactsData } = await supabase
  .from("contacts")
  .select("id, email, first_name, last_name, is_primary")
  .eq("client_id", clientId);
  // ⚠️ MISSING: .eq("entity_id", formation.entity_id)
```

`contacts` **a une colonne entity_id** (cf schema). Sur un environnement RLS `allow_all` (constaté en prod selon la mémoire), un admin de l'entité A pourrait potentiellement voir les contacts d'un client présent dans une autre entité, si ce client est partagé par accident. Violation de la règle absolue CLAUDE.md.

#### B2 — `ResumeDangerZone` cascade delete redondante et risquée
[ResumeDangerZone.tsx:30-37](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeDangerZone.tsx#L30-L37) :
```ts
const tables = [
  "formation_time_slots", "formation_trainers", "formation_companies",
  "formation_financiers", "formation_comments", "enrollments",
];
for (const table of tables) {
  const { error } = await supabase.from(table).delete().eq("session_id", formation.id);
  if (error) throw new Error(`Erreur suppression ${table}: ${error.message}`);
}
const { error } = await supabase.from("sessions").delete().eq("id", formation.id).eq("entity_id", formation.entity_id);
```

**3 problèmes** :
1. **Redondance** : toutes les FKs `session_id` des 6 tables sont `ON DELETE CASCADE` (vérifié dans `add-formation-management.sql`). Si on `DELETE FROM sessions WHERE id=X`, **Postgres supprime automatiquement** les sub-tables. Faire la suppression à la main est inutile.
2. **Partial deletion possible** : si la table 4 (`formation_financiers`) échoue après que les tables 1-3 aient été supprimées (rare mais possible avec lock/timeout), **la session reste en BDD mais sans trainers/companies/etc.** — état corrompu. Pas de transaction wrap.
3. **Liste incomplète** : oublie `formation_documents`, `signatures`, `documents`, `qualiopi_snapshots`, `qualiopi_mock_audits`, `formation_evaluation_assignments`, `formation_satisfaction_assignments`, `formation_elearning_assignments`, `formation_absences`, `email_history`. Heureusement la CASCADE BDD couvre ces tables aussi — mais en faisant la suppression à la main, le code ne profite pas de cette robustesse.

**Fix** : remplacer la boucle par un simple `DELETE FROM sessions WHERE id=X AND entity_id=Y`. Postgres CASCADE fera le ménage atomiquement.

#### B3 — Casts `as unknown as { individual_price?: number }` dans ResumeLearners
[ResumeLearners.tsx:277-284](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeLearners.tsx#L277-L284) + idem [ResumeCompanies.tsx:82-84, 117-118](src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeCompanies.tsx) :
```ts
{(e as unknown as { individual_price?: number }).individual_price != null && (
  {((e as unknown as { individual_price: number }).individual_price).toLocaleString("fr-FR")} €
)}
```

Le type `Enrollment` n'inclut pas `individual_price`. Le composant lit ce champ via cast. Viole « jamais de `any` ». Indique un schéma BDD/type désaligné depuis l'ajout du individual pricing (migration `add_individual_pricing.sql`).

Idem pour `Client.email` lu via `(client as unknown as { email?: string }).email` dans ResumeCompanies — le champ existe en BDD mais pas dans l'interface TypeScript.

### 4.3 🟠 BUGS MAJEURS

| # | Constat | Fichier:ligne |
|---|---|---|
| M1 | UPDATE sessions sans entity_id filter (3 composants) | `ResumeDescription:28`, `ResumeManager:42`, `ResumeLocation:46` |
| M2 | `onRefresh()` fire-and-forget (sans `await`) dans 6+ handlers | `ResumeDescription:35`, `ResumeManager:48`, `ResumeLocation:53`, `ResumeTrainers:103`, `ResumeLearners:131,179,329`, `ResumeCompanies` |
| M3 | Bouton « Historique » = stub | `ResumeActions:97` |
| M4 | Bouton « Envoyer (visio par email) » = stub | `ResumeVisioLink:59` |
| M5 | Catch vide swallow errors POST bulk send-welcome | `ResumeLearners:325` (`} catch { /* skip */ }`) |
| M6 | INSERT `formation_comments` sans entity_id (la table n'en a pas — OK via session_id FK, mais inconsistent avec le pattern) | `ResumeComments:30-34` |
| M7 | Toast d'erreur **générique** sans `error.message` | `ResumeDescription:31`, `ResumeManager:45`, `ResumeLocation:49` (et autres) |
| M8 | Pas de validation URL visio (l'user peut taper n'importe quoi) | `ResumeVisioLink` |
| M9 | State local `mode/location/description` non re-syncs au "Annuler" | `ResumeLocation`, `ResumeDescription` |
| M10 | `ResumeFinanciers` update sans `.eq("session_id", formation.id)` (id unique mais inconsistent avec delete) | `ResumeFinanciers:147-149` |
| M11 | Logique calcul `getTrainerStats` (heures réalisées depuis signatures) inline dans le composant | `ResumeTrainers:46-68` |
| M12 | Pas de double-click protection sur "Commencer"/"Ajouter" (juste `disabled` cosmétique) | `ResumeActions.handleStart`, divers |

### 4.4 🟡 DETTE & WARNINGS

- **Zéro test unitaire** sur TabResume et ses sous-composants (juste les services et utils sont couverts).
- **Aucun formulaire** utilise React Hook Form + Zod — tous en state local + Supabase direct. Viole CLAUDE.md "Jamais de formulaire sans RHF + Zod".
- **Services `formation-companies.ts` et `invoices.ts`** n'ont aucune mention de `entity_id`. C'est OK *en pratique* (les sub-tables sont protégées via session_id FK) mais le **check préalable** `session.entity_id` (pattern adopté pour Qualiopi en Task 4) n'est pas appliqué.
- **`ResumeActions.handleDuplicate`** : catch sans message (juste `} catch { toast(...) }` — perd l'info de l'erreur)
- **3 patterns d'écriture** coexistent (avec entity_id, sans entity_id, via service). Manque de consistance.
- **`Set<string>` ou `Map` pour les `formation.formation_xxx`** : chaque ouverture du tab lit la prop massive (96 champs) sans memoization fine — re-render coûteux si parent re-fetch.
- **Liste de tables `ResumeDangerZone:30`** : hardcodée et incomplète, doit être maintenue à la main si nouvelles tables sub-session apparaissent (qualiopi_snapshots récent — pas ajouté).
- **Cleanup docs orphelins** dans `removeCompanyFromSession` (best-effort try/catch) — bonne intention mais sans validation que le DELETE a réussi.

### 4.5 🔵 OBSERVATIONS UX

- **`ResumeManager` n'a pas de bouton "Retirer le manager"** (il faut sélectionner un autre admin pour changer — pas évident)
- **`ResumeTrainers` "Suggérer IA"** : pas de spinner pendant le fetch, pas d'AbortController
- **`ResumeCompanies` : pas de re-ordonnancement** des entreprises (ordre = ordre d'ajout, immutable)
- **`ResumeComments` : pas d'édition** d'un commentaire existant (seulement add/delete)
- **`ResumePriceHours` : très bien fait** — autoadresse INTRA/INTER, suggestions, indicateurs source de prix. Le meilleur composant du lot, à prendre comme modèle.
- **`ResumeDangerZone` : pas de undo** post-suppression (la cascade BDD est définitive)
- **L'orchestrateur `TabResume`** : pas de loading state global, on attend que la prop `formation` arrive du parent (qui gère lui-même)

---

## 5. Cartographie des risques et priorité

| # | Sévérité | Risque | Effort | Bénéfice |
|---|---|---|---|---|
| B1 | 🔴 critique | Multi-tenant : contacts sans entity_id (fuite cross-tenant possible) | XS | Sécurité |
| B2 | 🔴 critique | Cascade delete redondante + partial deletion possible | S | Intégrité données |
| B3 | 🔴 critique | Casts `as unknown as` sur `individual_price` / `client.email` | S | TypeScript discipline, CLAUDE.md |
| M1 | 🟠 majeur | 3 composants update sans entity_id | XS | Défense en profondeur |
| M2 | 🟠 majeur | fire-and-forget onRefresh (6+ occurrences) | XS | Race conditions |
| M3 | 🟠 majeur | Bouton « Historique » stub | M | Feature ou retrait |
| M4 | 🟠 majeur | Bouton « Envoyer visio par email » stub | S | Feature ou retrait |
| M5 | 🟠 majeur | Catch vide POST send-welcome | XS | Visibilité erreurs |
| M7 | 🟠 majeur | Toasts génériques sans `error.message` | XS | Debug |
| M8 | 🟠 majeur | Pas de validation URL visio | S | Robustesse |
| M9 | 🟠 majeur | State local non re-sync au "Annuler" | S | UX |
| M11 | 🟠 majeur | Logique stats inline (calcul heures) | M | Testabilité |
| D1-D6 | 🟡 dette | Tests / RHF+Zod / consistance patterns / cleanup | M-L | Hygiène long-terme |

---

## 6. Pistes de chantier (à valider)

### Piste A — Sécurité & intégrité (les 3 critiques)
- **B1** : ajouter `.eq("entity_id", formation.entity_id)` au fetch contacts dans `ResumeCompanies`.
- **B2** : remplacer la boucle de 6 DELETE de `ResumeDangerZone` par un seul `DELETE FROM sessions WHERE id=X AND entity_id=Y`. Documenter dans le code que la CASCADE BDD couvre les sub-tables. Garder un test e2e qui vérifie qu'après suppression, `formation_trainers`, `formation_companies`, etc. ne contiennent plus de rows pour ce session_id.
- **B3** : ajouter `individual_price?: number | null` à l'interface `Enrollment` et `email?: string | null` à l'interface `Client` dans `src/lib/types/index.ts`. Audit transverse `grep -rn "as unknown as { individual_price\|as unknown as { email" src/`.

### Piste B — Persistance robuste (M1, M2, M7)
Helper service `updateSessionField(supabase, sessionId, entityId, patch)` qui :
- Filtre par `id` ET `entity_id`
- Renvoie `{ ok, error?: { message } }`
- Toast intégré ou laissé au caller au choix
- Remplace les 5+ updates inline qui violent CLAUDE.md

Toutes les `onRefresh()` → `await onRefresh()` (audit transverse `grep -n "onRefresh()" src/app/.../_components/sections/`).

### Piste C — Validation et UX
- **M8** : valider l'URL visio avec un schéma Zod `z.string().url().or(z.literal(""))` avant l'update.
- **M9** : `useEffect(() => setEditing(false), [formation.description])` pour reset le draft quand la prop change. Idem pour `ResumeLocation`.
- **M5** : remplacer `} catch { /* skip */ }` par un compteur d'erreurs visible dans le toast final ("3 emails envoyés, 1 échec").

### Piste D — Stubs (M3, M4)
- **M3 « Historique »** : trois options à trancher avec Wissam :
  - (a) Construire une vue d'historique des modifications (audit log) — gros chantier mais utile
  - (b) Rediriger vers une page existante (logs email, snapshots Qualiopi…) — non-obvious
  - (c) Retirer le bouton (clean) jusqu'à ce que la feature soit décidée
- **M4 « Envoyer visio par email »** : à brancher sur le système d'emails existant — pattern similaire au bulk send-welcome dans ResumeLearners. Effort S.

### Piste E — Refactor & testabilité
- **M11** : extraire `getTrainerStats` dans `src/lib/services/trainer-hours.ts` + tests.
- Extraire le pattern de duplication de `ResumeActions.handleDuplicate` dans `src/lib/services/sessions.ts:duplicateSession(supabase, sessionId, entityId)`.
- Inliner les patterns `formation_trainers/financiers/comments` dans un service unifié `formation-relations.ts` (cohérent avec `formation-companies.ts`).

### Piste F — Tests
- Tests unitaires sur la nouvelle lib `updateSessionField`
- Tests sur `duplicateSession` (verif tous les champs copiés)
- Tests sur `getTrainerStats` (heures réelles depuis signatures)
- Test e2e sur la suppression cascade BDD (1 session → cleanup automatique des sub-tables)

### Piste G — RHF + Zod (dette CLAUDE.md)
Tous les sous-composants éditeurs (Description, Location, VisioLink, Manager, Comments, etc.) actuellement en state local devraient passer en React Hook Form + Zod. C'est un **gros chantier** (12 composants) — à proposer comme dette de fond, pas dans ce premier sprint.

### Piste H — Helper "cancel reset" pour les éditeurs inline
Pattern réutilisable :
```ts
function useInlineEditor<T>(initial: T) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  useEffect(() => { if (!editing) setValue(initial); }, [initial, editing]);
  return { editing, setEditing, value, setValue };
}
```
À appliquer à Description, Location, VisioLink, Comments (drafts).

---

## 7. Liste finale priorisée (proposition pour le brainstorming)

**Quick wins** (1 PR, < 1 jour) :
- Piste A complète (B1 + B2 + B3) — les 3 critiques en 1 commit chacun
- Pistes B (M1, M2) — refacto persistance + audit transverse onRefresh
- Piste C M9 (re-sync drafts au cancel)

**Chantier intermédiaire** (1 PR, 1-2 jours) :
- Pistes D (M3 + M4) après décision produit
- Piste C M5 + M7 + M8 (UX/visibility)
- Piste E partiel (extraction getTrainerStats + duplicateSession)
- Piste F (tests des nouveaux helpers/services)

**Chantier de fond** (à proposer plus tard) :
- Piste G : refactor RHF + Zod sur les 12 sous-composants
- Piste H : helper `useInlineEditor` + propagation à tous les drafts

**Décisions produit requises** :
- Piste D-M3 « Historique » : construire / rediriger / retirer ?
- Piste D-M4 « Envoyer visio par email » : reuse pattern bulk send-welcome ?
- Pattern `formation-relations.ts` unifié : oui/non ?

---

## 8. Annexes — Patterns à reproduire / éviter

### ✅ À reproduire
- **`ResumeVisioLink`** : pattern UPDATE avec `.eq("id", id).eq("entity_id", entityId)` + try/catch + `error.message` dans toast + `await onRefresh()`. C'est le modèle.
- **`ResumePriceHours`** : services externalisés, cascade reportée avec `{ impacted, blocked, skipped, errors }`, suggestions auto, source de prix tracking. Excellent code.
- **`formation-companies.ts:syncSessionTotalPrice`** : best-effort avec `console.error`, ne bloque pas le flow appelant.
- **State machine OPCO** dans `ResumeFinanciers` : 6 statuts cohérents avec transitions explicites.

### ❌ À éviter
- UPDATE Supabase sans `.eq("entity_id", ...)` (cf B1, M1)
- Cascade delete à la main quand la BDD a déjà `ON DELETE CASCADE` (cf B2)
- Cast `as unknown as { field?: type }` au lieu d'enrichir l'interface (cf B3)
- `onRefresh()` sans `await` (cf M2)
- `} catch { /* skip */ }` (cf M5)
- Boutons "Fonctionnalité à venir" qui restent stub indéfiniment (cf M3, M4)
- State local non re-sync depuis prop quand le draft est annulé (cf M9)
- Toast d'erreur sans `error.message` (cf M7)

---

**Fin du deep-dive.** Préparation du plan d'action à valider avec Wissam.
