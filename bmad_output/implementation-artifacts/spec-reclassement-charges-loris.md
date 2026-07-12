---
title: 'Reclassement des factures « charges » LORIS vers formation_charges (+ prévention import)'
type: 'chore'
created: '2026-07-10'
status: 'done'
baseline_commit: '94f70ccc699b88ea727b070a9a9194a0c2151b9a'
context:
  - '{project-root}/bmad_output/implementation-artifacts/investigations/factures-charges-loris-investigation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les imports LORIS ont inséré 220 coûts formateurs comme factures dans `formation_invoices` (montants **négatifs**, −450 564,65 € ; discriminant : `external_source='loris' AND notes LIKE 'Loris Charge%'`). Ils faussent rapport factures, onglet Finances et BPF 2026 (Cadre C minoré + 220 trous parasites).

**Approach:** Décision utilisateur : **reclasser, pas supprimer**. (1) Script `reclass_loris_charges.py` dry-run/`--apply` : chaque ligne Charge → une `formation_charges` (montant en valeur absolue, label traçant l'origine), puis suppression de la facture parasite ; fiches clients bootstrap orphelines listées (rapport seulement). (2) Prévention : les deux scripts d'import routent `Type='Charge'` vers `formation_charges`. (3) Ajout manuel de charges + marge (ChargesPanel) restent fonctionnels — zéro changement UI.

## Boundaries & Constraints

**Always:** réutiliser les helpers de `c3v_import.py` ; discriminant strict `external_source='loris'` ET `notes` commençant par `Loris Charge` (jamais `prefix='LORIS'`/`number>=900000` seuls — les vraies factures importées les portent aussi) ; `amount` reclassé = `abs()` ; label = `Charge LORIS — {recipient_name} ({external_reference})` ; idempotent (skip si `(session_id, label)` existe) ; insérer la charge PUIS supprimer la facture (par id explicite) ; `entity_id` recopié de la ligne source (2 entités en une passe) ; dry-run par défaut avec plan chiffré (attendu : 155 C3V / 65 MR).

**Ask First:** lancer `--apply` (suppression prod) — après validation humaine du plan dry-run ; tout écart du compte attendu (≠220 → STOP) ; supprimer les fiches bootstrap orphelines (hors scope : lister seulement).

**Never:** toucher les types LORIS Facture/Acompte/Avoir (les 6 avoirs sans flag = chantier séparé) ; modifier UI, routes API, BPF ou `revenue.ts` (stats recalculées à chaque lecture — le nettoyage des données suffit) ; migration SQL ; écrire sans `--apply`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dry-run nominal | 220 lignes Charge | plan chiffré par entité, 0 écriture | — |
| Apply nominal | GO humain | 220 charges créées (abs) + 220 factures supprimées + vérif post-apply | log par lot |
| Re-run après apply | 0 ligne restante | « rien à faire » (idempotence) | — |
| Crash entre insert et delete | charge créée, facture restante | re-run : dedupe → skip insert, delete rejoué | log |
| `parent_invoice_id` pointe vers une ligne à supprimer | avoir lié inattendu | WARN dans le plan (FK ON DELETE SET NULL) | warn |
| Charge à montant ≥ 0 | anomalie | WARN, reclassée avec `abs()` | warn |
| Import futur, xlsx avec `Type='Charge'` | prévention | routée vers `formation_charges`, dédupe `(session_id, label, amount)` | skip no-match session |

</frozen-after-approval>

## Code Map

- `scripts/import-loris/reclass_loris_charges.py` -- **créer** (remédiation dry-run/`--apply`)
- `scripts/import-loris/c3v_import.py` -- helpers : `rest_get` l.100, `_req` l.76 (DELETE), `insert_batch` l.682, `norm`/`to_decimal` ; **modifier** boucle factures l.1146-1167 → router Charge via nouveau `map_formation_charge` (résolution session identique à `map_formation_invoice` l.541-548)
- `scripts/import-loris/loris_import.py` -- **modifier** de même (jumeau : boucle l.1135-1160, `MR_ENTITY_ID` l.24)
- `scripts/import-loris/c3v_repair_session_52.py:184-196` -- précédent : skip `typ == "charge"` (colonne xlsx `Type`)
- `supabase/migrations/add_formation_finances.sql:41-48` -- schéma `formation_charges` (inchangé)
- `TabFinances.tsx:677-693` + `finances/ChargesPanel.tsx` -- ajout manuel existant, non-régression seulement
- `src/app/api/formations/[id]/invoices/route.ts:34-62` -- stats/marge recalculées à chaque GET → effet immédiat post-apply

## Tasks & Acceptance

**Execution:**
- [x] `scripts/import-loris/reclass_loris_charges.py` -- créer : `argparse --apply`/`--force` ; fetch paginé sur discriminant (id, entity_id, session_id, amount, recipient_name, recipient_id, external_reference, notes) ; garde-fous (préfixe notes AVEC délimiteur `Loris Charge — `, compte attendu 220, WARN parent_invoice_id) ; payloads charges (abs, label) dédupés selon la clé canonique (cf. Design Notes) ; apply : `insert_batch("formation_charges", ...)` puis DELETE par lots d'ids via `_req("DELETE", ...)` (réponse vide → recomptage GET du lot, pas de faux échec) ; rapport clients bootstrap (`loris_metadata->_bootstrap_from_invoices`) sans plus aucun `recipient_id` en factures ; vérif post-apply intégrée
- [x] `scripts/import-loris/c3v_import.py` -- `map_formation_charge(row, ...)` + routage `Type='Charge'` dans la boucle factures, dédupe canonique, `insert_batch("formation_charges", ...)` ; durcissements : `sys.exit` si `_error` au GET des charges existantes, GET paginé, montant illisible → `_skip_reason`, montant ≥ 0 → WARN, comptage/log des `Type` non reconnus, doublons droppés loggés (échantillon), lignes Charge exclues de la collecte bootstrap `referenced_recipients`, WARN si des factures `Loris Charge — %` subsistent (reclassement pas encore joué) -- prévention C3V
- [x] `scripts/import-loris/loris_import.py` -- même patch miroir -- prévention MR
- [ ] (manuel) dry-run → présenter le plan → **GO humain** → `--apply` + vérifs -- gate destructif

**Acceptance Criteria:**
- Given la base actuelle, when dry-run, then plan : 155 reclassements C3V (−395 266,48 €) + 65 MR (−55 298,17 €) + bootstrap orphelines, et RIEN n'est écrit.
- Given le GO, when `--apply`, then +220 `formation_charges` positives (total 450 564,65 €), 0 ligne `Loris Charge%` restante, total factures C3V ≈ 909 766 € (MR ≈ 228 933 €).
- Given un re-run après succès, then 0 création / 0 suppression.
- Given un import rejoué avec lignes `Type='Charge'`, then elles atterrissent en `formation_charges`, jamais en `formation_invoices`.
- Given l'onglet Finances d'une session touchée après apply, then ChargesPanel liste les charges reclassées, marge = facturé − charges, et l'ajout manuel d'une charge fonctionne (non-régression).

## Spec Change Log

- **2026-07-12 — loopback #2 (bad_spec, revue 3 agents + vérif données prod).** Findings déclencheurs : (a) MAJEUR la clé canonique v2 (base tronquée avant ` (`) fusionnait des charges réellement distinctes — vérifié en prod : **28 clés (entité, session, destinataire, montant) portent ≥2 vraies charges** (ex. 3× JM 1 000 €) → ~30 lignes seraient parties en anomalie puis SUPPRIMÉES sans reclassement au re-run `--force` (anomalies non durables) ; (b) tolérance ±0,01 inclusive fusionnant de vrais écarts d'un centime ; (c) clé sans `entity_id` + fetch reclass non filtré ; (d) base sensible casse/accents ; (e) import insérant des charges pendant que les factures parasites subsistent (double comptage temporaire) ; (f) Type « Charges »-like recréant des factures parasites invisibles. **Amendé :** Design Notes v3 — abandon de la clé croisée au profit d'un **verrou d'ordre** (import bloqué tant que des parasites subsistent) + dédupe reclassement par **label complet** (unique par réf) + dédupe import **multiset** insensible casse. Vérifié en prod par ailleurs : 0 destinataire avec parenthèses, 0 montant nul/positif/NaN, 0 variante de casse des notes, 0 incohérence entité facture/session, 0 facture enfant → run de reclassement attendu 220/220 sans anomalie. **État évité :** suppression de ~30 factures sans leur charge ; drop silencieux de charges légitimes à l'import. **KEEP (inchangés de v2, à re-livrer tels quels) :** architecture fetch→gardes→payloads→plan→insert PUIS delete→bootstrap→vérif ; `rest_get_all` paginé (arrêt page vide, `sys.exit` sur `_error` hors phase apply) ; STOP avant toute suppression si erreurs/écart d'insert ; anomalies exclues insert ET delete ; chunks 50 ; hard/soft stops `--force` ; recomptage GET après DELETE à corps vide ; exclusion des lignes charge de la collecte bootstrap ; log des doublons droppés ; symétrie stricte des jumeaux ; réutilisation helpers `c3v_import` ; style plan `c3v_repair_session_52.py` ; références : scratchpad `reclass_v2_reverted.py` + `c3v_v2_reverted.patch`.
- **2026-07-10 — loopback #1 (bad_spec, revue 3 agents).** Findings déclencheurs : (a) CRITIQUE labels divergents import (`Charge LORIS — {dest}`) vs reclassement (`… ({ref})`) → les deux mécanismes d'idempotence étaient mutuellement aveugles, doublons de charges garantis à tout re-import ; (b) CRITIQUE clé de dédupe reclassement `(session_id, label)` sans montant → après crash, une facture homonyme au montant jamais reclassé pouvait être supprimée ; (c) `_error` avalé et GET non paginé dans la dédupe import ; (d) préfixe notes sans délimiteur ; (e) `--force` bypassant aussi entité inattendue/sur-compte. **Amendé :** ajout des Design Notes (politique de label unifiée + clé de dédupe canonique base-label+montant, durcissements import, restriction `--force`) et refonte des tâches. **État évité :** doublons silencieux de charges dans la marge, suppression de factures non reclassées. **KEEP (a bien marché, à conserver à la re-dérivation) :** architecture du script v1 (fetch→gardes→payloads→plan chiffré→insert PUIS delete→rapport bootstrap→vérif post-apply ; copie de référence : scratchpad `reclass_v1_reverted.py`), `fetch_all` paginé avec arrêt sur page vide (`offset += len(page)`), STOP avant toute suppression si erreurs/écarts d'insert, anomalies exclues insert ET delete, chunks de 50, symétrie stricte des patchs jumeaux, réutilisation exclusive des helpers `c3v_import`, style du plan (emojis/sections identiques à `c3v_repair_session_52.py`), `py_compile` en barrière.

## Design Notes

**Séparation stricte des deux chemins d'écriture (v3 — remplace la « clé canonique tronquée » v2, tombée sur les collisions réelles : 28 clés (entité, session, destinataire, montant) portent ≥2 vraies charges distinctes, ex. 3× JM 1 000 € même session).**

- **Verrou d'ordre (le point clé)** : dans les imports, la sous-étape charges est **BLOQUÉE** tant qu'il reste des factures `notes ilike 'Loris Charge — %'` pour l'entité — toutes les insertions de charges sont skippées avec un message explicite « jouer scripts/import-loris/reclass_loris_charges.py d'abord » (les lignes Type='charge' restent routées HORS factures). Conséquence : le reclassement n'a jamais à reconnaître des charges créées par l'import, et réciproquement — plus aucun besoin de clé « croisée ».
- **Reclassement — dédupe par label COMPLET** : label = `Charge LORIS — {recipient_name} ({external_reference})` (gelé) ; `external_reference` étant unique par facture, le label est unique par ligne source → pas de troncature. Skip (`dedupe_skipped`, delete rejouable) si une `formation_charges` existe avec le même `(entity_id, session_id, label)` ET un montant égal (montants quantizés half-up 2 déc. via `Decimal(str(x)).quantize(Decimal("0.01"), ROUND_HALF_UP)` — pas de tolérance ±0,01, égalité exacte) ; même label mais montant ≠ → **anomalie** (ni insert ni delete). Montant NULL/NaN → anomalie. Les 28 groupes de collisions se reclassent donc intégralement (labels distincts par la réf).
- **Import — dédupe multiset par (entity_id, session_id, base, montant)** où `base` = `norm_name(Destinataire)` (insensible casse/accents) et base des charges existantes = `norm_name(label sans préfixe `Charge LORIS — ` ni suffixe ` (...)` FINAL)` : pour chaque clé, insérer `max(0, n_candidats − n_existants)` charges (labels : `Charge LORIS — {Destinataire} ({Numéro})` si Numéro présent, sinon sans suffixe — jamais de réf synthétique index-dépendante). Re-run import→import : n_existants = n_candidats → 0 insert. Ce comptage tolère les vraies charges multiples identiques (pas de drop silencieux).
- **`--force`** : ne bypasse le STOP de compte QUE pour un compte **inférieur** à l'attendu sur les entités connues (reprise post-crash) ; entité inattendue ou sur-compte → STOP même avec `--force`.
- **Préfixe notes réel** : `Loris Charge — ` (avec délimiteur) pour l'ILIKE, le garde `startswith` et la vérif post-apply.
- **Import, types non reconnus** : router uniquement `typ == "charge"` ; un Type contenant « charge » sans égalité exacte (ex. « Charges ») → ligne **skippée entièrement** (ni facture ni charge) + WARN — jamais de facture parasite recréée en silence ; autres Types hors `{facture, avoir, acompte, ''}` → comptés/loggés (routage facture inchangé) ; Types vides comptés en info.
- **Pendant l'`--apply`** (phases delete/vérif), une erreur GET de recomptage alimente `failures` (récapitulatif complet + exit 1) au lieu d'un `sys.exit` sec qui laisserait l'opérateur sans bilan.

## Verification

**Commands:**
- `python3 scripts/import-loris/reclass_loris_charges.py` -- expected: plan exact (220 / −450 564,65 €), exit 0, 0 écriture
- `python3 scripts/import-loris/reclass_loris_charges.py --apply` -- (après GO) expected: 220+220, vérif post-apply verte
- `npx tsc --noEmit` && `npx vitest run` -- expected: verts (aucun TS modifié — barrière non-régression)

**Manual checks:**
- Post-apply : `/admin/reports/factures` C3V ≈ 909 766 €, plus de négatifs non-avoirs ; BPF 2026 sans les ~220 trous parasites ; ChargesPanel d'une session touchée : charges visibles + ajout manuel OK.

## Suggested Review Order

**Remédiation — `reclass_loris_charges.py` (nouveau)**

- Contrat d'exécution complet : dry-run par défaut, crash-safety, interdiction du parallèle
  [`reclass_loris_charges.py:1`](../../scripts/import-loris/reclass_loris_charges.py#L1)
- Discriminant strict (ILIKE + garde `startswith` délimité) — jamais prefix/number seuls
  [`reclass_loris_charges.py:192`](../../scripts/import-loris/reclass_loris_charges.py#L192)
- Garde-fous de compte : hard stops (entité inattendue/sur-compte, non bypassables) vs soft (`--force`)
  [`reclass_loris_charges.py:214`](../../scripts/import-loris/reclass_loris_charges.py#L214)
- Cœur : dédupe MULTISET par label complet (unique par réf) — jamais de delete sans reclassement prouvé
  [`reclass_loris_charges.py:272`](../../scripts/import-loris/reclass_loris_charges.py#L272)
- Ordre crash-safe : insert des charges PUIS delete, STOP avant toute suppression si écart
  [`reclass_loris_charges.py:419`](../../scripts/import-loris/reclass_loris_charges.py#L419)
- Vérif post-apply avec assertion de compte (détecte un run concurrent)
  [`reclass_loris_charges.py:540`](../../scripts/import-loris/reclass_loris_charges.py#L540)
- Filet réseau `_req_net` : URLError → failures (pas de traceback sec en phase apply)
  [`reclass_loris_charges.py:111`](../../scripts/import-loris/reclass_loris_charges.py#L111)

**Prévention — imports jumeaux (c3v montré ; loris = miroir prouvé byte-identique modulo entité)**

- Verrou d'ordre : charges bloquées tant que des factures parasites subsistent (même prédicat que le reclass)
  [`c3v_import.py:1356`](../../scripts/import-loris/c3v_import.py#L1356)
- Routage `Type='charge'` hors factures + skip ENTIER des types « charge »-like
  [`c3v_import.py:1282`](../../scripts/import-loris/c3v_import.py#L1282)
- Dédupe multiset (n'insérer que l'excédent candidats − existants : zéro drop de charge légitime)
  [`c3v_import.py:1408`](../../scripts/import-loris/c3v_import.py#L1408)
- `map_formation_charge` : label sans réf synthétique, bornes de montant, `_dedupe_base` symétrique par construction
  [`c3v_import.py:665`](../../scripts/import-loris/c3v_import.py#L665)
- Helpers partagés : montant canonique (half-up, NaN/inf) et base de label (regex suffixe FINAL)
  [`c3v_import.py:637`](../../scripts/import-loris/c3v_import.py#L637)
- Miroir MR : mêmes hunks, entité substituée
  [`loris_import.py:1345`](../../scripts/import-loris/loris_import.py#L1345)

**Périphériques**

- Historique des deux loopbacks de revue (pourquoi la clé croisée a été abandonnée) : section Spec Change Log ci-dessus
- Contexte d'enquête (chiffres prod, discriminant, impacts)
  [`factures-charges-loris-investigation.md:1`](investigations/factures-charges-loris-investigation.md#L1)
- Différés actés (traçabilité formation_charges, avoirs fournisseurs, fiches bootstrap)
  [`deferred-work.md:303`](deferred-work.md#L303)
