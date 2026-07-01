# Packs d'automatisation — Lot 3 (Sélecteur à la création) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Choisir un pack d'automatisation à la création d'une formation et instancier son snapshot (`session_automation_steps`).

**Architecture:** Le formulaire de création (`/admin/trainings/page.tsx`) insère la session **côté client** (`supabase.from("sessions").insert`). On ajoute un `Select` de pack (packs de l'entité, défaut = `is_default`), on écrit `automation_pack_id` sur la session, et **après l'insert** on appelle `instantiatePackForSession` (Lot 1) — non bloquant.

**Tech Stack:** Next.js 14, TypeScript, Supabase (client), shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-07-01-automation-packs-creation-design.md`

---

## Écart assumé vs spec

La spec supposait le snapshot dans `POST /api/sessions`. **Vérification faite** : le formulaire de création réellement utilisé insère la session **directement côté client** (`src/app/(dashboard)/admin/trainings/page.tsx:498`, `supabase.from("sessions").insert(payload)`), il ne passe PAS par la route API. Donc le snapshot est déclenché **côté client après l'insert** dans ce même fichier. (`POST /api/sessions` reste hors périmètre de ce lot — chemin de création distinct.)

## Pré-requis vérifiés

- `SessionFormData` + `emptyForm` : `src/app/(dashboard)/admin/trainings/page.tsx:105-132`.
- Insert client : `handleCreateSession` (l.464), `payload` (l.480), `supabase.from("sessions").insert(payload)` (l.498). `entityId` via `useEntity()` (l.188), `supabase` disponible.
- Pattern de fetch d'options : `fetchPrograms` useCallback (l.274-287, filtre `entity_id`), état `programs` (l.208), type `ProgramOption` (l.93).
- `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` déjà importés depuis `@/components/ui/select` (l.28-33).
- Service Lot 1 : `instantiatePackForSession(supabase, packId, sessionId)` dans `src/lib/automation/instantiate-pack.ts`.
- Barrières : `npx tsc --noEmit` + `npx vitest run`.

## File Structure

| Fichier | Action |
|---|---|
| `supabase/migrations/add_session_automation_pack_id.sql` | Créer : colonne `sessions.automation_pack_id`. |
| `src/app/(dashboard)/admin/trainings/page.tsx` | Modifier : état+fetch packs, `Select` pack, défaut `is_default`, payload + snapshot post-insert. |

---

## Task 1 : Migration — `sessions.automation_pack_id`

**Files:**
- Create: `supabase/migrations/add_session_automation_pack_id.sql`

- [ ] **Step 1 : écrire la migration**

```sql
-- Trace le pack d'automatisation choisi à la création d'une formation (Lot 3).
-- Le snapshot réel des étapes vit dans session_automation_steps (Lot 1) ;
-- cette colonne est la référence de haut niveau (utile au « réappliquer » du Lot 4).
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS automation_pack_id UUID REFERENCES automation_packs(id) ON DELETE SET NULL;
```

- [ ] **Step 2 : commit** (jouée manuellement dans Supabase)

```bash
git add supabase/migrations/add_session_automation_pack_id.sql
git commit -m "feat(automation): colonne sessions.automation_pack_id (pack choisi à la création)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 : Formulaire — sélecteur de pack + snapshot

**Files:**
- Modify: `src/app/(dashboard)/admin/trainings/page.tsx`

- [ ] **Step 1 : importer le service de snapshot**

Près des autres imports en tête du fichier, ajoute :

```tsx
import { instantiatePackForSession } from "@/lib/automation/instantiate-pack";
```

- [ ] **Step 2 : type d'option de pack + état**

Après l'interface `ProgramOption` (l.93) OU près de l'état `programs`, ajoute le type et l'état :

```tsx
interface PackOption {
  id: string;
  name: string;
  icon: string | null;
  is_default: boolean;
}
```

Et à côté de `const [programs, setPrograms] = useState<ProgramOption[]>([]);` (l.208) :

```tsx
  const [packs, setPacks] = useState<PackOption[]>([]);
```

- [ ] **Step 3 : ajouter le champ au form data**

Dans `SessionFormData` (l.105) ajoute après `is_subcontracted: boolean;` :

```tsx
  automation_pack_id: string;
```

Dans `emptyForm` (l.119) ajoute après `is_subcontracted: false,` :

```tsx
  automation_pack_id: "",
```

- [ ] **Step 4 : fetch des packs de l'entité + chargement**

Après le `fetchPrograms` useCallback (l.287), ajoute :

```tsx
  const fetchPacks = useCallback(async () => {
    if (!entityId) return;
    const { data } = await supabase
      .from("automation_packs")
      .select("id, name, icon, is_default")
      .eq("entity_id", entityId)
      .order("name");
    setPacks((data ?? []) as PackOption[]);
  }, [entityId, supabase]);
```

Et ajoute un `useEffect` de chargement (à côté des autres `useEffect`, ex. après celui de `fetchSessions`) :

```tsx
  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);
```

- [ ] **Step 5 : pré-sélectionner le pack par défaut à l'ouverture**

Dans `openCreateForm` (l.455), au moment où le formulaire est réinitialisé (`setFormData(emptyForm)` ou équivalent), remplace l'affectation du form par une version qui pré-sélectionne le pack `is_default` :

```tsx
    const defaultPackId = packs.find((p) => p.is_default)?.id ?? "";
    setFormData({ ...emptyForm, automation_pack_id: defaultPackId });
```

(Si `openCreateForm` fait déjà `setFormData(emptyForm)`, remplace cette ligne par les deux ci-dessus. Si l'ouverture pré-remplit depuis un programme via un autre chemin, conserve ces champs et ajoute juste `automation_pack_id: defaultPackId`.)

- [ ] **Step 6 : ajouter le `Select` de pack dans le formulaire**

Dans le JSX du formulaire de création, dans la section options (près de la checkbox « Sous-traitance », ~l.675-698), ajoute ce bloc (la checkbox « Sous-traitance » reste inchangée, à côté) :

```tsx
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700">Parcours d'automatisation</label>
            <Select
              value={formData.automation_pack_id || "none"}
              onValueChange={(v) =>
                setFormData((f) => ({ ...f, automation_pack_id: v === "none" ? "" : v }))
              }
            >
              <SelectTrigger className="w-72 h-9 text-sm">
                <SelectValue placeholder="Choisir un parcours" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {packs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.icon ? `${p.icon} ` : ""}{p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
```

- [ ] **Step 7 : écrire `automation_pack_id` + déclencher le snapshot après insert**

Dans `handleCreateSession` (l.464) :

(a) dans `payload` (l.480), ajoute après `is_subcontracted: formData.is_subcontracted,` :

```tsx
      automation_pack_id: formData.automation_pack_id || null,
```

(b) remplace l'insert actuel (l.498) `const { error } = await supabase.from("sessions").insert(payload);` par une version qui récupère l'id et déclenche le snapshot **non bloquant** :

```tsx
    const { data: created, error } = await supabase
      .from("sessions")
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      // Snapshot du pack choisi — NON bloquant : la formation est créée quoi qu'il arrive.
      if (formData.automation_pack_id && created?.id) {
        const snap = await instantiatePackForSession(supabase, formData.automation_pack_id, created.id);
        if (!snap.ok) {
          toast({ title: "Formation créée", description: `Parcours non appliqué : ${snap.error}`, variant: "destructive" });
        } else {
          toast({ title: "Session planifiée", description: `Parcours appliqué (${snap.count} étape${snap.count > 1 ? "s" : ""}).` });
        }
      } else {
        toast({ title: "Session planifiée" });
      }
      setShowCreateForm(false);
      setFormData(emptyForm);
      fetchSessions();
    }
```

(Supprime l'ancien bloc `toast({ title: "Session planifiée" }); setShowCreateForm(false); ...` d'origine puisqu'il est désormais intégré ci-dessus.)

- [ ] **Step 8 : type-check + tests**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npx vitest run`
Expected: PASS (aucun test cassé ; `instantiate-pack.test.ts` toujours vert).

- [ ] **Step 9 : commit**

```bash
git add "src/app/(dashboard)/admin/trainings/page.tsx"
git commit -m "feat(automation): sélecteur de pack à la création + snapshot (Lot 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 : Vérification globale

**Files:** aucun (gates + test manuel)

- [ ] **Step 1 : type-check** — Run: `npx tsc --noEmit` → PASS.
- [ ] **Step 2 : tests** — Run: `npx vitest run` → PASS.
- [ ] **Step 3 : test manuel (après migration appliquée en base)** :
  - [ ] Ouvrir « Planifier une session » : le champ « Parcours d'automatisation » liste les packs de l'entité, **pré-sélectionné sur Qualiopi standard** (le `is_default`).
  - [ ] Créer une formation avec un pack → toast « Parcours appliqué (N étapes) ». En base : `sessions.automation_pack_id` renseigné ET `select count(*) from session_automation_steps where session_id = '<id>'` = nb d'étapes du pack.
  - [ ] Créer une formation avec « Aucun » → pas de `session_automation_steps`, `automation_pack_id` NULL (comportement legacy).
  - [ ] La checkbox « Sous-traitance » fonctionne toujours indépendamment.
- [ ] **Step 4 : pas de commit** (validation seule).

---

## Self-Review (effectué)

- **Couverture spec :** migration `automation_pack_id` (T1) ; sélecteur + défaut `is_default` + option Aucun (T2 steps 2-6) ; snapshot post-insert non bloquant (T2 step 7) ; checkbox inchangée (option a — aucune modif de `is_subcontracted`) ; critères d'acceptation → T3. ✅
- **Écart documenté :** snapshot côté client (l'insert est client-side), pas dans `POST /api/sessions`.
- **Placeholders :** aucun — code complet. Les rares « selon le code réel de openCreateForm » sont bornés par la consigne exacte (ajouter `automation_pack_id: defaultPackId`).
- **Cohérence des types :** `PackOption` (T2 step 2) utilisé par `packs`/`fetchPacks`/le Select ; `automation_pack_id: string` dans `SessionFormData`/`emptyForm` (T2 step 3) cohérent avec payload (`|| null`) et l'appel `instantiatePackForSession` (retour `{ok, count}` / `{ok:false, error}` défini au Lot 1).
