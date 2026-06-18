# Nomenclature des factures sur la base Excel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que toute la numérotation des factures se fasse sur la base des numéros Excel (`FAC-YY-N`, sans padding), la création future continuant la séquence importée, sans toucher à l'historique.

**Architecture:** Approche B. Deux migrations SQL (format de la colonne générée `reference` + seeding de la RPC de numérotation depuis les numéros Excel), un helper TS pur testé reflétant la formule, et un script de vérification read-only. La RPC `create_invoice_with_atomic_number` reste le point unique de création (3 routes l'appellent).

**Tech Stack:** PostgreSQL (Supabase, plpgsql), TypeScript, Vitest, Python (script de vérif via REST service-role).

---

## File Structure

- Create: `src/lib/utils/invoice-reference.ts` — helper pur `formatInvoiceReference` (source de vérité du format côté app).
- Create: `src/lib/utils/__tests__/invoice-reference.test.ts` — tests unitaires Vitest.
- Create: `supabase/migrations/update_invoice_reference_no_padding.sql` — redéfinit la colonne générée `reference` sans padding du numéro.
- Create: `supabase/migrations/invoice_numbering_continue_excel.sql` — réécrit `create_invoice_with_atomic_number` pour reprendre `max(N Excel)+1`.
- Create: `scripts/import-loris/verify_invoice_nomenclature.py` — vérification read-only (collisions, prochain n° par année).
- Reference (inchangés) : `src/lib/utils/invoice-display-ref.ts`, les 3 routes `src/app/api/formations/[id]/invoices/*`.

---

### Task 1: Helper TS pur `formatInvoiceReference` (TDD)

**Files:**
- Create: `src/lib/utils/invoice-reference.ts`
- Test: `src/lib/utils/__tests__/invoice-reference.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/utils/__tests__/invoice-reference.test.ts
import { describe, it, expect } from "vitest";
import { formatInvoiceReference } from "../invoice-reference";

describe("formatInvoiceReference", () => {
  it("facture FAC 2026 → FAC-26-25 (numéro non paddé, année 2 chiffres)", () => {
    expect(formatInvoiceReference({ prefix: "FAC", fiscalYear: 2026, globalNumber: 25 })).toBe("FAC-26-25");
  });
  it("continue la séquence Excel : FAC-26-24 → suivant 25", () => {
    expect(formatInvoiceReference({ prefix: "FAC", fiscalYear: 2026, globalNumber: 79 })).toBe("FAC-26-79");
  });
  it("avoir avec son propre préfixe", () => {
    expect(formatInvoiceReference({ prefix: "AV", fiscalYear: 2025, globalNumber: 3 })).toBe("AV-25-3");
  });
  it("année paddée à 2 chiffres", () => {
    expect(formatInvoiceReference({ prefix: "FAC", fiscalYear: 2005, globalNumber: 1 })).toBe("FAC-05-1");
  });
  it("numéro jamais paddé même à un chiffre", () => {
    expect(formatInvoiceReference({ prefix: "FAC", fiscalYear: 2026, globalNumber: 0 })).toBe("FAC-26-0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/utils/__tests__/invoice-reference.test.ts`
Expected: FAIL — `Cannot find module '../invoice-reference'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/utils/invoice-reference.ts
/**
 * Référence de facture telle que GÉNÉRÉE en base.
 *
 * Reflète exactement la colonne générée `formation_invoices.reference` :
 *   prefix || '-' || LPAD((fiscal_year % 100), 2) || '-' || global_number
 * Année sur 2 chiffres, numéro NON paddé — identique à la nomenclature Excel (ex. « FAC-26-25 »).
 *
 * Source de vérité unique du format côté app (preview / cohérence). Pour AFFICHER une facture
 * existante (qui peut être un import LORIS), utiliser `invoiceDisplayRef`.
 */
export function formatInvoiceReference(args: {
  prefix: string;
  fiscalYear: number;
  globalNumber: number;
}): string {
  const yy = String(args.fiscalYear % 100).padStart(2, "0");
  return `${args.prefix}-${yy}-${args.globalNumber}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/utils/__tests__/invoice-reference.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/invoice-reference.ts src/lib/utils/__tests__/invoice-reference.test.ts
git commit -m "feat(factures): helper formatInvoiceReference (format Excel FAC-YY-N sans padding)"
```

---

### Task 2: Migration — format de référence sans padding du numéro

**Files:**
- Create: `supabase/migrations/update_invoice_reference_no_padding.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/update_invoice_reference_no_padding.sql
-- ============================================================
-- Migration : format de référence facture sur la base Excel (sans padding du numéro)
-- Date : 2026-06-18
-- ============================================================
-- Le client veut que la nomenclature suive les numéros d'origine Excel : « FAC-26-25 »
-- (année 2 chiffres, numéro NON paddé). L'ancien format paddait le numéro sur 4 chiffres
-- (« FAC-26-0025 »). On redéfinit la colonne générée `reference`.
--
-- Impact historique : les imports (prefix='LORIS') voient leur `reference` recalculée mais
-- s'affichent via `external_reference` (helper invoiceDisplayRef) → invisible à l'écran.
-- L'index unique idx_invoices_global_numbering porte sur global_number, pas sur reference.
-- ============================================================

ALTER TABLE formation_invoices DROP COLUMN IF EXISTS reference;

ALTER TABLE formation_invoices
ADD COLUMN reference TEXT GENERATED ALWAYS AS (
  prefix || '-' || LPAD((fiscal_year % 100)::TEXT, 2, '0') || '-' || global_number::TEXT
) STORED;
```

- [ ] **Step 2: Vérifier la syntaxe SQL localement (lint visuel)**

Relire : `DROP COLUMN IF EXISTS` puis `ADD COLUMN ... GENERATED ALWAYS AS (...) STORED`.
Pas de `;` manquant, parenthèses équilibrées. (Pas d'exécution locale — appliquée par l'utilisateur dans Supabase Dashboard.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/update_invoice_reference_no_padding.sql
git commit -m "feat(factures): format reference sans padding du numero (FAC-26-25)"
```

---

### Task 3: Migration — la numérotation reprend la suite Excel

**Files:**
- Create: `supabase/migrations/invoice_numbering_continue_excel.sql`

- [ ] **Step 1: Écrire la migration (réécriture de la RPC)**

```sql
-- supabase/migrations/invoice_numbering_continue_excel.sql
-- ============================================================
-- Migration : la création de facture continue la séquence Excel
-- Date : 2026-06-18
-- ============================================================
-- Les factures historiques (prefix='LORIS') portent leur vrai numéro Excel dans
-- external_reference (« FAC-26-24 »). Une nouvelle facture prefix='FAC' repartait à 1
-- car le MAX(global_number) ne regardait que les lignes prefix='FAC' (inexistantes).
--
-- Fix : sous le même advisory lock, on seede le prochain numéro depuis GREATEST(
--   max(global_number des factures app du même tuple),
--   max(N réel parsé depuis external_reference « FAC-YY-N » de l'année) -- uniquement prefix='FAC'
-- ) + 1. Les 66 imports « N/A » (external_reference NULL/non conforme) ne matchent pas → ignorés.
-- Les avoirs (prefix='AV') gardent leur propre séquence (pas de seeding Excel).
-- ============================================================

CREATE OR REPLACE FUNCTION create_invoice_with_atomic_number(
  p_entity_id UUID,
  p_session_id UUID,
  p_recipient_type TEXT,
  p_recipient_id UUID,
  p_recipient_name TEXT,
  p_amount NUMERIC,
  p_prefix TEXT,
  p_fiscal_year INTEGER,
  p_due_date DATE,
  p_notes TEXT,
  p_is_avoir BOOLEAN,
  p_parent_invoice_id UUID,
  p_external_reference TEXT,
  p_recipient_siret TEXT,
  p_recipient_address TEXT
) RETURNS formation_invoices AS $$
DECLARE
  v_lock_key BIGINT;
  v_max_app INTEGER;
  v_max_excel INTEGER;
  v_next INTEGER;
  v_yy TEXT;
  v_result formation_invoices;
BEGIN
  -- Advisory lock par tuple (entity_id, fiscal_year, prefix) — sérialise READ+INSERT.
  v_lock_key := hashtextextended(p_entity_id::TEXT || ':' || p_fiscal_year::TEXT || ':' || p_prefix, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_yy := LPAD((p_fiscal_year % 100)::TEXT, 2, '0');

  -- 1) max des factures déjà créées dans l'app pour ce tuple
  SELECT COALESCE(MAX(global_number), 0) INTO v_max_app
  FROM formation_invoices
  WHERE entity_id = p_entity_id
    AND fiscal_year = p_fiscal_year
    AND prefix = p_prefix;

  -- 2) max des numéros Excel importés « FAC-YY-N » de l'année (uniquement pour le préfixe FAC)
  v_max_excel := 0;
  IF p_prefix = 'FAC' THEN
    SELECT COALESCE(MAX(
      (substring(external_reference FROM '^FAC-' || v_yy || '-([0-9]+)$'))::INTEGER
    ), 0) INTO v_max_excel
    FROM formation_invoices
    WHERE entity_id = p_entity_id
      AND fiscal_year = p_fiscal_year
      AND external_reference ~ ('^FAC-' || v_yy || '-[0-9]+$');
  END IF;

  v_next := GREATEST(v_max_app, v_max_excel) + 1;

  -- INSERT atomique dans la même transaction que le lock
  INSERT INTO formation_invoices (
    entity_id, session_id, recipient_type, recipient_id, recipient_name,
    amount, prefix, number, global_number, fiscal_year, due_date, notes,
    is_avoir, parent_invoice_id, external_reference, recipient_siret, recipient_address
  ) VALUES (
    p_entity_id, p_session_id, p_recipient_type, p_recipient_id, p_recipient_name,
    COALESCE(p_amount, 0), p_prefix, v_next, v_next, p_fiscal_year, p_due_date, p_notes,
    p_is_avoir, p_parent_invoice_id, p_external_reference, p_recipient_siret, p_recipient_address
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_invoice_with_atomic_number(
  UUID, UUID, TEXT, UUID, TEXT, NUMERIC, TEXT, INTEGER, DATE, TEXT,
  BOOLEAN, UUID, TEXT, TEXT, TEXT
) TO authenticated, service_role;
```

- [ ] **Step 2: Relire la cohérence avec l'existant**

Vérifier que la signature (15 paramètres, ordre, types) est **identique** à `atomic_invoice_numbering.sql`
(sinon `CREATE OR REPLACE` créerait une surcharge au lieu de remplacer). Vérifier que `number` ET
`global_number` reçoivent bien `v_next` (comme avant).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/invoice_numbering_continue_excel.sql
git commit -m "feat(factures): la numerotation continue la suite Excel (max N + 1 par annee)"
```

---

### Task 4: Script de vérification read-only

**Files:**
- Create: `scripts/import-loris/verify_invoice_nomenclature.py`

- [ ] **Step 1: Écrire le script**

```python
#!/usr/bin/env python3
"""Vérification read-only de la nomenclature des factures (FAC-YY-N).

Confirme, par année fiscale :
  - le max(N) des numéros Excel importés (external_reference « FAC-YY-N »),
  - l'absence de collision avec un global_number de facture prefix='FAC',
  - le prochain numéro qui sera attribué (= max(N Excel, global_number FAC) + 1).
Aucune écriture.
"""
import importlib.util, re, os
from collections import defaultdict

_spec = importlib.util.spec_from_file_location(
    "rec", os.path.join(os.path.dirname(__file__), "reconcile_code_formation.py")
)
rec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rec)

inv = rec.rest_get_all(
    "formation_invoices",
    select="prefix,global_number,fiscal_year,external_reference",
    entity_id=f"eq.{rec.MR_ENTITY_ID}",
)

max_excel = defaultdict(int)   # year -> max N Excel
max_fac = defaultdict(int)     # year -> max global_number prefix=FAC
excel_ns = defaultdict(set)    # year -> {N Excel}
fac_ns = defaultdict(set)      # year -> {global_number FAC}

for i in inv:
    year = i.get("fiscal_year")
    ext = i.get("external_reference") or ""
    m = re.match(r"^FAC-(\d{2})-(\d+)$", ext)
    if m and year is not None:
        n = int(m.group(2))
        max_excel[year] = max(max_excel[year], n)
        excel_ns[year].add(n)
    if i.get("prefix") == "FAC" and year is not None:
        gn = i.get("global_number") or 0
        max_fac[year] = max(max_fac[year], gn)
        fac_ns[year].add(gn)

years = sorted(set(max_excel) | set(max_fac))
print(f"{len(inv)} factures examinées (entité MR)\n")
collisions = 0
for y in years:
    inter = excel_ns[y] & fac_ns[y]
    nxt = max(max_excel[y], max_fac[y]) + 1
    yy = y % 100
    flag = "  ⚠ COLLISION" if inter else ""
    print(f"  {y}: max Excel={max_excel[y]} | max FAC app={max_fac[y]} "
          f"→ prochain = FAC-{yy:02d}-{nxt}{flag}")
    if inter:
        collisions += 1
        print(f"     numéros en conflit: {sorted(inter)}")

print(f"\n{'❌' if collisions else '✅'} {collisions} année(s) en collision")
```

- [ ] **Step 2: Exécuter (read-only, nécessite l'env service-role chargé)**

Run (depuis un shell avec les variables d'env Supabase) :
`python3 scripts/import-loris/verify_invoice_nomenclature.py`
Expected : pour chaque année, `prochain = FAC-YY-(max+1)` ; `✅ 0 année(s) en collision`.
(Si l'env n'est pas chargé localement, l'utilisateur le lance ; ce n'est pas bloquant pour la PR.)

- [ ] **Step 3: Commit**

```bash
git add scripts/import-loris/verify_invoice_nomenclature.py
git commit -m "chore(factures): script de verification de la nomenclature (read-only)"
```

---

### Task 5: Validation finale + PR

- [ ] **Step 1: Lancer toute la suite de tests**

Run: `npx vitest run`
Expected: tout vert (dont `invoice-reference.test.ts` et `invoice-display-ref.test.ts`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Pousser et ouvrir la PR**

```bash
git push -u origin <branche-courante>
gh pr create --fill --base main
```

Inclure dans la description : les 2 migrations à exécuter dans le Dashboard Supabase dans l'ordre
(1. `update_invoice_reference_no_padding.sql`, 2. `invoice_numbering_continue_excel.sql`), et le
script de vérif à lancer après.

---

## Self-Review

**Spec coverage :**
- Composant 1 (format sans padding) → Task 2. ✓
- Composant 2 (RPC reprend la suite Excel) → Task 3. ✓
- Composant 3 (helper TS + tests) → Task 1. ✓
- Composant 4 (vérification read-only) → Task 4. ✓
- Conformité séquence → préservée (advisory lock + index unique inchangés, Task 3). ✓

**Placeholders :** aucun — code complet dans chaque step.

**Cohérence des types/signatures :** la RPC de Task 3 reprend à l'identique la signature 15-params
de `atomic_invoice_numbering.sql` (sinon surcharge au lieu de remplacement) ; `formatInvoiceReference`
prend `{prefix, fiscalYear, globalNumber}` partout. Le format SQL (`LPAD(YY,2) || '-' || global_number`)
et le format TS (`padStart(2)` + numéro brut) produisent la même chaîne.

**Note d'exécution :** les migrations SQL ne sont pas exécutées localement (prod Supabase via
Dashboard, comme les migrations existantes). Les tests TDD portent sur le helper TS, qui reflète
fidèlement la formule SQL.
