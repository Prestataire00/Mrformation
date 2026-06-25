#!/usr/bin/env python3
"""
Backfill enrollments.client_id pour C3V (parité MR : ~93% des inscriptions ont
client_id ; obtenu sur MR via la ré-insertion d'apply_enrollments_fix). C3V
n'ayant PAS de mauvaise attribution, ses inscriptions n'ont pas été ré-insérées
→ client_id resté nul. Ce script le renseigne SANS rien supprimer :
  - INTRA (1 entreprise liée à la session) → client_id = cette entreprise.
  - INTER (>1)  → client_id = l'entreprise de l'apprenant (learners.client_id)
                   si elle figure parmi les entreprises de la session.
Non destructif (UPDATE seul, scopé sessions C3V). DRY-RUN par défaut, --apply.

  python3 scripts/import-loris/c3v_backfill_enrollment_client_id.py [--apply]
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

REPORT_PATH = Path(__file__).parent / "c3v_backfill_enrollment_client_id_report.json"


def patch_ids(table, ids, payload):
    for batch in [ids[i:i + 100] for i in range(0, len(ids), 100)]:
        url = f"{rec.SUPABASE_URL}/rest/v1/{table}?id=in.(" + ",".join(batch) + ")"
        req = urllib.request.Request(
            url, data=json.dumps(payload).encode(),
            headers={"apikey": rec.SERVICE_ROLE, "Authorization": f"Bearer {rec.SERVICE_ROLE}",
                     "Content-Type": "application/json", "Prefer": "return=minimal"}, method="PATCH")
        urllib.request.urlopen(req).read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    print(f"Backfill enrollments.client_id — C3V — {'APPLY (écriture)' if args.apply else 'DRY-RUN'}\n")

    sessions = rec.rest_get_all("sessions", select="id", entity_id=f"eq.{rec.C3V_ENTITY_ID}")
    sids = {s["id"] for s in sessions}
    fc = rec.rest_get_all("formation_companies", select="session_id,client_id")
    comp_by_session = defaultdict(set)
    for x in fc:
        if x["session_id"] in sids and x.get("client_id"):
            comp_by_session[x["session_id"]].add(x["client_id"])
    learners = rec.rest_get_all("learners", select="id,client_id", entity_id=f"eq.{rec.C3V_ENTITY_ID}")
    learner_client = {l["id"]: l.get("client_id") for l in learners}
    enr = rec.rest_get_all("enrollments", select="id,session_id,learner_id,client_id")

    by_client = defaultdict(list)   # client_id -> [enrollment_id]
    stats = {"intra": 0, "inter_via_apprenant": 0, "inter_ambigu": 0, "session_sans_entreprise": 0, "deja_renseigne": 0}
    for e in enr:
        if e["session_id"] not in sids:
            continue
        if e.get("client_id"):
            stats["deja_renseigne"] += 1
            continue
        comps = comp_by_session.get(e["session_id"], set())
        if len(comps) == 1:
            by_client[next(iter(comps))].append(e["id"])
            stats["intra"] += 1
        elif len(comps) > 1:
            lc = learner_client.get(e["learner_id"])
            if lc and lc in comps:
                by_client[lc].append(e["id"])
                stats["inter_via_apprenant"] += 1
            else:
                stats["inter_ambigu"] += 1
        else:
            stats["session_sans_entreprise"] += 1

    total = sum(len(v) for v in by_client.values())
    report = {"mode": "apply" if args.apply else "dry-run", "a_renseigner": total, "stats": stats,
              "distinct_clients": len(by_client)}
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    print(f"À renseigner : {total}  (INTRA={stats['intra']}, INTER via apprenant={stats['inter_via_apprenant']})")
    print(f"Non résolus  : INTER ambigu={stats['inter_ambigu']}, session sans entreprise={stats['session_sans_entreprise']}, déjà={stats['deja_renseigne']}")

    if not args.apply:
        print(f"\n[DRY-RUN] Aucune écriture. Rapport : {REPORT_PATH}")
        return

    print("\n>>> APPLICATION…")
    done = 0
    for client_id, ids in by_client.items():
        patch_ids("enrollments", ids, {"client_id": client_id})
        done += len(ids)
        print(f"  {done}/{total}", end="\r")
    print(f"\n✅ {done} inscriptions rattachées à leur entreprise. Rapport : {REPORT_PATH}")


if __name__ == "__main__":
    main()
