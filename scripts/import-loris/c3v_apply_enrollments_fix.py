#!/usr/bin/env python3
"""
Corrige la MAUVAISE ATTRIBUTION des inscriptions : l'import initial matchait la session
par TITRE seul (loris_import.map_enrollment l.434), donc pour N sessions de même titre,
toutes les inscriptions sont allées sur UNE seule (ex. « MANAGERS – PRÉVENTION… » :
26/06 = 44, les autres = 0).

Source de vérité : « Suivi de l'activité des stagaires (1) » = (Nom, Code formation).
Chaque Code formation → une session précise (via « Suivi de l'activité (1) » : titre + date début → extid).

Réconciliation PAR NOM (robuste aux doublons d'apprenants) :
  - Pour chaque session ayant des lignes stagaires (donc un Code) :
      noms_attendus = {norm(Nom) des lignes stagaires de ce Code}
      - INSERT : un nom attendu non inscrit sur la session → enrollment (fiche apprenant canonique).
      - DELETE : un enrollment dont le nom de l'apprenant n'est PAS attendu sur cette session → mal attribué.
  - On ne touche QUE les sessions présentes dans la source ; les autres restent intactes.
  - client_id des nouvelles inscriptions : repris de l'entreprise de la session (INTRA) si connue.

DRY-RUN par défaut. `--apply` pour écrire.
  python3 scripts/import-loris/apply_enrollments_fix.py [--apply]
"""

import argparse
import importlib.util
import json
import urllib.request
from collections import defaultdict
from pathlib import Path

_spec = importlib.util.spec_from_file_location("rec", Path(__file__).parent / "c3v_reconcile.py")
rec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rec)

REPORT_PATH = Path(__file__).parent / "c3v_apply_enrollments_fix_report.json"


def rest_post(table, rows):
    # Insert simple (pas d'on_conflict : la contrainte UNIQUE(session,learner) n'existe pas en prod).
    # La dédup applicative + le filtrage "manquant par nom" évitent les doublons.
    req = urllib.request.Request(
        f"{rec.SUPABASE_URL}/rest/v1/{table}", data=json.dumps(rows).encode(),
        headers={"apikey": rec.SERVICE_ROLE, "Authorization": f"Bearer {rec.SERVICE_ROLE}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"}, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            return len(rows)
    except urllib.error.HTTPError as e:
        if len(rows) == 1:
            print(f"    ⚠️ insert ignoré: {json.dumps(rows[0])} → {e.read().decode(errors='replace')[:160]}")
            return 0
        n = 0
        for row in rows:
            n += rest_post(table, [row]) or 0
        return n


def rest_delete_ids(table, ids):
    for batch in [ids[i:i + 100] for i in range(0, len(ids), 100)]:
        url = f"{rec.SUPABASE_URL}/rest/v1/{table}?id=in.(" + ",".join(batch) + ")"
        req = urllib.request.Request(url, headers={"apikey": rec.SERVICE_ROLE,
                "Authorization": f"Bearer {rec.SERVICE_ROLE}", "Prefer": "return=minimal"}, method="DELETE")
        urllib.request.urlopen(req).read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    print(f"FIX inscriptions (réattribution par Code formation) — {'APPLY' if args.apply else 'DRY-RUN'}\n")

    db_sessions = rec.rest_get_all("sessions", select="id,title,start_date,loris_external_id",
                                   entity_id=f"eq.{rec.C3V_ENTITY_ID}")
    db_learners = rec.rest_get_all("learners", select="id,first_name,last_name", entity_id=f"eq.{rec.C3V_ENTITY_ID}")
    db_enr = rec.rest_get_all("enrollments", select="id,session_id,learner_id,client_id")
    db_clients = rec.rest_get_all("clients", select="id,company_name", entity_id=f"eq.{rec.C3V_ENTITY_ID}")

    sess_by_extid = {s["loris_external_id"]: s for s in db_sessions if s.get("loris_external_id")}

    # Clé de nom INSENSIBLE À L'ORDRE (tokens triés) : le fichier stagaires mélange
    # « Prénom NOM » et « NOM Prénom » (ex. 'David DA CRUZ' vs 'Gayraud Hélène').
    def name_key(s):
        return " ".join(sorted(rec.norm_name(s).split()))

    learner_name = {l["id"]: name_key(f"{l.get('last_name') or ''} {l.get('first_name') or ''}") for l in db_learners}
    # clé de nom -> fiche canonique (min id)
    name_to_learner = {}
    for l in db_learners:
        v = name_key(f"{l.get('last_name') or ''} {l.get('first_name') or ''}")
        if v and (v not in name_to_learner or l["id"] < name_to_learner[v]):
            name_to_learner[v] = l["id"]
    client_by_name = defaultdict(list)
    for c in db_clients:
        client_by_name[rec.norm_name(c.get("company_name"))].append(c["id"])

    # Code formation -> session_id  + Code -> client_id (INTRA) via fichiers
    rows_sessions = rec.read_xlsx(rec.F_SESSIONS)
    rows_clients_f = rec.read_xlsx(rec.F_CLIENTS)
    ent_by_code = defaultdict(set)
    for r in rows_clients_f:
        c = rec.norm(r.get("Code formation")); e = rec.norm(r.get("Entreprise/Client"))
        if c and e: ent_by_code[c].add(e)
    code_to_session, code_to_client = {}, {}
    for r in rows_sessions:
        code = rec.norm(r.get("Code formation"))
        title = rec.norm(r.get("Nom de la formation")); start = rec.to_date(r.get("Date de début de la formation"))
        s = sess_by_extid.get(rec.stable_external_id("session", title or "", start or ""))
        if code and s:
            code_to_session[code] = s["id"]
            ents = ent_by_code.get(code, set())
            if len(ents) == 1:
                cids = client_by_name.get(rec.norm_name(next(iter(ents))), [])
                if cids: code_to_client[code] = sorted(cids)[0]

    # noms attendus par session (depuis stagaires)
    rows_stag = rec.read_xlsx(rec.F_STAGIAIRES)
    expected_names = defaultdict(set)        # session_id -> {norm names}
    code_of_session = {}                     # session_id -> code (pour client_id)
    for r in rows_stag:
        code = rec.norm(r.get("Code formation")); nom = rec.norm(r.get("Nom"))
        sid = code_to_session.get(code)
        if sid and nom:
            expected_names[sid].add(name_key(nom))
            code_of_session[sid] = code

    # enrollments actuels par session
    enr_by_session = defaultdict(list)
    for e in db_enr:
        enr_by_session[e["session_id"]].append(e)

    to_insert, to_delete = [], []
    name_unmatched = set()
    per_session = []  # diagnostic
    for sid, exp in expected_names.items():
        current = enr_by_session.get(sid, [])
        current_names = {learner_name.get(e["learner_id"], "") for e in current}
        # DELETE : enrollment dont le nom n'est pas attendu sur cette session
        dels = [e for e in current if learner_name.get(e["learner_id"], "") not in exp]
        # INSERT : nom attendu non couvert
        missing = [n for n in exp if n not in current_names]
        ins = []
        for n in missing:
            lid = name_to_learner.get(n)
            if not lid:
                name_unmatched.add(n); continue
            row = {"session_id": sid, "learner_id": lid, "status": "registered"}
            cid = code_to_client.get(code_of_session.get(sid))
            if cid: row["client_id"] = cid
            ins.append(row)
        to_insert.extend(ins)
        to_delete.extend([e["id"] for e in dels])
        per_session.append({"session_id": sid, "code": code_of_session.get(sid),
                            "attendus": len(exp), "actuels": len(current),
                            "a_inserer": len(ins), "a_supprimer": len(dels)})

    report = {
        "mode": "apply" if args.apply else "dry-run",
        "sessions_concernees": len(expected_names),
        "total_a_inserer": len(to_insert),
        "total_a_supprimer": len(to_delete),
        "noms_sans_fiche_apprenant": len(name_unmatched),
        "sessions_les_plus_corrigees": sorted(per_session, key=lambda x: -(x["a_inserer"] + x["a_supprimer"]))[:15],
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    print(f"Sessions avec source stagaires : {len(expected_names)}")
    print(f"  → inscriptions à INSÉRER (bonnes sessions) : {len(to_insert)}")
    print(f"  → inscriptions à SUPPRIMER (mal attribuées) : {len(to_delete)}")
    print(f"  noms stagaires sans fiche apprenant (ignorés) : {len(name_unmatched)}")
    print("\n  Top sessions corrigées (attendus / actuels → +ins / -del) :")
    for p in report["sessions_les_plus_corrigees"][:10]:
        print(f"    code {str(p['code']):4} | attendus={p['attendus']:3} actuels={p['actuels']:3} | +{p['a_inserer']} / -{p['a_supprimer']}")

    if not args.apply:
        print(f"\n[DRY-RUN] Aucune écriture. Rapport : {REPORT_PATH}")
        return

    print("\n>>> APPLICATION…")
    if to_delete:
        rest_delete_ids("enrollments", to_delete)
        print(f"  supprimées : {len(to_delete)}")
    # dédup par (session_id, learner_id) : 2 variantes de nom peuvent pointer la même fiche
    seen_pairs = set()
    deduped = []
    for row in to_insert:
        key = (row["session_id"], row["learner_id"])
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        deduped.append(row)
    done = 0
    for batch in [deduped[i:i + 200] for i in range(0, len(deduped), 200)]:
        done += rest_post("enrollments", batch) or 0
    print(f"  insérées (dédup {len(to_insert)}→{len(deduped)}) : {done}")
    print(f"✅ Terminé. Rapport : {REPORT_PATH}")


if __name__ == "__main__":
    main()
