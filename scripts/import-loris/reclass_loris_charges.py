#!/usr/bin/env python3
"""
Reclassement des factures « charges » LORIS → formation_charges (C3V + MR).

Contexte : bmad_output/implementation-artifacts/spec-reclassement-charges-loris.md
Investigation : bmad_output/implementation-artifacts/investigations/factures-charges-loris-investigation.md

Les imports LORIS (MR 08/06, C3V 25/06) ont inséré 220 lignes de Type « Charge »
(coûts formateurs/fournisseurs, montants NÉGATIFS, −450 564,65 € au total) comme
factures dans formation_invoices. Elles faussent le rapport factures, l'onglet
Finances et le BPF 2026. Décision utilisateur : RECLASSER, pas supprimer —
chaque ligne Charge → une formation_charges (montant en valeur absolue, label
traçant l'origine), PUIS suppression de la facture parasite.

Discriminant strict : external_source='loris' ET notes commençant par
« Loris Charge — » (avec délimiteur ; jamais prefix='LORIS'/number>=900000 seuls —
les vraies factures importées les portent aussi).

Attendu prod (investigation 2026-07-10) : 220 lignes
  - C3V FORMATION : 155 lignes, −395 266,48 €
  - MR FORMATION  :  65 lignes,  −55 298,17 €

Idempotence — dédupe par label COMPLET (Design Notes v3) : le label
« Charge LORIS — {recipient_name} ({external_reference}) » est unique par ligne
source (external_reference unique par facture) — AUCUNE troncature. Skip
(dedupe_skipped, delete rejouable) si une formation_charges existe avec le même
(entity_id, session_id, label) ET un montant ÉGAL (quantizé half-up 2 déc.,
égalité EXACTE — aucune tolérance ±0,01) ; même label mais montant divergent →
ANOMALIE (ni insert ni delete). Montant source NULL/NaN → anomalie (pas de
charge à 0 €). Les 28 groupes réels (session, destinataire, montant) partagés
se reclassent donc intégralement : leurs labels restent distincts par la réf.
Réciproque côté imports (c3v_import.py / loris_import.py) : VERROU D'ORDRE —
tant que des factures « Loris Charge — » subsistent, les imports n'insèrent
AUCUNE charge → les deux chemins d'écriture ne se croisent jamais.

⚠️ DRY-RUN PAR DÉFAUT. Écriture prod uniquement avec --apply (après GO humain).
⚠️ Ne JAMAIS lancer deux --apply en parallèle (aucun verrou concurrent — la
   vérification post-apply détecte l'écart de compte, mais après coup).
Réutilise les helpers de c3v_import.py (aucune ré-implémentation).

Ordre des écritures (crash-safe) : insert des charges PUIS delete des factures.
En cas de crash entre les deux, un re-run skippe l'insert (dédupe par label
complet) et rejoue le delete. Si le crash a eu lieu pendant les suppressions, le
compte trouvé est INFÉRIEUR à l'attendu → --apply STOPPE ; re-valider le plan en
dry-run puis rejouer avec --apply --force. --force ne bypasse QUE le sous-compte
sur les entités connues : entité inattendue ou SUR-compte → STOP même avec --force.

Pendant l'--apply (phases DELETE / recomptage / vérif post-apply), une erreur GET
alimente `failures` (récapitulatif complet + exit 1) au lieu d'un sys.exit sec
qui laisserait l'opérateur sans bilan ; hors apply (fetch initial, dédupe),
sys.exit reste de mise.

Usage :
    python3 scripts/import-loris/reclass_loris_charges.py                 # dry-run (défaut)
    python3 scripts/import-loris/reclass_loris_charges.py --apply         # write prod (après GO)
    python3 scripts/import-loris/reclass_loris_charges.py --apply --force # reprise post-crash
                                                                          # (sous-compte re-validé)
"""

import argparse
import sys
import urllib.error

# Réutilisation stricte des helpers de l'import LORIS (pas de ré-implémentation).
from c3v_import import (
    CHARGE_LABEL_PREFIX,
    CHARGE_NOTES_PREFIX,
    _req,
    canon_charge_amount,
    insert_batch,
    norm,
    rest_get_all,
    to_decimal,
)

# ── Constantes ────────────────────────────────────────────────────────────

C3V_ENTITY_ID = "51e959a3-eaaf-4f4a-bd7f-f41784595d90"
MR_ENTITY_ID = "f8acea54-71ab-4a22-8cf3-4e7170543bf1"
ENTITY_LABELS = {C3V_ENTITY_ID: "C3V FORMATION", MR_ENTITY_ID: "MR FORMATION"}

# Comptes attendus (investigation 2026-07-10). Écart → WARNING en dry-run.
# En --apply : SOUS-compte sur entité connue = STOP bypassable par --force
# (reprise post-crash) ; entité inattendue ou SUR-compte = STOP même avec --force.
EXPECTED = {C3V_ENTITY_ID: 155, MR_ENTITY_ID: 65}

CHUNK = 50  # taille des lots DELETE / requêtes in.(...)


# ── Helpers locaux ────────────────────────────────────────────────────────

def _fmt_amount(v):
    """Formatte un montant en style FR pour l'affichage du plan (250,32 €)."""
    if v is None:
        return "—"
    try:
        return f"{float(v):,.2f} €".replace(",", " ").replace(".", ",")
    except (TypeError, ValueError):
        return str(v)


def chunks(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


def entity_label(eid):
    return ENTITY_LABELS.get(eid, str(eid))


def _req_net(method, path, params=None, body=None, prefer=None):
    """_req + filet réseau : URLError/timeout/reset (erreurs NON-HTTP) → dict _error
    au lieu d'un traceback sec. La garantie « erreur en phase apply → failures »
    doit couvrir aussi les pannes réseau, pas seulement les statuts HTTP."""
    try:
        return _req(method, path, params=params, body=body, prefer=prefer)
    except (urllib.error.URLError, OSError) as e:
        return {"_error": True, "status": 0, "body": f"réseau : {e}"}


def rest_get_all_soft(table, **params):
    """GET paginé « tolérant » — réservé aux phases APPLY : retourne (rows, err).

    Même pagination que rest_get_all (offset += len(page), arrêt sur page vide)
    mais une erreur HTTP OU réseau est RETOURNÉE à l'appelant (err non-None) au
    lieu d'un sys.exit sec : en pleine phase d'écriture, l'erreur doit alimenter
    `failures` pour que l'opérateur garde un récapitulatif complet (Design Notes v3)."""
    rows = []
    offset = 0
    base = dict(params)
    base.setdefault("order", "id.asc")
    base.setdefault("limit", "1000")
    while True:
        page = _req_net("GET", table, params={**base, "offset": str(offset)})
        if isinstance(page, dict) and page.get("_error"):
            return rows, f"HTTP {page['status']} — {page['body'][:300]}"
        page = page if isinstance(page, list) else []
        rows.extend(page)
        if not page:
            return rows, None
        offset += len(page)


def main():
    parser = argparse.ArgumentParser(
        description="Reclassement des factures « Loris Charge — » vers formation_charges (dry-run par défaut)."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Écrit en prod (défaut = dry-run, aucune écriture).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Bypass le garde-fou de compte UNIQUEMENT pour un SOUS-compte sur les "
             "entités connues (reprise après crash partiel, plan re-validé en dry-run). "
             "Entité inattendue ou sur-compte : STOP même avec --force.",
    )
    args = parser.parse_args()
    DRY = not args.apply

    mode = "DRY-RUN (lecture seule)" if DRY else "APPLY (écriture prod)"
    print(f"\n{'═' * 78}")
    print(f"🛠️  Reclassement des factures « Loris Charge — » → formation_charges  |  Mode : {mode}")
    print(f"{'═' * 78}")
    if DRY:
        print("ℹ️  Aucune écriture ne sera effectuée.")

    failures = []  # erreurs des phases apply (DELETE/recomptage/vérif) → récap + exit 1

    def get_all_apply_safe(table, context, **params):
        """GET paginé sensible à la phase (Design Notes v3) :
        - DRY-RUN : rien n'a été écrit → sys.exit sec acceptable (rest_get_all) ;
        - APPLY   : l'erreur alimente `failures` (récapitulatif complet + exit 1
          en fin de run) et retourne None pour dégrader la section — JAMAIS de
          sys.exit sec en pleine phase d'écriture."""
        if DRY:
            return rest_get_all(table, **params)
        rows, err = rest_get_all_soft(table, **params)
        if err is not None:
            failures.append(f"GET {table} ({context}) : {err}")
            print(f"  ⚠️  Erreur GET {table} ({context}) : {err}")
            return None
        return rows

    # ═════════════════════════════════════════════════════════════════════════
    # 1) FETCH des lignes Charge (discriminant strict, GET paginé)
    # ═════════════════════════════════════════════════════════════════════════
    print(f"\n{'─' * 78}\n📥 Factures « Loris Charge — » (external_source=loris + notes ILIKE "
          f"'{CHARGE_NOTES_PREFIX}%')\n{'─' * 78}")
    raw_rows = rest_get_all("formation_invoices", **{
        "select": "id,entity_id,session_id,amount,recipient_name,recipient_id,external_reference,notes",
        "external_source": "eq.loris",
        "notes": f"ilike.{CHARGE_NOTES_PREFIX}*",
    })
    # Garde-fou côté client : startswith strict AVEC délimiteur (l'ILIKE est insensible à la casse).
    charge_rows = [r for r in raw_rows if (r.get("notes") or "").startswith(CHARGE_NOTES_PREFIX)]
    dropped_guard = len(raw_rows) - len(charge_rows)
    if dropped_guard:
        print(f"  ⚠️  {dropped_guard} ligne(s) matchée(s) par l'ILIKE mais rejetée(s) par le "
              f"garde-fou startswith('{CHARGE_NOTES_PREFIX}') — exclue(s) du périmètre.")
    print(f"  → {len(charge_rows)} lignes dans le périmètre")

    if not charge_rows:
        print("\n✅ Rien à faire — aucune ligne « Loris Charge — » restante (déjà reclassées ?).")
        print("   0 création / 0 suppression.")
        return

    by_entity = {}
    for r in charge_rows:
        by_entity.setdefault(r.get("entity_id"), []).append(r)

    hard_stops = []  # entité inattendue / SUR-compte : STOP en --apply même avec --force
    soft_stops = []  # SOUS-compte sur entité connue : STOP en --apply, bypassable --force
    for eid in sorted(by_entity, key=entity_label):
        rows_e = by_entity[eid]
        total_e = sum((to_decimal(r.get("amount")) or 0.0) for r in rows_e)
        expected_n = EXPECTED.get(eid)
        flag = ""
        if expected_n is None:
            hard_stops.append(f"entité INATTENDUE {eid} ({len(rows_e)} lignes)")
            flag = "  ⚠️  entité INATTENDUE (STOP non bypassable)"
        elif len(rows_e) > expected_n:
            hard_stops.append(f"{entity_label(eid)} : {len(rows_e)} lignes > attendu {expected_n} (sur-compte)")
            flag = f"  ⚠️  SUR-COMPTE (attendu {expected_n}, STOP non bypassable)"
        elif len(rows_e) < expected_n:
            soft_stops.append(f"{entity_label(eid)} : {len(rows_e)} lignes < attendu {expected_n}")
            flag = f"  ⚠️  SOUS-COMPTE (attendu {expected_n})"
        print(f"  {entity_label(eid):<15} : {len(rows_e):>3} lignes | total {_fmt_amount(total_e)}{flag}")
    for eid, expected_n in EXPECTED.items():
        if eid not in by_entity and expected_n:
            soft_stops.append(f"{entity_label(eid)} : 0 ligne < attendu {expected_n}")
            print(f"  {entity_label(eid):<15} :   0 ligne  ⚠️  SOUS-COMPTE (attendu {expected_n})")

    if hard_stops or soft_stops:
        if DRY:
            print("  ⚠️  WARNING : écart par rapport au compte attendu "
                  f"({EXPECTED[C3V_ENTITY_ID]} C3V / {EXPECTED[MR_ENTITY_ID]} MR = 220). "
                  "Re-vérifier le périmètre avant tout --apply.")
        elif hard_stops:
            sys.exit(
                "❌ STOP (non bypassable, même avec --force) :\n"
                + "\n".join(f"   • {h}" for h in hard_stops)
                + "\n   Entité inattendue ou sur-compte : le périmètre a changé — ré-investiguer."
            )
        elif not args.force:
            sys.exit(
                "❌ STOP : sous-compte par rapport à l'attendu "
                f"({EXPECTED[C3V_ENTITY_ID]} C3V / {EXPECTED[MR_ENTITY_ID]} MR = 220) :\n"
                + "\n".join(f"   • {s}" for s in soft_stops)
                + "\n   Re-valider le plan via un dry-run avant --apply.\n"
                "   (Reprise après un crash partiel de suppression : --apply --force "
                "une fois le plan re-validé en dry-run.)"
            )
        else:
            print("  ⚠️  Sous-compte IGNORÉ (--force) — plan supposé re-validé en dry-run.")

    # ═════════════════════════════════════════════════════════════════════════
    # 2) PAYLOADS charges + idempotence par label COMPLET
    #    Skip si une charge existe au même (entity_id, session_id, label) ET
    #    montant quantizé ÉGAL (half-up 2 déc., aucune tolérance) ; même label
    #    mais montant divergent → anomalie. Le label étant unique par
    #    external_reference, aucune fusion de charges réellement distinctes.
    # ═════════════════════════════════════════════════════════════════════════
    print(f"\n{'─' * 78}\n🧮 Construction des charges — dédupe par label COMPLET "
          f"(entity_id, session_id, label) + montant exact\n{'─' * 78}")
    existing_charges = rest_get_all("formation_charges", **{
        "select": "entity_id,session_id,label,amount",
        "label": f"like.{CHARGE_LABEL_PREFIX}*",
    })
    # MULTISET : une charge existante ne « couvre » qu'UNE facture — deux factures
    # partageant exactement (entité, session, label, montant) ne peuvent pas être
    # dedupe-skippées (donc supprimées) sur la foi d'une seule charge en base.
    existing_amount_counts = {}  # (entity_id, session_id, label) → {montant quantizé: n disponibles}
    existing_unreadable = set()  # clés dont une charge existante a un montant NULL/NaN
    for c in existing_charges:
        key = (c.get("entity_id"), c.get("session_id"), c.get("label"))
        amt = canon_charge_amount(c.get("amount"))
        if amt is None:
            existing_unreadable.add(key)
        else:
            per = existing_amount_counts.setdefault(key, {})
            per[amt] = per.get(amt, 0) + 1
    pre_existing_reclass_count = len(existing_charges)  # pour l'assertion post-apply
    print(f"  ℹ️  {pre_existing_reclass_count} charge(s) « {CHARGE_LABEL_PREFIX.strip()} » déjà en base")

    payload_by_invoice = {}   # invoice_id → payload formation_charges à insérer
    dedupe_skipped = []       # (invoice_id, label) : charge déjà en base → delete rejouable
    anomalies = []            # lignes NI insérées NI supprimées (intervention humaine)
    warns = []
    seen_batch_keys = set()   # (entity_id, session_id, label) déjà planifiés dans CE lot

    for r in charge_rows:
        inv_id = r["id"]
        rec = norm(r.get("recipient_name")) or "Inconnu"
        # Fallback « sans réf » : impossible en pratique (external_reference unique
        # posée par l'import), gardé par sécurité.
        ref = norm(r.get("external_reference")) or "sans réf"
        label = f"{CHARGE_LABEL_PREFIX}{rec} ({ref})"
        amount = to_decimal(r.get("amount"))
        if amount is None or amount != amount or amount == 0:  # NULL, NaN (d != d), ou zéro
            anomalies.append(f"montant NULL/NaN/zéro sur « {label} » (id={inv_id}) — "
                             "ni reclassée ni supprimée (pas de charge à 0 €)")
            continue
        if not r.get("session_id"):
            anomalies.append(f"session_id NULL sur « {label} » (id={inv_id}) — ni reclassée ni supprimée")
            continue
        if amount > 0:
            warns.append(f"montant > 0 ({_fmt_amount(amount)}) sur « {label} » — anomalie source, "
                         "reclassée quand même avec abs()")
        key = (r["entity_id"], r["session_id"], label)
        canon_amt = canon_charge_amount(amount)
        per = existing_amount_counts.get(key)
        if per and per.get(canon_amt, 0) > 0:
            # Charge déjà en base au même label + montant EXACT → delete rejouable.
            # Consommation MULTISET : cette charge existante ne couvrira aucune autre facture.
            per[canon_amt] -= 1
            dedupe_skipped.append((inv_id, label))
            continue
        if per or key in existing_unreadable:
            # Même label mais montant DIVERGENT, illisible en base, ou déjà consommé par
            # une autre facture du lot → ANOMALIE (jamais supprimer une facture dont le
            # montant n'a pas été reclassé).
            existing_desc = (", ".join(f"{_fmt_amount(a)}×{n}" for a, n in sorted(per.items()))
                             if per else "NULL/NaN illisible")
            anomalies.append(
                f"charge existante au même (entité, session, label) mais montant DIVERGENT "
                f"ou déjà consommé pour « {label} » (id={inv_id}, source {_fmt_amount(abs(amount))}, "
                f"en base restant {existing_desc}) — ni reclassée ni supprimée "
                "(égalité EXACTE requise, une charge existante ne couvre qu'une facture)"
            )
            continue
        if key in seen_batch_keys:
            anomalies.append(f"label en DOUBLON dans le lot sur « {label} » (id={inv_id}) — "
                             "ni reclassée ni supprimée (external_reference censée unique — "
                             "risque de perte d'information)")
            continue
        seen_batch_keys.add(key)
        payload_by_invoice[inv_id] = {
            "session_id": r["session_id"],
            "entity_id": r["entity_id"],
            "label": label,
            "amount": abs(amount),
        }

    payloads = list(payload_by_invoice.values())
    delete_ids = list(payload_by_invoice.keys()) + [inv_id for inv_id, _ in dedupe_skipped]
    delete_id_set = set(delete_ids)

    # ═════════════════════════════════════════════════════════════════════════
    # 3) WARN parent_invoice_id → lignes à supprimer (FK ON DELETE SET NULL)
    # ═════════════════════════════════════════════════════════════════════════
    linked_children = []
    for chunk_ids in chunks(delete_ids, CHUNK):
        rows = rest_get_all("formation_invoices", **{
            "select": "id,parent_invoice_id,external_reference,entity_id,amount",
            "parent_invoice_id": f"in.({','.join(chunk_ids)})",
        })
        for c in rows:
            if c["id"] not in delete_id_set:
                linked_children.append(c)
    for c in linked_children:
        warns.append(
            f"facture hors périmètre {c.get('external_reference') or c['id']} "
            f"({entity_label(c.get('entity_id'))}, {_fmt_amount(c.get('amount'))}) a "
            f"parent_invoice_id={c.get('parent_invoice_id')} → ligne à supprimer "
            "(FK ON DELETE SET NULL : le lien sera perdu)"
        )

    # ═════════════════════════════════════════════════════════════════════════
    # PLAN — récapitulatif lisible AVANT toute écriture
    # ═════════════════════════════════════════════════════════════════════════
    print(f"\n{'═' * 78}")
    print(f"📋 PLAN — Reclassement charges LORIS  ({mode})")
    print(f"{'═' * 78}")

    print("\n▸ PAR ENTITÉ")
    for eid in sorted(by_entity, key=entity_label):
        eid_payloads = [p for p in payloads if p["entity_id"] == eid]
        total_src = sum((to_decimal(r.get("amount")) or 0.0) for r in by_entity[eid])
        total_charges = sum(p["amount"] for p in eid_payloads)
        print(f"    {entity_label(eid):<15} : {len(by_entity[eid]):>3} lignes source "
              f"(total {_fmt_amount(total_src)}) → {len(eid_payloads):>3} charges à créer "
              f"(total {_fmt_amount(total_charges)})")

    print(f"\n▸ CHARGES À CRÉER : {len(payloads)}  — exemples (top 10 par montant) :")
    top = sorted(payload_by_invoice.items(), key=lambda kv: -kv[1]["amount"])[:10]
    for inv_id, p in top:
        print(f"    • {p['label'][:64]:<64} {_fmt_amount(p['amount']):>14}  "
              f"[{entity_label(p['entity_id'])}]")

    print(f"\n▸ SKIPS DEDUPE (charge déjà en base — label + montant exacts ; "
          f"facture supprimée quand même) : {len(dedupe_skipped)}")
    for inv_id, label in dedupe_skipped[:10]:
        print(f"    • {label[:70]}  (facture id={inv_id})")
    if len(dedupe_skipped) > 10:
        print(f"    … et {len(dedupe_skipped) - 10} autres")

    print(f"\n▸ FACTURES À SUPPRIMER : {len(delete_ids)}")

    if anomalies:
        print(f"\n▸ ANOMALIES (hors reclassement ET hors suppression) : {len(anomalies)}")
        for a in anomalies:
            print(f"    ❗ {a}")

    if warns:
        print(f"\n▸ WARNINGS : {len(warns)}")
        for w in warns:
            print(f"    ⚠️  {w}")
    else:
        print("\n▸ WARNINGS : aucun")

    # ═════════════════════════════════════════════════════════════════════════
    # 4) APPLY — insert des charges PUIS delete des factures (jamais l'inverse)
    # ═════════════════════════════════════════════════════════════════════════
    deleted_total = 0
    if not DRY:
        print(f"\n{'─' * 78}\n✍️  APPLY — 1/2 : insertion des {len(payloads)} charges\n{'─' * 78}")
        inserted, errors = insert_batch("formation_charges", payloads, dry_run=False)
        print(f"  ✅ charges insérées : {len(inserted)} | erreurs : {len(errors)}")
        if errors:
            print(f"  Sample : {errors[0]}")
            sys.exit(
                "❌ STOP : erreurs à l'insertion des charges — AUCUNE suppression effectuée.\n"
                "   Corriger, puis re-valider via dry-run (les charges déjà insérées seront "
                "skippées par le dedupe)."
            )
        if len(inserted) != len(payloads):
            sys.exit(
                f"❌ STOP : {len(inserted)} charges insérées ≠ {len(payloads)} attendues — "
                "AUCUNE suppression effectuée. Re-valider via dry-run."
            )

        # Ne supprimer QUE les ids dont la charge a été insérée (payload_by_invoice)
        # OU skippée pour dedupe (déjà reclassée) — jamais un id en anomalie.
        print(f"\n{'─' * 78}\n✍️  APPLY — 2/2 : suppression des {len(delete_ids)} factures parasites\n{'─' * 78}")
        for chunk_ids in chunks(delete_ids, CHUNK):
            res = _req_net(
                "DELETE",
                "formation_invoices",
                params={"id": f"in.({','.join(chunk_ids)})"},
                prefer="return=representation",
            )
            if isinstance(res, dict) and res.get("_error"):
                failures.append(f"DELETE lot de {len(chunk_ids)} ids : HTTP {res['status']} — {res['body'][:200]}")
                print(f"  ⚠️  Erreur DELETE lot ({len(chunk_ids)} ids) : HTTP {res['status']}")
                continue
            if isinstance(res, list):
                n = len(res)
            else:
                # Réponse None/vide (204 sans representation) : recompter les restantes
                # par GET id=in.(chunk) plutôt que déclarer un faux échec. Une erreur de
                # ce GET alimente `failures` (récap complet), pas de sys.exit sec.
                remaining_chunk = get_all_apply_safe("formation_invoices", "recomptage post-DELETE", **{
                    "select": "id",
                    "id": f"in.({','.join(chunk_ids)})",
                })
                if remaining_chunk is None:
                    print(f"  ⚠️  Recomptage indisponible — lot de {len(chunk_ids)} ids compté "
                          "0 supprimé (re-vérifier via dry-run)")
                    n = 0
                else:
                    n = len(chunk_ids) - len(remaining_chunk)
                    print(f"  ℹ️  Réponse DELETE vide — recomptage GET : "
                          f"{len(remaining_chunk)} restante(s) sur {len(chunk_ids)}")
            deleted_total += n
            print(f"  🗑️  Lot supprimé : {n}/{len(chunk_ids)}")
        if deleted_total != len(delete_ids):
            failures.append(f"suppressions incomplètes : {deleted_total}/{len(delete_ids)}")
            print(f"  ❌ Suppressions incomplètes : {deleted_total}/{len(delete_ids)}")
        else:
            print(f"  ✅ {deleted_total} factures parasites supprimées")

    # ═════════════════════════════════════════════════════════════════════════
    # 5) RAPPORT — fiches clients bootstrap orphelines (aucune suppression)
    # ═════════════════════════════════════════════════════════════════════════
    print(f"\n{'─' * 78}\n📇 Fiches clients bootstrap (rapport seulement, aucune suppression)\n{'─' * 78}")
    clients_rows = get_all_apply_safe("clients", "rapport bootstrap", **{
        "select": "id,company_name,entity_id,loris_metadata",
        "loris_metadata": "not.is.null",
    })
    if clients_rows is None:
        print("  ⚠️  Rapport bootstrap indisponible (erreur GET) — à rejouer via un dry-run.")
    else:
        bootstrap = [
            c for c in clients_rows
            if isinstance(c.get("loris_metadata"), dict) and c["loris_metadata"].get("_bootstrap_from_invoices")
        ]
        print(f"  ℹ️  {len(bootstrap)} fiche(s) client bootstrap (_bootstrap_from_invoices)")
        remaining_by_recipient = {c["id"]: 0 for c in bootstrap}
        bootstrap_degraded = False
        for chunk_ids in chunks([c["id"] for c in bootstrap], CHUNK):
            rows = get_all_apply_safe("formation_invoices", "rapport bootstrap (factures restantes)", **{
                "select": "id,recipient_id",
                "recipient_id": f"in.({','.join(chunk_ids)})",
            })
            if rows is None:
                bootstrap_degraded = True
                break
            for r in rows:
                # Exclusion des factures supprimées/à supprimer (simulée en dry-run).
                if r["id"] in delete_id_set:
                    continue
                if r.get("recipient_id") in remaining_by_recipient:
                    remaining_by_recipient[r["recipient_id"]] += 1
        if bootstrap_degraded:
            print("  ⚠️  Rapport bootstrap incomplet (erreur GET) — orphelines non déterminées.")
        else:
            orphans = [c for c in bootstrap if remaining_by_recipient.get(c["id"], 0) == 0]
            verb = "seraient orphelines" if DRY else "sont orphelines"
            print(f"  → {len(orphans)} fiche(s) {verb} (plus aucune facture) :")
            for c in sorted(orphans, key=lambda c: (entity_label(c.get("entity_id")), str(c.get("company_name")))):
                print(f"    • {c.get('company_name')}  [{entity_label(c.get('entity_id'))}]  id={c['id']}")

    # ═════════════════════════════════════════════════════════════════════════
    # 6) VÉRIFICATION POST-APPLY
    # ═════════════════════════════════════════════════════════════════════════
    if not DRY:
        print(f"\n{'─' * 78}\n🔎 Vérification post-apply\n{'─' * 78}")
        remaining_raw = get_all_apply_safe("formation_invoices", "vérif lignes restantes", **{
            "select": "id,notes",
            "external_source": "eq.loris",
            "notes": f"ilike.{CHARGE_NOTES_PREFIX}*",
        })
        if remaining_raw is not None:
            remaining = [r for r in remaining_raw if (r.get("notes") or "").startswith(CHARGE_NOTES_PREFIX)]
            ok = len(remaining) == len(anomalies)
            icon = "✅" if len(remaining) == 0 else ("⚠️" if ok else "❌")
            print(f"  {icon} Lignes « Loris Charge — » restantes : {len(remaining)} (attendu 0"
                  + (f", dont {len(anomalies)} anomalies non traitées" if anomalies else "") + ")")
            if remaining and not ok:
                failures.append(f"{len(remaining)} ligne(s) « Loris Charge — » restante(s) après apply")

        reclassed = get_all_apply_safe("formation_charges", "vérif charges reclassées", **{
            "select": "id",
            "label": f"like.{CHARGE_LABEL_PREFIX}*",
        })
        if reclassed is not None:
            # Assertion (pas un simple ℹ️) : un écart signale un run concurrent ou un
            # insert non comptabilisé — deux --apply ne doivent JAMAIS tourner en parallèle.
            expected_reclassed = pre_existing_reclass_count + len(payloads)
            icon2 = "✅" if len(reclassed) == expected_reclassed else "❌"
            print(f"  {icon2} formation_charges « {CHARGE_LABEL_PREFIX.strip()} » en base : "
                  f"{len(reclassed)} (attendu {expected_reclassed} = "
                  f"{pre_existing_reclass_count} pré-run + {len(payloads)} insérées)")
            if len(reclassed) != expected_reclassed:
                failures.append(
                    f"compte charges reclassées {len(reclassed)} ≠ attendu {expected_reclassed} "
                    "— run concurrent ou insertion non comptabilisée ? Ré-investiguer avant toute action."
                )

        for eid in sorted(EXPECTED, key=entity_label):
            inv_rows = get_all_apply_safe("formation_invoices", f"vérif total {entity_label(eid)}", **{
                "select": "amount",
                "entity_id": f"eq.{eid}",
            })
            if inv_rows is None:
                continue
            total = sum((to_decimal(r.get("amount")) or 0.0) for r in inv_rows)
            print(f"  ℹ️  Total formation_invoices {entity_label(eid):<15} : {_fmt_amount(total)} "
                  f"({len(inv_rows)} lignes)")

    # ═════════════════════════════════════════════════════════════════════════
    # FIN
    # ═════════════════════════════════════════════════════════════════════════
    print(f"\n{'═' * 78}")
    if DRY:
        print("✅ DRY-RUN terminé — AUCUNE écriture effectuée.")
        print("   Pour appliquer (après GO humain) : ajouter --apply")
    elif failures:
        print("❌ APPLY terminé AVEC ERREURS :")
        for f in failures:
            print(f"   • {f}")
        print("   Re-valider l'état via un dry-run avant toute nouvelle action.")
    else:
        print(f"✅ APPLY terminé : {len(payloads)} charges créées, "
              f"{len(dedupe_skipped)} déjà reclassées (dedupe), {deleted_total} factures supprimées.")
    print(f"{'═' * 78}\n")
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
