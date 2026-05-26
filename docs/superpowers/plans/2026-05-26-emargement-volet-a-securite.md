# Sous-chantier Émargement — Volet A Sécurité Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fermer les 2 bugs P0 sécurité de l'émargement (RLS publique + signature littérale "admin_bulk") + audit défensif `entity_id` sur 7 routes INSERT/UPDATE/DELETE.

**Architecture:**
1. DROP de la policy RLS `signing_tokens_public_read TO anon USING (true)` via migration SQL — aucun consumer côté client anon (les pages publiques utilisent service_role serveur).
2. Refacto Dialog bulk-sign admin en 2 étapes (confirm → sign) avec réutilisation du composant `<SignaturePad>` existant. Helper `isValidAdminBulkSignature` partagé client+serveur en défense en profondeur.
3. Audit ciblé `entity_id` sur 7 routes INSERT/UPDATE/DELETE, livré comme doc verdict.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Vitest, Supabase (PostgreSQL + RLS), TailwindCSS + shadcn/ui Dialog, helpers `sanitizeSignatureSvg` existant.

**Branche cible** : `feat/emargement-volet-a-securite` (depuis `main` à `e15fe07`).

**Source spec** : [docs/superpowers/specs/2026-05-26-emargement-volet-a-securite-design.md](../specs/2026-05-26-emargement-volet-a-securite-design.md)

---

## File Structure

**Created** :
- `src/lib/utils/validate-bulk-signature.ts` — helper pur, validate qu'un signature_data n'est pas la string littérale "admin_bulk" et est un format image utilisable (data URL ou SVG raw)
- `src/lib/utils/__tests__/validate-bulk-signature.test.ts` — 5 tests TDD du helper
- `supabase/migrations/drop_signing_tokens_public_read.sql` — migration SQL DROP policy
- `docs/audits/2026-05-26-emargement-entity-id-audit.md` — résultats de l'audit Livrable 3

**Modified** :
- `src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx` :
  - L378-383 : extension du type state `bulkSignSlot` (ajout `step` + `adminSignature`)
  - L397-432 : `handleBulkSign` utilise `adminSignature` au lieu de "admin_bulk" + garde isValidAdminBulkSignature
  - L927-948 : Dialog rendu en 2 étapes (confirm → sign)
- `src/app/api/signatures/route.ts` :
  - L33-53 : import + appel `isValidAdminBulkSignature` après `sanitizeSignatureSvg` (refus 400)

**Pas touchés** :
- `src/components/signatures/SignaturePad.tsx` — réutilisé tel quel (prop `onSign(svgData: string) => void`)
- `src/lib/utils/sanitize-svg.ts` — laissé en place, le helper isValidAdminBulkSignature s'exécute après

---

## Task 0: Baseline + branche + grep recap

**Files:** Aucun

- [ ] **Step 1: Vérifier état initial (tests verts, TS clean)**

Run: `git status`
Expected: `On branch main, nothing to commit, working tree clean`

Run: `git log -1 --oneline`
Expected: `e15fe07 docs(spec): self-review corrections — routes audit précises + défense profondeur clarifiée`

Run: `npx vitest run --reporter=basic 2>&1 | tail -3`
Expected: `Tests  533 passed (533)`

Run: `npx tsc --noEmit 2>&1 | head -3`
Expected: aucune sortie (clean)

- [ ] **Step 2: Créer la branche depuis main**

```bash
git checkout -b feat/emargement-volet-a-securite
```

Expected: `Switched to a new branch 'feat/emargement-volet-a-securite'`

- [ ] **Step 3: Grep recap des 2 P0 confirmés**

Run: `grep -n '"admin_bulk"' src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabEmargements.tsx`
Expected (exact ligne 412) :
```
412:            signature_data: "admin_bulk",
```

Run: `grep -n 'signing_tokens_public_read' supabase/migrations/add_missing_rls_policies.sql`
Expected (lignes 36 + 40) :
```
36:CREATE POLICY "signing_tokens_public_read" ON signing_tokens
```

- [ ] **Step 4: Confirmer 0 consumer côté client anon pour signing_tokens**

Run: `grep -rn '\.from("signing_tokens")\|from(\"signing_tokens\")' src/app src/components src/lib 2>/dev/null`
Expected output : tous les hits sont dans `src/app/api/**` (routes serveur) ou `src/lib/services/` — pas de hit côté client (`use client`).

Cette vérification est critique pour confirmer que le DROP de la policy `TO anon` est zero-risk.

---

## Task 1: Helper `isValidAdminBulkSignature` (TDD)

**Files:**
- Create: `src/lib/utils/validate-bulk-signature.ts`
- Test: `src/lib/utils/__tests__/validate-bulk-signature.test.ts`

- [ ] **Step 1: Écrire les 5 tests Vitest failing-first**

Créer `src/lib/utils/__tests__/validate-bulk-signature.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { isValidAdminBulkSignature } from "@/lib/utils/validate-bulk-signature";

describe("isValidAdminBulkSignature", () => {
  it("rejette null et string vide", () => {
    expect(isValidAdminBulkSignature(null)).toBe(false);
    expect(isValidAdminBulkSignature("")).toBe(false);
  });

  it("rejette la string littérale 'admin_bulk' (bug historique)", () => {
    expect(isValidAdminBulkSignature("admin_bulk")).toBe(false);
  });

  it("accepte un data URL PNG", () => {
    expect(
      isValidAdminBulkSignature("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAAAAA="),
    ).toBe(true);
  });

  it("accepte un SVG raw (format émis par SignaturePad)", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 128"><path d="M0 0L10 10" stroke="#1d4ed8" stroke-width="2" fill="none"/></svg>';
    expect(isValidAdminBulkSignature(svg)).toBe(true);
  });

  it("rejette toute string sans préfixe data: ni structure SVG", () => {
    expect(isValidAdminBulkSignature("juste du texte")).toBe(false);
    expect(isValidAdminBulkSignature("admin_signature")).toBe(false);
    expect(isValidAdminBulkSignature("<html>not svg</html>")).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer les tests pour confirmer échec**

Run: `npx vitest run src/lib/utils/__tests__/validate-bulk-signature.test.ts --reporter=basic 2>&1 | tail -10`
Expected: `FAIL` avec message du type `Failed to load url @/lib/utils/validate-bulk-signature` (le fichier n'existe pas encore).

- [ ] **Step 3: Implémenter le helper minimal**

Créer `src/lib/utils/validate-bulk-signature.ts` :

```ts
/**
 * Valide qu'un signature_data est utilisable pour un bulk-sign admin (Qualiopi).
 *
 * Reject :
 *  - null / vide
 *  - La string littérale "admin_bulk" (bug historique pré-fix Volet A Émargement)
 *  - Toute string sans préfixe data:image/ ni structure SVG raw
 *
 * Accept :
 *  - data URL image (data:image/png;base64,..., data:image/jpeg, etc.)
 *  - SVG raw (commence par <svg, format émis par <SignaturePad>)
 *
 * Utilisé côté client (gate UI du bouton "Confirmer") et côté serveur (route
 * /api/signatures POST en défense en profondeur).
 */
export function isValidAdminBulkSignature(signatureData: string | null): boolean {
  if (!signatureData || typeof signatureData !== "string") return false;
  if (signatureData === "admin_bulk") return false;
  if (signatureData.startsWith("data:image/")) return true;
  if (signatureData.trim().startsWith("<svg")) return true;
  return false;
}
```

- [ ] **Step 4: Lancer les tests pour confirmer succès**

Run: `npx vitest run src/lib/utils/__tests__/validate-bulk-signature.test.ts --reporter=basic 2>&1 | tail -5`
Expected: `Tests  5 passed (5)`

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/validate-bulk-signature.ts src/lib/utils/__tests__/validate-bulk-signature.test.ts
git commit -m "feat(emargement): helper isValidAdminBulkSignature + 5 tests TDD

Le helper rejette :
- null / vide
- La string littérale 'admin_bulk' (bug P0-2 du deep-dive)
- Toute string non-image (texte brut, HTML)

Accepte :
- data URL image (PNG/JPG/etc.)
- SVG raw (format émis par <SignaturePad>)

Utilisé côté client (gate UI) et serveur (défense profondeur).

Refs: docs/superpowers/specs/2026-05-26-emargement-volet-a-securite-design.md § 4.2"
```

---

## Task 2: Migration SQL `drop_signing_tokens_public_read.sql`

**Files:**
- Create: `supabase/migrations/drop_signing_tokens_public_read.sql`

- [ ] **Step 1: Vérifier qu'aucun consumer côté client anon n'existe**

Run :
```bash
grep -rn 'from("signing_tokens")\|from(\\"signing_tokens\\")' src --include="*.ts" --include="*.tsx" 2>/dev/null
```

Expected : tous les hits doivent être dans `src/app/api/*` (routes serveur utilisant service_role) ou dans `src/lib/services/*` (services serveur). **Aucun hit dans des composants `"use client"`**.

Si un hit dans un composant client existe → STOP, escalation au user (le DROP casserait cette feature).

- [ ] **Step 2: Créer la migration SQL**

Créer `supabase/migrations/drop_signing_tokens_public_read.sql` :

```sql
-- ============================================================
-- Migration : Suppression de la policy RLS publique sur signing_tokens
-- ============================================================
-- Date : 2026-05-26
-- Source : Deep-dive TabEmargements (docs/deep-dive-tab-emargements.md)
-- Sous-chantier : Volet A Sécurité, P0-1
--
-- PROBLÈME :
-- La policy `signing_tokens_public_read TO anon USING (true)`
-- (introduite par add_missing_rls_policies.sql) permettait à n'importe
-- qui avec la clé anon de faire `GET /rest/v1/signing_tokens` et
-- d'énumérer la totalité des tokens de signature en base.
--
-- ANALYSE :
-- En pratique, aucun code applicatif ne s'appuie sur cette policy :
--  - Les pages publiques /sign/[token] passent par /api/documents/sign-status
--    et /api/documents/sign qui utilisent SUPABASE_SERVICE_ROLE_KEY
--    (bypass RLS complet).
--  - Aucun composant client n'interroge `signing_tokens` directement
--    (vérifié par grep avant cette migration).
--
-- FIX :
-- DROP de la policy publique. La policy `signing_tokens_authenticated_all`
-- (existante, avec filtrage entity_id strict) reste en place pour les
-- rôles authenticated.
-- ============================================================

DROP POLICY IF EXISTS "signing_tokens_public_read" ON signing_tokens;

-- ============================================================
-- ROLLBACK (en cas de besoin, à exécuter manuellement) :
-- CREATE POLICY "signing_tokens_public_read" ON signing_tokens
--   FOR SELECT TO anon
--   USING (true);
-- ============================================================
```

- [ ] **Step 3: Vérifier la syntaxe SQL (lecture seule)**

Run: `head -50 supabase/migrations/drop_signing_tokens_public_read.sql`
Expected: contenu lisible, pas d'erreurs visibles, le `DROP POLICY IF EXISTS` est bien le dernier statement avant le commentaire ROLLBACK.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/drop_signing_tokens_public_read.sql
git commit -m "feat(emargement): migration SQL DROP RLS signing_tokens_public_read (P0-1)

La policy 'signing_tokens_public_read TO anon USING (true)' permettait
l'énumération massive de tokens via PostgREST direct. Aucun consumer
côté client anon (vérifié par grep) — les pages publiques /sign/[token]
passent par /api/documents/sign-status qui utilise service_role.

Migration zero-risk côté code applicatif. À appliquer dans Supabase
Dashboard après merge (pattern habituel).

Refs: docs/superpowers/specs/2026-05-26-emargement-volet-a-securite-design.md § 4.1"
```

---

## Task 3: Défense en profondeur route `/api/signatures` POST

**Files:**
- Modify: `src/app/api/signatures/route.ts:33-53`

- [ ] **Step 1: Lire le contexte actuel autour de la validation**

Run: `sed -n '33,53p' src/app/api/signatures/route.ts`
Expected (extrait) :
```ts
export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "trainer", "learner"]);
  if (auth.error) return auth.error;

  try {
    const { session_id, signature_data, time_slot_id, signer_id: bodySignerId, signer_type: bodySignerType } = await request.json();

    if (!session_id || !signature_data) {
      return NextResponse.json(
        { error: "Les champs session_id et signature_data sont requis." },
        { status: 400 }
      );
    }

    // SÉCURITÉ : sanitize le SVG côté écriture (défense en profondeur).
    ...
    const sanitized_signature = sanitizeSignatureSvg(signature_data);
    if (!sanitized_signature || typeof sanitized_signature !== "string") {
      return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
    }
```

- [ ] **Step 2: Ajouter l'import en haut du fichier**

Ouvrir `src/app/api/signatures/route.ts` et ajouter (après les autres imports `@/lib/...`) :

```ts
import { isValidAdminBulkSignature } from "@/lib/utils/validate-bulk-signature";
```

- [ ] **Step 3: Ajouter la garde de validation après le sanitize**

Modifier le bloc autour de la ligne 50-53 (après `sanitized_signature` créé, avant la suite) :

**AVANT** :
```ts
    const sanitized_signature = sanitizeSignatureSvg(signature_data);
    if (!sanitized_signature || typeof sanitized_signature !== "string") {
      return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
    }
```

**APRÈS** :
```ts
    const sanitized_signature = sanitizeSignatureSvg(signature_data);
    if (!sanitized_signature || typeof sanitized_signature !== "string") {
      return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
    }

    // Défense en profondeur : refuser toute signature non-image (e.g. string
    // littérale "admin_bulk" du bug historique pré-fix Volet A Émargement).
    // Voir docs/deep-dive-tab-emargements.md § P0-2.
    if (!isValidAdminBulkSignature(sanitized_signature)) {
      return NextResponse.json(
        { error: "Signature invalide : format non utilisable pour Qualiopi." },
        { status: 400 },
      );
    }
```

- [ ] **Step 4: Vérifier TypeScript clean**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie (clean)

- [ ] **Step 5: Vérifier que les tests existants restent verts**

Run: `npx vitest run --reporter=basic 2>&1 | tail -3`
Expected: `Tests  538 passed (538)` (les 533 baseline + 5 nouveaux de Task 1)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/signatures/route.ts
git commit -m "feat(emargement): défense en profondeur /api/signatures POST (P0-2)

Refus 400 si signature_data n'est pas un format image utilisable
(data URL ou SVG raw). Utilise le helper isValidAdminBulkSignature
après le sanitizer existant. Couvre 3 cas :
- string littérale 'admin_bulk' (bug historique)
- Toute string non-image qui passerait par erreur
- Format de signature inutilisable pour Qualiopi

Garde côté serveur en plus du fix côté client (Tasks 4-6).

Refs: docs/superpowers/specs/2026-05-26-emargement-volet-a-securite-design.md § 4.2"
```

---

## Task 4: Extension du state `bulkSignSlot` (step + adminSignature)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx:378-383`

- [ ] **Step 1: Lire le state existant**

Run: `sed -n '376,384p' src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabEmargements.tsx`
Expected (extrait) :
```ts
  // ── Bulk sign all unsigned on a slot ──

  const [bulkSignSlot, setBulkSignSlot] = useState<{
    open: boolean;
    slotId: string;
    unsignedLearners: { id: string; name: string }[];
    unsignedTrainers: { id: string; name: string }[];
  }>({ open: false, slotId: "", unsignedLearners: [], unsignedTrainers: [] });
```

- [ ] **Step 2: Extraire l'interface et étendre avec step + adminSignature**

Remplacer le bloc lignes 376-383 :

**AVANT** :
```ts
  // ── Bulk sign all unsigned on a slot ──

  const [bulkSignSlot, setBulkSignSlot] = useState<{
    open: boolean;
    slotId: string;
    unsignedLearners: { id: string; name: string }[];
    unsignedTrainers: { id: string; name: string }[];
  }>({ open: false, slotId: "", unsignedLearners: [], unsignedTrainers: [] });
  const [bulkSigning, setBulkSigning] = useState(false);
```

**APRÈS** :
```ts
  // ── Bulk sign all unsigned on a slot ──

  interface BulkSignDialogState {
    open: boolean;
    step: "confirm" | "sign";
    slotId: string;
    unsignedLearners: { id: string; name: string }[];
    unsignedTrainers: { id: string; name: string }[];
    adminSignature: string | null;
  }

  const initialBulkSignState: BulkSignDialogState = {
    open: false,
    step: "confirm",
    slotId: "",
    unsignedLearners: [],
    unsignedTrainers: [],
    adminSignature: null,
  };

  const [bulkSignSlot, setBulkSignSlot] = useState<BulkSignDialogState>(initialBulkSignState);
  const [bulkSigning, setBulkSigning] = useState(false);
```

- [ ] **Step 3: Mettre à jour `openBulkSign` (ligne 386-395) pour fournir les nouveaux champs**

Run: `sed -n '386,395p' src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabEmargements.tsx`
Expected (extrait) :
```ts
  const openBulkSign = (slot: FormationTimeSlot) => {
    const slotSigs = getSignaturesForSlot(slot);
    const unsignedLearners = ...
    const unsignedTrainers = ...
    setBulkSignSlot({ open: true, slotId: slot.id, unsignedLearners, unsignedTrainers });
  };
```

Modifier le `setBulkSignSlot` à l'intérieur :

**AVANT** :
```ts
    setBulkSignSlot({ open: true, slotId: slot.id, unsignedLearners, unsignedTrainers });
```

**APRÈS** :
```ts
    setBulkSignSlot({
      open: true,
      step: "confirm",
      slotId: slot.id,
      unsignedLearners,
      unsignedTrainers,
      adminSignature: null,
    });
```

- [ ] **Step 4: Vérifier TypeScript clean**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie (clean)

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabEmargements.tsx
git commit -m "refactor(emargement): extraction interface BulkSignDialogState + step/adminSignature

Préparation au Dialog 2-étapes (confirm → sign).
- Interface BulkSignDialogState typée explicitement
- Ajout step: 'confirm' | 'sign' (état du wizard)
- Ajout adminSignature: string | null (signature dessinée par admin)
- Constante initialBulkSignState pour DRY au reset

Refs: docs/superpowers/specs/2026-05-26-emargement-volet-a-securite-design.md § 4.2"
```

---

## Task 5: Dialog 2-étapes (confirm → sign) avec SignaturePad

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx:927-948`

- [ ] **Step 1: Lire le Dialog existant**

Run: `sed -n '926,948p' src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabEmargements.tsx`
Expected (extrait) :
```tsx
      {/* ── Dialog: Bulk sign ── */}
      <Dialog open={bulkSignSlot.open} onOpenChange={(open) => setBulkSignSlot(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cocher les présences en masse</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Marquer {bulkSignSlot.unsignedLearners.length} apprenant{...} et{" "}
            {bulkSignSlot.unsignedTrainers.length} formateur{...} non
            encore signé{...} comme
            présent{...} sur ce créneau ?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkSignSlot(prev => ({ ...prev, open: false }))}>
              Annuler
            </Button>
            <Button onClick={handleBulkSign} disabled={bulkSigning}>
              {bulkSigning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 2: Remplacer le Dialog par la version 2-étapes**

Remplacer le bloc Dialog complet (lignes 926-948) :

**AVANT** :
```tsx
      {/* ── Dialog: Bulk sign ── */}
      <Dialog open={bulkSignSlot.open} onOpenChange={(open) => setBulkSignSlot(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cocher les présences en masse</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Marquer {bulkSignSlot.unsignedLearners.length} apprenant{bulkSignSlot.unsignedLearners.length !== 1 ? "s" : ""} et{" "}
            {bulkSignSlot.unsignedTrainers.length} formateur{bulkSignSlot.unsignedTrainers.length !== 1 ? "s" : ""} non
            encore signé{(bulkSignSlot.unsignedLearners.length + bulkSignSlot.unsignedTrainers.length) !== 1 ? "s" : ""} comme
            présent{(bulkSignSlot.unsignedLearners.length + bulkSignSlot.unsignedTrainers.length) !== 1 ? "s" : ""} sur ce créneau ?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkSignSlot(prev => ({ ...prev, open: false }))}>
              Annuler
            </Button>
            <Button onClick={handleBulkSign} disabled={bulkSigning}>
              {bulkSigning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

**APRÈS** :
```tsx
      {/* ── Dialog: Bulk sign (2 étapes : confirm → sign) ── */}
      <Dialog
        open={bulkSignSlot.open}
        onOpenChange={(open) => {
          if (!open) {
            // Reset au close pour éviter la fuite d'état entre 2 ouvertures
            setBulkSignSlot(initialBulkSignState);
          } else {
            setBulkSignSlot(prev => ({ ...prev, open: true }));
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {bulkSignSlot.step === "confirm"
                ? "Cocher les présences en masse"
                : "Votre signature (appliquée à tous)"}
            </DialogTitle>
          </DialogHeader>

          {bulkSignSlot.step === "confirm" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Marquer {bulkSignSlot.unsignedLearners.length} apprenant{bulkSignSlot.unsignedLearners.length !== 1 ? "s" : ""} et{" "}
                {bulkSignSlot.unsignedTrainers.length} formateur{bulkSignSlot.unsignedTrainers.length !== 1 ? "s" : ""} non
                encore signé{(bulkSignSlot.unsignedLearners.length + bulkSignSlot.unsignedTrainers.length) !== 1 ? "s" : ""} comme
                présent{(bulkSignSlot.unsignedLearners.length + bulkSignSlot.unsignedTrainers.length) !== 1 ? "s" : ""} sur ce créneau ?
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkSignSlot(initialBulkSignState)}>
                  Annuler
                </Button>
                <Button onClick={() => setBulkSignSlot(prev => ({ ...prev, step: "sign" }))}>
                  Suivant →
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-2">
                Dessinez votre signature. Elle sera enregistrée pour les{" "}
                {bulkSignSlot.unsignedLearners.length + bulkSignSlot.unsignedTrainers.length}{" "}
                personnes sélectionnées.
              </p>
              <SignaturePad
                label="Signature de l'administrateur"
                isSigned={!!bulkSignSlot.adminSignature}
                onSign={(svgData) => setBulkSignSlot(prev => ({ ...prev, adminSignature: svgData }))}
                onClear={() => setBulkSignSlot(prev => ({ ...prev, adminSignature: null }))}
                disabled={bulkSigning}
              />
              {bulkSigning && (
                <div className="flex items-center gap-2 text-sm text-blue-600 mt-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Enregistrement...
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setBulkSignSlot(prev => ({ ...prev, step: "confirm", adminSignature: null }))}
                  disabled={bulkSigning}
                >
                  ← Retour
                </Button>
                <Button
                  onClick={handleBulkSign}
                  disabled={bulkSigning || !bulkSignSlot.adminSignature}
                >
                  {bulkSigning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Confirmer
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
```

- [ ] **Step 3: Vérifier TypeScript clean**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie (clean)

- [ ] **Step 4: Vérifier que la suite Vitest reste verte (régression UI non testée mais le compilateur protège)**

Run: `npx vitest run --reporter=basic 2>&1 | tail -3`
Expected: `Tests  538 passed (538)`

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabEmargements.tsx
git commit -m "feat(emargement): Dialog bulk-sign 2 étapes (confirm → sign) avec SignaturePad

UX : l'admin doit dessiner sa signature avant le bulk-sign.
- Étape confirm : message existant + bouton Suivant
- Étape sign : <SignaturePad> + boutons Retour/Confirmer
- 'Confirmer' disabled tant que adminSignature null
- Reset complet au close (anti-fuite d'état)

Le handleBulkSign envoie toujours 'admin_bulk' à ce stade ;
la modification vient en Task 6.

Refs: docs/superpowers/specs/2026-05-26-emargement-volet-a-securite-design.md § 4.2"
```

---

## Task 6: `handleBulkSign` utilise `adminSignature` au lieu de "admin_bulk"

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx:397-432`

- [ ] **Step 1: Lire le handler actuel**

Run: `sed -n '397,432p' src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabEmargements.tsx`
Expected (extrait) :
```ts
  const handleBulkSign = async () => {
    setBulkSigning(true);
    let signed = 0;
    const all = [...];
    for (const person of all) {
      try {
        const res = await fetch("/api/signatures", {
          ...
          body: JSON.stringify({
            session_id: formation.id,
            signature_data: "admin_bulk",   // ← LITTÉRAL
            time_slot_id: bulkSignSlot.slotId,
            ...
          }),
        });
        ...
      } catch { }
    }
    ...
  };
```

- [ ] **Step 2: Ajouter l'import du helper en haut du fichier**

Run: `head -30 src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabEmargements.tsx`
Repérer le bloc d'imports `@/lib/utils/...`. Ajouter :

```ts
import { isValidAdminBulkSignature } from "@/lib/utils/validate-bulk-signature";
```

- [ ] **Step 3: Remplacer handleBulkSign avec garde + utilisation de adminSignature**

Remplacer le bloc complet `handleBulkSign` (lignes 397-432) :

**AVANT** :
```ts
  const handleBulkSign = async () => {
    setBulkSigning(true);
    let signed = 0;
    const all = [
      ...bulkSignSlot.unsignedTrainers.map(t => ({ id: t.id, type: "trainer" as const })),
      ...bulkSignSlot.unsignedLearners.map(l => ({ id: l.id, type: "learner" as const })),
    ];

    for (const person of all) {
      try {
        const res = await fetch("/api/signatures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: formation.id,
            signature_data: "admin_bulk",
            time_slot_id: bulkSignSlot.slotId,
            signer_id: person.id,
            signer_type: person.type,
          }),
        });
        if (res.ok) signed++;
      } catch {
        // continue on error
      }
    }

    if (signed > 0) {
      toast({ title: `${signed} présence${signed !== 1 ? "s" : ""} cochée${signed !== 1 ? "s" : ""} sur ce créneau` });
    } else {
      toast({ title: "Tous déjà signés" });
    }
    setBulkSignSlot(prev => ({ ...prev, open: false }));
    setBulkSigning(false);
    await onRefresh();
  };
```

**APRÈS** :
```ts
  const handleBulkSign = async () => {
    // Garde de sécurité : refuse si la signature admin n'est pas valide.
    // En pratique le bouton est disabled tant que adminSignature est null,
    // mais on garde la vérif en défense en profondeur (couvre une régression
    // future éventuelle du gate UI).
    if (!isValidAdminBulkSignature(bulkSignSlot.adminSignature)) {
      toast({
        title: "Signature manquante",
        description: "Dessinez votre signature avant de confirmer.",
        variant: "destructive",
      });
      return;
    }

    setBulkSigning(true);
    let signed = 0;
    const all = [
      ...bulkSignSlot.unsignedTrainers.map(t => ({ id: t.id, type: "trainer" as const })),
      ...bulkSignSlot.unsignedLearners.map(l => ({ id: l.id, type: "learner" as const })),
    ];

    for (const person of all) {
      try {
        const res = await fetch("/api/signatures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: formation.id,
            signature_data: bulkSignSlot.adminSignature,
            time_slot_id: bulkSignSlot.slotId,
            signer_id: person.id,
            signer_type: person.type,
          }),
        });
        if (res.ok) signed++;
      } catch {
        // continue on error
      }
    }

    if (signed > 0) {
      toast({ title: `${signed} présence${signed !== 1 ? "s" : ""} cochée${signed !== 1 ? "s" : ""} sur ce créneau` });
    } else {
      toast({ title: "Tous déjà signés" });
    }
    setBulkSignSlot(initialBulkSignState);
    setBulkSigning(false);
    await onRefresh();
  };
```

- [ ] **Step 4: Vérifier 0 occurrence de "admin_bulk" littérale restante**

Run: `grep -n '"admin_bulk"\|'\''admin_bulk'\''' src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabEmargements.tsx`
Expected: aucune sortie (la string littérale a totalement disparu du fichier).

Run (vérification cross-codebase) : `grep -rn '"admin_bulk"' src --include="*.ts" --include="*.tsx" 2>/dev/null`
Expected: aucune sortie côté client (les seules occurrences pourraient être dans les tests `validate-bulk-signature.test.ts` qui testent justement le rejet de cette string — c'est OK).

- [ ] **Step 5: Vérifier TypeScript clean + Vitest vert**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: aucune sortie (clean)

Run: `npx vitest run --reporter=basic 2>&1 | tail -3`
Expected: `Tests  538 passed (538)`

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabEmargements.tsx
git commit -m "fix(emargement): handleBulkSign envoie la signature admin réelle (P0-2)

Remplacement de la string littérale 'admin_bulk' par bulkSignSlot.adminSignature
(SVG raw dessiné par l'admin dans le canvas).

Garde de sécurité en début de fonction : refus + toast si signature
manquante (couvre une régression future éventuelle du gate UI).

Reset complet au close avec initialBulkSignState (anti-fuite d'état).

Score Qualiopi : les PDFs futurs contiendront une vraie signature
graphique, pas la string 'admin_bulk' (qui contaminait l'historique
selon le deep-dive).

Refs: docs/superpowers/specs/2026-05-26-emargement-volet-a-securite-design.md § 4.2"
```

---

## Task 7: Audit entity_id sur les 7 routes INSERT/UPDATE/DELETE

**Files:**
- Create: `docs/audits/2026-05-26-emargement-entity-id-audit.md`
- Modify (si findings) : routes API listées dans la spec § 4.3

- [ ] **Step 1: Créer le fichier doc d'audit (squelette)**

Créer `docs/audits/2026-05-26-emargement-entity-id-audit.md` :

```markdown
# Audit entity_id — Routes Émargement/Signatures

> **Date :** 2026-05-26
> **Sous-chantier :** Volet A Sécurité Émargement (Task 7 du plan)
> **Source spec :** [docs/superpowers/specs/2026-05-26-emargement-volet-a-securite-design.md](../superpowers/specs/2026-05-26-emargement-volet-a-securite-design.md) § 4.3

## Méthodologie

Pour chaque route, vérifier :
1. **INSERT** : la valeur `entity_id` est-elle passée à `.insert({...})` ?
   D'où vient-elle (auth.profile.entity_id, résolu via token, autre) ?
2. **UPDATE/DELETE** : le WHERE inclut-il `entity_id` (direct ou proxy via session_id) ?
3. Peut-on attaquer cross-tenant en passant un id d'une autre entité ?

## Verdict par route

### 1. `/api/signatures` POST (INSERT signatures)
**Référence :** [src/app/api/signatures/route.ts:132](../../src/app/api/signatures/route.ts#L132)
**Verdict :** ⏳ À auditer

### 2. `/api/signatures/[id]` DELETE (DELETE signatures)
**Référence :** `src/app/api/signatures/[id]/route.ts`
**Verdict :** ⏳ À auditer

### 3. `/api/emargement` POST (2× INSERT)
**Référence :** [src/app/api/emargement/route.ts:295](../../src/app/api/emargement/route.ts#L295) + :354
**Verdict :** ⏳ À auditer

### 4. `/api/emargement/slots` POST (4× INSERT + 2× UPDATE)
**Référence :** [src/app/api/emargement/slots/route.ts:152](../../src/app/api/emargement/slots/route.ts#L152), :287, :361, :264, :346
**Verdict :** ⏳ À auditer

### 5. `/api/emargement/sign` POST (INSERT signatures + signature_evidence + UPDATE used_at)
**Référence :** [src/app/api/emargement/sign/route.ts:119](../../src/app/api/emargement/sign/route.ts#L119), :169, :182
**Verdict :** ⏳ À auditer

### 6. `/api/emargement/post-session-eval` POST
**Référence :** [src/app/api/emargement/post-session-eval/route.ts:16](../../src/app/api/emargement/post-session-eval/route.ts#L16)
**Verdict :** ⏳ À auditer

### 7. `/api/sessions/[id]/auto-absences` POST (INSERT absences)
**Référence :** [src/app/api/sessions/[id]/auto-absences/route.ts:160](../../src/app/api/sessions/[id]/auto-absences/route.ts#L160)
**Verdict :** ⏳ À auditer

## Findings

(à remplir au fil de l'audit)

## Conclusion

(à remplir à la fin)
```

- [ ] **Step 2: Auditer la route 1 — `/api/signatures` POST**

Run: `sed -n '125,160p' src/app/api/signatures/route.ts`
Lire le bloc INSERT. Vérifier :
- L'INSERT contient-il `entity_id` ? Si oui, depuis quelle source ?
- Si pas dans l'INSERT direct, est-ce qu'il y a un check d'autorisation amont (e.g. l'enrollment vérifié appartient bien à l'entity de l'admin) ?

Mettre à jour la section "### 1. `/api/signatures` POST" dans le doc d'audit avec :
- **Verdict :** ✅ OK ou ⚠️ Fixed ou 🚨 Issue
- Citation du code pertinent
- Explication

- [ ] **Step 3: Auditer la route 2 — `/api/signatures/[id]` DELETE**

Run: `cat src/app/api/signatures/\[id\]/route.ts 2>/dev/null | head -50`
Si le fichier n'existe pas, noter dans le doc que la route est inexistante.
Sinon, vérifier le `.eq()` du `.delete()` — filtre-t-il sur entity_id ou un proxy session_id ?

- [ ] **Step 4: Auditer la route 3 — `/api/emargement` POST**

Run: `sed -n '254,360p' src/app/api/emargement/route.ts`
Vérifier les 2 INSERT (ligne 295 + 354).

- [ ] **Step 5: Auditer la route 4 — `/api/emargement/slots` POST**

Run: `sed -n '79,370p' src/app/api/emargement/slots/route.ts`
Vérifier les 4 INSERT (152, 287, 361) et 2 UPDATE (264, 346).

- [ ] **Step 6: Auditer la route 5 — `/api/emargement/sign` POST (route token public)**

Run: `sed -n '17,200p' src/app/api/emargement/sign/route.ts`
**Note** : cette route est publique (signe via token). L'entity_id doit être résolu via le token, pas l'auth utilisateur.

- [ ] **Step 7: Auditer la route 6 — `/api/emargement/post-session-eval` POST**

Run: `sed -n '1,80p' src/app/api/emargement/post-session-eval/route.ts`

- [ ] **Step 8: Auditer la route 7 — `/api/sessions/[id]/auto-absences` POST**

Run: `sed -n '1,170p' src/app/api/sessions/\[id\]/auto-absences/route.ts`

- [ ] **Step 9: Si findings → fix au fil de l'audit (1 commit par fix)**

Pour chaque finding 🚨 :
- Faire le fix minimal (e.g. ajouter `.eq("entity_id", auth.profile.entity_id)`)
- Tester localement (`npx tsc --noEmit`)
- Commit avec message du type :
```
fix(emargement): manque entity_id sur <route> (audit Task 7)

Découvert lors de l'audit entity_id (Task 7 du Volet A Sécurité).
La route X faisait INSERT sans entity_id, permettant à un admin
d'entité A de créer une signature pour une session d'entité B.

Refs: docs/audits/2026-05-26-emargement-entity-id-audit.md
```

- [ ] **Step 10: Finaliser la section Conclusion du doc d'audit**

Mettre à jour la section "## Conclusion" du doc avec :
- Nombre de routes auditées : 7
- Nombre de findings 🚨 trouvés : X
- Nombre de fix appliqués : Y
- Verdict global (✅ propre / ⚠️ avec corrections / 🚨 issues résiduelles)

- [ ] **Step 11: Commit du doc d'audit final**

```bash
git add docs/audits/2026-05-26-emargement-entity-id-audit.md
git commit -m "docs(audit): audit entity_id 7 routes émargement/signatures (Volet A Task 7)

Verdict route par route. <X> findings trouvés et fix dans la foulée.

Refs: docs/superpowers/specs/2026-05-26-emargement-volet-a-securite-design.md § 4.3"
```

---

## Task 8: Vérification finale

**Files:** Aucun (vérifications uniquement)

- [ ] **Step 1: Suite Vitest complète verte**

Run: `npx vitest run --reporter=basic 2>&1 | tail -5`
Expected: `Tests  538 passed (538)` (baseline 533 + 5 nouveaux du helper)

- [ ] **Step 2: TypeScript strict clean**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: aucune sortie (clean)

- [ ] **Step 3: Next.js build success**

Run: `npm run build 2>&1 | tail -10`
Expected: `✓ Compiled successfully` puis liste des routes.

- [ ] **Step 4: Récap des commits du sous-chantier**

Run: `git log --oneline e15fe07..HEAD`
Expected : ~7-10 commits de la forme :
```
<sha> feat(emargement): helper isValidAdminBulkSignature + 5 tests TDD
<sha> feat(emargement): migration SQL DROP RLS signing_tokens_public_read (P0-1)
<sha> feat(emargement): défense en profondeur /api/signatures POST (P0-2)
<sha> refactor(emargement): extraction interface BulkSignDialogState + step/adminSignature
<sha> feat(emargement): Dialog bulk-sign 2 étapes (confirm → sign) avec SignaturePad
<sha> fix(emargement): handleBulkSign envoie la signature admin réelle (P0-2)
<sha> docs(audit): audit entity_id 7 routes émargement/signatures (Volet A Task 7)
[<sha> fix(emargement): manque entity_id sur ... (si finding)]
```

- [ ] **Step 5: Vérification grep finale**

Run: `grep -rn '"admin_bulk"' src/app/\(dashboard\) --include="*.tsx" --include="*.ts" 2>/dev/null`
Expected: aucune sortie (la string littérale a totalement disparu côté client).

Run: `grep -rn "TO anon USING (true)" supabase/migrations/drop_signing_tokens_public_read.sql 2>/dev/null`
Expected: une ligne dans le commentaire ROLLBACK seulement (pas dans le DROP actif).

---

## Task 9: STOP — validation manuelle stricte par Wissam

**Files:** Aucun (procédure manuelle)

> ⚠️ **Le subagent S'ARRÊTE ICI.** Le controller (Claude) présente la procédure ci-dessous à Wissam et attend la décision Go/No-go. Task 10 ne se déclenche **qu'après** le Go.

### Procédure de validation manuelle

**A. Appliquer la migration SQL en prod**

1. Ouvrir le Supabase Dashboard du projet prod
2. Aller dans SQL Editor
3. Coller le contenu de `supabase/migrations/drop_signing_tokens_public_read.sql`
4. Run
5. Vérifier le message : `DROP POLICY` (sans erreur)

**B. Vérifier la fermeture de la faille RLS**

Run (depuis terminal local, avec env vars du `.env.local`) :
```bash
curl -s -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/signing_tokens?limit=1" \
  | head -5
```

- ☐ **AVANT migration** : renvoie un JSON array avec des objets `signing_tokens`
- ☐ **APRÈS migration** : renvoie `[]` ou un objet d'erreur RLS

**C. Vérifier que les pages publiques continuent de fonctionner**

1. Récupérer un token de signature valide existant (e.g. depuis l'admin UI ou `SELECT token FROM signing_tokens WHERE expires_at > now() LIMIT 1;`)
2. Ouvrir `https://<domaine-prod>/sign/<token>` dans un navigateur
3. ☐ La page charge correctement (logo, info session, bouton signer)
4. ☐ Pas d'erreur console RLS

**D. Tester le bulk-sign UI corrigé**

1. Se connecter en admin sur prod (ou compte témoin)
2. Ouvrir une session ayant ≥ 2 non-signataires sur un slot
3. Cliquer sur "Marquer les présents en masse"
4. ☐ Le Dialog s'ouvre sur l'étape "confirm" avec le message "Marquer X apprenants..."
5. Cliquer "Suivant →"
6. ☐ L'étape "sign" s'affiche avec le canvas `<SignaturePad>`
7. Dessiner une signature au stylet/souris
8. ☐ Le bouton "Confirmer" devient actif (n'est plus disabled)
9. Cliquer "Confirmer"
10. ☐ Toast de succès "X présences cochées sur ce créneau"
11. ☐ Le Dialog se ferme

**E. Vérifier les données en base**

Dans Supabase Dashboard SQL Editor :
```sql
SELECT id, signature_data, signer_type, signed_at
FROM signatures
WHERE signed_at >= now() - interval '5 minutes'
ORDER BY signed_at DESC
LIMIT 10;
```

- ☐ Toutes les lignes ont `signature_data` qui commence par `<svg` (SVG raw) ou `data:image/` (data URL)
- ☐ **AUCUNE** ligne n'a `signature_data = 'admin_bulk'`

**F. Vérifier un PDF Qualiopi**

1. Générer un PDF de feuille d'émargement pour la session testée
2. Ouvrir le PDF
3. ☐ Les signatures sont des tracés graphiques visibles
4. ☐ **AUCUNE** signature n'affiche le texte "admin_bulk"

### Décision

Présenter à Wissam :
- ✅ **Go** : passer à Task 10 (finishing-a-development-branch, merge + push prod)
- ❌ **No-go** : noter le finding, revert ou fix, re-tester

---

## Task 10: Après Go — finishing-a-development-branch

**Files:** Aucun (orchestration git)

- [ ] **Step 1: Invoker finishing-a-development-branch**

Annoncer : "I'm using the finishing-a-development-branch skill to complete this work."

Utiliser superpowers:finishing-a-development-branch :
1. Verify tests : `npx vitest run` → 538 passed
2. Determine base : main (depuis `e15fe07`)
3. Présenter les 4 options à Wissam (Merge local / Push+PR / Keep as-is / Discard)
4. Pattern habituel des chantiers précédents : **merge local sur main + push prod**
5. Cleanup branch `feat/emargement-volet-a-securite`

- [ ] **Step 2: Confirmer le push prod**

Run: `git log --oneline origin/main..HEAD` (après merge)
Expected: liste vide (tout est pushé)

Run: `git log --oneline -5`
Expected: les commits du sous-chantier sont en tête de `main`.

---

## Résumé du sous-chantier

| Volet | Livrable | Estimation | Tasks |
|-------|----------|------------|-------|
| **A.1** | Migration SQL DROP RLS publique | ~1h | Task 2 |
| **A.2** | Canvas admin bulk + helper + tests | ~5-6h | Task 1, 3, 4, 5, 6 |
| **A.3** | Audit entity_id 7 routes | ~2-3h | Task 7 |
| **Vérif** | Tests + tsc + build + manuelle | ~1-2h | Task 8, 9, 10 |
| **Total** | | **~10h** | 11 tasks |

**Critères d'acceptance** (cf. spec § 6) : tous validés avant Task 10.

**Risque prod** : faible (migration zero-risk côté code, UI canvas testée manuellement, défense en profondeur côté serveur).
