# Import CRM Sellsy

Procédure d'import en bulk des données CRM depuis un export Sellsy (5 fichiers CSV) vers les tables `crm_*` de Supabase.

## Pré-requis

- Python 3.9+
- 5 fichiers CSV exportés depuis Sellsy, placés dans `~/Downloads` (ou autre dossier via `--downloads`) :
  - `C3V liste prospect.csv`
  - `C3V commentaires.csv`
  - `MR - PROSPECT À JOUR DU 12_11.csv`
  - `MR - COMMENTAIRES À JOUR DU 12_11.csv`
  - `MR - TACHES À JOUR DU 12_11.csv`

## Étapes

### 1. Appliquer la migration

Dans Supabase SQL Editor (Cmd+A + Run sur tout le fichier) :

```
supabase/migrations/add_crm_sellsy_import_fields.sql
```

Cette migration ajoute :
- Colonnes `sellsy_id`, `address`, `postal_code`, `city`, `country`, `naf_code` sur `crm_prospects`
- Colonnes `sellsy_external_ref`, `label` sur `crm_tasks`
- Nouvelle table `crm_prospect_comments` + RLS
- Contraintes UNIQUE pour l'idempotence

Idempotente : peut être relancée sans risque.

### 2. Générer les SQL d'import

```bash
python3 scripts/import-sellsy-crm.py
```

Génère 4 fichiers dans `scripts/generated-crm-import/` (gitignored — contiennent les données du client) :

| Fichier | Contenu |
|---|---|
| `00_reset_crm_data.sql` | **⚠️ DESTRUCTIF** — supprime toutes les lignes CRM des entités MR + C3V (`crm_prospects`, `crm_tasks`, `crm_quotes`, `crm_campaigns`, `crm_prospect_comments`). Transactionnel. |
| `01_import_prospects.sql` | INSERT idempotent des 4480 prospects (sellsy_id + entity_id comme clé) |
| `02_import_comments.sql` | INSERT des 2307 commentaires reliés aux prospects via `sellsy_id`. Cleanup post-insert des orphelins. |
| `03_import_tasks.sql` | INSERT des 1924 tâches MR (hash MD5 comme clé d'idempotence) |

Le script affiche aussi un rapport : prospects par propriétaire, comptes par entité, alertes (prospects sans SIREN/email).

### 3. Exécuter en prod (Supabase SQL Editor)

**Ordre strict** :

1. **00_reset** (si tu veux wipe les anciennes données — destructif) — Cmd+A + Run
2. **01_import_prospects** — Cmd+A + Run
3. **02_import_comments** — Cmd+A + Run
4. **03_import_tasks** — Cmd+A + Run

Chaque fichier est encapsulé dans `BEGIN; ... COMMIT;` — si une partie échoue, la transaction rollback automatiquement.

### 4. Vérifications post-import

```sql
-- Compteurs par entité :
SELECT
  e.slug,
  (SELECT COUNT(*) FROM crm_prospects WHERE entity_id = e.id) AS prospects,
  (SELECT COUNT(*) FROM crm_tasks WHERE entity_id = e.id) AS tasks,
  (SELECT COUNT(*) FROM crm_prospect_comments WHERE entity_id = e.id) AS comments
FROM entities e
WHERE e.slug IN ('mr-formation', 'c3v-formation');

-- Prospects sans propriétaire (= profile pas trouvé en DB) :
SELECT COUNT(*) FROM crm_prospects
 WHERE source = 'sellsy_import' AND assigned_to IS NULL;

-- Quelques exemples :
SELECT company_name, siret, city, naf_code, assigned_to
  FROM crm_prospects WHERE source = 'sellsy_import' LIMIT 10;
```

## Stratégie

### Idempotence

- `crm_prospects.sellsy_id` UNIQUE par entity → relancer l'import n'a pas d'effet doublon (ON CONFLICT DO UPDATE).
- `crm_prospect_comments.sellsy_id` UNIQUE par entity → idem.
- `crm_tasks.sellsy_external_ref` : hash MD5 stable de `entity_key + titre + date_creation + id_objet_lie` → idempotent même sans ID Sellsy natif sur les tâches.

### Mapping propriétaires → profiles

Le script utilise des sous-requêtes SQL avec COALESCE :

```sql
COALESCE(
  (SELECT id FROM profiles WHERE LOWER(first_name || ' ' || last_name) = LOWER('Loris VICHOT') LIMIT 1),
  (SELECT id FROM profiles WHERE LOWER(last_name) = LOWER('VICHOT') LIMIT 1)
)
```

Si le profile n'existe pas en base, `assigned_to = NULL` et le nom Sellsy est préservé dans `notes` (`Propriétaire Sellsy : ...`). Aucun blocage.

### SIRET corrompu

L'export Sellsy a stocké les SIRET en notation scientifique Excel (ex: `"3,41174E+13"`), perdant 5 chiffres. Décision : on stocke le **SIREN** (9 chiffres, intact) dans la colonne `siret`. Suffisant pour le CRM commercial. Si un SIRET complet est nécessaire plus tard, voir API INSEE Sirene.

### Commentaires orphelins

Si un commentaire référence un `prospect_sellsy_id` qui n'existe pas en base (prospect supprimé entre-temps côté Sellsy), la sous-requête retourne NULL et la ligne est insérée avec `prospect_id = NULL`. Le cleanup `DELETE WHERE prospect_id IS NULL` à la fin du fichier supprime ces orphelins.

## Rollback

Si l'import donne un résultat indésirable :

```sql
-- Reset propre (re-run du 00_reset_crm_data.sql) :
BEGIN;
DELETE FROM crm_prospect_comments WHERE entity_id IN (
  (SELECT id FROM entities WHERE slug IN ('mr-formation', 'c3v-formation'))
);
-- (puis crm_tasks, crm_quotes, crm_campaigns, crm_prospects)
COMMIT;
```

Pour rollback Supabase plateforme (Pro/Team plan), utiliser le **Point-in-Time Recovery** dans Dashboard → Settings → Database → Backups.

## Limites connues

- **Tâches C3V** : pas d'historique côté Sellsy (le client n'a exporté que MR pour les tâches).
- **SIRET** : SIREN à la place (9 chiffres au lieu de 14).
- **Adresse de livraison** (`ADRESSE LIVRAISON PARTIE 1` côté MR) : ignorée car identique à l'adresse principale dans 99% des cas.
- **Collaborateurs liés** (sur les tâches) : ignorés. Si besoin plus tard, ajouter colonne `crm_tasks.collaborators TEXT[]`.
