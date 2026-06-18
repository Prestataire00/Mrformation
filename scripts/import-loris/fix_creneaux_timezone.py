"""Corrige le fuseau horaire des créneaux importés (formation_time_slots).

Bug : apply_creneaux.py écrivait l'heure murale Paris avec un suffixe Z (« 09:00:00Z »),
donc 09:00 UTC au lieu de 09:00 Paris → affichage décalé de +1h (hiver) / +2h (été).

Cible (signature exacte de l'importeur, sans risque pour les créneaux créés dans l'app) :
  title ∈ {Matin, Après-midi}  ET  heure UTC de début ∈ {09, 13}
Un 09:00 Paris correctement stocké est 07:00/08:00 UTC — jamais 09:00 UTC. La correction
est donc idempotente : une fois corrigé (07/08/11/12h UTC), un créneau ne re-matche plus.

DRY-RUN par défaut. `--apply` pour écrire.
  python3 scripts/import-loris/fix_creneaux_timezone.py
  python3 scripts/import-loris/fix_creneaux_timezone.py --apply
"""
import argparse
import importlib.util
import json
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

UTC = ZoneInfo("UTC")

_spec = importlib.util.spec_from_file_location("rec", Path(__file__).parent / "reconcile_code_formation.py")
rec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rec)

from tz_paris import correct_utc_z_to_paris

TITLES = {"Matin", "Après-midi"}
BAD_UTC_HOURS = {9, 13}


def utc_hour(iso: str) -> int:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(UTC).hour


def rest_patch(slot_id: str, body: dict):
    url = f"{rec.SUPABASE_URL}/rest/v1/formation_time_slots?id=eq.{slot_id}"
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(),
        headers={"apikey": rec.SERVICE_ROLE, "Authorization": f"Bearer {rec.SERVICE_ROLE}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
        method="PATCH",
    )
    with urllib.request.urlopen(req) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    slots = rec.rest_get_all(
        "formation_time_slots",
        select="id,title,start_time,end_time",
    )

    targets = []
    for s in slots:
        if s.get("title") in TITLES and utc_hour(s["start_time"]) in BAD_UTC_HOURS:
            targets.append(s)

    print(f"{len(slots)} créneaux au total — {len(targets)} à corriger "
          f"(title ∈ {TITLES}, heure UTC début ∈ {BAD_UTC_HOURS})\n")

    for s in targets[:8]:
        ns, ne = correct_utc_z_to_paris(s["start_time"]), correct_utc_z_to_paris(s["end_time"])
        print(f"  {s['title']:<11} {s['start_time']} → {ns}")
        print(f"  {'':<11} {s['end_time']} → {ne}")
    if len(targets) > 8:
        print(f"  … (+{len(targets) - 8} autres)")

    if not args.apply:
        print(f"\n[DRY-RUN] {len(targets)} créneaux seraient corrigés. Relancer avec --apply.")
        return

    done = 0
    for s in targets:
        body = {
            "start_time": correct_utc_z_to_paris(s["start_time"]),
            "end_time": correct_utc_z_to_paris(s["end_time"]),
        }
        rest_patch(s["id"], body)
        done += 1
        if done % 100 == 0:
            print(f"  … {done}/{len(targets)}")
    print(f"\n✅ {done} créneaux corrigés.")


if __name__ == "__main__":
    main()
