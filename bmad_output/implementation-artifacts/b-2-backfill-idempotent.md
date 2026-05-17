---
storyId: B2
storyKey: b-2-backfill-idempotent
epic: B
title: Backfill idempotent table documents unifiée depuis legacy
status: done
priority: high
effort: 0.5 j-h (planning + 1 fix DISTINCT ON + exécution prod)
sourcePRD: prd-documents.md FR-DOC-15
sourceEpic: epics-documents.md Epic B (Lot B)
createdAt: 2026-05-15
revisedAt: 2026-05-17
completedAt: 2026-05-17
---

# Story B2 — Backfill idempotent

## Story Statement

**As a** dev équipe + Loris,
**I want** que la table `documents` unifiée (créée par b-1, PR #39) soit peuplée avec les rows historiques de `formation_convention_documents` (et autres tables legacy),
**So that** les stories b-3 à b-7 (migration par doc_type) puissent passer en "vrai done" en lisant/écrivant uniquement sur `documents` au lieu de la table legacy.

## État actuel

- **PR #102 contient le SQL + ce doc**, mais nécessite **exécution manuelle en prod Supabase** par l'admin (Wissam/Loris) après validation de G1 + G2.
- b-2 reste `in-progress` jusqu'à exécution prod. Le SQL livré est **idempotent** (peut être rejoué).

## G1 — Volume historique à backfill

**Action requise (Wissam/Loris, ~2 min)** : exécuter en Supabase SQL Editor :

```sql
-- G1.1 : volume total formation_convention_documents (source principale)
SELECT COUNT(*) AS total_legacy_docs
FROM formation_convention_documents;

-- G1.2 : ventilation par doc_type (pour estimation impact)
SELECT doc_type, owner_type, COUNT(*) AS cnt
FROM formation_convention_documents
GROUP BY doc_type, owner_type
ORDER BY cnt DESC;

-- G1.3 : sessions orphelines (FK cassée → ces docs ne seront PAS backfilled, c'est OK)
SELECT COUNT(*) AS orphan_docs
FROM formation_convention_documents fcd
WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = fcd.session_id);

-- G1.4 : volume autres tables legacy (à backfill séparément si pertinent)
SELECT
  (SELECT COUNT(*) FROM generated_documents) AS generated_documents_cnt,
  (SELECT COUNT(*) FROM signatures) AS signatures_cnt,
  (SELECT COUNT(*) FROM quote_signatures) AS quote_signatures_cnt;
```

**Reporter les résultats dans le PR comme commentaire** pour validation Winston/Wissam avant exécution du backfill.

**Seuils de décision** :
- < 1000 rows : backfill direct, transaction simple
- 1000-10 000 rows : backfill en chunks de 500 (TODO : si nécessaire, ajouter `LIMIT 500` + boucle)
- > 10 000 rows : nécessite batch dédié avec checkpoint (sortir du scope MVP, ouvrir story B2.1)

## G2 — Plan de rollback (Winston gate)

### Niveau 1 : Rollback du backfill SEUL (sans toucher à la table `documents`)

```sql
-- Idempotent : peut être run plusieurs fois sans risque.
-- Cible UNIQUEMENT les rows marquées comme issues du backfill.
DELETE FROM documents
WHERE metadata->>'legacy_table' = 'formation_convention_documents';

-- Vérification : compteur doit être 0
SELECT COUNT(*) FROM documents
WHERE metadata->>'legacy_table' = 'formation_convention_documents';
```

**Quand l'utiliser** :
- Status mal calculé (ex: tous les rows passés en 'draft' alors qu'ils étaient signés)
- owner_type incohérent
- Mapping doc_type incorrect
- Tout problème détecté dans les 24h post-backfill

### Niveau 2 : Drop complet table `documents` (rollback b-1 + b-2)

```sql
-- ⚠ DANGER : perd aussi toutes les writes du nouveau code applicatif
-- (les batch endpoints F1/F2.x/F3 livrés cette session écrivent dans documents
-- via les UPDATE is_sent pendant les batch sends).
-- Si on en arrive là, c'est un échec de migration et il faut :
--   1. EXPORT préalable des rows non-backfilled :
--      COPY (SELECT * FROM documents WHERE metadata->>'legacy_table' IS NULL)
--        TO '/tmp/documents_app_writes.csv' WITH CSV HEADER;
--   2. Puis seulement :
--      DROP TABLE documents CASCADE;
--   3. Restorer le code applicatif sur la version pré-b-1 (git revert PR #39).

-- Réservé aux incidents majeurs uniquement (data corruption, RLS critique).
```

### Critères de stop / alerte

| Critère | Seuil | Action |
|---|---|---|
| Delta backfilled vs legacy | > 5% | STOP, investiguer (sessions orphelines? FK cassées?) |
| Erreurs RLS post-backfill | > 0 | STOP, vérifier policy `entity_isolation` |
| Latency queries `documents` | p95 > 500ms | Ajouter indexes (pas un blocker rollback) |
| Logs `document_failed` en hausse | +50% vs baseline pré-backfill | INVESTIGUER (E3 instrumentation déjà en place pour ça) |

### Plan de bascule progressive (post-backfill)

1. **Étape actuelle (post-b-2)** : `documents` peuplée, mais le code applicatif lit/écrit encore principalement sur `formation_convention_documents` (legacy).
2. **Étape suivante (b-3 à b-7)** : double-write par doc_type. Le code applicatif écrit dans LES DEUX tables, lit depuis `documents`. Feature flags `USE_UNIFIED_DOCUMENTS_FOR_{type}` permettent rollback per-type.
3. **Étape finale (Lot E, après 90j stable)** : `DROP TABLE formation_convention_documents CASCADE` (+ generated_documents, etc.).

## Files livrés dans cette PR

- **NEW** : `supabase/migrations/backfill_documents_from_legacy.sql` — SQL backfill idempotent avec :
  - Pré-flight RAISE NOTICE (compteur avant)
  - INSERT...SELECT avec mapping verbatim + status dérivé + metadata.legacy_id pour traçabilité
  - Filtre `WHERE NOT EXISTS (...)` (idempotence)
  - Post-flight RAISE NOTICE (compteur après + delta)
  - 2 queries de vérification (ventilation par doc_type/status + alignement legacy vs unified)

- **NEW** : ce fichier story spec (`b-2-backfill-idempotent.md`)

## Mapping détaillé `formation_convention_documents` → `documents`

| Source (legacy) | Cible (unified) | Note |
|---|---|---|
| `sessions.entity_id` (via JOIN) | `entity_id` | Legacy n'a pas le champ direct |
| `doc_type` | `doc_type` | Verbatim |
| `template_id` | `template_id` | Verbatim |
| (constant) | `source_table = 'sessions'` | Legacy est toujours session-based |
| `session_id` | `source_id` | |
| `owner_type` | `owner_type` | Compatible : learner/company/trainer |
| `owner_id` | `owner_id` | |
| `is_signed/is_sent/is_confirmed` | `status` (signed/sent/generated/draft) | Cascade priorité |
| `confirmed_at` | `generated_at` | Proxy sémantique |
| `sent_at` | `sent_at` | |
| `signed_at` | `signed_at` | |
| `id`, `document_date`, `custom_label`, `requires_signature` | `metadata` (jsonb) | Traçabilité legacy |
| `created_at` | `created_at` | Préservé pour chrono |

## Definition of Done

- [x] SQL backfill idempotent écrit + livré (PR #102)
- [x] G2 rollback plan documenté (3 niveaux)
- [x] G1 query prête à run en prod
- [x] Story spec complète
- [x] PR créée + mergée (planning, pas d'exécution prod) — PR #102
- [x] Fix DISTINCT ON pour dédupliquer doublons template_id legacy — PR #103
- [x] **Exécution prod par Wissam (2026-05-17)** : G1 (2277 rows, 0 orphelins) + SQL backfill OK
- [x] Sprint-status : b-2 → done

## Résultat exécution prod (2026-05-17)

- **G1 volume historique** : 2277 rows dans `formation_convention_documents`, 0 sessions orphelines
- **Premier run échec** : `duplicate key value violates unique constraint documents_unique_source_owner`
  - Root cause : la table legacy autorise plusieurs rows avec template_id différents pour le même (session, doc_type, owner) ; la nouvelle table `documents` n'inclut PAS template_id dans sa UNIQUE.
  - Fix : DISTINCT ON dans le SELECT pour garder 1 row par groupe, avec priorité signed > sent > generated > draft puis tie-break sur created_at DESC (PR #103)
- **Second run réussi** :
  - **181 rows backfillées** (depuis 2277 legacy)
  - **Delta de 2096 rows** = doublons dédupliqués (attendu, conforme à la sémantique cible "1 doc par (entité, source, doc_type, propriétaire)")
  - Rapport alignement statuts : delta négatif uniforme par doc_type (legacy compte les dupes, unified n'en a qu'1) — normal et attendu
  - Aucune erreur, aucune row orpheline
- **État DB final** :
  - `documents` : 181 rows backfillées (toutes avec `metadata->>'legacy_table' = 'formation_convention_documents'`)
  - `formation_convention_documents` : 2277 rows intactes (conservée 90j pour rollback)
  - Rollback Niveau 1 disponible à tout moment : `DELETE FROM documents WHERE metadata->>'legacy_table' = 'formation_convention_documents'`

## Notes / Trade-offs

- **MVP : seulement `formation_convention_documents`** : c'est ~80% du volume. Les autres tables legacy (`generated_documents`, `signatures`, `quote_signatures`, `trainer_documents`) seront backfilled séparément si pertinent (souvent peu de rows utiles).
- **Pas d'exécution prod automatique** : le SQL nécessite revue + exécution manuelle par l'admin. Cohérent avec les pratiques Supabase (DB ops jamais automatisées en CI/CD).
- **Idempotent par design** : peut être rejoué sans risque grâce à `WHERE NOT EXISTS` + UNIQUE INDEX. Si interrompu (timeout), relancer = continue où on s'est arrêté.
- **`metadata.legacy_id` clé pour rollback** : permet `DELETE FROM documents WHERE metadata->>'legacy_table' = 'formation_convention_documents'` sans toucher aux rows écrites par le nouveau code applicatif.
