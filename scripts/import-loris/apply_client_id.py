#!/usr/bin/env python3
"""
LOT 1 — Rattachement apprenants ↔ entreprises (client_id) via « Code formation ».

Principe (additif, sûr) :
  - Sessions INTRA (1 seule entreprise) : tous les apprenants inscrits héritent du client_id.
  - Source des inscrits : « Suivi de l'activité des stagaires (1) » (Nom + Code formation).
  - Garde-fous : n'écrit QUE si client_id est NULL (idempotent, n'écrase rien) ;
    si un même nom est rattaché à >1 entreprise (sessions INTRA différentes) → CONFLIT → on saute (manuel).
  - Cascade enrollments : pour toute inscription existante sur une session INTRA, si enrollments.client_id
    est NULL → on le renseigne depuis le client de la session (déterministe, sans matching de nom).

DRY-RUN par défaut. `--apply` pour écrire. INTER / entreprises absentes / conflits → listés pour traitement manuel.

Usage :
  python3 scripts/import-loris/apply_client_id.py            # dry-run
  python3 scripts/import-loris/apply_client_id.py --apply    # écriture
"""

import argparse
import importlib.util
import json
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

# Réutilise helpers/REST/constantes du script de réconciliation
_spec = importlib.util.spec_from_file_location("rec", Path(__file__).parent / "reconcile_code_formation.py")
rec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rec)

REPORT_PATH = Path(__file__).parent / "apply_client_id_report.json"


def rest_patch(table, id_filter, body):
    url = f"{rec.SUPABASE_URL}/rest/v1/{table}?{id_filter}"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "apikey": rec.SERVICE_ROLE,
            "Authorization": f"Bearer {rec.SERVICE_ROLE}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="PATCH",
    )
    with urllib.request.urlopen(req) as r:
        return r.status


def chunk(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="écrit en base (sinon dry-run)")
    args = ap.parse_args()
    mode = "APPLY (écriture)" if args.apply else "DRY-RUN (lecture seule)"
    print(f"LOT 1 client_id — {mode} — MR FORMATION\n")

    db_sessions = rec.rest_get_all("sessions", select="id,title,start_date,loris_external_id",
                                   entity_id=f"eq.{rec.MR_ENTITY_ID}")
    db_learners = rec.rest_get_all("learners", select="id,first_name,last_name,client_id",
                                   entity_id=f"eq.{rec.MR_ENTITY_ID}")
    db_clients = rec.rest_get_all("clients", select="id,company_name", entity_id=f"eq.{rec.MR_ENTITY_ID}")
    db_enroll = rec.rest_get_all("enrollments", select="id,session_id,learner_id,client_id")

    # index
    sess_by_extid = {s["loris_external_id"]: s for s in db_sessions if s.get("loris_external_id")}
    client_by_name = defaultdict(list)
    for c in db_clients:
        client_by_name[rec.norm_name(c.get("company_name"))].append(c["id"])
    learner_by_name = defaultdict(list)
    for l in db_learners:
        fn = (l.get("first_name") or "").strip()
        ln = (l.get("last_name") or "").strip()
        for v in {rec.norm_name(f"{ln} {fn}"), rec.norm_name(f"{fn} {ln}")}:
            if v:
                learner_by_name[v].append(l)

    rows_sessions = rec.read_xlsx(rec.F_SESSIONS)
    rows_clients = rec.read_xlsx(rec.F_CLIENTS)
    rows_stag = rec.read_xlsx(rec.F_STAGIAIRES)

    # code -> entreprises
    ent_by_code = defaultdict(set)
    for r in rows_clients:
        code = rec.norm(r.get("Code formation"))
        ent = rec.norm(r.get("Entreprise/Client"))
        if code and ent:
            ent_by_code[code].add(ent)

    # code -> session DB (extid) + code INTRA -> client_id
    code_to_session = {}
    code_to_client = {}     # INTRA résolu uniquement
    skipped = {"inter": 0, "no_client_in_db": 0, "no_entreprise": 0, "session_unmatched": 0}
    for r in rows_sessions:
        code = rec.norm(r.get("Code formation"))
        if not code:
            continue
        title = rec.norm(r.get("Nom de la formation"))
        start = rec.to_date(r.get("Date de début de la formation"))
        s = sess_by_extid.get(rec.stable_external_id("session", title or "", start or ""))
        if not s:
            skipped["session_unmatched"] += 1
            continue
        code_to_session[code] = s
        ents = ent_by_code.get(code, set())
        if not ents:
            skipped["no_entreprise"] += 1
            continue
        if len(ents) > 1:
            skipped["inter"] += 1
            continue
        cids = client_by_name.get(rec.norm_name(next(iter(ents))), [])
        if len(cids) == 1:
            code_to_client[code] = cids[0]
        else:
            skipped["no_client_in_db"] += 1

    # nom -> set(client_id) via sessions INTRA (détection conflit)
    name_to_clients = defaultdict(set)
    for r in rows_stag:
        code = rec.norm(r.get("Code formation"))
        nom = rec.norm(r.get("Nom"))
        if code in code_to_client and nom:
            name_to_clients[rec.norm_name(nom)].add(code_to_client[code])

    # plan learners : record NULL + nom non-conflictuel -> client_id
    learner_updates = defaultdict(list)   # client_id -> [learner_id]
    conflicts = []
    no_learner_record = set()
    for name, clients in name_to_clients.items():
        recs = learner_by_name.get(name, [])
        if not recs:
            no_learner_record.add(name)
            continue
        if len(clients) > 1:
            conflicts.append(name)
            continue
        cid = next(iter(clients))
        for l in recs:
            if not l.get("client_id"):
                learner_updates[cid].append(l["id"])

    n_learner_upd = sum(len(v) for v in learner_updates.values())

    # plan enrollments : inscription existante sur session INTRA, client_id NULL -> client de la session
    sessid_to_client = {code_to_session[c]["id"]: cid for c, cid in code_to_client.items()}
    enroll_updates = defaultdict(list)
    for e in db_enroll:
        cid = sessid_to_client.get(e.get("session_id"))
        if cid and not e.get("client_id"):
            enroll_updates[cid].append(e["id"])
    n_enroll_upd = sum(len(v) for v in enroll_updates.values())

    # ── rapport ───────────────────────────────────────────────────────────
    report = {
        "mode": "apply" if args.apply else "dry-run",
        "sessions_intra_resolues": len(code_to_client),
        "skipped": skipped,
        "learners_a_mettre_a_jour": n_learner_upd,
        "enrollments_a_mettre_a_jour": n_enroll_upd,
        "noms_en_conflit_multi_entreprise": sorted(conflicts)[:50],
        "nb_conflits": len(conflicts),
        "noms_sans_record_learner": sorted(no_learner_record)[:30],
        "nb_noms_sans_record": len(no_learner_record),
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    print(f"Sessions INTRA résolues (1 entreprise → 1 client) : {len(code_to_client)}")
    print(f"Sautées : INTER={skipped['inter']}, entreprise absente base={skipped['no_client_in_db']}, "
          f"sans entreprise={skipped['no_entreprise']}, session non matchée={skipped['session_unmatched']}")
    print(f"\n→ Learners à rattacher (client_id NULL) : {n_learner_upd}")
    print(f"→ Enrollments existants à compléter      : {n_enroll_upd}")
    print(f"⚠️  Noms en conflit (même nom, >1 entreprise) : {len(conflicts)} → manuel")
    print(f"⚠️  Noms inscrits sans record learner          : {len(no_learner_record)} → manuel")

    if not args.apply:
        print(f"\n[DRY-RUN] Aucune écriture. Rapport : {REPORT_PATH}")
        print("Relance avec --apply pour écrire.")
        return

    print("\n>>> APPLICATION…")
    done_l = 0
    for cid, ids in learner_updates.items():
        for batch in chunk(ids, 100):
            rest_patch("learners", "id=in.(" + ",".join(batch) + ")", {"client_id": cid})
            done_l += len(batch)
            print(f"  learners {done_l}/{n_learner_upd}", end="\r")
    print(f"  learners mis à jour : {done_l}        ")
    done_e = 0
    for cid, ids in enroll_updates.items():
        for batch in chunk(ids, 100):
            rest_patch("enrollments", "id=in.(" + ",".join(batch) + ")", {"client_id": cid})
            done_e += len(batch)
    print(f"  enrollments mis à jour : {done_e}")
    print(f"\n✅ Terminé. Rapport : {REPORT_PATH}")


if __name__ == "__main__":
    main()
