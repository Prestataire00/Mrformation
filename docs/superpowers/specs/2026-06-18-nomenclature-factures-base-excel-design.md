# Nomenclature des factures sur la base Excel — Design

> Spec validée le 2026-06-18. Méthode BMAD (brainstorming → spec → plan → exécution).

## Contexte

Les factures historiques ont été importées depuis les fichiers Excel du client (Loris). Leur
vrai numéro d'origine (ex. `FAC-25-0`, `FAC-26-24`) est stocké dans `external_reference` ; leur
colonne générée `reference` est synthétique (`LORIS-26-9500`). Le helper `invoiceDisplayRef`
(#298) affiche déjà le vrai numéro partout (liste, ligne, PDF, email).

**Problème restant** : quand un admin crée une **nouvelle** facture dans l'app, la numérotation
démarre une séquence parallèle (`FAC-26-0001`) au lieu de **continuer la suite Excel**
(`FAC-26-24` → devrait donner `FAC-26-25`). Deux écarts :
1. La séquence repart à 1 → collision conceptuelle avec les numéros Excel existants.
2. Le format est paddé (`FAC-26-0025`) alors que l'Excel ne l'est pas (`FAC-26-25`).

Le client veut que **toute la nomenclature** se fasse sur la base des numéros Excel.

## Décisions de cadrage

- **Format retenu** : `FAC-26-25` — année sur 2 chiffres, **numéro non paddé**, identique au fichier Excel.
- **Approche B** : on **ne touche pas** à l'historique (170 factures importées). On rebranche
  uniquement la **création future** pour qu'elle continue la suite Excel. Zéro réécriture
  risquée des lignes existantes, et les 66 factures « N/A » (sans numéro d'origine) ne posent
  aucun problème.

## État des lieux technique (sourcé du code)

- Les **3 routes** de création de facture passent toutes par la RPC
  `create_invoice_with_atomic_number` avec `p_prefix: "FAC"` (ou `"AV"` pour les avoirs) :
  - `src/app/api/formations/[id]/invoices/route.ts:114`
  - `src/app/api/formations/[id]/invoices/auto-generate/route.ts:74`
  - `src/app/api/formations/[id]/invoices/import/route.ts:73`
- Aucun formatage de référence n'est calculé côté TS — `reference` est une **colonne générée** en base.
- Format actuel de `reference` (`update_invoice_format_and_tva_default.sql`) :
  `prefix || '-' || LPAD((fiscal_year % 100)::TEXT, 2, '0') || '-' || LPAD(global_number::TEXT, 4, '0')`.
- La RPC calcule `v_next := COALESCE(MAX(global_number), 0) + 1` sous advisory lock, filtré par
  `(entity_id, fiscal_year, prefix)`. Les imports étant `prefix='LORIS'`, une nouvelle facture
  `prefix='FAC'` repart donc à 1.
- Unicité garantie par `idx_invoices_global_numbering (entity_id, fiscal_year, prefix, global_number)`.

## Composants

### 1. Migration — format de référence sans padding du numéro

`supabase/migrations/update_invoice_reference_no_padding.sql`

Redéfinit la colonne générée `reference` (DROP puis re-ADD, comme les migrations existantes) :

```sql
ALTER TABLE formation_invoices DROP COLUMN IF EXISTS reference;
ALTER TABLE formation_invoices
ADD COLUMN reference TEXT GENERATED ALWAYS AS (
  prefix || '-' || LPAD((fiscal_year % 100)::TEXT, 2, '0') || '-' || global_number::TEXT
) STORED;
```

- Année toujours paddée sur 2 chiffres (`26`, `05`), **numéro non paddé** (`25`).
- Impact sur l'historique : les lignes `LORIS-…` voient leur `reference` recalculée
  (`LORIS-26-950000`) mais elles **s'affichent via `external_reference`** (helper) → invisible
  pour l'utilisateur. Les avoirs `AV` et futures `FAC` prennent le format Excel.
- Aucune requête applicative ne dépend du padding de `reference` (vérifié : tout passe par
  `invoiceDisplayRef`). L'index unique porte sur `global_number`, pas sur `reference` → pas d'impact.

### 2. Migration — la numérotation reprend la suite Excel

`supabase/migrations/invoice_numbering_continue_excel.sql`

Met à jour `create_invoice_with_atomic_number` (et `next_invoice_number` par cohérence) pour
seeder le prochain numéro à partir des deux sources, sous le **même** advisory lock :

```sql
-- max des factures déjà créées dans l'app (même entity/year/prefix)
SELECT COALESCE(MAX(global_number), 0) INTO v_max_app
  FROM formation_invoices
 WHERE entity_id = p_entity_id AND fiscal_year = p_fiscal_year AND prefix = p_prefix;

-- max des numéros Excel importés "FAC-YY-N" pour cette année (uniquement pour le préfixe FAC)
v_max_excel := 0;
IF p_prefix = 'FAC' THEN
  SELECT COALESCE(MAX(
    (substring(external_reference FROM '^FAC-' ||
      LPAD((p_fiscal_year % 100)::TEXT, 2, '0') || '-([0-9]+)$'))::INTEGER
  ), 0) INTO v_max_excel
    FROM formation_invoices
   WHERE entity_id = p_entity_id AND fiscal_year = p_fiscal_year
     AND external_reference ~ ('^FAC-' || LPAD((p_fiscal_year % 100)::TEXT, 2, '0') || '-[0-9]+$');
END IF;

v_next := GREATEST(v_max_app, v_max_excel) + 1;
```

Le reste de la fonction (advisory lock, INSERT atomique, GRANT) reste identique.

- Prochaine facture 2026 = `FAC-26-25` (suit `FAC-26-24`) ; 2025 = `FAC-25-79`.
- Les 66 « N/A » (external_reference NULL ou non conforme) ne matchent pas le regex → ignorées.
- Les avoirs (`prefix='AV'`) gardent leur propre séquence (pas de seeding Excel).

### 3. Helper TS pur + tests

`src/lib/utils/invoice-reference.ts`

```ts
/** Reflète exactement la formule SQL de la colonne générée `reference`. */
export function formatInvoiceReference(args: {
  prefix: string;
  fiscalYear: number;
  globalNumber: number;
}): string {
  const yy = String(args.fiscalYear % 100).padStart(2, "0");
  return `${args.prefix}-${yy}-${args.globalNumber}`;
}
```

Source de vérité unique du format côté app (preview, cohérence) et testable en TDD.
`invoiceDisplayRef` reste inchangé (toujours nécessaire pour l'historique `LORIS`).

### 4. Vérification (read-only, sans risque)

Script `scripts/import-loris/verify_invoice_nomenclature.py` (dry-run only) qui confirme :
- pour chaque année, `max(N Excel)` est bien identifié ;
- aucune collision : aucun `global_number` de facture `prefix='FAC'` n'entre en conflit avec un N Excel ;
- log du prochain numéro attendu par année.

## Gestion d'erreur

Inchangée. L'advisory lock par `(entity_id, fiscal_year, prefix)` sérialise READ+INSERT ;
l'index unique `idx_invoices_global_numbering` reste le filet de dernier recours (23505).

## Tests

- **Unitaires (Vitest)** sur `formatInvoiceReference` : année 2026 → `FAC-26-25` ;
  padding année 2005 → `AV-05-3` ; numéro jamais paddé.
- **Vérification data** via le script read-only ci-dessus avant/après migration.

## Conformité

Numérotation séquentielle continue par année fiscale, sans trou ni doublon — conforme à
l'obligation légale de séquence chronologique des factures (CGI art. 242 nonies A).

## Hors périmètre

- Réécriture de la numérotation stockée des 170 factures importées (approche A, écartée).
- Traitement des 66 factures « N/A » (pas de numéro d'origine — restent telles quelles).
- Compte comptable (vide dans les fichiers sources).
