# Import Loris → Supabase (MR FORMATION)

Import one-shot des 8 fichiers XLSX exportés du système Loris vers la base Supabase
de MR FORMATION (entity_id `f8acea54-71ab-4a22-8cf3-4e7170543bf1`).

## Pré-requis

1. Migration `supabase/migrations/add_loris_import_columns.sql` **appliquée** dans
   Supabase Dashboard > SQL Editor. Cette migration ajoute `loris_external_id` +
   `loris_metadata JSONB` sur 7 tables (clients, learners, trainings, sessions,
   formation_trainers, enrollments, crm_quotes).
2. Python 3 + `openpyxl` installé (déjà OK en local).
3. `.env.local` doit contenir `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
4. Les 8 fichiers XLSX placés dans `~/Downloads/` (par défaut).

## Fichiers attendus (ordre d'import dépendance)

| # | Fichier | Lignes | Table cible |
|---|---|---|---|
| 1 | `Clients.xlsx` | 239 | `clients` |
| 2 | `Apprenants.xlsx` | 2 186 | `learners` |
| 3 | `Suivi de l'activité.xlsx` | 130 | `trainings` + `sessions` |
| 4 | `Suivi de l'activité des formateurs.xlsx` | 126 | `formation_trainers` |
| 5 | `Suivi de l'activité des stagaires.xlsx` | 1 090 | `enrollments` |
| 6 | `Suivi des devis.xlsx` | 182 | `crm_quotes` |
| 7 | `Suivi des factures.xlsx` | 171 | `formation_invoices` |
| 8 | `Suivi de l'activité des clients.xlsx` | 143 | (vue dérivée — skippée) |

**Total : 4 267 lignes.**

## Usage

```bash
# 1. Dry-run (recommandé d'abord) — analyse sans rien écrire
python3 scripts/import-loris/loris_import.py --dry-run

# 2. Dry-run sur une seule table
python3 scripts/import-loris/loris_import.py --dry-run --tables clients

# 3. Exécution réelle (après review du dry-run)
python3 scripts/import-loris/loris_import.py --execute

# 4. Exécution sélective
python3 scripts/import-loris/loris_import.py --execute --tables clients,learners
```

## Stratégies clés

- **Multi-tenant** : tout import sur entity_id MR FORMATION uniquement.
- **Dédoublonnage** : skip via clé naturelle (email pour clients/learners,
  référence pour devis/factures, title pour trainings, title+start_date pour
  sessions). Logué dans le rapport final.
- **Champs gap** : tous les champs Loris sans cible DB native sont stockés
  dans la colonne `loris_metadata JSONB` (préservation 100% des données).
- **Traçabilité** : chaque ligne importée reçoit un `loris_external_id` stable
  (hash des champs clés Loris si ID Externe vide). Permet réimport idempotent.
- **N° Sécurité Sociale** : stocké tel quel dans `learners.social_security_number`
  (décision Wissam — pas de chiffrement particulier en v1).

## Sortie

Le script génère :
- Logs console détaillés (par table : inserted / skipped / errors)
- Fichier rapport `scripts/import-loris/last_import_report.json`
