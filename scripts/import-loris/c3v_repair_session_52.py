#!/usr/bin/env python3
"""
Réparation ciblée C3V — réimport de la session « Code formation 52 »
(Agent de maintenance des bâtiments, 23/02/2026 → 31/12/2026, COMPÉTENCES BTP)
+ ses factures + ses inscriptions, droppées par l'import LORIS.

Contexte : bmad_output/implementation-artifacts/spec-c3v-repair-session-52.md
Cause racine : l'import C3V clé les sessions sur (titre, date_début) SANS le Code
formation ; pour un titre partagé par 3 instances, le code 52 (2026) a été écarté →
ses factures ont skippé en no-match. Ce script recrée UNIQUEMENT le code 52.

⚠️ DRY-RUN PAR DÉFAUT. Écriture prod uniquement avec --apply (après GO humain).
Réutilise TOUTES les fonctions de c3v_import.py (aucune ré-implémentation métier).

Usage :
    python3 scripts/import-loris/c3v_repair_session_52.py           # dry-run (défaut)
    python3 scripts/import-loris/c3v_repair_session_52.py --apply   # write prod
"""

import argparse
import sys

# Réutilisation stricte des helpers de l'import LORIS (pas de ré-implémentation).
from c3v_import import (
    C3V_ENTITY_ID,
    FILES,
    fetch_existing_lookups,
    insert_batch,
    map_enrollment,
    map_formation_invoice,
    map_session,
    norm,
    read_xlsx,
    rest_get,
    stable_external_id,
    to_date,
    to_decimal,
)

TARGET_CODE = "52"


def _fmt_amount(v):
    """Formatte un montant en style FR pour l'affichage du plan (250,32 €)."""
    if v is None:
        return "—"
    try:
        return f"{float(v):,.2f} €".replace(",", " ").replace(".", ",")
    except (TypeError, ValueError):
        return str(v)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Écrit en prod (défaut = dry-run, aucune écriture).",
    )
    args = parser.parse_args()
    DRY = not args.apply

    mode = "DRY-RUN (lecture seule)" if DRY else "APPLY (écriture prod)"
    print(f"\n{'═' * 78}")
    print(f"🛠️  Réparation C3V — Code formation {TARGET_CODE}  |  Mode : {mode}")
    print(f"{'═' * 78}")
    print(f"Entity C3V FORMATION : {C3V_ENTITY_ID}")
    if DRY:
        print("ℹ️  Aucune écriture ne sera effectuée (insert_batch dry_run=True).")

    # ── Lookups existants (lecture prod, read-only) ──────────────────────────
    print(f"\n{'─' * 78}\n📥 Lookups existants (prod, read-only)\n{'─' * 78}")
    lk = fetch_existing_lookups()
    print(
        f"  → {len(lk['clients_by_name'])} clients, {len(lk['learners_by_name'])} learners, "
        f"{len(lk['trainings_by_title'])} trainings, {len(lk['sessions_by_title'])} sessions"
    )

    plan = {
        "session": {"status": None, "detail": None},
        "invoices": {"create": [], "skip_existing": [], "skip_charge": []},
        "enrollments": {"create": [], "skip_no_match": [], "skip_existing": []},
    }

    # ═════════════════════════════════════════════════════════════════════════
    # 1) SESSION (Code formation 52)
    # ═════════════════════════════════════════════════════════════════════════
    print(f"\n{'─' * 78}\n📂 SESSION — Code formation {TARGET_CODE}\n{'─' * 78}")
    _sh, sess_rows = read_xlsx(FILES["trainings_sessions"])
    sess_rows = sess_rows or []
    matched_sessions = [r for r in sess_rows if norm(r.get("Code formation")) == TARGET_CODE]
    print(f"  Lignes source (Code formation == {TARGET_CODE}) : {len(matched_sessions)}")

    new_session_id = None
    if not matched_sessions:
        print("  ❌ Aucune ligne session code 52 dans la source — rien à créer.")
        plan["session"] = {"status": "SOURCE_ABSENTE", "detail": None}
    else:
        # Une seule ligne code 52 attendue ; on traite la première.
        srow = matched_sessions[0]
        title = norm(srow.get("Nom de la formation"))
        start_date = to_date(srow.get("Date de début de la formation"))
        end_date = to_date(srow.get("Date de fin de la formation"))
        # Recalcule l'external_id EXACTEMENT comme map_session (titre + date_début).
        loris_ext = stable_external_id("session", title, start_date or "")
        existing_sid = lk["sessions_by_loris_id"].get(loris_ext)

        payload = map_session(srow, 0, lk["trainings_by_title"])
        training_ok = payload.get("training_id") is not None if payload else False

        base_detail = {
            "title": title,
            "start_date": start_date,
            "end_date": end_date,
            "loris_external_id": loris_ext,
            "training_linked": training_ok,
        }

        if existing_sid:
            print(f"  ✅ Session DÉJÀ présente (loris_external_id={loris_ext}) → id={existing_sid}")
            print("     Aucune création (idempotence).")
            new_session_id = existing_sid
            plan["session"] = {"status": "DÉJÀ PRÉSENTE", "detail": {**base_detail, "id": existing_sid}}
        else:
            print(f"  ➕ Session À CRÉER : « {title} »  {start_date} → {end_date}")
            print(f"     training rattaché en base : {'oui' if training_ok else 'NON (training_id=null)'}")
            print(f"     loris_external_id : {loris_ext}")
            inserted, errors = insert_batch("sessions", [payload], dry_run=DRY)
            if errors:
                print(f"  ⚠️  Erreurs insert session : {errors[0]}")
            if DRY:
                # Placeholder id pour permettre la suite du plan (résolution facture→session).
                new_session_id = f"DRYRUN-SESSION-52-{loris_ext}"
                print(f"     [DRY-RUN] id simulé pour la suite du plan : {new_session_id}")
            else:
                new_session_id = inserted[0]["id"] if inserted else None
                print(f"  ✅ Session créée → id={new_session_id}")
            plan["session"] = {
                "status": "À CRÉER" if not errors else "ERREUR",
                "detail": {**base_detail, "id": new_session_id, "errors": errors},
            }

        # Câblage code_to_session[52] pour que map_formation_invoice résolve la session.
        if new_session_id:
            lk["code_to_session"][TARGET_CODE] = new_session_id

    # ═════════════════════════════════════════════════════════════════════════
    # 2) FACTURES (Code formation 52)
    # ═════════════════════════════════════════════════════════════════════════
    print(f"\n{'─' * 78}\n📂 FACTURES — Code formation {TARGET_CODE}\n{'─' * 78}")
    _fh, inv_rows = read_xlsx(FILES["formation_invoices"])
    inv_rows = inv_rows or []
    matched_invoices = [r for r in inv_rows if norm(r.get("Code formation")) == TARGET_CODE]
    print(f"  Lignes source (Code formation == {TARGET_CODE}) : {len(matched_invoices)}")

    # Références déjà en base (C3V, source loris) — dédup par external_reference.
    existing_refs_rows = rest_get(
        "formation_invoices",
        select="external_reference",
        **{"entity_id": f"eq.{C3V_ENTITY_ID}", "external_source": "eq.loris"},
    )
    ref_set = {
        r["external_reference"]
        for r in (existing_refs_rows if isinstance(existing_refs_rows, list) else [])
        if r.get("external_reference")
    }

    # Offset number/global_number : même logique que l'import (max existant, ≥ 900000).
    max_gn_rows = rest_get(
        "formation_invoices",
        select="global_number",
        order="global_number.desc.nullslast",
        limit="1",
        **{"entity_id": f"eq.{C3V_ENTITY_ID}"},
    )
    max_gn = 0
    if isinstance(max_gn_rows, list) and max_gn_rows and max_gn_rows[0].get("global_number"):
        max_gn = max_gn_rows[0]["global_number"]
    offset_gn = max(max_gn + 1, 900000)
    print(f"  ℹ️  Offset global_number : {offset_gn} (max existant = {max_gn})")

    invoices_to_insert = []
    for i, row in enumerate(matched_invoices):
        ref = norm(row.get("Numéro"))
        typ = (norm(row.get("Type")) or "").lower()
        amount = to_decimal(row.get("Montant"))
        # Filtre : ne pas créer les lignes « Charge » (formateurs) — pas de N° facture,
        # montant négatif. Ce ne sont pas des factures de vente.
        if typ == "charge" or ref is None:
            print(f"  ⏭️  Skip (charge/sans n°) : type={typ or '?'} montant={_fmt_amount(amount)} "
                  f"dest={norm(row.get('Destinataire'))}")
            plan["invoices"]["skip_charge"].append(
                {"type": typ, "amount": amount, "destinataire": norm(row.get("Destinataire"))}
            )
            continue

        p = map_formation_invoice(
            row, i, lk["sessions_by_title"], lk["clients_by_name"],
            code_to_session=lk["code_to_session"],
        )
        if not p:
            continue
        if "_skip_reason" in p:
            print(f"  ⏭️  Skip (no-match) : {ref} — {p['_skip_reason']}")
            plan["invoices"]["skip_existing"].append(
                {"external_reference": ref, "reason": p["_skip_reason"]}
            )
            continue

        ext_ref = p.get("external_reference")
        if ext_ref and ext_ref in ref_set:
            print(f"  ✅ Facture DÉJÀ présente : {ext_ref} ({_fmt_amount(p.get('amount'))}) → skip")
            plan["invoices"]["skip_existing"].append(
                {"external_reference": ext_ref, "amount": p.get("amount"), "reason": "déjà en base"}
            )
            continue

        # Offset number/global_number, comme l'import.
        p["number"] = offset_gn + i
        p["global_number"] = offset_gn + i
        invoices_to_insert.append(p)
        print(
            f"  ➕ Facture À CRÉER : external_reference={ext_ref}  montant={_fmt_amount(p.get('amount'))}  "
            f"statut={p.get('status')}  ref_interne=LORIS-{p['number']}  dest={p.get('recipient_name')}"
        )
        plan["invoices"]["create"].append(
            {
                "external_reference": ext_ref,
                "amount": p.get("amount"),
                "status": p.get("status"),
                "reference_interne": f"LORIS-{p['number']}",
                "recipient_name": p.get("recipient_name"),
                "recipient_type": p.get("recipient_type"),
            }
        )

    inv_inserted, inv_errors = insert_batch("formation_invoices", invoices_to_insert, dry_run=DRY)
    if inv_errors:
        print(f"  ⚠️  Erreurs insert factures : {inv_errors[0]}")
    if not DRY:
        print(f"  ✅ Factures créées : {len(inv_inserted)} | erreurs : {len(inv_errors)}")

    # ═════════════════════════════════════════════════════════════════════════
    # 3) INSCRIPTIONS (Code formation 52)
    # ═════════════════════════════════════════════════════════════════════════
    print(f"\n{'─' * 78}\n📂 INSCRIPTIONS — Code formation {TARGET_CODE}\n{'─' * 78}")
    _eh, enr_rows = read_xlsx(FILES["enrollments"])
    enr_rows = enr_rows or []
    # Filtre : Code formation == 52 (repli sur titre géré par map_enrollment via code_to_session).
    matched_enr = [r for r in enr_rows if norm(r.get("Code formation")) == TARGET_CODE]
    print(f"  Lignes source (Code formation == {TARGET_CODE}) : {len(matched_enr)}")

    # Dédup persistant par loris_external_id (comme l'import).
    existing_enr = rest_get(
        "enrollments", select="loris_external_id", **{"loris_external_id": "not.is.null"}
    )
    existing_enr_ext = {
        r["loris_external_id"]
        for r in (existing_enr if isinstance(existing_enr, list) else [])
        if r.get("loris_external_id")
    }

    enr_to_insert = []
    seen_ext = set()
    for row in matched_enr:
        p = map_enrollment(
            row, lk["sessions_by_title"], lk["learners_by_name"], code_to_session=lk["code_to_session"]
        )
        if not p:
            continue
        if "_skip_reason" in p:
            nom = norm(row.get("Nom"))
            print(f"  ⏭️  Skip (no-match) : {nom} — {p['_skip_reason']}")
            plan["enrollments"]["skip_no_match"].append({"nom": nom, "reason": p["_skip_reason"]})
            continue
        ext = p["loris_external_id"]
        if ext in seen_ext or ext in existing_enr_ext:
            print(f"  ✅ Inscription DÉJÀ présente : {norm(row.get('Nom'))} → skip")
            plan["enrollments"]["skip_existing"].append({"nom": norm(row.get("Nom"))})
            continue
        seen_ext.add(ext)
        enr_to_insert.append(p)
        print(f"  ➕ Inscription À CRÉER : {norm(row.get('Nom'))}")
        plan["enrollments"]["create"].append({"nom": norm(row.get("Nom"))})

    enr_inserted, enr_errors = insert_batch("enrollments", enr_to_insert, dry_run=DRY)
    if enr_errors:
        print(f"  ⚠️  Erreurs insert inscriptions : {enr_errors[0]}")
    if not DRY:
        print(f"  ✅ Inscriptions créées : {len(enr_inserted)} | erreurs : {len(enr_errors)}")

    # ═════════════════════════════════════════════════════════════════════════
    # PLAN — récapitulatif lisible
    # ═════════════════════════════════════════════════════════════════════════
    print(f"\n{'═' * 78}")
    print(f"📋 PLAN — Réparation Code formation {TARGET_CODE}  ({mode})")
    print(f"{'═' * 78}")

    # Session
    s = plan["session"]
    print("\n▸ SESSION")
    if s["status"] == "SOURCE_ABSENTE":
        print("    ❌ Aucune ligne source — rien à faire.")
    else:
        d = s["detail"] or {}
        print(f"    Statut       : {s['status']}")
        print(f"    Titre        : {d.get('title')}")
        print(f"    Dates        : {d.get('start_date')} → {d.get('end_date')}")
        print(f"    Training lié : {'oui' if d.get('training_linked') else 'NON'}")
        print(f"    Session id   : {d.get('id')}")

    # Factures
    inv = plan["invoices"]
    print("\n▸ FACTURES")
    print(f"    À créer          : {len(inv['create'])}")
    for f in inv["create"]:
        print(
            f"        • {f['external_reference']:<12} {_fmt_amount(f['amount']):>14}  "
            f"statut={f['status']:<8} interne={f['reference_interne']}  → {f['recipient_name']} "
            f"({f['recipient_type']})"
        )
    print(f"    Déjà présentes / skip : {len(inv['skip_existing'])}")
    for f in inv["skip_existing"]:
        amt = _fmt_amount(f["amount"]) if f.get("amount") is not None else ""
        print(f"        • {f.get('external_reference', '?'):<12} {amt:>14}  ({f.get('reason')})")
    print(f"    Charges ignorées (non-factures) : {len(inv['skip_charge'])}")
    for f in inv["skip_charge"]:
        print(f"        • {f.get('destinataire')}  {_fmt_amount(f.get('amount'))}  (type={f.get('type')})")

    # Inscriptions
    enr = plan["enrollments"]
    print("\n▸ INSCRIPTIONS")
    print(f"    À créer            : {len(enr['create'])}")
    for e in enr["create"]:
        print(f"        • {e['nom']}")
    print(f"    Déjà présentes     : {len(enr['skip_existing'])}")
    for e in enr["skip_existing"]:
        print(f"        • {e['nom']}")
    print(f"    Non résolues (skip) : {len(enr['skip_no_match'])}")
    for e in enr["skip_no_match"]:
        print(f"        • {e['nom']} — {e['reason']}")

    print(f"\n{'═' * 78}")
    if DRY:
        print("✅ DRY-RUN terminé — AUCUNE écriture effectuée.")
        print("   Pour appliquer (après GO humain) : ajouter --apply")
    else:
        print("✅ APPLY terminé.")
        print(
            f"   Session : {plan['session']['status']} | "
            f"Factures créées : {len(inv_inserted)} | Inscriptions créées : {len(enr_inserted)}"
        )
    print(f"{'═' * 78}\n")


if __name__ == "__main__":
    main()
