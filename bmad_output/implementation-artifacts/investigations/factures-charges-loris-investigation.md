# Investigation : Factures « charges » LORIS mélangées aux factures clients

## Hand-off Brief

1. **Ce qui se passe.** Les imports LORIS ont inséré 220 coûts formateurs (montants négatifs, −450 565 €) comme factures dans `formation_invoices` (Confirmé : code + prod) ; ils minorent le rapport factures, l'onglet Finances et le futur BPF 2026, où ils créent aussi 220 trous parasites bloquant le « prêt à déposer » de ~103 sessions.
2. **Où en est le dossier.** Conclu (confiance High) : cause racine, volumes, impacts et discriminant fiable (`external_source='loris' AND notes LIKE 'Loris Charge%'`) établis et contre-vérifiés.
3. **Prochaine action.** Script de remédiation dry-run/`--apply` : reclasser les 220 lignes en `formation_charges` (ABS du montant) + filtrer les Charges dans les scripts d'import (prévention) — via `bmad-quick-dev`.

## Case Info

| Field            | Value                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| Ticket           | N/A (demande utilisateur 2026-07-10)                                        |
| Date opened      | 2026-07-10                                                                   |
| Status           | Concluded                                                                    |
| System           | Prod Supabase (lecture seule service_role), repo lms-platform @ main 94f70ccc |
| Evidence sources | Code (scripts import LORIS, modules finances/BPF), données prod REST         |

## Problem Statement

Verbatim utilisateur : « Les factures “charges” créent des décalages et des factures inutiles : à supprimer, ou à classer sur un compte comptable distinct si elles sont conservées (actuellement tout est mélangé). »

Traité comme hypothèse ; le périmètre exact (volume, montants, impact réel sur les agrégats) reste à confirmer par les données prod.

## Evidence Inventory

| Source                                             | Status    | Notes                                                                 |
| -------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| scripts/import-loris/c3v_import.py                  | Available | Mapping factures sans filtre Type (l.537-598)                          |
| scripts/import-loris/loris_import.py (MR)           | Available | Même pattern notes `Loris {Type}` (l.585)                              |
| scripts/import-loris/c3v_repair_session_52.py       | Available | Exclut explicitement les lignes Charge (l.187-192) — précédent connu   |
| Données prod formation_invoices                     | Available | Quantifié le 2026-07-10 (Finding 4), script rejouable                   |
| Chemins de code consommateurs (CA, rapports, BPF)   | Available | Workflow wf_27784bd2-b6c terminé, 4 analyses contre-vérifiées (Finding 7) |
| Fichiers source XLSX LORIS (suivi_des_factures)     | Missing   | ~/Downloads — utile pour recouper les types, non bloquant               |

## Investigation Backlog

| # | Path to Explore                                                      | Priority | Status      | Notes                                             |
| - | -------------------------------------------------------------------- | -------- | ----------- | ------------------------------------------------- |
| 1 | Quantifier les lignes `Loris Charge` en prod (2 entités)             | High     | Done        | Finding 4 : 220 lignes, −450 565 €                |
| 2 | Impact code : CA dashboard, reports/factures, BPF Cadre C, TabFinances | High   | Done        | Finding 7 (workflow wf_27784bd2-b6c, contre-vérifié) |
| 3 | Vérifier la distribution des types LORIS (`notes`) — Facture/Avoir/Charge | Medium | Done    | Facture 374 / Acompte 2 / Avoir 6 / Charge 220 (Finding 4 + Side Findings) |
| 4 | Décision : supprimer vs reclasser en `formation_charges`             | High     | Open        | Recommandation : reclasser (Deduction 2) — décision utilisateur attendue |
| 5 | Fiches clients bootstrap orphelines après remédiation                | Low      | Open        | Finding 6 — à traiter dans le script de remédiation |

## Timeline of Events

| Time       | Event                                                                    | Source                                   | Confidence |
| ---------- | ------------------------------------------------------------------------ | ---------------------------------------- | ---------- |
| 2026-06-08 | Import LORIS→MR : 65 lignes Charge insérées en factures                  | created_at prod                          | Confirmed  |
| 2026-06-25 | Import LORIS→C3V : 155 lignes Charge insérées en factures                | created_at prod                          | Confirmed  |
| 2026-07-03 | Réparation session 52 : lignes Charge explicitement exclues (précédent)  | scripts/import-loris/c3v_repair_session_52.py:187 | Confirmed |
| 2026-07-09 | Symptôme « CA prévisionnel négatif » corrigé défensivement au dashboard (~220 factures négatives citées) | commit d498524d (PR #330) | Confirmed |
| 2026-07-10 | Signalement utilisateur : factures « charges » = décalages + factures inutiles | demande verbatim                    | Confirmed  |

## Confirmed Findings

### Finding 1 : L'import C3V n'a pas filtré les lignes de type « Charge »

**Evidence:** scripts/import-loris/c3v_import.py:537-598 — `map_formation_invoice` mappe toute ligne du XLSX en `formation_invoices` ; le Type LORIS n'est conservé que dans `notes` (`f"Loris {Type}"`, l.596). Aucun test sur `Type == "Charge"`.

**Detail:** Toute ligne « Charge » du fichier `suivi_des_factures.xlsx` matchée à une session est devenue une facture prod (prefix `LORIS`, `number >= 900000`, `is_external=true`).

### Finding 2 : Le script de réparation session 52 exclut ces lignes — le défaut de l'import initial est un précédent reconnu

**Evidence:** scripts/import-loris/c3v_repair_session_52.py:187-192 — « ne pas créer les lignes “Charge” (formateurs) — pas de N° facture, non-factures » (`if typ == "charge" or ref is None: skip`).

**Detail:** Le correctif de périmètre existait déjà pour la réparation ciblée, mais n'a jamais été rétro-appliqué aux lignes importées initialement.

### Finding 3 : L'import MR partage le même défaut — les deux entités sont touchées

**Evidence:** scripts/import-loris/loris_import.py:526,585 — même `map_formation_invoice`, même pattern `notes = f"Loris {Type}"`, aucun filtre Charge. Données prod (diagnostic read-only 2026-07-10) : 65 lignes Charge MR + 155 lignes Charge C3V.

**Detail:** MR importé le 2026-06-08, C3V le 2026-06-25 (created_at).

### Finding 4 : 220 lignes Charge en prod, montants NÉGATIFS, −450 564,65 € au total

**Evidence:** Diagnostic REST read-only 2026-07-10 (script scratchpad `diag_loris_charges.py`), prod Supabase.

**Detail:**
- **C3V** : 155 lignes, **−395 266,48 €**, 52 sessions touchées. Total `formation_invoices` C3V = 514 499 € → hors charges le vrai total serait **909 766 €** (le CA brut est minoré de 43 %).
- **MR** : 65 lignes, **−55 298,17 €**, 51 sessions touchées. Total MR = 173 635 € → hors charges **228 933 €**.
- Toutes : `status='pending'`, `funding_type=NULL`, `due_date=NULL`, `is_avoir=false`, `invoice_date` **toutes en 2026** (posée par défaut), `recipient_type='company'`.
- Destinataires = 88 codes formateurs/fournisseurs (MM, ADIF, JRN, FORMATEUR, KILOUTOU…), pas des clients.
- Distribution complète des types LORIS : Facture n=374 (+1 077 457 €), Acompte n=2 (+56 355 €), Avoir n=6 (−27 360 €), **Charge n=220 (−450 565 €)**.
- Table cible `formation_charges` quasi vide (1 ligne C3V, 250 €).

### Finding 5 : Le bug « CA prévisionnel négatif » (PR #330, 2026-07-09) était un symptôme de ces mêmes lignes — corrigé défensivement, pas à la source

**Evidence:** commit d498524d (`fix(dashboard): CA prévisionnel négatif`) — message : « ~220 factures à montant négatif SANS ce flag [is_avoir] … étaient sommées à tort » ; fix = `if (amt <= 0) continue;` dans src/lib/dashboard/revenue.ts.

**Detail:** Seul le dashboard est protégé (rejet montants ≤ 0). Les autres consommateurs de `formation_invoices` (rapport factures, BPF, TabFinances) restent exposés — analyse d'impact en cours (workflow wf_27784bd2-b6c). Le « décalage » signalé par l'utilisateur est le même phénomène vu ailleurs.

### Finding 6 : 96 fiches clients « bootstrap » parasites créées depuis les factures, dont les destinataires des charges

**Evidence:** scripts/import-loris/c3v_import.py:1120-1142 (`_bootstrap_from_invoices`) ; prod : 96 clients avec `loris_metadata._bootstrap_from_invoices=true`, dont des initiales formateurs/fournisseurs (AM, VE, HD, RC, JM, xj, M…) mêlées aux vrais financeurs (OPCO ATLAS, Constructys).

**Detail:** Le nettoyage des factures Charge devrait considérer aussi ces fiches clients orphelines (celles référencées uniquement par des lignes Charge).

### Finding 7 : Analyse d'impact des 4 consommateurs (workflow multi-agents, chaque conclusion contre-vérifiée)

**Evidence:** Workflow wf_27784bd2-b6c (8 agents, 4 analyses + 4 contre-vérifications, toutes confirmées). Citations ci-dessous vérifiées.

**Detail — impact réel en tenant compte des montants NÉGATIFS (les agents raisonnaient sur l'hypothèse « positifs » ; corrigé ici avec les données prod) :**

| Consommateur | Inclut les lignes Charge ? | Impact réel (montants négatifs, status=pending) |
| --- | --- | --- |
| **Dashboard admin (CA réalisé/prévisionnel)** | Non depuis PR #330 | Protégé défensivement par `if (amt <= 0) continue` (src/lib/dashboard/revenue.ts:33). C'était le symptôme « CA prévisionnel négatif » corrigé le 09/07. KPI « Factures en retard » non touché (charges = pending). |
| **Rapport factures** (src/app/(dashboard)/admin/reports/factures/page.tsx:92-96,148-152) | **Oui** | Aucun garde montant/source : « Total facturé » et « En attente » **minorés de −395k € (C3V) / −55k € (MR)** ; les 220 lignes sont listées dans le tableau et l'export Excel comme des factures normales ; `notes` n'est même pas fetchée → indiscernables ; action « Marquer payée » proposée dessus. |
| **BPF Cadre C** (src/lib/services/bpf-report-service.ts:113-121 ; src/lib/bpf-calculator.ts:192,511-518) | **Oui** | Seul filtre = `invoice_date` dans l'exercice + `status != cancelled`. Les 220 lignes ont toutes `invoice_date` **2026** → le BPF 2026 sera **minoré de −450 565 €**, replié sur la ligne 11 « Autres produits » (funding_type NULL). En plus : 220 « trous de données » parasites (`invoices_sans_funding`, bpf-calculator.ts:289-290) qui polluent le DataGapsPanel, **bloquent le statut « prêt à déposer »** des ~103 sessions touchées (bpf-calculator.ts:894-901), et invitent l'admin à assigner un funding_type à des charges (ce qui les déplacerait sur une vraie ligne de CA — pire). Asymétrie Cerfa : un coût formateur doit nourrir le Cadre D (calculé depuis formation_trainers, pas depuis les factures), jamais le C en négatif. |
| **Onglet Finances formation** (src/app/api/formations/[id]/invoices/route.ts:19-24,49-62 ; TabFinances.tsx:975-988) | **Oui** | KPIs « Facturé »/« En attente » de la formation minorés ; 220 lignes parasites affichées avec toutes les actions d'une vraie facture (PDF, email, avoir, annuler, éditer car pending) ; la marge est *par coïncidence* numériquement proche du vrai (le négatif agit comme une soustraction) mais sur la mauvaise ligne comptable ; le bandeau d'auto-génération de factures est masqué dès qu'il existe des lignes (TabFinances.tsx:855-858). |

**Discriminant fiable** (contre-vérifié) : `external_source='loris'` **ET** `notes LIKE 'Loris Charge%'`. ⚠️ Ne PAS utiliser `prefix='LORIS'`/`number>=900000` seuls : les vraies factures importées LORIS les portent aussi.

## Deduced Conclusions

### Deduction 1 : Les lignes Charge minorent (et non gonflent) tous les agrégats non protégés fondés sur `formation_invoices`

**Based on:** Findings 4 (montants négatifs) + 7 (aucun filtre source/notes chez les consommateurs, hors dashboard post-#330).

**Reasoning:** Une ligne à montant négatif, `status='pending'`, `is_avoir=false`, `invoice_date` 2026 passe tous les filtres du rapport factures, du BPF et de l'onglet Finances. Seul le dashboard rejette les montants ≤ 0 depuis le 09/07.

**Conclusion:** Le « décalage » signalé par l'utilisateur est confirmé et quantifié : −450 565 € répartis sur ~103 sessions des 2 entités, visibles partout sauf sur le dashboard.

### Deduction 2 : Le reclassement vers `formation_charges` est supérieur à la suppression

**Based on:** Finding 4 (destinataires = formateurs/fournisseurs, montants = coûts réels), Finding 7 (Cadre D BPF ne lit PAS `formation_charges` → aucun risque de re-pollution ; marge TabFinances = facturé − formation_charges).

**Reasoning:** Supprimer détruit ~450k € d'information de coût par session ; reclasser en `formation_charges` (montant en valeur absolue, label conservant l'origine : « Charge LORIS — {destinataire} ({réf}) ») nettoie tous les agrégats ET alimente correctement le calcul de marge par formation. Les stats étant recalculées à chaque GET, l'effet est immédiat sans changement de code.

## Hypothesized Paths

### Hypothesis 1 (utilisateur) : les factures « charges » créent des décalages et des factures inutiles

**Status:** Confirmed

**Theory:** Des lignes non-factures polluent les listes et les totaux.

**Supporting indicators:** Findings 1-3 ; précédent session 52.

**Would confirm:** Présence en prod de lignes `notes LIKE 'Loris Charge%'` avec montants non nuls comptés dans les agrégats.

**Would refute:** 0 ligne en prod (import aurait skippé faute de session match), ou montants nuls/négligeables.

**Resolution:** Confirmé le 2026-07-10 : 220 lignes, −450 565 €, comptées dans rapport factures + BPF + Finances formation (Findings 4 et 7). Nuance : l'effet est une minoration (montants négatifs), pas un gonflement, et le dashboard est déjà protégé (PR #330).

## Missing Evidence

| Gap                                   | Impact                                            | How to Obtain                                    |
| ------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| Volume/montants prod des lignes Charge | Dimensionne la remédiation et la décision          | REST read-only (en cours)                         |
| XLSX source LORIS                      | Recoupement type par type                          | ~/Downloads/suivi_des_factures.xlsx (optionnel)   |

## Source Code Trace

| Element       | Detail                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| Error origin  | scripts/import-loris/c3v_import.py:537 `map_formation_invoice` (idem loris_import.py:526) |
| Trigger       | Exécution des imports LORIS (MR puis C3V ~2026-06-25)                    |
| Condition     | Ligne XLSX de Type « Charge » matchée à une session → insérée en facture |
| Related files | c3v_repair_session_52.py (exclusion correcte), TabFinances.tsx, reports/factures/page.tsx, bpf-calculator.ts |

## Conclusion

**Confidence: High** (cause racine Confirmée par code + données prod ; impacts contre-vérifiés par 4 analyses indépendantes).

Les imports LORIS (MR 08/06, C3V 25/06) ont inséré **220 lignes de type « Charge » (coûts formateurs/fournisseurs, montants négatifs, −450 564,65 € au total)** dans `formation_invoices` sans les filtrer — le Type LORIS n'est conservé que dans `notes`. Ces lignes minorent le rapport factures et l'onglet Finances, minoreront le **BPF 2026 Cadre C** (toutes datées 2026) tout en y créant 220 trous de données parasites qui bloquent le « prêt à déposer » de ~103 sessions, et ont déjà causé le bug « CA prévisionnel négatif » (corrigé défensivement au dashboard seulement, PR #330). Discriminant fiable : `external_source='loris' AND notes LIKE 'Loris Charge%'`.

## Recommended Next Steps

### Fix direction

**Recommandation : reclasser, pas supprimer** (l'option « compte comptable distinct » de l'utilisateur, et la table existe déjà) :

1. **Remédiation données** (script dry-run/`--apply` sur le modèle de `c3v_repair_session_52.py`) :
   - Pour chacune des 220 lignes : créer une `formation_charges` (session_id, entity_id, `amount = ABS(montant)`, `label = "Charge LORIS — {recipient_name} ({external_reference})"`), puis supprimer la ligne de `formation_invoices`.
   - Vérifs post-apply : totaux rapport factures (C3V ≈ 909 766 €, MR ≈ 228 933 €), BPF 2026 sans trous parasites, marge par formation alimentée.
2. **Prévention import** : dans `map_formation_invoice` (c3v_import.py:537 et loris_import.py:526), router `Type='Charge'` vers `formation_charges` (ou skipper comme c3v_repair_session_52.py:187-192).
3. **Optionnel — nettoyage annexe** : les fiches clients bootstrap référencées uniquement par des lignes Charge (sous-ensemble des 96 `_bootstrap_from_invoices`) deviennent orphelines après remédiation — à supprimer dans le même script (Finding 6).

### Diagnostic

Aucun résiduel — script read-only rejouable : scratchpad `diag_loris_charges.py` (résultats du 2026-07-10 dans Finding 4).

## Reproduction Plan

Observable en prod sans écriture : `/admin/reports/factures` (entité C3V) → « Total facturé » ≈ 514k € au lieu de ≈ 910k € ; lignes à montants négatifs non-avoirs dans le tableau. `/admin/reports/bpf` (C3V, exercice 2026) → panneau trous : ~155 factures sans funding_type dont les charges.

## Side Findings

- La table `formation_charges` (supabase/migrations/add_formation_finances.sql:41-56) + ChargesPanel constituent le réceptacle naturel d'un reclassement (alimente le calcul de marge, hors CA). Quasi vide aujourd'hui (1 ligne).
- **6 avoirs importés LORIS sans flag `is_avoir`** (n=6, −27 360 €, `notes='Loris Avoir…'`) : l'import ne pose pas `is_avoir` (DEFAULT FALSE). Recoupe le dossier BPF-avoirs (4 avoirs C3V funding-null + 2 MR). Hors périmètre charges, mais le même script de remédiation pourrait poser `is_avoir=true` dessus — à trancher.
- 2 lignes « Loris Acompte » (+56 354,50 €, C3V) — à vérifier qu'elles sont bien du CA (probablement oui, laisser en l'état).
- L'action « Marquer payée » et l'édition (status pending) sont offertes sur les lignes Charge dans le rapport factures et TabFinances — disparaît avec la remédiation données, aucun changement de code requis.
- Le KPI dashboard rejette TOUT montant ≤ 0 depuis PR #330 (y compris de vraies remises négatives) — comportement assumé par le commit d498524d, non remis en cause ici.
