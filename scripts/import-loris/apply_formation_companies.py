#!/usr/bin/env python3
"""
LOT 1b — Lien session ↔ entreprise (formation_companies), affiché dans « Entreprises liées ».

Source : « Suivi de l'activité des clients (1) » → (Code formation, Entreprise/Client, Prix HT).
Pour chaque (session, entreprise) : insère une ligne formation_companies (amount = Prix HT).
Fonctionne pour INTRA (1) ET INTER (plusieurs entreprises par session).

Garde-fous :
  - client_id résolu par nom normalisé → clients (fiche canonique = min id si doublons).
  - Idempotent : UNIQUE(session_id, client_id) ; on saute les paires déjà présentes.
  - Ne touche PAS sessions.total_price (déjà renseigné à l'import).

DRY-RUN par défaut. `--apply` pour écrire.
  python3 scripts/import-loris/apply_formation_companies.py [--apply]
"""

import argparse
import importlib.util
import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

_spec = importlib.util.spec_from_file_location("rec", Path(__file__).parent / "reconcile_code_formation.py")
rec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rec)

REPORT_PATH = Path(__file__).parent / "apply_formation_companies_report.json"


def to_decimal(v):
    s = rec.norm(v)
    if not s:
        return None
    s = re.sub(r"[^\d.,\-]", "", s)
    if not s:
        return None
    if "." in s and "," in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def rest_post(table, rows):
    req = urllib.request.Request(
        f"{rec.SUPABASE_URL}/rest/v1/{table}", data=json.dumps(rows).encode(),
        headers={"apikey": rec.SERVICE_ROLE, "Authorization": f"Bearer {rec.SERVICE_ROLE}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
        method="POST")
    with urllib.request.urlopen(req) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    print(f"LOT 1b formation_companies — {'APPLY (écriture)' if args.apply else 'DRY-RUN'} — MR FORMATION\n")

    db_sessions = rec.rest_get_all("sessions", select="id,title,start_date,loris_external_id",
                                   entity_id=f"eq.{rec.MR_ENTITY_ID}")
    db_clients = rec.rest_get_all("clients", select="id,company_name", entity_id=f"eq.{rec.MR_ENTITY_ID}")
    existing = rec.rest_get_all("formation_companies", select="session_id,client_id")

    sess_by_extid = {s["loris_external_id"]: s for s in db_sessions if s.get("loris_external_id")}
    client_by_name = defaultdict(list)
    for c in db_clients:
        client_by_name[rec.norm_name(c.get("company_name"))].append(c["id"])
    existing_pairs = {(x["session_id"], x["client_id"]) for x in existing}

    rows_sessions = rec.read_xlsx(rec.F_SESSIONS)
    rows_clients = rec.read_xlsx(rec.F_CLIENTS)

    # code -> session_id
    code_to_session = {}
    for r in rows_sessions:
        code = rec.norm(r.get("Code formation"))
        title = rec.norm(r.get("Nom de la formation"))
        start = rec.to_date(r.get("Date de début de la formation"))
        s = sess_by_extid.get(rec.stable_external_id("session", title or "", start or ""))
        if code and s:
            code_to_session[code] = s["id"]

    to_insert = []
    seen = set()
    stats = {"deja_present": 0, "session_non_matchee": 0, "entreprise_sans_client": 0, "sans_prix": 0}
    unresolved_ent = defaultdict(int)
    for r in rows_clients:
        code = rec.norm(r.get("Code formation"))
        ent = rec.norm(r.get("Entreprise/Client"))
        if not code or not ent:
            continue
        sess_id = code_to_session.get(code)
        if not sess_id:
            stats["session_non_matchee"] += 1
            continue
        cids = client_by_name.get(rec.norm_name(ent), [])
        if not cids:
            stats["entreprise_sans_client"] += 1
            unresolved_ent[ent] += 1
            continue
        client_id = sorted(cids)[0]  # fiche canonique si doublons
        pair = (sess_id, client_id)
        if pair in existing_pairs or pair in seen:
            stats["deja_present"] += 1
            continue
        seen.add(pair)
        amount = to_decimal(r.get("Prix HT"))
        if amount is None:
            stats["sans_prix"] += 1
        to_insert.append({"session_id": sess_id, "client_id": client_id, "amount": amount})

    report = {
        "mode": "apply" if args.apply else "dry-run",
        "liens_a_creer": len(to_insert),
        "sessions_concernees": len({x["session_id"] for x in to_insert}),
        "stats": stats,
        "entreprises_non_resolues": dict(sorted(unresolved_ent.items(), key=lambda kv: -kv[1])[:20]),
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    print(f"Liens session↔entreprise à créer : {len(to_insert)} "
          f"(sur {report['sessions_concernees']} sessions)")
    print(f"  déjà présents : {stats['deja_present']} | sans prix : {stats['sans_prix']}")
    print(f"  session non matchée : {stats['session_non_matchee']} | entreprise sans client : {stats['entreprise_sans_client']}")
    if unresolved_ent:
        print("  entreprises non résolues :", dict(list(report["entreprises_non_resolues"].items())[:5]))

    if not args.apply:
        print(f"\n[DRY-RUN] Aucune écriture. Rapport : {REPORT_PATH}")
        return

    print("\n>>> APPLICATION…")
    done = 0
    for batch in [to_insert[i:i + 200] for i in range(0, len(to_insert), 200)]:
        rest_post("formation_companies", batch)
        done += len(batch)
    print(f"✅ {done} liens créés. Rapport : {REPORT_PATH}")


if __name__ == "__main__":
    main()
