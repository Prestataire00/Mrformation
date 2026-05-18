---
storyId: H17
storyKey: h-17-acces-commerciaux-crm
epic: H
title: Accès commerciaux au CRM — déblocage rôle `commercial` (RLS + API + sidebar)
status: ready-for-dev
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

- [ ] **Task 1 — Audit complet routes API CRM** (AC-2)
  - [ ] `grep -rn '"admin"\|"super_admin"' src/app/api/crm/ --include="*.ts"` → lister tous les checks de rôle
  - [ ] `grep -rn 'requireRole' src/app/api/crm/ --include="*.ts"` → lister tous les `requireRole(["admin"...])`
  - [ ] Produire la liste exhaustive des routes à patcher dans le commit message
- [ ] **Task 2 — Migration RLS `add_commercial_role_to_crm_rls.sql`** (AC-1, AC-5)
  - [ ] Créer le fichier `supabase/migrations/add_commercial_role_to_crm_rls.sql`
  - [ ] Pour chaque table CRM core (9 tables listées AC-1), `DROP POLICY IF EXISTS <name>_admin_all ON <table>; CREATE POLICY <name>_admin_commercial_all ON <table> FOR ALL TO authenticated USING (auth.user_role() IN ('admin', 'commercial') AND entity_id = auth.user_entity_id()) WITH CHECK (...)`
  - [ ] Renommer le suffixe `_admin_all` → `_admin_commercial_all` ou conserver `_admin_all` (au choix DEV, justifier dans le commit)
  - [ ] Vérifier idempotence : run 2× le fichier → 0 erreur
  - [ ] **NE PAS toucher** les policies `crm-access.sql` (sales reps trainers, scope différent)
  - [ ] **NE PAS exécuter en prod automatiquement** : laisser Wissam exécuter via Supabase Dashboard (cf workflow projet : migrations exécutées manuellement)
- [ ] **Task 3 — Patcher les routes API CRM** (AC-2)
  - [ ] Pour chaque route identifiée en Task 1, étendre le tableau de rôles pour inclure `"commercial"`
  - [ ] Si le check est `if (!["admin","super_admin"].includes(profile.role) && !profile.has_crm_access)` → remplacer par `if (!["admin","super_admin","commercial"].includes(profile.role) && !profile.has_crm_access)`
  - [ ] Si possible, extraire le check dans un helper `isCrmAuthorized(profile: Profile): boolean` dans `src/lib/auth/permissions.ts` (DRY, +20 LOC partagées au lieu de 5×4 LOC dupliqués)
  - [ ] Lancer `npx tsc --noEmit`
- [ ] **Task 4 — Nettoyer sidebar commercial** (AC-3)
  - [ ] Dans `src/components/layout/Sidebar.tsx` section `commercialNavSections` (lignes ~212-258), retirer :
    - L'item "Clients & Financeurs" complet (les 2 enfants pointent vers `/admin/clients/*` bloqué)
    - L'item "Formations" sous Pédagogie (pointe vers `/admin/trainings` bloqué)
    - L'item "Planning" sous Pédagogie (pointe vers `/admin/planning` bloqué)
    - La section "Pédagogie" entière puisqu'elle devient vide
  - [ ] Conserver : Tableau de Bord + section Commercial avec ses 8 liens CRM
- [ ] **Task 5 — Validation manuelle locale + smoke API** (AC-2, AC-3, AC-4)
  - [ ] Créer un profil commercial test en local (`UPDATE profiles SET role='commercial' WHERE email='test@local'`)
  - [ ] Se connecter, vérifier sidebar (AC-3 OK)
  - [ ] Naviguer sur les 8 liens CRM → tous en 200 (AC-3 OK)
  - [ ] Visiter `/admin/crm` → données réelles affichées (AC-4 OK)
  - [ ] Vérifier qu'un admin existant garde son menu admin complet inchangé (AC-5)
- [ ] **Task 6 — Mettre à jour les status existants désynchronisés** (post-fix qualité, hors AC)
  - [ ] `sprint-status.yaml` : marquer h-9, h-10, h-11, h-12, h-13, h-14, h-15, h-16 comme `done` (mergés sur main mais statuts encore `backlog`)
  - [ ] Mettre `epic-h: in-progress`
  - [ ] Ajouter `h-17-acces-commerciaux-crm: ready-for-dev`
- [ ] **Task 7 — Commit + push + suivi**
  - [ ] Commit avec convention Epic H : `fix(crm): h-17 acces commerciaux au CRM (RLS + API + sidebar) (Epic H)`
  - [ ] Demander à Wissam d'exécuter la migration SQL dans Supabase Dashboard avant que le déploiement Netlify ne change le frontend (sinon les commerciaux verront un menu OK mais resteront bloqués par RLS)

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

(à renseigner par le dev — ex: `claude-opus-4-7[1m]`)

### Debug Log References

(à renseigner pendant l'implémentation)

### Completion Notes List

(à renseigner avant code-review)

### File List

(à renseigner avant code-review — liste exhaustive des fichiers modifiés/créés)

## 9. Questions ouvertes (à clarifier APRÈS lecture de cette story par Wissam)

1. **Option A vs B pour les checks API** (extension directe vs helper centralisé) — l'option B est techniquement plus propre mais demande 1 fichier supplémentaire. Préférence ?
2. **Naming policy** : `_admin_commercial_all` (descriptif mais long) vs garder `_admin_all` (cohérent avec existant mais trompeur) ?
3. **Scoping futur** : faut-il déjà prévoir une story h-18 "scoping fin commercial (assigned_to / created_by)" ou attendre que le client redemande ?
4. **Validation prod** : qui valide en prod après merge ? Wissam doit-il créer un compte commercial test pour smoke en prod, ou le client le fait ?
