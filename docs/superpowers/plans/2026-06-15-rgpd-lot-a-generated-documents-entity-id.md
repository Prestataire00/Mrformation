# RGPD Lot A — Isolation `generated_documents` par `entity_id` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir l'isolation multi-tenant de `generated_documents` via une colonne `entity_id` (migration idempotente + backfill), posée à l'insertion et utilisée pour filtrer la lecture admin.

**Architecture:** Chantier **data-first** (comme le runbook P0 auth) : une migration SQL (jouée dans Supabase Dashboard) ajoute `entity_id` de façon idempotente (`IF NOT EXISTS` — la colonne existe peut-être déjà, le code l'insère), backfille les lignes existantes depuis `session/client/learner`, et pose une policy RLS directe. Ensuite, le code filtre le fetch admin par `entity_id` (au lieu d'un filtre client-side partiel).

**Tech Stack:** Postgres/Supabase (migration + RLS, helpers `public.*`), Next.js client (admin documents page).

**Référence cadrage :** `bmad_output/planning-artifacts/2026-06-15-cadrage-confidentialite-fichiers-rgpd.md` (Lot A).

---

## File Structure

| Fichier | Rôle | Action |
|---------|------|--------|
| `supabase/migrations/add_entity_id_generated_documents.sql` | Migration : colonne + backfill + index + RLS | Créer (jouée dans Dashboard) |
| `src/app/(dashboard)/admin/documents/page.tsx` | Fetch admin : filtre `entity_id` ; insert : pose `entity_id` | Modifier |

---

## Task 1 : Migration `entity_id` (data-first — exécutée dans Supabase Dashboard)

**Files:**
- Create: `supabase/migrations/add_entity_id_generated_documents.sql`

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/add_entity_id_generated_documents.sql` avec EXACTEMENT :

```sql
-- ============================================================
-- RGPD Lot A — entity_id sur generated_documents
-- ============================================================
-- Idempotent. À exécuter dans Supabase Dashboard → SQL Editor.
-- Helpers RLS en public.* (PAS auth.*) — convention migrations du projet.
-- ============================================================

-- 1. Colonne (peut déjà exister : le code l'insère déjà)
ALTER TABLE generated_documents
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE CASCADE;

-- 2. Backfill des lignes sans entity_id, depuis session / client / learner (1er non-null)
UPDATE generated_documents gd
SET entity_id = COALESCE(
  (SELECT s.entity_id FROM sessions s   WHERE s.id = gd.session_id),
  (SELECT c.entity_id FROM clients c    WHERE c.id = gd.client_id),
  (SELECT l.entity_id FROM learners l   WHERE l.id = gd.learner_id)
)
WHERE gd.entity_id IS NULL;

-- 3. Index pour le filtrage
CREATE INDEX IF NOT EXISTS idx_generated_documents_entity ON generated_documents(entity_id);

-- 4. RLS : isolation directe par entity_id (admin de l'entité + super_admin)
DROP POLICY IF EXISTS "generated_documents_entity_isolation" ON generated_documents;
CREATE POLICY "generated_documents_entity_isolation" ON generated_documents
  FOR ALL TO authenticated
  USING (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  WITH CHECK (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin');

-- ============================================================
-- Vérifications (à lancer après) :
--   SELECT count(*) FROM generated_documents WHERE entity_id IS NULL;  -- doit tendre vers 0 (sauf orphelins sans FK)
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='generated_documents' AND column_name='entity_id'; -- 1 ligne
-- ============================================================
```

- [ ] **Step 2 : Exécuter dans Supabase Dashboard → SQL Editor**, puis lancer les requêtes de vérification (en bas du fichier). `entity_id IS NULL` ne doit rester que pour d'éventuels orphelins (sans session/client/learner) — acceptable (ils ne seront pas exposés).

- [ ] **Step 3 : Commit du fichier de migration**

```bash
git add supabase/migrations/add_entity_id_generated_documents.sql
git commit -m "feat(rgpd): migration entity_id sur generated_documents (Lot A)"
```

> ⚠️ La migration doit être **jouée en prod AVANT** de déployer le code de la Task 2 (le filtre `.eq("entity_id")` renverrait du vide si la colonne/backfill manquent).

---

## Task 2 : Filtre `entity_id` sur le fetch admin + insertion

**Files:**
- Modify: `src/app/(dashboard)/admin/documents/page.tsx`

- [ ] **Step 1 : Confirmer que l'insertion pose `entity_id`**

Lire `handleGenerate` (insert vers `generated_documents`, vers la ligne 990). Vérifier que le payload `.insert({...})` contient `entity_id: entityId`. Si absent, l'ajouter. (Au moment du cadrage, l'insert posait déjà `entity_id` — confirmer et ne rien changer si c'est le cas.)

- [ ] **Step 2 : Filtrer le fetch par `entity_id` côté serveur**

Dans `fetchGeneratedDocs`, remplacer le filtre client-side partiel par un filtre Supabase direct. Remplacer :

```tsx
    const { data, error } = await supabase
      .from("generated_documents")
      .select("*, template:document_templates(name, type, entity_id), session:sessions(title, trainer:trainers(first_name, last_name)), client:clients(company_name), learner:learners(first_name, last_name)")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchGeneratedDocs error:", error);
      toast({ title: "Erreur", description: "Impossible de charger les documents.", variant: "destructive" });
    } else {
      const all = (data as GeneratedDocumentFull[]) || [];
      const filtered = entityId ? all.filter((d) => d.template?.entity_id === entityId) : all;
      setGeneratedDocs(filtered);
    }
```

par :

```tsx
    if (!entityId) {
      setGeneratedDocs([]);
      setDocsLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("generated_documents")
      .select("*, template:document_templates(name, type, entity_id), session:sessions(title, trainer:trainers(first_name, last_name)), client:clients(company_name), learner:learners(first_name, last_name)")
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchGeneratedDocs error:", error);
      toast({ title: "Erreur", description: "Impossible de charger les documents.", variant: "destructive" });
    } else {
      setGeneratedDocs((data as GeneratedDocumentFull[]) || []);
    }
```

(Le `fetchGeneratedDocs` a déjà `entityId` dans ses deps `[entityId]` — pas de changement de deps.)

- [ ] **Step 3 : Type-check (seul ce fichier compte)**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "admin/documents/page" || echo "OK"`
Expected: `OK`.

- [ ] **Step 4 : Suite de tests + build**

Run: `npm test` (attendu : 1624 verts, pas de régression) puis `npm run build 2>&1 | grep -iE "Failed to compile" || echo "BUILD OK"`.

- [ ] **Step 5 : Commit**

```bash
git add "src/app/(dashboard)/admin/documents/page.tsx"
git commit -m "feat(rgpd): filtre generated_documents par entity_id (Lot A)"
```

---

## Task 3 : Vérification finale

- [ ] **Step 1 : Relire les critères d'acceptation du cadrage** (§4, critère 3 : `entity_id` existe, backfillé, posé à l'insertion, fetch filtré).
- [ ] **Step 2 : Smoke test (après migration jouée)** : en tant qu'admin d'une entité, la page Documents → onglet « Générés » ne montre que les documents de l'entité courante.

---

## Notes de conformité (CLAUDE.md)
- Migration séparée (jamais d'édition directe de `schema.sql`). Helpers RLS en `public.*`.
- Filtre `entity_id` désormais côté serveur (défense en profondeur, plus seulement RLS/client-side).
- Pas de `any` introduit.
