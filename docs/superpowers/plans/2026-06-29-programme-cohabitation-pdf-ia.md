# Cohabitation des chemins de création de programme (IA + Import PDF + Grille manuelle) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réintroduire l'import de programme depuis un PDF et la grille de saisie manuelle des modules, en cohabitation avec le générateur IA déjà en place.

**Architecture:** Restauration sélective depuis `d0e51118^` (le commit `d0e51118` du 27/06 avait tout retiré). Trois fichiers n'ont eu que le retrait de la grille et rien après → restaurés **tels quels**. Le hub reçoit deux boutons supplémentaires par édition chirurgicale, en gardant le bouton « Générer (IA) ».

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Supabase, shadcn/ui, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-29-programme-cohabitation-pdf-ia-design.md`

---

## Note de cadrage (écart assumé vs spec)

La spec listait `src/lib/validations/program.ts` et son test comme « à restaurer ». **Vérification faite, c'est inutile** : le champ retiré de `programHubFormSchema` était un *textarea JSON brut* du hub que l'on **ne** restaure pas (le hub utilise des boutons). La grille manuelle s'appuie sur les types locaux `EditModule` et sur `programContentSchema`, **resté intact**. Donc `program.ts` et `program.test.ts` ne sont **pas** modifiés. Tout le reste de la spec est couvert ci-dessous.

## Pré-requis vérifiés

- Aucun commit n'a touché `programs/[id]/page.tsx`, `EditProgramDialog.tsx`, `programs/page.tsx`, `program.ts` après `d0e51118` (vérifié via `git log d0e51118..HEAD -- <fichier>` → vide). La copie de travail = version « slim ».
- Barrières automatiques du projet : `npx tsc --noEmit` et `npx vitest run` (le lint ESLint 9 est cassé — ne pas s'en servir).

## File Structure

| Fichier | Action | Responsabilité |
|---|---|---|
| `src/app/api/programs/ai-extract/route.ts` | Restaurer verbatim | Extraction IA d'un PDF → `ParsedData` |
| `src/app/(dashboard)/admin/programs/import/page.tsx` | Restaurer verbatim | Écran d'import 3 étapes (upload → aperçu → done) |
| `src/app/(dashboard)/admin/programs/[id]/_components/EditProgramDialog.tsx` | Restaurer verbatim | Dialog d'édition AVEC grille de modules |
| `src/app/(dashboard)/admin/programs/[id]/page.tsx` | Restaurer verbatim | Détail programme : state `editModules` + `handleSave` qui écrit `content` |
| `src/app/(dashboard)/admin/programs/page.tsx` | Édition chirurgicale | Hub : +2 boutons (Importer PDF, Créer vierge) + handler `handleCreateBlank` |

---

## Task 1: Restaurer la route d'extraction IA

**Files:**
- Restore: `src/app/api/programs/ai-extract/route.ts`

- [ ] **Step 1: Restaurer le fichier depuis le parent du commit de retrait**

```bash
git show "d0e51118^:src/app/api/programs/ai-extract/route.ts" > src/app/api/programs/ai-extract/route.ts
```

- [ ] **Step 2: Vérifier que le fichier compile (types/imports encore valides 2 jours après)**

Run: `npx tsc --noEmit`
Expected: PASS (aucune erreur liée à `ai-extract/route.ts`). Si une erreur d'import apparaît, noter le symbole manquant et l'aligner sur l'API actuelle avant de continuer.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/programs/ai-extract/route.ts
git commit -m "feat(programme): restaure la route ai-extract (PDF → programme)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Restaurer l'écran d'import PDF

**Files:**
- Restore: `src/app/(dashboard)/admin/programs/import/page.tsx`

- [ ] **Step 1: Restaurer le fichier**

```bash
git show "d0e51118^:src/app/(dashboard)/admin/programs/import/page.tsx" > "src/app/(dashboard)/admin/programs/import/page.tsx"
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: PASS. La page consomme la route restaurée en Task 1 (`POST /api/programs/ai-extract`) — cohérent.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/admin/programs/import/page.tsx"
git commit -m "feat(programme): restaure l'écran d'import PDF (upload → aperçu → enregistre)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Restaurer la grille de modules dans l'édition

**Files:**
- Restore: `src/app/(dashboard)/admin/formations/[id]/_components/EditProgramDialog.tsx`

Ce fichier n'a eu, dans `d0e51118`, que le retrait de la grille (export `EditModule`, props `editModules`/`setEditModules`, JSX de la grille) et rien après. La version `d0e51118^` = version actuelle + grille.

- [ ] **Step 1: Restaurer le fichier**

```bash
git show "d0e51118^:src/app/(dashboard)/admin/formations/[id]/_components/EditProgramDialog.tsx" > "src/app/(dashboard)/admin/formations/[id]/_components/EditProgramDialog.tsx"
```

- [ ] **Step 2: Vérifier la compilation isolément**

Run: `npx tsc --noEmit`
Expected: des erreurs UNIQUEMENT dans `programs/[id]/page.tsx` (il n'importe pas encore `EditModule` ni ne passe les props `editModules`). C'est attendu — corrigé en Task 4. Aucune autre erreur ne doit apparaître. (Si on veut un état vert intermédiaire, enchaîner Task 4 avant de committer ; sinon committer tel quel, le rouge est localisé et résolu juste après.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/EditProgramDialog.tsx"
git commit -m "feat(programme): restaure la grille de modules dans EditProgramDialog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Restaurer le câblage de la grille dans le détail programme

**Files:**
- Restore: `src/app/(dashboard)/admin/programs/[id]/page.tsx`

Dans `d0e51118`, ce fichier n'a eu que le retrait du state `editModules`, du peuplement des modules dans `openEditDialog`, de la construction de `content.modules` dans `handleSave`, et du passage des props à `EditProgramDialog`. La version `d0e51118^` rétablit exactement ces 4 points et est cohérente avec l'`EditProgramDialog` restauré en Task 3.

- [ ] **Step 1: Restaurer le fichier**

```bash
git show "d0e51118^:src/app/(dashboard)/admin/programs/[id]/page.tsx" > "src/app/(dashboard)/admin/programs/[id]/page.tsx"
```

- [ ] **Step 2: Vérifier la compilation complète (doit redevenir verte)**

Run: `npx tsc --noEmit`
Expected: PASS. `EditModule` est de nouveau importé et les props `editModules`/`setEditModules` correspondent à la signature restaurée en Task 3.

- [ ] **Step 3: Lancer les tests existants (aucune régression)**

Run: `npx vitest run src/lib/validations/__tests__/program.test.ts`
Expected: PASS (`programContentSchema` et `programHubFormSchema` inchangés).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/admin/programs/[id]/page.tsx"
git commit -m "feat(programme): recâble la grille de modules dans le détail programme (save content)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Ajouter les 2 points d'entrée dans le hub

**Files:**
- Modify: `src/app/(dashboard)/admin/programs/page.tsx`

Le hub garde « Nouveau programme (IA) ». On ajoute « Importer un PDF » (lien vers `/admin/programs/import`, route restaurée en Task 2) et « Créer manuellement (vierge) » (crée un programme minimal puis redirige vers l'édition, où la grille de Task 3/4 prend le relais).

- [ ] **Step 1: Ajouter le handler `handleCreateBlank` juste après `handleCreateFromAi`**

Repérer la fin de `handleCreateFromAi` (le `};` qui suit `await fetchPrograms();` puis le `catch`/`finally`, vers la ligne ~330). Insérer après :

```tsx
  // Création manuelle : programme minimal (1 séquence vide) puis édition (grille).
  const handleCreateBlank = async (): Promise<void> => {
    if (!entityId) {
      toast({ title: "Erreur", description: "Entité non chargée — réessayez.", variant: "destructive" });
      return;
    }
    setCreatingFromAi(true);
    try {
      const result = await createProgramService(supabase, entityId, {
        title: "Nouveau programme",
        description: null,
        objectives: null,
        content: { modules: [{ id: 1, title: "Séquence 1", topics: [] }] },
        price: null,
        tva_rate: null,
        duration_hours: null,
        nsf_code: null,
        nsf_label: null,
        is_apprenticeship: false,
        bpf_objective: null,
        bpf_funding_type: null,
      });
      if (!result.ok) {
        toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Programme créé", description: "Complétez les séquences dans l'édition." });
      router.push(`/admin/programs/${result.program.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de créer le programme";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setCreatingFromAi(false);
    }
  };
```

- [ ] **Step 2: Remplacer le bloc de boutons d'en-tête par les 3 chemins**

Repérer (vers la ligne ~541) :

```tsx
        <div className="flex gap-2">
          {/* Lot C : unique voie de création = génération IA standalone. */}
          <Button onClick={() => setGenerateDialogOpen(true)} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Nouveau programme (IA)
          </Button>
        </div>
```

Le remplacer par :

```tsx
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setGenerateDialogOpen(true)} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Générer (IA)
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <Link href="/admin/programs/import">
              <Upload className="h-4 w-4" />
              Importer un PDF
            </Link>
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            disabled={creatingFromAi}
            onClick={handleCreateBlank}
          >
            <FilePlus className="h-4 w-4" />
            Créer manuellement (vierge)
          </Button>
        </div>
```

- [ ] **Step 3: Ajouter les icônes manquantes à l'import lucide-react**

Repérer l'import existant `import { ... } from "lucide-react";` (le bloc commençant ligne ~20). S'assurer que `Upload` et `FilePlus` y figurent (en plus de `Sparkles`, `Search`, etc. déjà présents). Ajouter ceux qui manquent à la liste, par ex. :

```tsx
import {
  Sparkles,
  Upload,
  FilePlus,
  // …conserver les icônes déjà importées…
} from "lucide-react";
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: PASS. `Link`, `router`, `createProgramService`, `toast`, `entityId`, `creatingFromAi`, `fetchPrograms` sont déjà présents dans le fichier (vérifié) ; seules les icônes `Upload`/`FilePlus` sont à ajouter.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/admin/programs/page.tsx"
git commit -m "feat(programme): hub à 3 chemins de création (IA + import PDF + vierge)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Vérification globale

**Files:** aucun (gates + test manuel)

- [ ] **Step 1: Type-check complet**

Run: `npx tsc --noEmit`
Expected: PASS, zéro erreur.

- [ ] **Step 2: Suite de tests**

Run: `npx vitest run`
Expected: PASS (aucune régression ; `program.test.ts` inchangé).

- [ ] **Step 3: Test manuel des 3 chemins (entité MR, en local)**

Checklist (cocher chacun) :
- [ ] Hub `/admin/programs` : les 3 boutons s'affichent.
- [ ] « Générer (IA) » : crée un programme comme avant (non régressé).
- [ ] « Importer un PDF » : upload d'un **vrai PDF de programme client** → l'IA extrait → écran d'aperçu correct → enregistrement → le programme apparaît dans le hub.
- [ ] « Créer manuellement (vierge) » : crée le programme et redirige vers `/admin/programs/<id>`.
- [ ] Édition d'un programme (importé ou vierge) : la **grille de modules** est présente ; ajout/suppression/édition d'une séquence puis sauvegarde → `content.modules` persiste (revérifier après rechargement).
- [ ] Chaque action filtre bien par entité (un programme créé sous MR n'apparaît pas sous C3V).

- [ ] **Step 4: Pas de commit** (étape de validation uniquement). Si le test manuel révèle un défaut, ouvrir une sous-tâche de correction avant la livraison.

---

## Self-Review (effectué)

- **Couverture spec :** import PDF (T1+T2), grille en édition (T3+T4), 3 boutons hub + vierge (T5), IA conservé (non touché), pas de migration SQL (aucune), tests/gates (T6). ✅ Écart `program.ts`/`program.test.ts` justifié en tête de plan.
- **Placeholders :** aucun — restaurations via `git show` (exactes) + code complet pour T5.
- **Cohérence des types :** `EditModule` exporté par `EditProgramDialog` (T3) et importé par `[id]/page.tsx` (T4) ; props `editModules`/`setEditModules` alignées (versions `d0e51118^` mutuellement cohérentes). `handleCreateBlank` réutilise la signature exacte de `createProgramService` vue dans `handleCreateFromAi`.
