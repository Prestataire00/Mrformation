# Investigation: C3V — session + 3 factures « manquantes » dans suivi_factures-3

## Hand-off Brief

1. **What happened.** Loris signale, sur C3V, une session « Agent de maintenance des bâtiments » (23/02/2026→31/12/2026) et 3 factures COMPÉTENCES BTP (FAC-26-57 250,32 € / FAC-26-87 332,15 € / FAC-26-115 794,71 €) « manquantes dans suivi_factures-3 ».
2. **Where the case stands.** Preuve prod (service_role, read-only) : les réfs **FAC-26-57/87/115 n'existent pas** en base (ni `reference` ni `external_reference`), **250,32 € et 794,71 € n'existent nulle part** (toutes entités), **aucune session « Agent de maintenance » aux dates 23/02/2026** (les 2 qui existent sont datées 2025). Seul **332,15 €** existe (2 factures importées). → **trou de données** (les objets ne sont pas dans l'app), pas un filtre d'export.
3. **What's needed next.** Clarifier ce qu'est **suivi_factures-3** et sa **source** (fichier client / Sellsy ? export app ?), et obtenir les lignes-source de ces 3 factures + la session, pour savoir exactement quoi (ré)importer/créer.

## Case Info

| Field | Value |
| ----- | ----- |
| Date opened | 2026-07-03 |
| Status | Active (verdict Medium-High ; lacune = source « suivi_factures-3 ») |
| System | LMS C3V (entity_id `51e959a3-eaaf-4f4a-bd7f-f41784595d90`) ; base PROD |
| Evidence sources | Requêtes read-only prod (service_role) ; mémoires import LORIS/Sellsy C3V |

## Problem Statement

« Il manque une session + 3 factures sur C3V, décrites comme manquantes dans suivi_factures-3. » — hypothèse utilisateur, vérifiée indépendamment.

## Confirmed Findings

- **F1.** Aucune facture `reference IN (FAC-26-57, FAC-26-87, FAC-26-115)` (count=0). Aucune non plus en `external_reference` (les factures importées BTP ont `external_reference` = FAC-26-32 / FAC-26-56, pas 57/87/115).
- **F2.** `amount IN (250.32, 794.71)` sur **toutes** les entités → count=0. Seul **332,15 €** existe : 2 factures C3V, `reference` LORIS-26-900156 (ext FAC-26-32, *paid*) et LORIS-26-900180 (ext FAC-26-56, *late*), destinataire COMPÉTENCES BTP.
- **F3.** Le training « Agent de maintenance des bâtiments » existe (C3V). Il a **2 sessions**, datées **2025** (2025-11-24→2026-04-24, 2 inscrits ; 2025-05-26→2025-07-11, 10 inscrits). **Aucune** session à `start_date` = 23/02/2026.
- **F4.** L'app utilise 3 numérotations : `reference` interne = `LORIS-26-9000XX` (imports) ou `FAC-26-XXX` (natifs, ≥ ~160) ; `external_reference` = `FAC-26-XX` (n° source Sellsy sur les imports). Les « FAC-26-57/87/115 » du fichier client ne correspondent à aucune des deux.

## Deduced Conclusions

- **D1.** La session (23/02/2026) et 2 des 3 factures (250,32 / 794,71) **n'existent pas dans l'app** → trou d'import/création, PAS un problème d'export qui masquerait de l'existant. Cohérent avec [[project_c3v_loris_import]] (import LORIS C3V incomplet : restaient formation_companies + créneaux) et [[project_invoice_status_stored_only]] (faux payés / rapprochement par référence).
- **D2.** La facture à 332,15 € existe mais sous une autre référence → soit c'est la « même » facture avec un n° différent (mismatch de numérotation client↔app), soit une facture distincte au même montant. À lever avec la source.

## Hypothesized Paths

- **H1 (utilisateur) : un rapport/export exclut de la donnée existante.** Status : **Refuté** pour la session + 2 factures (F1/F2/F3 : elles n'existent pas). Partiellement ouvert pour 332,15 € (existe sous autre réf).
- **H2 : trou d'import (jamais importé de LORIS/Sellsy).** Status : **Confirmé** pour la session + 2 factures (D1).
- **H3 : mismatch de numérotation (client FAC-26-57/87/115 ≠ app).** Status : Ouvert — dépend de la source de suivi_factures-3.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Nature + source de « suivi_factures-3 » | Distingue trou d'import réel vs mismatch de clé de rapprochement | Demander à Loris : fichier client/Sellsy ? export app ? + partager les lignes-source (n°, montant, date, client, session) |
| Lignes-source des 3 factures + de la session | Savoir exactement quoi créer/réimporter | Idem — le fichier suivi_factures-3 |

## Final Conclusion

**Confidence: Medium-High.** Les objets signalés (session 23/02/2026 + factures à 250,32 € et 794,71 €) **ne sont pas dans la base** ; ce n'est pas un défaut d'affichage/export mais un **trou de données** (import LORIS/Sellsy C3V incomplet). La facture à 332,15 € existe sous une autre référence (mismatch de numérotation). Fix : ré-importer/créer les objets manquants — **nécessite la source** (suivi_factures-3) pour connaître le contenu exact.

## Follow-up: 2026-07-03 — Root cause CONFIRMÉE (High)

**Preuve (lecture xlsx source) :**
- **F5.** `suivi_des_factures.xlsx` (source LORIS des factures) **contient bien** FAC-26-57 (250,32 €, 02/03/2026), FAC-26-87 (332,15 €, 01/04/2026), FAC-26-115 (794,71 €, 29/04/2026), toutes COMPÉTENCES BTP, **code formation 52**. → elles étaient dans la source, auraient dû être importées.
- **F6.** `Suivi_de_l_activite_.xlsx` (source des sessions) contient **3 sessions « Agent de maintenance des bâtiments »** de codes distincts : **52** (23/02/2026→31/12/2026, COMPÉTENCES BTP), **96** (24/11/2025→24/04/2026), **151** (26/05/2025→11/07/2025). Seuls **96 et 151 sont en base** (= les 2 sessions 2025). **Le code 52 (2026) est présent en source mais absent en base.**
- **F7.** `c3v_import.py:381-392` documente un **BUG DÉDUP** : la clé d'identité/dédup des sessions = `stable_external_id("session", title, start_date)` — **sans le Code formation**. La résolution facture→session passe par `code_to_session` (`:405`), avec repli par titre (`:407`).

**H1 (rapport masque l'existant) : Refuté** (F5/F6 : session + factures réellement absentes de la base).
**H2 (jamais importé) : Refuté** au sens « pas dans la source » — elles **sont** dans la source.
**H4 (nouveau) — import a droppé le code 52 : Confirmé.** Les 3 sessions partagent un **titre strictement identique** ; l'identité/dédup ne s'appuyant pas sur le Code formation (F7), le code 52 n'a pas obtenu de session propre → `code_to_session[52]` absent → ses factures (code 52) sont **skippées en no-match** (`c3v_import.py:1167`).

**Cause racine (High) :** l'import C3V clé les sessions sur `(titre, date_début)` et non sur `Code formation` → pour un titre partagé par 3 instances, l'instance 2026 (code 52) a été écartée ; ses factures ont suivi.

### Fix direction
1. **Réparer la donnée** : créer/ré-importer la **session code 52** (Agent de maintenance, 23/02/2026→31/12/2026, COMPÉTENCES BTP, inter) puis **rattacher/importer ses factures** (les FAC-26 de code 52 de la source, dont 57/87/115) — write prod, à faire avec confirmation (script d'import ciblé par Code formation, ou saisie app).
2. **Prévenir la récidive** : inclure `Code formation` dans la clé d'identité des sessions (`c3v_import.py` — cf. remédiation déjà esquissée l.386-388) ET dans les résolutions code→session ; attention : change les extid des sessions déjà importées (ré-import à cadrer).

**Status : Concluded** (root cause confirmée ; reste l'exécution du fix, hors périmètre enquête).

**Réparation appliquée (2026-07-03).** Script `scripts/import-loris/c3v_repair_session_52.py` (dry-run + `--apply`) : session `2547ed0e-d61f-49dc-89d8-421eb9273537` créée + 3 factures (FAC-26-57 250,32 € / FAC-26-87 332,15 € / FAC-26-115 794,71 €, `reference` LORIS-26-900437/438/439, rattachées, C3V) — vérifié en base. 0 inscription (absente de la source LORIS, cohérent). Les 3 lignes « Charge » du code 52 sont exclues (coûts formateurs, non-factures). **Restant (prévention récidive, différé) :** inclure `Code formation` dans la clé d'identité des sessions de `c3v_import.py` (cf. l.386-388) pour éviter que de futurs imports redroppent des sessions homonymes.
