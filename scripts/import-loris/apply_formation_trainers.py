#!/usr/bin/env python3
"""
ESPACE FORMATEUR (B) — Lien session ↔ formateur (formation_trainers) via « Code formation ».

L'import initial matchait la session par TITRE seul → seulement 100 liens / 90 sessions.
Le fichier « Suivi de l'activité des formateurs (1) » a désormais « Code formation » → matching déterministe.

Source : (Formateur, Code formation) → trainer (par nom) + session (Code formation → extid).
Insère formation_trainers(session_id, trainer_id, role='formateur'). Idempotent UNIQUE(session_id,trainer_id).

DRY-RUN par défaut. `--apply` pour écrire.
  python3 scripts/import-loris/apply_formation_trainers.py [--apply]
"""

import argparse
import importlib.util
import json
import urllib.request
from collections import defaultdict
from pathlib import Path

_spec = importlib.util.spec_from_file_location("rec", Path(__file__).parent / "reconcile_code_formation.py")
rec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rec)

F_FORMATEURS = "Suivi de l'activité des formateurs (1).xlsx"
REPORT_PATH = Path(__file__).parent / "apply_formation_trainers_report.json"


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
    print(f"FORMATION_TRAINERS — {'APPLY' if args.apply else 'DRY-RUN'} — MR FORMATION\n")

    db_sessions = rec.rest_get_all("sessions", select="id,title,start_date,loris_external_id",
                                   entity_id=f"eq.{rec.MR_ENTITY_ID}")
    db_trainers = rec.rest_get_all("trainers", select="id,first_name,last_name",
                                   entity_id=f"eq.{rec.MR_ENTITY_ID}")
    existing = rec.rest_get_all("formation_trainers", select="session_id,trainer_id")

    sess_by_extid = {s["loris_external_id"]: s for s in db_sessions if s.get("loris_external_id")}
    trainer_by_name = defaultdict(list)
    for t in db_trainers:
        fn = (t.get("first_name") or "").strip()
        ln = (t.get("last_name") or "").strip()
        for v in {rec.norm_name(f"{ln} {fn}"), rec.norm_name(f"{fn} {ln}")}:
            if v:
                trainer_by_name[v].append(t["id"])
    existing_pairs = {(x["session_id"], x["trainer_id"]) for x in existing}

    # Construire code -> session via le fichier sessions (Code formation)
    rows_sessions = rec.read_xlsx(rec.F_SESSIONS)
    code_to_session = {}
    for r in rows_sessions:
        code = rec.norm(r.get("Code formation"))
        title = rec.norm(r.get("Nom de la formation"))
        start = rec.to_date(r.get("Date de début de la formation"))
        s = sess_by_extid.get(rec.stable_external_id("session", title or "", start or ""))
        if code and s:
            code_to_session[code] = s["id"]

    rows_form = rec.read_xlsx(F_FORMATEURS)
    to_insert, seen = [], set()
    stats = {"deja_present": 0, "session_non_matchee": 0, "trainer_non_trouve": 0, "trainer_ambigu": 0}
    unresolved = defaultdict(int)
    for r in rows_form:
        code = rec.norm(r.get("Code formation"))
        nom = rec.norm(r.get("Formateur"))
        if not code or not nom:
            continue
        sess_id = code_to_session.get(code)
        if not sess_id:
            stats["session_non_matchee"] += 1
            continue
        tids = trainer_by_name.get(rec.norm_name(nom), [])
        if len(tids) == 0:
            stats["trainer_non_trouve"] += 1
            unresolved[nom] += 1
            continue
        if len(set(tids)) > 1:
            stats["trainer_ambigu"] += 1
            continue
        tid = tids[0]
        pair = (sess_id, tid)
        if pair in existing_pairs or pair in seen:
            stats["deja_present"] += 1
            continue
        seen.add(pair)
        to_insert.append({"session_id": sess_id, "trainer_id": tid, "role": "formateur"})

    report = {
        "mode": "apply" if args.apply else "dry-run",
        "liens_a_creer": len(to_insert),
        "sessions_concernees": len({x["session_id"] for x in to_insert}),
        "trainers_concernes": len({x["trainer_id"] for x in to_insert}),
        "stats": stats,
        "formateurs_non_trouves": dict(sorted(unresolved.items(), key=lambda kv: -kv[1])[:20]),
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    print(f"Liens session↔formateur à créer : {len(to_insert)} "
          f"({report['sessions_concernees']} sessions, {report['trainers_concernes']} formateurs)")
    print(f"  déjà présents : {stats['deja_present']}")
    print(f"  session non matchée : {stats['session_non_matchee']} | formateur introuvable : {stats['trainer_non_trouve']} | ambigu : {stats['trainer_ambigu']}")
    if unresolved:
        print("  formateurs introuvables (échantillon) :", list(report["formateurs_non_trouves"].items())[:6])

    if not args.apply:
        print(f"\n[DRY-RUN] Aucune écriture. Rapport : {REPORT_PATH}")
        return

    print("\n>>> APPLICATION…")
    done = 0
    for batch in [to_insert[i:i + 200] for i in range(0, len(to_insert), 200)]:
        rest_post("formation_trainers", batch)
        done += len(batch)
    print(f"✅ {done} liens créés. Rapport : {REPORT_PATH}")


if __name__ == "__main__":
    main()
