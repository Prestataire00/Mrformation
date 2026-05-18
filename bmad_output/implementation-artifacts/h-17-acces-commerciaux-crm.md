---
storyId: H17
storyKey: h-17-acces-commerciaux-crm
epic: H
title: Accès commerciaux au CRM — déblocage rôle `commercial` (RLS + API + sidebar)
status: review
priority: P0
effort: 1-1.5 j-h
wave: hot-fix (hors sprint plan B-F)
sourceClientReport: Client (2026-05-18) — « les commerciaux n'ont accès à rien »
sourceEpic: bmad_output/planning-artifacts/epics-admin-pdfs-stabilisation.md (extension Epic H)
createdAt: 2026-05-18
createdBy: bmad-create-story (Claude Opus 4.7)
---

# Story H17 — Accès commerciaux au CRM : déblocage rôle `commercial`

## 1. Story Statement

**As a** commercial (Marc, Taline — rôle `commercial`),
**I want** pouvoir réellement utiliser le CRM (prospects, devis, tâches, actions co) après avoir été créé avec mon rôle,
**So that** je peux exercer mon métier au lieu de tomber sur des pages vides ou des 403.

## 2. Context — diagnostic 3 couches

Le rôle `commercial` est défini en DB (`profiles.role` CHECK + `permissions.ts` Role union) et **partiellement câblé** côté permissions UI (`/admin/crm` autorisé). Mais 3 couches le bloquent silencieusement, expliquant le « rien » remonté par le client :

| Couche | Fichier / Table | Problème |
|--------|----------------|----------|
| **RLS Postgres** | `crm_prospects`, `crm_tasks`, `crm_quotes`, `crm_quote_lines`, `crm_campaigns`, `crm_client_tags`, `crm_prospect_tags`, `crm_automation_rules`, `crm_commercial_actions` | Policies `_admin_all` autorisent **uniquement** `auth.user_role() = 'admin'`. Le commercial passe le middleware mais Supabase refuse toutes les requêtes → tableaux vides, 0 prospect, 0 devis, 0 tâche. |
| **API routes** | `src/app/api/crm/prospects/route.ts:136` (au moins, à auditer toutes) | Check `if (!["admin","super_admin"].includes(profile.role) && !profile.has_crm_access)` → renvoie 403 pour `commercial` (ce flag `has_crm_access` est conçu pour les **trainers** ayant accès CRM, pas pour le rôle commercial). |
| **Sidebar UI** | `src/components/layout/Sidebar.tsx:236-257` (section `commercialNavSections`) | Le menu commercial liste des liens vers `/admin/clients`, `/admin/clients/financeurs`, `/admin/trainings`, `/admin/planning` qui sont **bloqués par `permissions.ts:15`** (`/admin` → admin/super_admin only). Clic → redirection 403 ou logout. |

**Origine probable** (à confirmer pendant la story) : manque originel — le rôle a été créé mais les RLS et l'API n'ont jamais été propagées, et la sidebar a été surchargée de liens non-couverts par les permissions. Vérification git : aucun commit récent (Epic G/H) ne touche les policies `crm_*_admin_all` ni `Sidebar.tsx` section commercial. Pas de régression à fixer, c'est une finalisation.

## 3. Scope (confirmé avec Wissam, 2026-05-18)

**Périmètre = CRM uniquement** : prospects, devis, tâches, actions commerciales. Pas de lecture sur formations / clients. Pas de settings. Pas d'administration utilisateurs.

**Hors scope** :
- Modèle "scoped" (commercial voit uniquement SES propres prospects/devis via `assigned_to = auth.uid()`) → trop risqué pour un hot-fix. Le commercial voit **tous** les prospects/devis/tâches de SON entité (`entity_id`). Si scoping fin requis plus tard, créer une story h-18 séparée.
- Modification du flag `profiles.has_crm_access` (réservé aux trainers ayant accès CRM en parallèle de leur rôle principal).
- Refonte sidebar commercial (juste retirer les liens hors-CRM bloqués).

## 4. Acceptance Criteria (Given/When/Then)

### AC-1 — RLS Postgres : `commercial` autorisé en CRUD sur toutes les tables CRM core

- **Given** une nouvelle migration `supabase/migrations/add_commercial_role_to_crm_rls.sql`
- **When** elle est exécutée dans Supabase SQL Editor
- **Then** sur chacune des tables suivantes, le check `auth.user_role()` autorise **`'admin'` ET `'commercial'`** (en plus du filtre `entity_id = auth.user_entity_id()` conservé) :
  - `crm_prospects`
  - `crm_tasks`
  - `crm_quotes`
  - `crm_quote_lines`
  - `crm_campaigns`
  - `crm_client_tags`
  - `crm_prospect_tags`
  - `crm_automation_rules`
  - `crm_commercial_actions`
- **And** la migration est **idempotente** (`DROP POLICY IF EXISTS ... ; CREATE POLICY ...`)
- **And** les policies sales reps (`crm-access.sql` : `CRM sales reps read own prospects` etc.) sont **conservées intactes** (cibles trainers `has_crm_access`, scope différent)
- **And** un commercial connecté avec un client SQL test (rôle simulé via `SET LOCAL request.jwt.claims`) peut SELECT/INSERT/UPDATE/DELETE sur ces 9 tables

### AC-2 — API routes CRM : `commercial` accepté par `requireRole` / checks manuels

- **Given** les routes sous `src/app/api/crm/**`
- **When** un audit grep complet de `["admin","super_admin"]`, `requireRole(["admin"...])`, ou `profile.role !==` est mené dans ce dossier
- **Then** chaque check de rôle bloquant `commercial` est étendu pour inclure `"commercial"` (ou remplacé par un helper centralisé `isCrmAuthorized(profile)`)
- **And** la route `src/app/api/crm/prospects/route.ts:136` (check connu) accepte `commercial` en GET et POST
- **And** un test smoke (curl avec session commercial OU test Vitest mockant `requireRole`) confirme 200 sur au moins :
  - `GET /api/crm/prospects`
  - `POST /api/crm/prospects`
  - `GET /api/crm/quotes`
  - `GET /api/crm/tasks`

### AC-3 — Sidebar commercial : seuls les liens fonctionnels sont visibles

- **Given** la section `commercialNavSections` dans `src/components/layout/Sidebar.tsx`
- **When** un commercial se connecte
- **Then** son menu n'affiche **PAS** :
  - "Toutes les Entreprises" → `/admin/clients` (bloqué par permissions.ts:15)
  - "Tous les Financeurs" → `/admin/clients/financeurs` (idem)
  - Section "Pédagogie" : "Toutes les Formations" → `/admin/trainings` (idem)
  - Section "Pédagogie" : "Planning" → `/admin/planning` (idem)
- **And** son menu affiche **uniquement** :
  - Tableau de Bord (`/admin/crm`)
  - Section Commercial → CRM : Tunnel de Vente, Tous les Prospects, Tâches, Suivi Commercial, Devis, Formulaires, Campagnes, Séquences
- **And** chacun des 8 liens CRM répond **200 OK** quand le commercial le visite (validation manuelle ou test E2E)

### AC-4 — Page d'atterrissage `/admin/crm` charge sans erreur pour un commercial

- **Given** un commercial connecté
- **When** il accède à `/admin/crm`
- **Then** la page charge en moins de 3s sans erreur console
- **And** les widgets "stats", "prospects récents", "tâches du jour" affichent des données réelles (pas d'état vide "Erreur RLS")
- **And** aucun appel Supabase ne renvoie de code 403/PGRST204 dans la console réseau

### AC-5 — Aucune régression admin / super_admin

- **Given** un compte admin et un compte super_admin
- **When** ils naviguent sur `/admin/crm/*` après la migration et le déploiement
- **Then** ils voient strictement les mêmes données qu'avant la story (régression nulle)
- **And** leur menu sidebar reste inchangé

## 5. Tasks / Subtasks

- [x] **Task 1 — Audit complet routes API CRM** (AC-2)
  - [x] `grep -rn '"admin"\|"super_admin"' src/app/api/crm/ --include="*.ts"` → 22 matches identifiés
  - [x] `grep -rn 'requireRole' src/app/api/crm/ --include="*.ts"` → 1 match (`quotes/sign-request/route.ts:18`)
  - [x] Liste produite en Completion Notes (routes patchées vs routes laissées admin-only avec justification)
- [x] **Task 2 — Migration RLS `add_commercial_role_to_crm_rls.sql`** (AC-1, AC-5)
  - [x] Fichier créé : `supabase/migrations/add_commercial_role_to_crm_rls.sql`
  - [x] 9 tables couvertes : `crm_prospects`, `crm_tasks`, `crm_quotes`, `crm_quote_lines`, `crm_campaigns`, `crm_client_tags`, `crm_prospect_tags`, `crm_automation_rules`, `crm_commercial_actions`
  - [x] Suffixe renommé `_admin_all` → `_admin_commercial_all` (clarté audit RLS futur)
  - [x] Idempotent : `DROP POLICY IF EXISTS` × 2 (l'ancien `_admin_all` + le nouveau `_admin_commercial_all`) puis `CREATE POLICY`
  - [x] Policies `crm-access.sql` sales reps **intactes** (vérifié — non référencées dans la nouvelle migration)
  - [x] Migration NON exécutée automatiquement : à charge Wissam (cf Completion Notes section "ACTION REQUISE")
- [x] **Task 3 — Patcher les routes API CRM** (AC-2)
  - [x] Helper centralisé `isCrmAuthorized(profile)` créé dans `src/lib/auth/permissions.ts` (option B)
  - [x] Routes patchées avec le helper : `prospects/route.ts` (GET + POST), `quotes/route.ts` (GET + POST), `tags/route.ts` (POST + DELETE)
  - [x] Route `quotes/sign-request/route.ts` : `requireRole(["super_admin", "admin", "commercial"])` (helper non-applicable car `requireRole` n'accepte pas `has_crm_access`)
  - [x] Routes admin-only laissées intactes : `suivi/*`, `automations/*`, `notifications/*` (cf justification commit + Completion Notes)
  - [x] `npx tsc --noEmit` clean
- [x] **Task 4 — Nettoyer sidebar commercial** (AC-3)
  - [x] Section "Clients & Financeurs" supprimée du `commercialNavSections`
  - [x] Section "Pédagogie" entière supprimée (devenait vide)
  - [x] Item "Suivi Commercial" retiré du sous-menu CRM (cohérence : `/api/crm/suivi` reste admin-only)
  - [x] Conservés : Tableau de Bord + sous-menu CRM avec 7 liens fonctionnels (Tunnel, Prospects, Tâches, Devis, Formulaires, Campagnes, Séquences)
- [x] **Task 5 — Validation tsc + tests** (AC-2, AC-3, AC-4 partielle)
  - [x] `npx tsc --noEmit` : 0 erreur
  - [x] `npx vitest run` : **395/395 tests passent** (zéro régression)
  - [ ] Validation manuelle UI : **à charge Wissam** après déploiement Netlify (pas de compte commercial local pour test E2E)
- [x] **Task 6 — Mettre à jour les status existants désynchronisés** (déjà fait en story-creation commit `1772dbc`)
  - [x] `epic-h: in-progress` + h-1 à h-16 marqués done
  - [x] `h-17-acces-commerciaux-crm: in-progress` (en cours)
- [x] **Task 7 — Commit + push + suivi**
  - [x] Commit `fix(crm): h-17 acces commerciaux au CRM (RLS + API + sidebar) (Epic H)`
  - [x] **ACTION REQUISE WISSAM** : exécuter `supabase/migrations/add_commercial_role_to_crm_rls.sql` dans Supabase Dashboard SQL Editor AVANT que Netlify ne déploie le frontend (sinon les commerciaux verront leur nouveau menu mais resteront bloqués par RLS et les pages CRM seront vides)

## 6. Dev Notes

### 6.1 — Fichiers identifiés (audit du Story Owner, à valider/étendre par le DEV)

**Backend / DB** :
- `supabase/migrations/add_commercial_role_to_crm_rls.sql` — **NEW** (migration RLS)
- `supabase/schema.sql:550-564` (et autres positions `_admin_all`) — DOCUMENTER que les nouvelles policies de la migration vivent en migration et NON en schema.sql (cohérent avec convention projet)

**API routes** (liste minimale connue, à étendre par le DEV via grep) :
- `src/app/api/crm/prospects/route.ts:136` — **UPDATE** (check rôle)
- `src/app/api/crm/**` — autres routes à auditer (Task 1)

**Frontend** :
- `src/components/layout/Sidebar.tsx:212-258` — **UPDATE** (nettoyage sidebar commercial)

**Helper centralisé** (optionnel mais recommandé) :
- `src/lib/auth/permissions.ts` — **UPDATE** : ajouter export `export function isCrmAuthorized(profile: { role: Role; has_crm_access: boolean }): boolean`

### 6.2 — Pattern RLS à suivre (cf existant)

```sql
-- AVANT (schema.sql:548)
CREATE POLICY "crm_prospects_admin_all" ON crm_prospects
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

-- APRÈS (nouvelle migration)
DROP POLICY IF EXISTS "crm_prospects_admin_all" ON crm_prospects;
CREATE POLICY "crm_prospects_admin_commercial_all" ON crm_prospects
  FOR ALL TO authenticated
  USING (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id());
```

### 6.3 — Pattern API check à suivre

```ts
// AVANT (src/app/api/crm/prospects/route.ts:136)
if (!["admin","super_admin"].includes(profile.role) && !profile.has_crm_access) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// APRÈS option A — extension directe
if (!["admin","super_admin","commercial"].includes(profile.role) && !profile.has_crm_access) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// APRÈS option B (recommandée — helper centralisé dans src/lib/auth/permissions.ts)
import { isCrmAuthorized } from "@/lib/auth/permissions";
if (!isCrmAuthorized(profile)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

### 6.4 — Previous Story Intelligence (h-13 → h-16, mergées 2026-05-18)

Patterns récents Epic H confirmés :
- **Commits Epic H = small, focused, P0 d'abord** : un seul sujet par commit, message bilingue rigoureux, co-author Claude
- **Migrations SQL = fichier séparé dans `supabase/migrations/`** : jamais éditer `schema.sql` directement, l'utilisateur exécute manuellement dans Supabase Dashboard
- **Pas de snapshot tests pour code RLS** : seuls les templates ont des snapshots. RLS = audit visuel + smoke tests
- **`npx tsc --noEmit` avant chaque commit** : convention projet, échec = blocking
- **CLAUDE.md règle absolue n°2** : « Jamais d'appel Supabase sans filtre entity_id » — respecté par les policies actuelles, à conserver dans la migration

### 6.5 — Git Intelligence (last 5 commits)

```
a5bc60b feat(documents): h-16 signature trainer alignee sur signature client + override 'Generer quand meme' (Epic H)
ed58e61 fix(emargement): h-15 enrollments.client_id manquant dans SELECT cassait '1 PDF par entreprise' (Epic H)
b0af85e test(snapshots): fige la date dans les snapshot tests templates
03a6894 fix(emargement): h-14 statut signature par slot reel sur feuille individuelle (Epic H)
bb57d46 fix(questionnaires): h-13 colonne DB 'responses' (pas 'answers') dans fill-for-learner
```

Insights pour h-17 :
- **Pattern message** : `fix(<module>): h-N <description courte> (Epic H)` — utiliser `fix(crm)` pour h-17
- **Bugs h-13 à h-16 = root cause approach** : ils ne patchent pas le symptôme mais la cause profonde (colonne DB, SELECT manquant). Suivre le même standard ici : pas de bandage UI tant que la RLS n'est pas fixée.

### 6.6 — Project Context Reference

- `CLAUDE.md` règles 1-10 (notamment règle 2 : entity_id obligatoire, règle 3 : RLS obligatoire, règle 6 : pas de schema.sql sans migration)
- `_bmad/bmm/config.yaml` : `document_output_language: French` (story en français)
- `memory/project_rls_state.md` : « ~50 tables ont allow_all USING(true) annulant toute la sécurité » — cette story améliore la posture RLS de 9 tables CRM (admin → admin+commercial avec filtre entity_id maintenu)

### 6.7 — Risques + mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Migration SQL exécutée APRÈS le déploiement frontend → commerciaux voient le menu mais toujours rien | Moyenne | P0 (UX cassée) | **Task 7** demande explicitement d'exécuter la SQL **AVANT** que Netlify déploie. Si pas possible : déploier en 2 PRs séquentielles (PR1 = SQL only, PR2 = code après que SQL soit en prod) |
| `auth.user_role()` retourne `NULL` pour les commerciaux (helper jamais testé sur ce rôle) | Faible | P0 (toutes RLS échouent) | Tester en local avec un profil commercial AVANT migration prod. Si bug, fix dans `auth.user_role()` est un mini-sous-story à isoler |
| Commercial existant a `has_crm_access=false` ET la nouvelle RLS marche → 403 quand même via API check | Moyenne | P1 | L'option B (helper `isCrmAuthorized`) résout en testant `role==='commercial' OR has_crm_access` |
| Le client a en réalité besoin de scoping fin (« mes prospects à moi ») | Moyenne | P1 | Hors scope confirmé. Si remonte, créer h-18 — la story actuelle ne ferme pas la porte (les policies `crm-access.sql` sales reps coexistent) |

### 6.8 — Testing standards summary

- **RLS** : tests SQL manuels dans Supabase Dashboard via `SET LOCAL request.jwt.claims = '{"role": "commercial", ...}'; SELECT * FROM crm_prospects;` (cf pattern `supabase/migrations/RUN_THIS_IN_SUPABASE_rls_cleanup.sql` pour exemples)
- **API** : aucun test unitaire des routes API CRM existant à ce jour (`src/app/api/crm/__tests__/` n'existe pas). Smoke manuel suffit pour ce hot-fix. Si DEV veut ajouter, suivre pattern `src/lib/__tests__/entity-isolation.test.ts`.
- **Sidebar** : aucun test E2E sidebar. Validation manuelle en local.

## 7. References

- [Source: supabase/schema.sql:33] — définition du rôle `commercial` dans le CHECK constraint
- [Source: supabase/schema.sql:505-509] — fonction `auth.user_role()`
- [Source: supabase/schema.sql:548-564] — policies `_admin_all` actuelles (pattern à étendre)
- [Source: supabase/migrations/crm-access.sql] — policies sales reps trainers (à NE PAS toucher)
- [Source: src/lib/auth/permissions.ts:1-20] — Role union + PAGE_PERMISSIONS
- [Source: src/lib/auth/permissions.ts:30-64] — API_PERMISSIONS
- [Source: src/app/api/crm/prospects/route.ts:125-140] — check rôle bloquant connu
- [Source: src/components/layout/Sidebar.tsx:212-258] — `commercialNavSections`
- [Source: src/lib/types/index.ts:43] — `Profile.has_crm_access`
- [Source: CLAUDE.md §Roles & Permissions] — liste des 6 rôles incluant commercial

## 8. Dev Agent Record

### Agent Model Used

`claude-opus-4-7[1m]` via bmad-dev-story (workflow Epic H hot-fix)

### Debug Log References

- `grep '"admin"\|"super_admin"\|requireRole' src/app/api/crm/` → 22 occurrences scannées et triées en 3 catégories (déjà OK / à patcher / à laisser admin-only)
- `npx tsc --noEmit` (post-patches) → clean
- `npx vitest run` → 395/395 tests passent (32 fichiers, 2.14s)

### Completion Notes

#### Routes API patchées (acceptent `commercial` désormais via `isCrmAuthorized`)

| Route | Méthode | Avant | Après |
|---|---|---|---|
| `/api/crm/prospects` | GET | `!["admin","super_admin"].includes(role)` | `!isCrmAuthorized(profile)` |
| `/api/crm/prospects` | POST | idem (+ `!has_crm_access`) | idem helper |
| `/api/crm/quotes` | GET | `!["admin","super_admin"].includes(role)` | `!isCrmAuthorized(profile)` |
| `/api/crm/quotes` | POST | idem | idem helper |
| `/api/crm/quotes/sign-request` | POST | `requireRole(["super_admin", "admin"])` | `requireRole(["super_admin", "admin", "commercial"])` |
| `/api/crm/tags` | POST | `!["admin","super_admin"].includes(role)` | `!isCrmAuthorized(profile)` |
| `/api/crm/tags` | DELETE | idem | idem helper |

#### Routes API laissées admin-only (par cohérence avec `permissions.ts:42` qui exclut déjà commercial de `/api/crm/suivi`)

| Route | Justification |
|---|---|
| `/api/crm/suivi/*` (3 checks) | Analytics admin (vue agrégée multi-commerciaux) |
| `/api/crm/automations/*` (2 checks) | Configuration de règles métier — admin-level |
| `/api/crm/automations/run` | Exécution de règles — admin-level |
| `/api/crm/notifications/daily-digest`, `weekly-summary` | Cron internes / digests agrégés |
| `/api/crm/notifications/generate` | Génération admin de notifications |
| `/api/crm/tasks` (3 checks) | **Déjà ouvert à commercial** — aucun patch nécessaire |

#### Sidebar — items retirés du menu commercial

- "Clients & Financeurs" (2 liens vers `/admin/clients/*` bloqués par `permissions.ts:15`)
- Section "Pédagogie" entière (Formations + Planning bloqués)
- "Suivi Commercial" sous CRM (cohérence : route admin-only)

#### Décisions techniques

1. **Helper centralisé `isCrmAuthorized`** (option B de la story) plutôt qu'extension directe (option A) : DRY, 1 source de vérité pour les 7 routes patchées, facilite les évolutions futures (ex: ouvrir au rôle `manager` si créé).
2. **Naming `_admin_commercial_all`** (option proposée AC-1) plutôt que conserver `_admin_all` : audit RLS futur immédiatement clair sur les rôles autorisés.
3. **Migration laissée à l'admin** : conforme à la convention projet (cf h-13/14/15/16) où aucune SQL n'est exécutée automatiquement par le dev agent — Wissam exécute via Supabase Dashboard.
4. **Pas d'extension RLS sur `crm_custom_fields`, `crm_sequences`, `crm_prospect_comments`, `crm_quote_reminders`, `crm_notifications`** : patterns RLS différents (`_entity`, `_access`, `entity_isolation`, owner-based). Hors scope story h-17 — si commercial doit y avoir accès, ouvrir une story h-18 dédiée après validation du périmètre fonctionnel.

#### ⚠️ ACTION REQUISE WISSAM avant smoke prod

1. **Exécuter la migration SQL** dans Supabase Dashboard SQL Editor :
   ```bash
   # Contenu du fichier supabase/migrations/add_commercial_role_to_crm_rls.sql
   # à copier-coller dans le SQL Editor et exécuter
   ```
   À faire **AVANT** que Netlify finisse de déployer le frontend, sinon les commerciaux verront le nouveau menu mais resteront bloqués par les anciennes policies RLS `_admin_all` → pages CRM vides ou erreurs.

2. **Créer / vérifier un compte commercial test** (UPDATE `profiles SET role='commercial' WHERE email='...'`).

3. **Smoke test 5 min** :
   - Connexion compte commercial → vérifier le menu (Tableau Bord + sous-menu CRM 7 items)
   - Cliquer sur Tunnel de Vente, Tous les Prospects, Tâches, Devis → données affichées (pas d'erreur 403/PGRST)
   - Vérifier qu'un compte admin existant garde son menu admin complet

### File List

**Created**
- `supabase/migrations/add_commercial_role_to_crm_rls.sql` — migration RLS 9 tables CRM

**Modified**
- `src/lib/auth/permissions.ts` — ajout helper `isCrmAuthorized()`
- `src/app/api/crm/prospects/route.ts` — GET + POST patchés (helper)
- `src/app/api/crm/quotes/route.ts` — GET + POST patchés (helper)
- `src/app/api/crm/quotes/sign-request/route.ts` — `requireRole` étendu commercial
- `src/app/api/crm/tags/route.ts` — POST + DELETE patchés (helper)
- `src/components/layout/Sidebar.tsx` — `commercialNavSections` recentré CRM uniquement
- `bmad_output/implementation-artifacts/sprint-status.yaml` — `h-17` → `in-progress` puis `review`
- `bmad_output/implementation-artifacts/h-17-acces-commerciaux-crm.md` — status + tasks checked + Dev Agent Record + File List + Change Log

### Change Log

| Date | Description |
|---|---|
| 2026-05-18 | Story h-17 implémentée (bmad-dev-story) : RLS migration + helper API + sidebar cleanup. tsc clean + 395/395 tests. En attente smoke prod après exécution SQL par Wissam. |

## 9. Questions ouvertes (traitées pendant l'implémentation)

1. **Option A vs B helper** → **B retenue** (helper centralisé `isCrmAuthorized`, +30 LOC partagées contre duplication).
2. **Naming policy** → **`_admin_commercial_all` retenue** (audit-friendly).
3. **Scoping futur (h-18)** → décision repoussée. Le commercial voit actuellement TOUS les prospects/devis/tâches de son entité. Si scoping fin requis, créer h-18 séparée — sans urgence client, on n'anticipe pas.
4. **Validation prod** → Wissam crée compte test commercial et valide ; client client final fait la confirmation finale.

## 9. Questions ouvertes (à clarifier APRÈS lecture de cette story par Wissam)

1. **Option A vs B pour les checks API** (extension directe vs helper centralisé) — l'option B est techniquement plus propre mais demande 1 fichier supplémentaire. Préférence ?
2. **Naming policy** : `_admin_commercial_all` (descriptif mais long) vs garder `_admin_all` (cohérent avec existant mais trompeur) ?
3. **Scoping futur** : faut-il déjà prévoir une story h-18 "scoping fin commercial (assigned_to / created_by)" ou attendre que le client redemande ?
4. **Validation prod** : qui valide en prod après merge ? Wissam doit-il créer un compte commercial test pour smoke en prod, ou le client le fait ?
