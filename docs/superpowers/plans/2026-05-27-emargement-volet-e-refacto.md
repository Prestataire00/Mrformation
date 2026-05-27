# Sous-chantier Émargement — Volet E Refacto Architectural Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Découper TabEmargements.tsx (1232 LOC) en 5 sous-composants logiques dans `_components/emargements/` pour améliorer la maintenabilité, en suivant le pattern de référence TabQuestionnaires post-Volet D.

**Architecture:**
1. Pure réorganisation : aucune logique métier modifiée, juste extraction de portions JSX + handlers locaux dans des composants séparés.
2. Stratégie 1 commit par extraction (bisect-friendly si régression).
3. Le state critique reste dans le parent (passé en props comme `state` + `setState`) — anti-pattern context API évité.
4. Ordre intentionnel : moins risqué d'abord (HeroStats, UI pure), BulkSignDialog (critique Volet A canvas) en dernier.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Vitest baseline 550 tests, shadcn/ui (Dialog, Select, Button, Progress, Badge), TailwindCSS, Lucide icons.

**Branche cible** : `feat/emargement-volet-e-refacto` (depuis `main` à `bd47247`).

**Source spec** : [docs/superpowers/specs/2026-05-27-emargement-volet-e-refacto-design.md](../specs/2026-05-27-emargement-volet-e-refacto-design.md)

---

## File Structure

**Created** :
- `src/app/(dashboard)/admin/formations/[id]/_components/emargements/HeroStatsAndWorkflow.tsx`
- `src/app/(dashboard)/admin/formations/[id]/_components/emargements/CompanyFilter.tsx`
- `src/app/(dashboard)/admin/formations/[id]/_components/emargements/QrCodesDialog.tsx`
- `src/app/(dashboard)/admin/formations/[id]/_components/emargements/SingleSignDialog.tsx`
- `src/app/(dashboard)/admin/formations/[id]/_components/emargements/BulkSignDialog.tsx`

**Modified** :
- `src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx` : 1232 → ~740 LOC

**Pas extraits volontairement** (décision spec § 3.1) :
- DocumentExportActions : pas de JSX propre (les boutons d'export vivent dans HeroStatsAndWorkflow, les 4 handlers restent dans le parent)
- SignatureManagement : `handleDeleteSignature` est utilisé inline dans `renderPersonRow` qui reste dans le parent
- SlotsList (~390 LOC) : trop fortement couplé au state parent
- QrGenerationActions : YAGNI, bien isolé inline

---

## Task 0: Baseline + branche + créer dossier `emargements/`

**Files:** Création directory uniquement

- [ ] **Step 1: Vérifier état initial**

Run: `git status`
Expected: `On branch main, ...` (untracked .claude/skills/* OK)

Run: `git log -1 --oneline`
Expected: dernier commit doc

Run: `npx vitest run --reporter=basic 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files  49 passed (49)` et `Tests  550 passed (550)`

Run: `npx tsc --noEmit 2>&1 | head -3`
Expected: aucune sortie

- [ ] **Step 2: Créer la branche depuis main**

```bash
git checkout -b feat/emargement-volet-e-refacto
```

- [ ] **Step 3: Créer le dossier `emargements/`**

```bash
mkdir -p 'src/app/(dashboard)/admin/formations/[id]/_components/emargements'
```

- [ ] **Step 4: Confirmer la baseline LOC du parent**

Run: `wc -l 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'`
Expected: `1232` (baseline avant refacto)

Pas de commit pour Task 0 (juste setup).

---

## Task 1: Extract `HeroStatsAndWorkflow.tsx` (~140 LOC)

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/emargements/HeroStatsAndWorkflow.tsx`
- Modify: TabEmargements.tsx (remplace lignes 662-798 par `<HeroStatsAndWorkflow />`)

**Pourquoi en premier** : pure UI, aucun state local, faible coupling. Permet de rôder le pattern avant d'attaquer les Dialogs.

- [ ] **Step 1: Lire la section à extraire**

Run: `sed -n '662,798p' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'`

Tu dois voir :
- "HERO ROW" : grid 3 cards (Signatures, Taux de présence, Créneaux) avec progress bar
- "3 CARDS WORKFLOW" : Préparer (QR codes generation), Collecter (live mode link), Vérifier (export PDF)

Ces sections référencent :
- Variables computées : `totalSigned`, `totalExpected`, `completionPct`, `timeSlots.length`, `formation.id`
- Handlers : `handleGenerateAllTokens`, `handleExportPdf`, `handleSendToTrainer`, `handleDownloadPlanningHebdo`, `handleExportEmargementPdf`, `handleExportEmargementPerCompany`, `handlePrintEmpty`
- State : `generatingTokens`, `exportingPdf`, `sendingToTrainer`, `pdfProgress`

Le composant extrait recevra TOUS ces éléments en props.

- [ ] **Step 2: Créer le composant `HeroStatsAndWorkflow.tsx`**

Créer `src/app/(dashboard)/admin/formations/[id]/_components/emargements/HeroStatsAndWorkflow.tsx`.

Squelette à compléter avec le JSX exact copié des lignes 662-798 :

```tsx
"use client";

import {
  QrCode, Send, Printer, CheckSquare, Loader2, Download,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface HeroStatsAndWorkflowProps {
  formationId: string;
  hasTimeSlots: boolean;
  totalSigned: number;
  totalExpected: number;
  completionPct: number;
  timeSlotsCount: number;
  // Workflow card states
  generatingTokens: boolean;
  exportingPdf: boolean;
  sendingToTrainer: boolean;
  pdfProgress: { current: number; total: number };
  // Workflow card handlers
  onGenerateAllTokens: () => void;
  onExportPdf: () => void;
  onSendToTrainer: () => void;
  onDownloadPlanningHebdo: () => void;
  onExportEmargementPdf: () => void;
  onExportEmargementPerCompany: () => void;
  onPrintEmpty: () => void;
  // Visibility for per-company button (INTER only)
  hasMultipleCompanies: boolean;
}

export function HeroStatsAndWorkflow(props: HeroStatsAndWorkflowProps) {
  return (
    <>
      {/* PASTE ICI le bloc JSX original lignes 662-798 (HERO ROW + 3 CARDS WORKFLOW) */}
      {/* En remplaçant via Find & Replace :
         - timeSlots.length > 0 → props.hasTimeSlots
         - totalSigned → props.totalSigned
         - totalExpected → props.totalExpected
         - completionPct → props.completionPct
         - timeSlots.length → props.timeSlotsCount
         - formation.id → props.formationId
         - handleGenerateAllTokens → props.onGenerateAllTokens
         - generatingTokens → props.generatingTokens
         - handleExportPdf → props.onExportPdf
         - exportingPdf → props.exportingPdf
         - pdfProgress → props.pdfProgress
         - handleSendToTrainer → props.onSendToTrainer
         - sendingToTrainer → props.sendingToTrainer
         - handleDownloadPlanningHebdo → props.onDownloadPlanningHebdo
         - handleExportEmargementPdf → props.onExportEmargementPdf
         - handleExportEmargementPerCompany → props.onExportEmargementPerCompany
         - handlePrintEmpty → props.onPrintEmpty
         - companies.length > 1 → props.hasMultipleCompanies
      */}
    </>
  );
}
```

- [ ] **Step 3: Remplacer la section dans TabEmargements**

Ajouter l'import en haut (après les imports `@/lib/...`) :

```tsx
import { HeroStatsAndWorkflow } from "./emargements/HeroStatsAndWorkflow";
```

Remplacer le bloc lignes 662-798 (les 2 sections HERO ROW + 3 CARDS WORKFLOW) par :

```tsx
      <HeroStatsAndWorkflow
        formationId={formation.id}
        hasTimeSlots={timeSlots.length > 0}
        totalSigned={totalSigned}
        totalExpected={totalExpected}
        completionPct={completionPct}
        timeSlotsCount={timeSlots.length}
        generatingTokens={generatingTokens}
        exportingPdf={exportingPdf}
        sendingToTrainer={sendingToTrainer}
        pdfProgress={pdfProgress}
        onGenerateAllTokens={handleGenerateAllTokens}
        onExportPdf={handleExportPdf}
        onSendToTrainer={handleSendToTrainer}
        onDownloadPlanningHebdo={handleDownloadPlanningHebdo}
        onExportEmargementPdf={handleExportEmargementPdf}
        onExportEmargementPerCompany={handleExportEmargementPerCompany}
        onPrintEmpty={handlePrintEmpty}
        hasMultipleCompanies={companies.length > 1}
      />
```

- [ ] **Step 4: Vérifier TypeScript clean + Vitest vert**

```bash
npx tsc --noEmit 2>&1 | head -10
# Expected: aucune sortie

npx vitest run --reporter=basic 2>&1 | grep -E "Tests "
# Expected: Tests  550 passed (550)
```

Si TS pleure sur un prop manquant ou un type incompatible, ajuste l'interface ou le passage de prop. **Ne PAS modifier la logique métier.**

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/emargements/HeroStatsAndWorkflow.tsx' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'
git commit -m "refactor(emargement): extract HeroStatsAndWorkflow from TabEmargements (Volet E)

Première extraction du Sous-chantier 4. Pure réorganisation, aucun
changement de comportement.

Le composant rend les 2 sections du haut de TabEmargements :
- HERO ROW : 3 cards stats (Signatures, Taux présence, Créneaux)
- 3 CARDS WORKFLOW : Préparer (QR codes), Collecter (mode live), Vérifier (export)

Props : state computé + state UI + handlers async (passés en callbacks).
Aucun state local — UI pure pilotée par le parent.

Parent TabEmargements : 1232 → ~1090 LOC.

Refs: docs/superpowers/specs/2026-05-27-emargement-volet-e-refacto-design.md § 4.4"
```

---

## Task 2: Extract `CompanyFilter.tsx` (~30 LOC)

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/emargements/CompanyFilter.tsx`
- Modify: TabEmargements.tsx (remplace bloc filtre lignes ~628-660)

- [ ] **Step 1: Lire la section à extraire**

Run: `sed -n '628,665p' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'`

Tu dois voir le bloc `{formationKind === "inter" && companies.length > 0 && (...)}` avec un Select shadcn.

- [ ] **Step 2: Créer le composant `CompanyFilter.tsx`**

```tsx
"use client";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Company {
  client_id: string;
  client_name: string;
}

interface CompanyFilterProps {
  isInter: boolean;
  companies: Company[];
  filterClientId: string | null;
  onChange: (clientId: string | null) => void;
}

export function CompanyFilter({ isInter, companies, filterClientId, onChange }: CompanyFilterProps) {
  if (!isInter || companies.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 bg-blue-50">
      <span className="text-muted-foreground">Filtrer par entreprise :</span>
      <Select
        value={filterClientId ?? "all"}
        onValueChange={(v) => onChange(v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-[240px]">
          <SelectValue placeholder="Toutes les entreprises" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes les entreprises</SelectItem>
          {companies.map((c) => (
            <SelectItem key={c.client_id} value={c.client_id}>
              {c.client_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

**Note sur le type Company** : si TS pleure sur le passage `companies` (parent type différent), importer le type exact depuis `@/lib/types` plutôt que redéclarer.

- [ ] **Step 3: Remplacer la section dans TabEmargements**

Ajouter l'import :
```tsx
import { CompanyFilter } from "./emargements/CompanyFilter";
```

Remplacer le bloc filtre par :
```tsx
      <CompanyFilter
        isInter={formationKind === "inter"}
        companies={companies}
        filterClientId={filterClientId}
        onChange={setFilterClientId}
      />
```

- [ ] **Step 4: Vérifier**

```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run --reporter=basic 2>&1 | grep -E "Tests "
```

Expected: clean + 550 passing.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/emargements/CompanyFilter.tsx' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'
git commit -m "refactor(emargement): extract CompanyFilter from TabEmargements (Volet E)

Composant trivial : Select shadcn pour filtrer par entreprise en formation INTER.
Visibilité gérée en interne (return null si non-INTER ou 0 entreprises).

Refs: docs/superpowers/specs/2026-05-27-emargement-volet-e-refacto-design.md § 4.4"
```

---

## Task 3: Extract `QrCodesDialog.tsx` (~150 LOC)

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/emargements/QrCodesDialog.tsx`
- Modify: TabEmargements.tsx (remplace Dialog QR codes lignes 1077-1227)

**Le plus gros Dialog** mais coupling faible. State `qrDialog`, `qrSlotTokens`, `qrImages` passé en props.

- [ ] **Step 1: Lire la section à extraire**

Run: `sed -n '1077,1227p' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'`

Tu dois voir le `<Dialog open={qrDialog} ...>` complet avec :
- Affichage des QR codes par slot
- Empty state si aucun apprenant
- Debug panel (gated NODE_ENV depuis Volet B+C)
- Bouton "Exporter en PDF"

- [ ] **Step 2: Lire le type `SlotTokensResponse` (lignes 40-60 environ)**

Run: `sed -n '40,60p' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'`

L'interface `SlotTokensResponse` doit migrer dans `QrCodesDialog.tsx` (puis être réexportée pour le parent qui l'utilise dans `setQrSlotTokens`).

- [ ] **Step 3: Créer le composant `QrCodesDialog.tsx`**

```tsx
"use client";

import { Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export interface SlotTokensResponse {
  slots: {
    slot: { id: string; title: string | null; start_time: string; end_time: string; slot_order: number };
    learner_tokens: { token: string; person: { id: string; first_name: string; last_name: string; email: string | null } }[];
    trainer_tokens: { token: string; person: { id: string; first_name: string; last_name: string; email: string | null } }[];
  }[];
  total_tokens: number;
  debug?: {
    session_id: string;
    slots_count: number;
    enrollments_count: number;
    enrollment_statuses: string[];
    enrollments_with_learner: number;
    trainers_count: number;
    trainers_with_data: number;
    enrollments_error: string | null;
    profile_entity_id: string;
    insert_errors: { type: string; phase?: string; code: string | undefined; message: string; details?: string; hint?: string }[];
    first_iteration_trace: { existing_data: boolean; existing_error: string | null; insert_data: boolean; insert_error: string | null } | null;
  };
}

interface QrCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qrSlotTokens: SlotTokensResponse | null;
  qrImages: Record<string, string>;
  exportingPdf: boolean;
  onExportPdf: () => void;
}

export function QrCodesDialog({
  open,
  onOpenChange,
  qrSlotTokens,
  qrImages,
  exportingPdf,
  onExportPdf,
}: QrCodesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* PASTE ICI le contenu original du Dialog lignes 1077-1227 (entre <Dialog> et </Dialog>) */}
        {/* Find & Replace :
           - qrDialog (en read-only context, e.g. open prop) → open (le composant utilise open directement)
           - qrSlotTokens (use) → qrSlotTokens (déstructuré)
           - qrImages (use) → qrImages (déstructuré)
           - handleExportPdf → onExportPdf
           - exportingPdf → exportingPdf (déstructuré)
           - setQrDialog(false) → onOpenChange(false)
        */}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Mettre à jour TabEmargements**

Retirer la déclaration de `interface SlotTokensResponse` lignes 40-60 (déplacée dans QrCodesDialog).

Ajouter l'import :
```tsx
import { QrCodesDialog, type SlotTokensResponse } from "./emargements/QrCodesDialog";
```

Remplacer le bloc Dialog (lignes 1077-1227) par :
```tsx
      <QrCodesDialog
        open={qrDialog}
        onOpenChange={setQrDialog}
        qrSlotTokens={qrSlotTokens}
        qrImages={qrImages}
        exportingPdf={exportingPdf}
        onExportPdf={handleExportPdf}
      />
```

- [ ] **Step 5: Vérifier**

```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run --reporter=basic 2>&1 | grep -E "Tests "
```

Expected: clean + 550 passing.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/emargements/QrCodesDialog.tsx' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'
git commit -m "refactor(emargement): extract QrCodesDialog from TabEmargements (Volet E)

Le plus gros Dialog (~150 LOC) avec coupling faible.
- Type SlotTokensResponse déplacé dans le composant (réexporté pour parent)
- Props : open, onOpenChange, qrSlotTokens, qrImages, exportingPdf, onExportPdf
- Aucun state local, parent garde le state
- Debug panel (NODE_ENV gate du Volet B+C) préservé

Refs: docs/superpowers/specs/2026-05-27-emargement-volet-e-refacto-design.md § 4.4"
```

---

## Task 4: Extract `SingleSignDialog.tsx` (~40 LOC)

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/emargements/SingleSignDialog.tsx`
- Modify: TabEmargements.tsx (remplace Dialog Sign on behalf lignes 1038-1075)

- [ ] **Step 1: Lire la section à extraire**

Run: `sed -n '1038,1075p' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'`

Tu dois voir le `<Dialog open={signDialog.open} ...>` avec SignaturePad + bouton Annuler.

- [ ] **Step 2: Créer le composant `SingleSignDialog.tsx`**

```tsx
"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { SignaturePad } from "@/components/signatures/SignaturePad";
import type { FormationTimeSlot } from "@/lib/types";

export interface SignDialogState {
  open: boolean;
  slotId: string;
  signerId: string;
  signerType: "learner" | "trainer";
  signerName: string;
}

interface SingleSignDialogProps {
  signDialog: SignDialogState;
  setSignDialog: (state: SignDialogState | ((prev: SignDialogState) => SignDialogState)) => void;
  timeSlots: FormationTimeSlot[];
  signing: boolean;
  onAdminSign: (svgData: string) => Promise<void>;
  formatSlotLabel: (slot: FormationTimeSlot) => string;
}

export function SingleSignDialog({
  signDialog,
  setSignDialog,
  timeSlots,
  signing,
  onAdminSign,
  formatSlotLabel,
}: SingleSignDialogProps) {
  return (
    <Dialog open={signDialog.open} onOpenChange={(open) => setSignDialog((prev) => ({ ...prev, open }))}>
      <DialogContent className="max-w-md">
        {/* PASTE ICI le contenu original du Dialog lignes 1040-1074 (entre <DialogContent> et </DialogContent>) */}
        {/* Find & Replace :
           - handleAdminSign → onAdminSign
           - signing → signing (déstructuré)
           - formatSlotLabel → formatSlotLabel (déstructuré)
           - timeSlots → timeSlots (déstructuré)
           - setSignDialog(prev => ({ ...prev, open: false })) → setSignDialog((prev) => ({ ...prev, open: false }))
        */}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Mettre à jour TabEmargements**

Retirer la déclaration inline de l'interface du state `signDialog` (déplacée dans SingleSignDialog).

Ajouter l'import :
```tsx
import { SingleSignDialog, type SignDialogState } from "./emargements/SingleSignDialog";
```

Modifier la déclaration `useState` du parent pour utiliser le type importé :
```tsx
const [signDialog, setSignDialog] = useState<SignDialogState>({
  open: false, slotId: "", signerId: "", signerType: "learner", signerName: ""
});
```

Remplacer le bloc Dialog (lignes 1038-1075) par :
```tsx
      <SingleSignDialog
        signDialog={signDialog}
        setSignDialog={setSignDialog}
        timeSlots={timeSlots}
        signing={signing}
        onAdminSign={handleAdminSign}
        formatSlotLabel={formatSlotLabel}
      />
```

- [ ] **Step 4: Vérifier**

```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run --reporter=basic 2>&1 | grep -E "Tests "
```

Expected: clean + 550 passing.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/emargements/SingleSignDialog.tsx' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'
git commit -m "refactor(emargement): extract SingleSignDialog from TabEmargements (Volet E)

Dialog 'Signer pour X' (~40 LOC). Props : signDialog state + setter,
timeSlots, signing, onAdminSign callback, formatSlotLabel helper.

Le type SignDialogState est déplacé dans le composant et réexporté
pour le parent.

Refs: docs/superpowers/specs/2026-05-27-emargement-volet-e-refacto-design.md § 4.4"
```

---

## Task 5: Extract `BulkSignDialog.tsx` (~80 LOC, **EN DERNIER** — Volet A critique)

**Files:**
- Create: `src/app/(dashboard)/admin/formations/[id]/_components/emargements/BulkSignDialog.tsx`
- Modify: TabEmargements.tsx (remplace Dialog bulk-sign 2 étapes lignes 960-1036)

**ATTENTION** : ce Dialog implémente le canvas 2-étapes Volet A (P0-2 fix). Toute régression = retour du bug `signature_data: "admin_bulk"` littéral. Smoke check stricte au Task 7.

- [ ] **Step 1: Lire la section à extraire**

Run: `sed -n '960,1036p' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'`

Tu dois voir :
- Dialog avec `step === "confirm"` (message + Suivant) ET `step === "sign"` (SignaturePad + Confirmer)
- Reset au close via `initialBulkSignState`
- Bouton "Confirmer" gated par `!bulkSignSlot.adminSignature`

- [ ] **Step 2: Lire aussi `BulkSignDialogState` + `initialBulkSignState` (lignes 379-395 environ)**

Run: `sed -n '379,400p' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'`

Ces types/constantes doivent migrer vers le composant + être réexportés pour le parent qui les utilise dans `handleBulkSign`.

- [ ] **Step 3: Créer le composant `BulkSignDialog.tsx`**

```tsx
"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { SignaturePad } from "@/components/signatures/SignaturePad";

export interface BulkSignDialogState {
  open: boolean;
  step: "confirm" | "sign";
  slotId: string;
  unsignedLearners: { id: string; name: string }[];
  unsignedTrainers: { id: string; name: string }[];
  adminSignature: string | null;
}

export const initialBulkSignState: BulkSignDialogState = {
  open: false,
  step: "confirm",
  slotId: "",
  unsignedLearners: [],
  unsignedTrainers: [],
  adminSignature: null,
};

interface BulkSignDialogProps {
  bulkSignSlot: BulkSignDialogState;
  setBulkSignSlot: (state: BulkSignDialogState | ((prev: BulkSignDialogState) => BulkSignDialogState)) => void;
  bulkSigning: boolean;
  onBulkSign: () => Promise<void>;
}

export function BulkSignDialog({
  bulkSignSlot,
  setBulkSignSlot,
  bulkSigning,
  onBulkSign,
}: BulkSignDialogProps) {
  return (
    <Dialog
      open={bulkSignSlot.open}
      onOpenChange={(open) => {
        if (!open) {
          setBulkSignSlot(initialBulkSignState);
        } else {
          setBulkSignSlot((prev) => ({ ...prev, open: true }));
        }
      }}
    >
      <DialogContent className="max-w-md">
        {/* PASTE ICI le JSX intérieur du Dialog lignes ~970-1035 (DialogHeader + ternaire step) */}
        {/* Find & Replace :
           - handleBulkSign → onBulkSign
           - bulkSigning → bulkSigning (déstructuré)
           - bulkSignSlot → bulkSignSlot (déstructuré)
           - setBulkSignSlot → setBulkSignSlot (déstructuré)
           - initialBulkSignState → initialBulkSignState (constante locale)
        */}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Mettre à jour TabEmargements**

Retirer `interface BulkSignDialogState` + `const initialBulkSignState` du parent (déplacés dans BulkSignDialog).

Ajouter l'import :
```tsx
import { BulkSignDialog, type BulkSignDialogState, initialBulkSignState } from "./emargements/BulkSignDialog";
```

Le parent utilise toujours `initialBulkSignState` (reset dans `handleBulkSign` après envoi) et `BulkSignDialogState` (typing du `useState`). Les imports les rendent disponibles.

Remplacer le bloc Dialog (lignes 960-1036) par :
```tsx
      <BulkSignDialog
        bulkSignSlot={bulkSignSlot}
        setBulkSignSlot={setBulkSignSlot}
        bulkSigning={bulkSigning}
        onBulkSign={handleBulkSign}
      />
```

- [ ] **Step 5: Vérifier (STRICTE pour Volet A)**

```bash
npx tsc --noEmit 2>&1 | head -10
# Expected: clean

npx vitest run --reporter=basic 2>&1 | grep -E "Tests "
# Expected: Tests  550 passed (550)

grep -rn '"admin_bulk"' 'src/app/(dashboard)/admin/formations/[id]/_components/' --include="*.tsx"
# Expected: aucune sortie (la string littérale du bug Volet A pré-fix ne doit JAMAIS apparaître côté client)
```

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/emargements/BulkSignDialog.tsx' 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'
git commit -m "refactor(emargement): extract BulkSignDialog from TabEmargements (Volet E)

Dialog bulk-sign 2-étapes (confirm → sign) du Volet A.
- BulkSignDialogState + initialBulkSignState déplacés dans le composant
  (réexportés pour parent qui les utilise dans handleBulkSign)
- Props : bulkSignSlot state + setter, bulkSigning, onBulkSign callback
- Reset au close préservé (anti-fuite état)
- SignaturePad partagé + validation isValidAdminBulkSignature préservés

CRITIQUE : pas de régression sur P0-2 fix (admin signature SVG réelle,
pas la string 'admin_bulk' littérale).

Refs: docs/superpowers/specs/2026-05-27-emargement-volet-e-refacto-design.md § 4.4"
```

---

## Task 6: Cleanup final + vérification finale

**Files:**
- Modify (si nécessaire): TabEmargements.tsx (imports orphelins)

- [ ] **Step 1: Vérifier les imports orphelins**

Run: `npx tsc --noEmit 2>&1 | grep -i "is declared but" | head -5`
Expected: aucune sortie. Si TS flag un import non utilisé, le retirer.

Run (manuel) : ouvrir `TabEmargements.tsx`, scroller les imports en haut. Identifier les imports qui ne sont plus utilisés depuis les 5 extractions (e.g. certaines icônes Lucide, types).

Si tu vois des imports non utilisés, les retirer.

- [ ] **Step 2: Vérifier le LOC du parent**

Run: `wc -l 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'`
Expected: entre **600 et 800 LOC** (cible ~740 LOC).

Si > 800, vérifier qu'il n'y a pas de bloc oublié dans une extraction.
Si < 600, peut-être qu'une extraction a accidentellement supprimé du contenu.

- [ ] **Step 3: Vérification finale globale**

```bash
npx vitest run --reporter=basic 2>&1 | grep -E "Test Files|Tests "
# Expected: Test Files  49 passed (49) + Tests  550 passed (550)

npx tsc --noEmit 2>&1 | head -5
# Expected: aucune sortie

npm run build 2>&1 | grep -E "Compiled|error\b|Error\b" | head -3
# Expected: ✓ Compiled successfully (les Dynamic server usage sur d'autres routes sont pré-existants)
```

- [ ] **Step 4: Récap des commits**

Run: `git log --oneline main..HEAD`

Expected : 5 commits :
```
<sha> refactor(emargement): extract BulkSignDialog from TabEmargements (Volet E)
<sha> refactor(emargement): extract SingleSignDialog from TabEmargements (Volet E)
<sha> refactor(emargement): extract QrCodesDialog from TabEmargements (Volet E)
<sha> refactor(emargement): extract CompanyFilter from TabEmargements (Volet E)
<sha> refactor(emargement): extract HeroStatsAndWorkflow from TabEmargements (Volet E)
```

- [ ] **Step 5: Commit du cleanup (si nécessaire)**

Si Step 1 a retiré des imports orphelins, commit :
```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx'
git commit -m "refactor(emargement): cleanup imports orphelins post-extractions (Volet E)

Suite aux 5 extractions, certains imports (icônes Lucide, types) ne
sont plus utilisés dans le parent. Cleanup.

Refs: docs/superpowers/specs/2026-05-27-emargement-volet-e-refacto-design.md § 4.4"
```

Si aucun import à retirer, pas de commit.

---

## Task 7: STOP — smoke check manuel par Wissam (~20 min)

**Files:** Aucun (procédure manuelle)

> ⚠️ **Le subagent S'ARRÊTE ICI.** Le controller (Claude) présente la procédure ci-dessous à Wissam et attend la décision Go/No-go. Task 8 ne se déclenche **qu'après** le Go.

### Procédure smoke check

**A. Affichage de base**
- [ ] Ouvrir `/admin/formations/<session-uuid>` → onglet Émargement
- [ ] HeroStats visible (3 cards Signatures/Taux/Créneaux)
- [ ] 3-card workflow visible (Préparer / Collecter / Vérifier)
- [ ] Slots et apprenants affichés correctement

**B. Filtre INTER (si applicable)**
- [ ] En formation INTER → CompanyFilter visible
- [ ] Sélectionner une entreprise → liste filtrée
- [ ] "Toutes les entreprises" → liste complète

**C. Exports PDF**
- [ ] Export planning hebdo signé → PDF téléchargé
- [ ] Export feuille émargement → PDF téléchargé
- [ ] Export per-company (INTER) → N PDFs téléchargés

**D. QR Codes (QrCodesDialog)**
- [ ] Cliquer "Générer QR codes" → Dialog s'ouvre
- [ ] Codes individuels visibles
- [ ] Empty state si pas d'apprenants
- [ ] Bouton "Exporter en PDF" depuis le Dialog marche

**E. Single sign (SingleSignDialog)**
- [ ] Cliquer "Signer pour X" → Dialog s'ouvre
- [ ] Canvas SignaturePad marche
- [ ] Confirmer → toast succès, signature visible

**F. Bulk sign (BulkSignDialog) — CRITIQUE Volet A**
- [ ] Cliquer "Marquer tous présents" → Dialog 2-étapes s'ouvre
- [ ] Étape 1 (confirm) : message + bouton Suivant
- [ ] Étape 2 (sign) : SignaturePad visible, bouton Confirmer disabled tant que pas signé
- [ ] Dessiner → bouton Confirmer activé
- [ ] Confirmer → toast succès
- [ ] Vérifier DB : signatures ont `signature_data` = SVG (pas "admin_bulk")

**G. Suppression signature**
- [ ] Icône poubelle sur une signature existante → confirm + toast succès
- [ ] Signature retirée de la liste

### Décision

- ✅ **Go** : Task 8 (merge + push prod)
- ❌ **No-go** : noter le finding, fix, re-tester

---

## Task 8: Après Go — finishing-a-development-branch

**Files:** Aucun (orchestration git)

- [ ] **Step 1: Invoquer finishing-a-development-branch**

Annoncer : "I'm using the finishing-a-development-branch skill to complete this work."

Utiliser superpowers:finishing-a-development-branch :
1. Verify tests : `npx vitest run` → 550 passed
2. Determine base : main
3. Pattern habituel : **merge local sur main + push prod**
4. Cleanup branch `feat/emargement-volet-e-refacto`

- [ ] **Step 2: Confirmer push prod**

Run: `git log --oneline origin/main..HEAD` (après push)
Expected: liste vide.

---

## Résumé du sous-chantier

| Task | Livrable | Estimation |
|------|----------|-----------|
| 0 | Baseline + branche + dossier | 10 min |
| 1 | Extract HeroStatsAndWorkflow (~140 LOC) | 1h |
| 2 | Extract CompanyFilter (~30 LOC) | 30 min |
| 3 | Extract QrCodesDialog (~150 LOC, le plus gros) | 1.5h |
| 4 | Extract SingleSignDialog (~40 LOC) | 45 min |
| 5 | Extract BulkSignDialog (~80 LOC, **EN DERNIER**) | 1h |
| 6 | Cleanup imports + vérifs | 30 min |
| 7 | STOP smoke check Wissam (~20 min) | manuel |
| 8 | Finishing | 10 min |
| **Total** | | **~5-6h** |

**Critères d'acceptance** (cf. spec § 6) : tous validés avant Task 8.

**Risque prod** : faible — pure réorganisation, pas de logique métier modifiée. Le filet Volet F (11 tests load-signatures + coverage 100%) reste actif.

**Score qualité TabEmargements** : 8/10 maintenu (architecture invisible UX), mais **maintenabilité fortement améliorée** (5 composants extraits, parent passe de 1232 → ~740 LOC).
