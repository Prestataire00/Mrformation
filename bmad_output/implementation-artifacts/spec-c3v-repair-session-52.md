---
title: 'Réparation C3V — réimport ciblé session code 52 (+ factures + inscriptions)'
type: 'chore'
created: '2026-07-03'
status: 'done'
baseline_commit: '9592661bb56e6f3f2ad1cdfb7034bf1f55ca0601'
context:
  - '{project-root}/bmad_output/implementation-artifacts/investigations/suivi-factures-c3v-manquantes-investigation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'import LORIS→C3V a droppé la session « Agent de maintenance des bâtiments » **code formation 52** (23/02/2026→31/12/2026, COMPÉTENCES BTP) — présente dans la source mais absente en base (identité session sur `(titre,date)` sans Code formation ; 3 sessions homonymes). Ses factures (FAC-26-57/87/115 + autres du code 52) ont skippé en no-match, et ses inscriptions manquent.

**Approach:** Un **script Python de réparation ciblé** `scripts/import-loris/c3v_repair_session_52.py`, **dry-run par défaut**, qui **réutilise les fonctions de `c3v_import.py`** (import du module) pour, sur le **seul Code formation 52** : (1) créer la session manquante, (2) créer ses factures, (3) créer ses inscriptions — de façon **idempotente** (skip ce qui existe déjà). Écriture prod **uniquement** avec `--apply`, **après validation humaine du plan de dry-run**.

## Boundaries & Constraints

**Always:** réutiliser `c3v_import.py` (`read_xlsx`, `FILES`, `C3V_ENTITY_ID`, `stable_external_id`, `norm/norm_name/to_date/to_decimal`, `map_session`, `map_formation_invoice`, `map_enrollment`, `fetch_existing_lookups`, `insert_batch(table, rows, dry_run)`, la logique d'offset `number/global_number ≥ 900000`) — **pas de ré-implémentation** ; `entity_id` = C3V strict ; **idempotent** (avant insert : session par `loris_external_id`, facture par `external_reference`, inscription par `loris_external_id` — skip si déjà en base) ; filtrer strictement sur **Code formation == "52"** ; `insert_batch(..., dry_run=True)` en mode dry-run.

**Ask First:** exécuter avec `--apply` (write prod) — **seulement** après que le plan de dry-run ait été présenté et validé par l'humain. Toute création qui dépasse le périmètre code 52.

**Never:** écrire en prod en mode par défaut (dry-run only) ; toucher les sessions/factures/inscriptions d'autres codes ; modifier `c3v_import.py` (le fix de la clé de dédup pour l'avenir est un chantier séparé, hors scope) ; dupliquer une donnée déjà présente. Rester sur `main`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Session absente | pas de session `loris_external_id("session", titre, 2026-02-23)` | plan : « créer 1 session » ; `--apply` l'insère | log |
| Session déjà là | ré-exécution après apply | plan : « session OK (existe) » ; 0 insert | — |
| Facture absente | ligne code 52 dont `external_reference` (FAC-26-57…) pas en base | plan : « créer facture FAC-26-57 250,32 € » ; `--apply` insère (ref LORIS-26-9000XX + external_reference FAC) | log |
| Facture déjà là | `external_reference` déjà en base C3V | skip (plan : « déjà présente ») | — |
| Inscription no-match | learner introuvable pour une ligne code 52 | skip + **listé dans le plan** (« X inscriptions non résolues ») | log, pas de crash |
| Dry-run (défaut) | sans `--apply` | imprime le plan complet, **0 écriture** | — |

</frozen-after-approval>

## Code Map

- `scripts/import-loris/c3v_import.py` -- **source des helpers** à importer/réutiliser : `read_xlsx`, `FILES`, `C3V_ENTITY_ID`, `stable_external_id`, `norm/norm_name/to_date/to_decimal`, `map_session` (l.336), `map_formation_invoice` (l.537), `map_enrollment` (l.443), `fetch_existing_lookups` (l.603), `insert_batch` (l.682), offset `number/global_number` (l.1109)
- `scripts/import-loris/c3v_repair_session_52.py` -- **créer** le script de réparation
- Sources xlsx (`~/Downloads/`) : `Suivi_de_l_activite_.xlsx` (session, col « Code formation »), `suivi_des_factures.xlsx` (factures), `Suivi_de_l_activite__des_stagiaires.xlsx` (inscriptions)

## Tasks & Acceptance

**Execution:**
- [ ] `scripts/import-loris/c3v_repair_session_52.py` -- `from c3v_import import (...)` ; `argparse --apply` (défaut dry-run) ; `lk = fetch_existing_lookups()` ; lire la ligne session `Code formation == "52"` de `FILES["trainings_sessions"]` → si son `loris_external_id` absent de `lk["sessions_by_loris_id"]` : `map_session()` + `insert_batch("sessions", ..., dry_run=not apply)`, puis `lk["code_to_session"]["52"] = new_id` ; filtrer `suivi_des_factures.xlsx` sur `Code formation == "52"` → pour chaque facture dont `external_reference` pas déjà en base C3V : `map_formation_invoice(..., code_to_session=lk["code_to_session"])` (offset `number` calculé comme l'import) + `insert_batch("formation_invoices", ...)` ; idem inscriptions `Code formation == "52"` via `map_enrollment` (skip no-match, les lister) ; **imprimer un plan lisible** (session, chaque facture réf+montant+external_reference, chaque inscription, + les skips) -- le script de réparation
- [ ] (manuel, hors code) exécuter le **dry-run**, présenter le plan à l'humain, obtenir le GO avant `--apply`

**Acceptance Criteria:**
- Given la base sans la session 52, when je lance le script en dry-run, then il liste : 1 session à créer, les factures du code 52 (dont FAC-26-57 250,32 €, FAC-26-87 332,15 €, FAC-26-115 794,71 €), les inscriptions — **sans rien écrire**.
- Given je relance en dry-run après un `--apply`, then il indique tout « déjà présent » (0 création) — idempotence.
- Given `--apply` validé, when il s'exécute, then la session + ses factures + inscriptions sont créées en C3V, `entity_id` = C3V, `external_reference` = FAC-26-XX, et les 3 factures apparaissent en base.

## Verification

**Commands:**
- `python3 scripts/import-loris/c3v_repair_session_52.py` -- expected: plan de dry-run lisible, 0 écriture (exit 0)
- (après GO) `python3 scripts/import-loris/c3v_repair_session_52.py --apply` -- expected: créations effectuées, résumé

**Manual checks:**
- Comparer le plan à la source (les lignes code 52 de `suivi_des_factures.xlsx`) et à la base (requête read-only : `formation_invoices` where session = la nouvelle, `reference IN` / `external_reference IN (FAC-26-57/87/115)` → présentes après apply).

