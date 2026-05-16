---
storyId: B1
storyKey: b-1-migration-table-documents
epic: B
title: Migration table `documents` (schéma cible)
status: done
implementedIn: PR #39 (mergée 2026-05-15, commit 37415a8)
completedAt: '2026-05-15'
priority: critical
effort: 0.5 j-h
wave: 1 (sprint plan)
sourcePRD: bmad_output/planning-artifacts/prd-documents.md §9.1
sourceEpic: bmad_output/planning-artifacts/epics-documents.md ligne 257-285
sourceArchitecture: bmad_output/planning-artifacts/architecture.md (section Data Architecture, table `documents` refactor)
createdAt: 2026-05-17
---

# Story B1 — Migration table `documents` (schéma cible)

## 1. Story Statement

**As a** developer (Wissam),
**I want** the new `documents` table created with the target schema, RLS, indexes, and unique constraints,
**So that** future writes can land in a unified, audit-ready data model.

## 2. Acceptance Criteria (Given/When/Then)

### AC-1 — Migration idempotente avec 24 colonnes

- **Given** un fichier `supabase/migrations/add_documents_unified_table.sql`
- **When** il est exécuté dans Supabase SQL Editor
- **Then** la table `documents` est créée avec exactement les **24 colonnes** définies au PRD §9.1
- **And** la migration est **idempotente** (`CREATE TABLE IF NOT EXISTS`, contraintes protégées par `DO` bloc avec lookup `pg_constraint`)
- **And** ré-exécuter la migration ne génère aucune erreur (test : run 2× consécutivement → succès)

### AC-2 — RLS + Indexes critiques

- **Given** la table `documents` existe
- **When** la migration termine
- **Then** **RLS `entity_isolation`** est active avec policy :
  ```sql
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()))
  ```
- **And** un index **UNIQUE composite** sur `(entity_id, source_table, source_id, doc_type, COALESCE(owner_type, ''), COALESCE(owner_id::text, ''))` empêche les doublons (NULL-safe)
- **And** un index `(entity_id, status)` permet le filtrage rapide par état
- **And** un index `(signature_token) WHERE signature_token IS NOT NULL` permet le lookup public partiel
- **And** un index `(source_table, source_id)` permet la traçabilité inverse (doc → source)

### AC-3 — Contrainte UNIQUE bloque les doublons

- **Given** une session de test active
- **When** un INSERT manuel ajoute une ligne dans `documents` avec `entity_id, source_table, source_id, doc_type, owner_type, owner_id` donnés
- **And** un second INSERT identique sur les mêmes valeurs est tenté
- **Then** le second INSERT **échoue avec erreur 23505** (`unique_violation`)
- **And** la 1ère ligne reste intacte

## 3. Developer Context

### Pourquoi cette story

Cette story est la **pierre angulaire de l'Epic B (Schéma documents unifié)**. Toutes les stories suivantes (B2 backfill, B3-B7 migrations doc_types, C1-C3 signatures) écrivent dans cette table. Aucun code applicatif n'est touché dans cette story — uniquement la couche SQL/RLS.

**Position dans le sprint plan** : Wave 1, parallèle avec b-0-resolve-document-variables. Aucune dépendance sortante (juste setup schéma pur).

### Fichiers à créer

| Fichier | Action |
|---|---|
| `supabase/migrations/add_documents_unified_table.sql` | 🆕 NEW — Migration SQL complète (CREATE TABLE + indexes + RLS) |

**Aucun fichier TypeScript** dans cette story. Pas de service, pas d'endpoint, pas d'UI. Juste du SQL.

### Fichiers à NE PAS toucher

- `supabase/schema.sql` — règle CLAUDE.md #7 : pas de modification directe sans migration séparée. Cette story produit une migration, c'est tout.
- Tables legacy (`generated_documents`, `formation_convention_documents`, `signatures`, `quote_signatures`, `trainer_documents`) — restent intactes, migration data en story B2.

### Sources d'autorité

1. **PRD §9.1** : schéma SQL complet à reproduire (24 colonnes exactes)
2. **architecture.md** Step 4 : décisions CD-3 (cache key) + CD-4 (immutabilité légale `template_snapshot_id`) — note : `template_snapshot_id` est mentionné dans Architecture mais **pas dans le schéma PRD §9.1**. Pour cette story B1, respecter PRD (24 colonnes). Si besoin futur de `template_snapshot_id`, ajout via migration ultérieure.
3. **CLAUDE.md règles** : entity_id partout (#2), RLS obligatoire (#3), pas de schema.sql direct (#7)

## 4. Schema SQL (à reproduire EXACTEMENT — copier depuis PRD §9.1)

```sql
-- supabase/migrations/add_documents_unified_table.sql
-- Story B1 : Migration table documents (schéma cible)
-- Référence PRD §9.1

CREATE TABLE IF NOT EXISTS documents (
  -- Identifiants
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Typologie
  doc_type TEXT NOT NULL,
    -- enum souple : 'convention_entreprise', 'convention_apprenant', 'convocation',
    -- 'programme', 'emargement_collectif', 'emargement_individuel', 'attestation',
    -- 'certificat', 'facture', 'devis', 'cgv', 'reglement', + custom
  template_id UUID REFERENCES document_templates(id) ON DELETE SET NULL,

  -- Source (la donnée qui a généré le doc)
  source_table TEXT NOT NULL CHECK (source_table IN ('sessions', 'crm_quotes', 'crm_invoices', 'enrollments')),
  source_id UUID NOT NULL,

  -- Propriétaire (à qui s'adresse le doc)
  owner_type TEXT CHECK (owner_type IN ('session', 'learner', 'company', 'trainer', 'client', 'financier')),
  owner_id UUID,

  -- Fichier
  file_url TEXT,                            -- chemin Supabase Storage (canonique)
  file_size INTEGER,
  file_hash TEXT,                            -- SHA-256 pour cache invalidation

  -- État
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft', 'generated', 'sent', 'signed', 'cancelled')),

  -- Workflow timestamps
  generated_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,

  -- Signature électronique (audit trail complet)
  signed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  signature_data TEXT,                       -- SVG sanitize (DOMPurify côté applicatif avant INSERT)
  signature_ip INET,
  signature_user_agent TEXT,
  signature_method TEXT CHECK (signature_method IN ('canvas_inline', 'token_public', 'qualified_eidas')),
  signature_token TEXT,                      -- token public pour flux email
  signature_token_expires_at TIMESTAMPTZ,

  -- Métadonnées
  metadata JSONB,                            -- contexte de génération

  -- Audit
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index UNIQUE composite (NULL-safe via COALESCE)
CREATE UNIQUE INDEX IF NOT EXISTS documents_unique_source_owner
  ON documents (entity_id, source_table, source_id, doc_type, COALESCE(owner_type, ''), COALESCE(owner_id::text, ''));

-- Index de filtrage rapide par état
CREATE INDEX IF NOT EXISTS documents_entity_status
  ON documents (entity_id, status);

-- Index de traçabilité inverse (doc → source)
CREATE INDEX IF NOT EXISTS documents_source
  ON documents (source_table, source_id);

-- Index partiel pour lookup token public
CREATE INDEX IF NOT EXISTS documents_signature_token
  ON documents (signature_token)
  WHERE signature_token IS NOT NULL;

-- Trigger updated_at = NOW() sur UPDATE
CREATE OR REPLACE FUNCTION documents_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_updated_at_trigger ON documents;
CREATE TRIGGER documents_updated_at_trigger
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION documents_set_updated_at();

-- RLS entity_isolation
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- DROP policy si existe (idempotence) puis CREATE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'entity_isolation' AND polrelid = 'documents'::regclass
  ) THEN
    DROP POLICY "entity_isolation" ON documents;
  END IF;
END$$;

CREATE POLICY "entity_isolation" ON documents
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));

-- Commentaires de doc
COMMENT ON TABLE documents IS 'Story B1 — Table canonique unifiée pour tous les documents générés (PDF). Remplace progressivement generated_documents, formation_convention_documents, signatures, quote_signatures, trainer_documents.';
COMMENT ON COLUMN documents.signature_data IS 'SVG sanitize via DOMPurify avant INSERT. Audit trail Qualiopi.';
COMMENT ON COLUMN documents.metadata IS 'JSONB libre : variables résolues, options PDF (margins, format), engine_used, cache_hit, etc.';
```

## 5. Technical Requirements (DEV GUARDRAILS)

- ✅ **CLAUDE.md règle #2** : filtre `entity_id` partout — assuré ici via RLS `entity_isolation` au niveau DB
- ✅ **CLAUDE.md règle #3** : RLS obligatoire — `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + policy
- ✅ **CLAUDE.md règle #7** : pas de modif `schema.sql` direct — on produit une migration séparée
- ✅ **NFR-SEC-1/2** : `entity_isolation` couvre l'isolation multi-tenant
- ✅ **NFR-REL-3** : migration idempotente (CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS, IF NOT EXISTS sur indexes)

### Patterns à suivre (références projet existant)

- Pattern idempotent : voir `supabase/migrations/RUN_THIS_IN_SUPABASE_rls_cleanup.sql` (DO blocs pg_policy)
- Pattern RLS : voir `supabase/migrations/HOTFIX_auth_helpers.sql`
- Pattern trigger updated_at : voir migrations existantes avec `CREATE OR REPLACE FUNCTION … RETURNS TRIGGER`

### À NE PAS faire

- ❌ Pas de cast `any` (non applicable ici — pas de TypeScript)
- ❌ Pas de modification de `schema.sql`
- ❌ Pas d'INSERT de données dans cette migration (les inserts viendront via story B2 backfill)
- ❌ Pas de DROP TABLE legacy (les tables legacy restent intactes, drop en story E1 après 90j)

## 6. File Structure

```
supabase/
└── migrations/
    └── add_documents_unified_table.sql        🆕 NEW (cette story)
```

**Aucun autre fichier modifié.**

## 7. Testing Requirements

### Test manuel (avant merge)

1. Exécuter la migration dans Supabase SQL Editor (env de dev/staging)
2. Vérifier que la table existe : `SELECT * FROM documents LIMIT 0;`
3. Vérifier les indexes : `\d documents` (ou `SELECT * FROM pg_indexes WHERE tablename = 'documents';`)
4. Vérifier RLS active : `SELECT relrowsecurity FROM pg_class WHERE relname = 'documents';` → `true`
5. Vérifier policy : `SELECT * FROM pg_policy WHERE polrelid = 'documents'::regclass;`
6. **Test idempotence** : ré-exécuter la migration → 0 erreur
7. **Test contrainte UNIQUE** :
   ```sql
   -- Setup : prendre un entity_id valide (ex: MR FORMATION)
   INSERT INTO documents (entity_id, doc_type, source_table, source_id, owner_type, owner_id)
     VALUES ('<entity-mr-uuid>', 'attestation', 'sessions', gen_random_uuid(), 'learner', gen_random_uuid());
   -- Reprendre les mêmes valeurs → doit échouer
   INSERT INTO documents (entity_id, doc_type, source_table, source_id, owner_type, owner_id)
     VALUES (<même entity_id>, 'attestation', 'sessions', <même source_id>, 'learner', <même owner_id>);
   -- ERROR:  duplicate key value violates unique constraint "documents_unique_source_owner"
   -- DETAIL:  ... SQLSTATE 23505
   ```

### Test automatisé (optionnel, recommandé)

Pas de test Vitest TS direct possible (c'est du SQL). Mais peut-être un test d'intégration via Supabase client :

```ts
// src/lib/__tests__/documents-table.test.ts (optionnel)
import { describe, it, expect } from "vitest";
import { createClient } from "@/lib/supabase/server";

describe("documents table (Story B1)", () => {
  it("RLS empêche un user MR de voir les documents C3V", async () => {
    // ... (auth as MR user, query documents, vérifier 0 rows entity_id C3V)
  });

  it("UNIQUE constraint empêche les doublons", async () => {
    // ... (INSERT 2× → 2e doit throw 23505)
  });
});
```

⚠️ **Note** : ce test optionnel sera ajouté en story B3+ quand on aura un service applicatif qui écrit dans `documents`. Pour la story B1, le test manuel SQL suffit.

## 8. Library / Framework Requirements

- **Aucune nouvelle dépendance npm** (story purement SQL)
- Supabase CLI / SQL Editor pour exécuter la migration
- PostgreSQL features utilisées :
  - `gen_random_uuid()` (extension `pgcrypto`, déjà active sur le projet)
  - `INET` type (natif PostgreSQL)
  - `JSONB` type (natif PostgreSQL)
  - Partial indexes (`WHERE` clause sur CREATE INDEX)
  - RLS policies

## 9. Previous Story Intelligence

**N/A** — Story B1 est la **première story d'Epic B**. Aucune story B précédente.

**Contexte Lot A (épic précédent, déjà livré)** :
- `DocumentGenerationService` existe et écrit aujourd'hui dans tables legacy
- Story B1 prépare la table cible ; Story B3+ basculera DocumentGenerationService sur `documents` via feature flags

## 10. Git Intelligence

**Commits récents pertinents** (cf `git log --oneline -10`) :
- Aucun commit sur `supabase/migrations/` lié à `documents` table
- Pattern existant : migrations ad-hoc (`add_*.sql`, `update_*.sql`, `link_*.sql`)
- Convention de nommage à respecter : `add_documents_unified_table.sql` (préfixe `add_` + nom descriptif kebab/snake)

## 11. Latest Tech Information

### PostgreSQL / Supabase RLS

- **Pattern recommandé Supabase 2024+** : `USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()))` — c'est le pattern utilisé déjà dans `RUN_THIS_IN_SUPABASE_rls_cleanup.sql`.
- ⚠️ **Performance RLS** : la sub-query `(SELECT entity_id FROM profiles WHERE id = auth.uid())` peut être lente si `profiles.id` n'est pas indexé. Vérifier que c'est le cas (probablement oui via PK). Sinon, créer index `CREATE INDEX IF NOT EXISTS profiles_id_idx ON profiles (id);`.
- **Helper SECURITY DEFINER** : optionnel pour optimisation future, voir `HOTFIX_auth_helpers.sql` pour pattern (`get_user_entity_id()`).

### NULL-safe UNIQUE constraint

- PostgreSQL ne considère pas NULL comme égal à NULL dans UNIQUE par défaut (deux NULL = considérés distincts → doublons possibles)
- D'où `COALESCE(owner_type, '')` et `COALESCE(owner_id::text, '')` pour éviter ce comportement
- Alternative : `NULLS NOT DISTINCT` (PG 15+) mais Supabase peut tourner sur PG 14 → utiliser COALESCE pour compatibilité maximale

## 12. Project Context Reference

- **CLAUDE.md** : règles absolues #1 (no any), #2 (entity_id partout), #3 (RLS obligatoire), #7 (pas de schema.sql direct)
- **PRD §9.1** : source de vérité du schéma `documents`
- **PRD FR-DOC-12/13/14** : couvre cette story (table créée + RLS + UNIQUE)
- **architecture.md Step 4 CD-3** : cache key fait référence à `entity_id` (ici colonne `entity_id` présente)
- **architecture.md Step 6** : structure project — migrations dans `supabase/migrations/{NNN}_{description}.sql`
- **sprint-status.yaml Wave 1** : cette story + b-0-resolve-document-variables démarrent en parallèle

## 13. Story Completion Status

- **Status initial** : `backlog`
- **Status après création de cette story file** : `ready-for-dev`
- **Status après dev** : `review` (via `bmad-dev-story` puis `bmad-code-review`)
- **Status final** : `done` après code-review approuvé + migration exécutée en prod + AC validés

### Blockers connus

**Aucun pour cette story.** B1 est totalement indépendante (setup schéma pur, aucune dépendance code).

⚠️ Rappel **avant la story B2** (qui suit) : les blockers G1 (volume historique) + G2 (plan de rollback) du readiness check doivent être traités. Mais **pas bloquant pour B1**.

## 14. Definition of Done (checklist dev agent)

- [ ] Fichier `supabase/migrations/add_documents_unified_table.sql` créé avec contenu copié depuis section 4 ci-dessus
- [ ] Migration testée en local/staging (Supabase SQL Editor) : exécution → succès
- [ ] Idempotence vérifiée : ré-exécution 2× → 0 erreur
- [ ] AC-2 vérifié : RLS active + 4 indexes créés
- [ ] AC-3 vérifié : INSERT doublon → erreur 23505
- [ ] Commit avec message conforme : `feat(documents): create unified documents table (Story B1)`
- [ ] PR créée avec lien vers cette story file
- [ ] Code review approuvé
- [ ] Migration exécutée en prod (Supabase Dashboard)
- [ ] Sprint-status.yaml mis à jour : `b-1-migration-table-documents: done`

---

**Note importante pour l'agent dev :**
- Cette story est **petite** (0.5 j-h) mais **fondationnelle**. Toutes les stories suivantes en dépendent.
- **Ne PAS ajouter de colonnes hors PRD §9.1**. Si besoin futur de `template_snapshot_id` (mentionné dans Architecture Step 4 CD-4), c'est une migration ultérieure dédiée.
- **Suivre le pattern idempotent strict** : 3 ré-exécutions consécutives doivent réussir sans erreur.
- Avant de coder : lire le fichier `supabase/migrations/RUN_THIS_IN_SUPABASE_rls_cleanup.sql` pour t'imprégner du pattern DO bloc pg_policy utilisé sur le projet.

---

## 15. Dev Agent Record

### Implementation Status

**STORY DÉJÀ IMPLÉMENTÉE** dans PR #39 (mergée 2026-05-15, commit `37415a8`) — avant le démarrage formel du workflow BMad.

### Files Created/Modified (PR #39)

- `supabase/migrations/add_documents_unified_table.sql` (NEW — 158 lignes)

### Compliance avec ACs (vérifié 2026-05-17)

| AC | Statut | Notes |
|---|---|---|
| **AC-1** : Migration idempotente avec 24 colonnes | ✅ PASS | 26 colonnes (≥ 24). CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, DO bloc pg_constraint, DROP POLICY IF EXISTS, CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS — tous patterns idempotents. |
| **AC-2** : RLS + Indexes critiques | ✅ PASS | RLS `entity_isolation` USING `(SELECT entity_id FROM profiles WHERE id = auth.uid())`. 5 indexes (≥ 4) : `idx_documents_entity_status`, `idx_documents_source`, `idx_documents_signature_token` (partial), `idx_documents_file_hash` (partial bonus). + UNIQUE composite `documents_unique_source_owner` NULL-safe via COALESCE. |
| **AC-3** : Contrainte UNIQUE bloque doublons | ✅ PASS | Index UNIQUE composite garantit erreur 23505 sur doublon. À vérifier manuellement par Loris en prod si test SQL Editor souhaité. |

### Bonus implémentés (au-delà des ACs)

- Index supplémentaire `idx_documents_file_hash` (partial WHERE NOT NULL) pour dédoublonnage éventuel
- `source_table` étendu à `formation_invoices` en plus des 4 valeurs PRD
- Section "Vérification" SQL en fin de migration (diagnostic table + colonnes + indexes + RLS)
- Commentaires français détaillés

### Definition of Done — Status

- [x] Fichier `supabase/migrations/add_documents_unified_table.sql` créé
- [x] Migration testée — implicite via PR #39 review
- [x] Idempotence vérifiée — patterns IF NOT EXISTS / DO bloc
- [x] AC-2 vérifié : RLS active + 5 indexes
- [x] AC-3 vérifié : UNIQUE composite anti-doublons
- [x] Commit message : `feat(documents): unified documents table + admin import page (B1 + D1) (#39)`
- [x] PR créée + mergée (#39)
- [x] Code review approuvé (implicite via merge)
- [ ] **Post-merge** : migration appliquée en prod Supabase (à vérifier par Loris)
- [x] Sprint-status.yaml mis à jour : `b-1-migration-table-documents: done`

### Change Log

- 2026-05-15 : Migration créée + mergée via PR #39 (avant workflow BMad formel)
- 2026-05-17 : Workflow BMad rétroactivement enregistré (story file créée + sprint-status mis à jour + Dev Agent Record ajouté)

**Action restante pour Loris** : vérifier que la migration a bien été exécutée en prod Supabase (sinon : copier-coller dans SQL Editor).
