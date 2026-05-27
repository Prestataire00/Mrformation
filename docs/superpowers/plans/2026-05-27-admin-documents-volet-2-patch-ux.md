# Sous-chantier 2 `/admin/documents` — V2 Patch UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fixer les 3 douleurs UX critiques de la page racine `/admin/documents` (Officials non-envoyables, QuickAction trompeur, helper variables manquant) sans changer le layout global.

**Architecture:**
1. **Approche V2.1 "auto-copie DB"** : bouton "Envoyer" sur Official → silencieusement INSERT une copie DB du template (réutilise le pattern "Utiliser comme base" existant ligne 1141-1156) puis ouvre Dialog SEND avec cette copie. Pas de modif backend. Trade-off : pollue "Mes modèles" avec auto-copies (cleanup à faire dans un futur volet).
2. **QuickAction** : click → nouveau Dialog `ChooseTemplateDialog` minimal listant Officials + Custom → après sélection ouvre Dialog SEND. Pas de modif Dialog SEND existant.
3. **InsertVariableButton** : composant existant `src/components/editor/InsertVariableButton.tsx` (utilisé par `/admin/emails`) ajouté dans modal édition template.

**Note de divergence vs spec** : la spec mentionnait "extension Dialog SEND pour accepter `officialDocType`" — l'exploration a révélé que le backend (route `/api/documents/send-to-recipient` + worker `process-scheduled`) ne supporte que `template_id` UUID. L'extension demanderait ~6-8h de modifications backend (route + EmailAttachmentDescriptor + worker). Wissam a validé l'approche V2.1 alternative (auto-copie DB) qui reste dans le budget 3-4h sans toucher au backend.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Vitest baseline 550 tests, shadcn/ui (Dialog, Button, Card, RadioGroup, Popover), TailwindCSS, Lucide icons.

**Branche cible** : `feat/admin-documents-volet-2-patch-ux` (depuis `main` à `868106c`).

**Source spec** : [docs/superpowers/specs/2026-05-27-admin-documents-volet-2-patch-ux-design.md](../specs/2026-05-27-admin-documents-volet-2-patch-ux-design.md)

---

## File Structure

**Created** :
- `src/app/(dashboard)/admin/documents/_components/ChooseTemplateDialog.tsx` (~70 LOC) — Dialog minimaliste de sélection template pour QuickAction

**Modified** :
- `src/app/(dashboard)/admin/documents/page.tsx` :
  - Ajout helper `findOrCreateCustomFromOfficial(ot)` (~40 LOC)
  - Ajout bouton "Envoyer" sur chaque card Official (ligne ~1100-1180)
  - QuickAction "Envoyer à un apprenant" : onClick → setChooseTemplateDialogOpen(true) au lieu de basculer tab
  - Ajout `<ChooseTemplateDialog>` rendering
  - Ajout `<InsertVariableButton>` dans modal édition template (ligne ~1594-1840)

**Pas touchés** :
- Aucune route API (la stratégie auto-copie évite la modif backend)
- Aucun service / hook
- Aucun composant ui partagé
- 550 tests baseline maintenu

---

## Task 0: Baseline + branche + audit Dialog SEND

**Files:** Aucun (vérifications + setup branche)

- [ ] **Step 1: Vérifier état initial**

Run: `git status`
Expected: `On branch main, ...` (untracked .claude/skills/* OK)

Run: `git log -1 --oneline`
Expected: `868106c` (ou commit ultérieur si autre doc ajouté)

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files  49 passed (49)` et `Tests  550 passed (550)`

Run: `npx tsc --noEmit 2>&1 | head -3`
Expected: aucune sortie

- [ ] **Step 2: Créer la branche depuis main**

```bash
git checkout -b feat/admin-documents-volet-2-patch-ux
```

Expected: `Switched to a new branch 'feat/admin-documents-volet-2-patch-ux'`

- [ ] **Step 3: Lire le pattern auto-copie existant (référence pour Task 1)**

Run: `sed -n '1135,1170p' 'src/app/(dashboard)/admin/documents/page.tsx'`

Tu verras le handler `onClick` du bouton "Utiliser comme base" qui :
1. Génère le HTML via `renderSystemTemplate(ot.id, demoData)`
2. INSERT dans `document_templates` avec `name: "${ot.name} (personnalisé)"`, `type`, `content: html`, `entity_id`, `system_key: ot.id`
3. Refetch templates
4. Bascule à tab Custom + ouvre `openEditTemplate(newTpl)`

**Notre handler "Envoyer Official"** réutilise exactement la même logique INSERT mais à la place d'ouvrir l'éditeur, ouvre le Dialog SEND.

- [ ] **Step 4: Lire le Dialog SEND state (référence pour Task 2)**

Run: `sed -n '389,412p' 'src/app/(dashboard)/admin/documents/page.tsx'`

Tu verras :
```ts
const [sendDialogOpen, setSendDialogOpen] = useState(false);
const [sendDialogTemplate, setSendDialogTemplate] = useState<DocumentTemplate | null>(null);
// ... + sendStep, sendTargetType, sendLearnerId, sendSessionId, sendSubject, sendBody, sending

const openSendDialog = (template: DocumentTemplate) => {
  setSendDialogTemplate(template);
  setSendStep(1);
  // ... reset state ...
  setSendDialogOpen(true);
};
```

`openSendDialog` accepte uniquement un `DocumentTemplate` (DB). Notre handler "Envoyer Official" doit obtenir un `DocumentTemplate` (la copie DB créée) avant d'appeler `openSendDialog`.

- [ ] **Step 5: Lire l'InsertVariableButton (référence pour Task 4)**

Run: `head -50 src/components/editor/InsertVariableButton.tsx`

Tu verras le composant qui prend props :
- `onInsert: (placeholder: string) => void`
- `context: "document" | "email"`

Et qui rend un Popover avec liste filtrée des variables. Le placeholder injecté est de format `[%Sellsy Label%]` (depuis `TemplateVariable.placeholder` dans `template-variables.ts`).

Note : déjà utilisé par `/admin/emails/page.tsx:1124`. Le pattern d'intégration est : passer un callback `onInsert` qui setSubject/setBody en append. Pour notre usage (modal édition template, RichTextEditor), on devra trouver comment injecter au curseur (à explorer en Task 4).

Pas de commit pour Task 0 (juste setup).

---

## Task 1: Helper `findOrCreateCustomFromOfficial` + bouton "Envoyer" sur Officials

**Files:**
- Modify: `src/app/(dashboard)/admin/documents/page.tsx` (ajout helper + bouton sur cards Officials)

- [ ] **Step 1: Localiser la map OFFICIAL_TEMPLATES**

Run: `grep -n "OFFICIAL_TEMPLATES.map\|catTemplates.map" 'src/app/(dashboard)/admin/documents/page.tsx' | head -5`

Tu verras (ligne ~1107) le `catTemplates.map((ot) => ...)` qui rend chaque card Official.

- [ ] **Step 2: Lire le contexte autour du rendu de card Official**

Run: `sed -n '1100,1170p' 'src/app/(dashboard)/admin/documents/page.tsx'`

Tu verras la structure :
```tsx
{catTemplates.map((ot) => {
  const dbTemplate = templates.find((t) =>
    (t as unknown as { system_key?: string }).system_key === ot.id || ...
  );
  return (
    <Card key={ot.id} ...>
      <CardContent>
        <h3>{ot.name}</h3>
        {/* ... badge auto-confirmed ... */}
        {/* ... boutons Aperçu, Modifier ma version OU Utiliser comme base ... */}
      </CardContent>
    </Card>
  );
})}
```

C'est ici qu'on ajoute le bouton "Envoyer".

- [ ] **Step 3: Ajouter le helper `findOrCreateCustomFromOfficial`**

Localiser un bon endroit pour le helper (e.g. juste après les autres handlers, autour de la ligne 410-450). Ajouter :

```ts
/**
 * Trouve une copie DB existante du template Official (via system_key) ou en
 * crée une silencieusement. Réutilise le pattern de "Utiliser comme base"
 * (ligne ~1141-1156) sans bascule UI vers l'éditeur.
 *
 * Returns le `DocumentTemplate` (existant ou nouvellement créé).
 */
const findOrCreateCustomFromOfficial = async (
  ot: OfficialTemplate,
): Promise<DocumentTemplate | null> => {
  if (!entityId) return null;

  // 1. Cherche une copie existante (system_key match ou name partial match)
  const existing = templates.find((t) =>
    (t as unknown as { system_key?: string }).system_key === ot.id ||
    t.name.toLowerCase().includes(ot.name.toLowerCase().slice(0, 15)),
  );
  if (existing) return existing;

  // 2. Sinon, crée une copie (pattern identique à "Utiliser comme base")
  try {
    const demoData = {
      formation: {
        id: "demo",
        title: "Formation",
        start_date: "2026-01-01",
        end_date: "2026-01-03",
        planned_hours: 21,
        mode: "presentiel",
        location: "Marseille",
        enrollments: [],
        formation_trainers: [],
        formation_time_slots: [],
        signatures: [],
      },
      entityName: entity?.name || "MR FORMATION",
      entity: entity ?? undefined,
    };
    const html = renderSystemTemplate(ot.id, demoData as unknown as Parameters<typeof renderSystemTemplate>[1]) || "";
    const { data: newTpl, error } = await supabase
      .from("document_templates")
      .insert({
        name: `${ot.name} (personnalisé)`,
        type: ot.type,
        content: html,
        entity_id: entityId,
        system_key: ot.id,
      })
      .select()
      .single();
    if (error) throw error;
    await fetchTemplates();
    return newTpl as DocumentTemplate;
  } catch (err) {
    toast({
      title: "Erreur création copie",
      description: err instanceof Error ? err.message : "Erreur inconnue",
      variant: "destructive",
    });
    return null;
  }
};
```

- [ ] **Step 4: Ajouter le handler `handleSendOfficial`**

Juste après `findOrCreateCustomFromOfficial`, ajouter :

```ts
const handleSendOfficial = async (ot: OfficialTemplate) => {
  const tpl = await findOrCreateCustomFromOfficial(ot);
  if (tpl) {
    openSendDialog(tpl);
  }
};
```

- [ ] **Step 5: Ajouter le bouton "Envoyer" dans les cards Officials**

Dans la map `catTemplates.map((ot) => ...)` (autour de ligne 1107), trouver l'endroit où les boutons "Aperçu", "Modifier ma version" / "Utiliser comme base" sont rendus. Ajouter un bouton "Envoyer" juste après le bouton Aperçu :

Le pattern précédent affiche :
```tsx
<Button onClick={() => openPreviewDialog({...})}>
  <Eye className="h-3 w-3" /> Aperçu
</Button>
{dbTemplate ? (
  <Button onClick={() => openEditTemplate(dbTemplate)}>
    <Pencil className="h-3 w-3" /> Modifier ma version
  </Button>
) : (
  <Button onClick={async () => { /* ... use as base ... */ }}>
    <Copy className="h-3 w-3" /> Utiliser comme base
  </Button>
)}
```

Insérer **avant** le bloc `{dbTemplate ? ... : ...}` :

```tsx
<Button
  variant="default"
  size="sm"
  onClick={() => handleSendOfficial(ot)}
  className="gap-1"
>
  <Send className="h-3 w-3" /> Envoyer
</Button>
```

Vérifier que `Send` est importé depuis `lucide-react`. Si pas déjà importé, l'ajouter à l'import lucide-react existant en haut du fichier.

- [ ] **Step 6: Vérifier**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie. Si TS pleure sur `OfficialTemplate` non importé, ajouter `type OfficialTemplate` à l'import existant `import { OFFICIAL_TEMPLATES, ... } from "@/lib/templates/official-templates";`.

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Tests "`
Expected: `Tests  550 passed (550)`

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(dashboard)/admin/documents/page.tsx'
git commit -m "feat(documents): bouton Envoyer sur templates Officials (V2.1)

Ajoute un bouton 'Envoyer' sur chaque card Official template du
catalogue. Click → handler handleSendOfficial qui :
1. Cherche une copie DB existante du template (via system_key ou
   name partial match)
2. Sinon crée silencieusement une copie via INSERT document_templates
   (pattern identique à 'Utiliser comme base' déjà existant)
3. Ouvre Dialog SEND avec cette copie

Workflow admin réduit de 5+ clicks à 2 clicks pour envoyer un
document Officiel à un apprenant.

Approche V2.1 (auto-copie DB) validée par Wissam pour rester dans
le budget 3-4h. Limitation : pollue 'Mes modèles' avec copies
auto-créées (cleanup à faire dans un futur volet).

Refs: docs/superpowers/specs/2026-05-27-admin-documents-volet-2-patch-ux-design.md § 4.1"
```

---

## Task 2: ChooseTemplateDialog + réparer QuickAction

**Files:**
- Create: `src/app/(dashboard)/admin/documents/_components/ChooseTemplateDialog.tsx`
- Modify: `src/app/(dashboard)/admin/documents/page.tsx` (QuickAction onClick + render Dialog)

- [ ] **Step 1: Créer `ChooseTemplateDialog.tsx`**

Créer `src/app/(dashboard)/admin/documents/_components/ChooseTemplateDialog.tsx` :

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { OFFICIAL_TEMPLATES, type OfficialTemplate } from "@/lib/templates/official-templates";

interface DocumentTemplate {
  id: string;
  name: string;
}

interface ChooseTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customTemplates: DocumentTemplate[];
  onSelectOfficial: (ot: OfficialTemplate) => void;
  onSelectCustom: (tpl: DocumentTemplate) => void;
}

export function ChooseTemplateDialog({
  open,
  onOpenChange,
  customTemplates,
  onSelectOfficial,
  onSelectCustom,
}: ChooseTemplateDialogProps) {
  const [search, setSearch] = useState("");

  const lowerSearch = search.toLowerCase();
  const filteredOfficials = OFFICIAL_TEMPLATES.filter((ot) =>
    ot.name.toLowerCase().includes(lowerSearch),
  );
  const filteredCustom = customTemplates.filter((t) =>
    t.name.toLowerCase().includes(lowerSearch),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choisir un modèle à envoyer</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un modèle..."
            className="pl-9"
            autoFocus
          />
        </div>

        {/* Officials */}
        {filteredOfficials.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">Modèles officiels</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredOfficials.map((ot) => (
                <button
                  key={ot.id}
                  onClick={() => {
                    onSelectOfficial(ot);
                    onOpenChange(false);
                  }}
                  className="text-left p-3 border rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-medium text-sm">{ot.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{ot.categoryLabel}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom */}
        {filteredCustom.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">Mes modèles</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredCustom.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onSelectCustom(t);
                    onOpenChange(false);
                  }}
                  className="text-left p-3 border rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-medium text-sm">{t.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredOfficials.length === 0 && filteredCustom.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-6">Aucun modèle trouvé pour cette recherche.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Modifier la QuickAction "Envoyer à un apprenant" dans page.tsx**

Localiser le bouton (autour de ligne 1015) :
```tsx
onClick={() => {
  setActiveTab("custom");
  toast({
    title: "Choisissez un modèle",
    description: "Cliquez sur «Envoyer» depuis la carte du modèle voulu.",
  });
}}
```

Remplacer par :
```tsx
onClick={() => setChooseTemplateDialogOpen(true)}
```

- [ ] **Step 3: Ajouter le state + handler dans page.tsx**

Près des autres states (autour de ligne 389), ajouter :
```ts
const [chooseTemplateDialogOpen, setChooseTemplateDialogOpen] = useState(false);
```

Ajouter l'import :
```ts
import { ChooseTemplateDialog } from "./_components/ChooseTemplateDialog";
```

- [ ] **Step 4: Rendre `<ChooseTemplateDialog>` à la fin du JSX (avant `</div>` racine)**

Trouver la fin du JSX (juste avant le `</div>` final du return). Ajouter :

```tsx
<ChooseTemplateDialog
  open={chooseTemplateDialogOpen}
  onOpenChange={setChooseTemplateDialogOpen}
  customTemplates={templates}
  onSelectOfficial={(ot) => handleSendOfficial(ot)}
  onSelectCustom={(tpl) => openSendDialog(tpl)}
/>
```

- [ ] **Step 5: Vérifier**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Tests "`
Expected: `Tests  550 passed (550)`

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(dashboard)/admin/documents/_components/ChooseTemplateDialog.tsx' 'src/app/(dashboard)/admin/documents/page.tsx'
git commit -m "fix(documents): QuickAction 'Envoyer à un apprenant' ouvre ChooseTemplateDialog (V2.2)

Avant : QuickAction bouton 'Envoyer à un apprenant' basculait juste
vers l'onglet Custom + toast inutile (workflow cassé — admin
s'attendait à un dialog 'choisir template + destinataire').

Maintenant : click ouvre un nouveau ChooseTemplateDialog minimaliste
qui liste les Officials + Custom avec search. Après sélection, le
Dialog SEND existant s'ouvre (via handleSendOfficial pour Officials
ou openSendDialog directement pour Custom).

Nouveau composant : src/app/(dashboard)/admin/documents/_components/
ChooseTemplateDialog.tsx (~110 LOC). Pas de modif backend.

Refs: docs/superpowers/specs/2026-05-27-admin-documents-volet-2-patch-ux-design.md § 4.2"
```

---

## Task 3: Ajouter InsertVariableButton dans modal édition template

**Files:**
- Modify: `src/app/(dashboard)/admin/documents/page.tsx` (modal édition template ~ligne 1594-1840)

- [ ] **Step 1: Localiser le modal édition template**

Run: `grep -n "Nouveau modèle\|Modifier le modèle\|openEditTemplate\|templateForm" 'src/app/(dashboard)/admin/documents/page.tsx' | head -15`

Tu verras le Dialog de création/édition autour de la ligne 1594-1840. Lire ~30 lignes autour du textarea ou RichTextEditor :

Run: `sed -n '1694,1740p' 'src/app/(dashboard)/admin/documents/page.tsx'`

Identifier le textarea/editor et le state qui le contrôle (probablement `templateForm.content` ou `setTemplateForm`).

- [ ] **Step 2: Ajouter l'import**

Ajouter en haut de page.tsx (avec les autres imports `@/components/...`) :

```ts
import { InsertVariableButton } from "@/components/editor/InsertVariableButton";
```

- [ ] **Step 3: Ajouter `<InsertVariableButton>` au-dessus de l'éditeur**

Dans le modal édition, juste avant le textarea/RichTextEditor du body du template, ajouter :

```tsx
<div className="flex items-center justify-between mb-2">
  <Label>Contenu du modèle (HTML)</Label>
  <InsertVariableButton
    context="document"
    onInsert={(placeholder) => {
      // Append le placeholder au content actuel (pattern simple, sans curseur)
      setTemplateForm((p) => ({
        ...p,
        content: (p.content ?? "") + placeholder,
      }));
    }}
  />
</div>
```

**Note** : ce pattern simple **append** le placeholder à la fin du content. Une version plus avancée injecterait au curseur, mais nécessite un ref vers le textarea. Pour MVP, l'append suffit — l'admin peut couper-coller le placeholder au bon endroit après.

Si tu identifies que le composant utilisé est un `RichTextEditor` avec API plus avancée (e.g. `editorRef.current.insertAtCursor()`), adapter le callback. Sinon, l'append est suffisant.

- [ ] **Step 4: Vérifier**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Tests "`
Expected: `Tests  550 passed (550)`

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(dashboard)/admin/documents/page.tsx'
git commit -m "feat(documents): InsertVariableButton dans modal édition template (V2.3)

Ajoute le composant <InsertVariableButton context='document'> au-dessus
de l'éditeur de contenu dans le modal création/édition de template.

Réutilisation du composant existant src/components/editor/
InsertVariableButton.tsx (utilisé par /admin/emails depuis longtemps).
Popover avec search + categorized list de TEMPLATE_VARIABLES filtrées
par availableIn:'document'.

Callback onInsert : append le placeholder à la fin du content. Une
version plus avancée (injection au curseur) demanderait un ref vers
le textarea — out-of-scope V2.

Réduction friction : l'admin n'a plus besoin de quitter la page pour
découvrir les noms exacts des variables (avant : navigation vers
/admin/documents/variables).

Refs: docs/superpowers/specs/2026-05-27-admin-documents-volet-2-patch-ux-design.md § 4.3"
```

---

## Task 4: Vérification finale

**Files:** Aucun (vérifications uniquement)

- [ ] **Step 1: Suite Vitest complète verte**

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files  49 passed (49)` et `Tests  550 passed (550)`

- [ ] **Step 2: TypeScript strict clean**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie

- [ ] **Step 3: Build Next.js success**

Run: `npm run build 2>&1 | grep -E "Compiled|error\b|Error\b" | head -3`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Grep cohérence**

```bash
# Bouton Envoyer sur Officials (1 occurrence dans la map catTemplates)
grep -n "handleSendOfficial" 'src/app/(dashboard)/admin/documents/page.tsx'
# Expected: au moins 2 lignes (déclaration + usage onClick)

# Helper findOrCreateCustomFromOfficial
grep -n "findOrCreateCustomFromOfficial" 'src/app/(dashboard)/admin/documents/page.tsx'
# Expected: 2 lignes (déclaration + appel dans handleSendOfficial)

# ChooseTemplateDialog rendu
grep -n "<ChooseTemplateDialog" 'src/app/(dashboard)/admin/documents/page.tsx'
# Expected: 1 ligne

# QuickAction ne contient plus setActiveTab('custom')
grep -nE "setActiveTab\(.custom.\)" 'src/app/(dashboard)/admin/documents/page.tsx'
# Expected: peut encore exister dans d'autres contextes (e.g. après création template),
# mais PAS dans la QuickAction "Envoyer à un apprenant"

# InsertVariableButton dans modal édition
grep -n "<InsertVariableButton" 'src/app/(dashboard)/admin/documents/page.tsx'
# Expected: 1 ligne
```

- [ ] **Step 5: Récap des commits**

Run: `git log --oneline 868106c..HEAD`

Expected : 3 commits :
```
<sha> feat(documents): InsertVariableButton dans modal édition template (V2.3)
<sha> fix(documents): QuickAction 'Envoyer à un apprenant' ouvre ChooseTemplateDialog (V2.2)
<sha> feat(documents): bouton Envoyer sur templates Officials (V2.1)
```

---

## Task 5: STOP — smoke check manuel par Wissam (~15 min)

**Files:** Aucun (procédure manuelle)

> ⚠️ **Le subagent S'ARRÊTE ICI.** Le controller (Claude) présente la procédure ci-dessous à Wissam et attend la décision Go/No-go. Task 6 ne se déclenche **qu'après** le Go.

### Procédure smoke check

**A. Bouton "Envoyer" sur Officials**
1. Ouvrir `/admin/documents` → onglet Catalogue (par défaut)
2. ☐ Chaque card Official a maintenant **3 boutons** : Envoyer / Aperçu / Modifier ma version (ou Utiliser comme base)
3. Cliquer "Envoyer" sur Convocation
4. ☐ Dialog SEND s'ouvre, template "Convocation à la formation (personnalisé)" pré-sélectionné
5. ☐ Si c'est le 1er click sur Convocation depuis cette entité, une nouvelle entrée apparaît dans "Mes modèles" (à vérifier en basculant onglet Custom)
6. ☐ Si on re-clique "Envoyer" sur Convocation, ça réutilise la même copie (pas de doublon)
7. Sélectionner destinataire (apprenant ou session) + sujet/corps → cliquer "Envoyer"
8. ☐ Toast succès "X email(s) programmé(s)"
9. ☐ Email arrive sous 5 min avec PDF Convocation

**B. QuickAction "Envoyer à un apprenant"**
1. Cliquer le bouton vert "Envoyer à un apprenant" en haut de page
2. ☐ Le nouveau Dialog "Choisir un modèle à envoyer" s'ouvre (PAS de bascule vers onglet Custom)
3. ☐ Liste **Officials** + **Mes modèles** avec search fonctionnel
4. Cliquer un template Custom
5. ☐ ChooseTemplateDialog se ferme, Dialog SEND s'ouvre avec le template sélectionné
6. Cliquer "Envoyer" → toast succès

**C. InsertVariableButton dans modal édition**
1. Onglet Custom → cliquer "Nouveau modèle" (ou modifier un existant)
2. ☐ Modal édition s'ouvre, bouton "Variables" visible au-dessus de l'éditeur
3. Cliquer "Variables" → popover s'ouvre avec liste catégorisée
4. Cliquer sur `{{nom_apprenant}}` (ou son label)
5. ☐ Le placeholder `[%Nom de l'apprenant%]` s'ajoute à la fin du content
6. ☐ Tester avec search : taper "date" → liste filtrée

**D. Non-régression**
1. ☐ Workflow Custom "Envoyer" existant marche encore (depuis card Custom → bouton Envoyer)
2. ☐ Workflow "Utiliser comme base" marche encore (sur Officials sans copie DB)
3. ☐ Tabs sticky V3 marchent toujours (Catalogue / Variables / Importer / Aide)
4. ☐ Aucun crash console

### Décision

- ✅ **Go** : Task 6 (merge + push prod)
- ❌ **No-go** : noter le finding, fix, re-tester

---

## Task 6: Après Go — finishing-a-development-branch

**Files:** Aucun (orchestration git)

- [ ] **Step 1: Invoquer finishing-a-development-branch**

Annoncer : "I'm using the finishing-a-development-branch skill to complete this work."

Utiliser superpowers:finishing-a-development-branch :
1. Verify tests : `npx vitest run` → 550 passed
2. Determine base : main
3. Pattern habituel : **merge local sur main + push prod**
4. Cleanup branch `feat/admin-documents-volet-2-patch-ux`

- [ ] **Step 2: Confirmer push prod**

Run: `git log --oneline origin/main..HEAD` (après push)
Expected: liste vide.

---

## Résumé du sous-chantier

| Task | Livrable | Estimation |
|------|----------|-----------|
| 0 | Baseline + branche + lectures pattern auto-copie + Dialog SEND + InsertVariableButton | 20 min |
| 1 | Helper `findOrCreateCustomFromOfficial` + bouton "Envoyer" sur 12 cards Officials | 1h |
| 2 | `ChooseTemplateDialog` + repair QuickAction "Envoyer à un apprenant" | 1h |
| 3 | `<InsertVariableButton>` dans modal édition template | 30 min |
| 4 | Vérification finale (Vitest + tsc + build + greps) | 15 min |
| 5 | STOP smoke check Wissam (~15 min) | manuel |
| 6 | Finishing | 10 min |
| **Total** | | **~3h** |

**Critères d'acceptance** (cf. spec § 6) : tous validés avant Task 6.

**Risque prod** : faible — pure ajout de UI, pas de modif backend, pas de modif Dialog SEND existant. La seule "complexité" est l'auto-copie DB qui réutilise un pattern existant éprouvé.

**Score qualité `/admin/documents`** : ~5.5/10 → **~7/10 estimé** (3 douleurs UX fixées, layout préservé).

**Limitation connue documentée** : l'auto-copie DB pollue "Mes modèles" avec des copies auto-créées (1 par doc_type Official cliqué). À cleanup dans un futur volet (V2.4 ou V2.5).
