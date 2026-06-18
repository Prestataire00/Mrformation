#!/usr/bin/env python3
"""
LOT 2 — Synthèse des créneaux (formation_time_slots) pour les sessions sans planning.

Principe :
  - Source heures : « Suivi de l'activité (1) » → colonne « Heures prévues » (HH:MM:SS) par Code formation.
  - Dates : sessions.start_date / end_date (déjà en base, NOT NULL).
  - Convention app (cf. resolve-variables.ts) : Matin 09:00-12:00 (3h) + Après-midi 13:00-17:00 (4h) = 7h/jour,
    stockée en 'YYYY-MM-DDT09:00:00Z'. Jours ouvrés uniquement (week-ends + fériés FR exclus).
  - On répartit les heures prévues en demi-journées depuis start_date. Si « Heures prévues » absente,
    on estime depuis le nombre de jours ouvrés de la plage [start_date, end_date].
  - Idempotent : on SAUTE toute session ayant déjà ≥1 créneau. Le trigger trg_recompute_planned_hours
    recalcule planned_hours depuis les créneaux insérés.

DRY-RUN par défaut. `--apply` pour écrire.

Usage :
  python3 scripts/import-loris/apply_creneaux.py            # dry-run
  python3 scripts/import-loris/apply_creneaux.py --apply
"""

import argparse
import importlib.util
import json
import math
import urllib.request
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

_spec = importlib.util.spec_from_file_location("rec", Path(__file__).parent / "reconcile_code_formation.py")
rec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rec)

from tz_paris import paris_wallclock_to_utc_iso  # heure murale Paris → instant UTC (DST géré)

REPORT_PATH = Path(__file__).parent / "apply_creneaux_report.json"


# ── Fériés FR (fixes + mobiles via Pâques) ─────────────────────────────────
def easter(year):
    a = year % 19
    b = year // 100
    c = year % 100
    d = (19 * a + b - b // 4 - ((b - (b + 8) // 25 + 1) // 3) + 15) % 30
    e = (32 + 2 * (b % 4) + 2 * (c // 4) - d - (c % 4)) % 7
    f = d + e - 7 * ((a + 11 * d + 22 * e) // 451) + 114
    month = f // 31
    day = f % 31 + 1
    return date(year, month, day)


def holidays_for(year):
    e = easter(year)
    fixed = [(1, 1), (5, 1), (5, 8), (7, 14), (8, 15), (11, 1), (11, 11), (12, 25)]
    h = {date(year, m, d) for m, d in fixed}
    h.add(e + timedelta(days=1))    # lundi de Pâques
    h.add(e + timedelta(days=39))   # Ascension
    h.add(e + timedelta(days=50))   # lundi de Pentecôte
    return h


_HOLIDAY_CACHE = {}


def is_working_day(d):
    if d.weekday() >= 5:  # samedi=5, dimanche=6
        return False
    if d.year not in _HOLIDAY_CACHE:
        _HOLIDAY_CACHE[d.year] = holidays_for(d.year)
    return d not in _HOLIDAY_CACHE[d.year]


def working_days(start, end):
    """Liste des jours ouvrés de start à end (inclus)."""
    out = []
    cur = start
    while cur <= end:
        if is_working_day(cur):
            out.append(cur)
        cur += timedelta(days=1)
    return out


def parse_hours(v):
    """« 07:00:00 » → 7.0 ; « 14:30:00 » → 14.5. None si vide/invalide."""
    s = rec.norm(v)
    if not s:
        return None
    parts = s.split(":")
    try:
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        return h + m / 60.0
    except (ValueError, IndexError):
        return None


def parse_date(s):
    s = (s or "")[:10]
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except ValueError:
        return None


def build_slots(session_id, start_d, hours):
    """Répartit `hours` en demi-journées (Matin 3h, Après-midi 4h) sur jours ouvrés
    consécutifs depuis start_d. Retourne (slots, last_day)."""
    slots = []
    remaining = hours
    order = 0
    cur = start_d
    # avance jusqu'au premier jour ouvré
    while not is_working_day(cur):
        cur += timedelta(days=1)
    last_day = cur
    guard = 0
    while remaining > 0.01 and guard < 400:
        guard += 1
        if not is_working_day(cur):
            cur += timedelta(days=1)
            continue
        last_day = cur
        ds = cur.isoformat()
        # Matin : jusqu'à 3h
        morn = min(3.0, remaining)
        end_h = 9 + morn
        eh = int(end_h)
        em = int(round((end_h - eh) * 60))
        slots.append({
            "session_id": session_id, "title": "Matin",
            "start_time": paris_wallclock_to_utc_iso(ds, "09:00"),
            "end_time": paris_wallclock_to_utc_iso(ds, f"{eh:02d}:{em:02d}"),
            "slot_order": order,
        })
        order += 1
        remaining -= morn
        # Après-midi : jusqu'à 4h
        if remaining > 0.01:
            aft = min(4.0, remaining)
            end_h = 13 + aft
            eh = int(end_h)
            em = int(round((end_h - eh) * 60))
            slots.append({
                "session_id": session_id, "title": "Après-midi",
                "start_time": paris_wallclock_to_utc_iso(ds, "13:00"),
                "end_time": paris_wallclock_to_utc_iso(ds, f"{eh:02d}:{em:02d}"),
                "slot_order": order,
            })
            order += 1
            remaining -= aft
        cur += timedelta(days=1)
    return slots, last_day


def rest_post(table, rows):
    url = f"{rec.SUPABASE_URL}/rest/v1/{table}"
    req = urllib.request.Request(
        url, data=json.dumps(rows).encode(),
        headers={"apikey": rec.SERVICE_ROLE, "Authorization": f"Bearer {rec.SERVICE_ROLE}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    print(f"LOT 2 créneaux — {'APPLY (écriture)' if args.apply else 'DRY-RUN'} — MR FORMATION\n")

    db_sessions = rec.rest_get_all("sessions", select="id,title,start_date,end_date,loris_external_id",
                                   entity_id=f"eq.{rec.MR_ENTITY_ID}")
    sess_by_extid = {s["loris_external_id"]: s for s in db_sessions if s.get("loris_external_id")}

    # sessions ayant déjà des créneaux (idempotence)
    existing = rec.rest_get_all("formation_time_slots", select="session_id")
    has_slots = {x["session_id"] for x in existing}

    rows_sessions = rec.read_xlsx(rec.F_SESSIONS)

    plan = []        # (session_id, title, n_slots, hours, derived, end_day, end_date_db)
    skip_existing = skip_unmatched = skip_no_dates = 0
    all_slots = []
    for r in rows_sessions:
        code = rec.norm(r.get("Code formation"))
        title = rec.norm(r.get("Nom de la formation"))
        start = rec.to_date(r.get("Date de début de la formation"))
        s = sess_by_extid.get(rec.stable_external_id("session", title or "", start or ""))
        if not s:
            skip_unmatched += 1
            continue
        if s["id"] in has_slots:
            skip_existing += 1
            continue
        sd = parse_date(s.get("start_date"))
        ed = parse_date(s.get("end_date"))
        if not sd:
            skip_no_dates += 1
            continue
        hours = parse_hours(r.get("Heures prévues"))
        derived = False
        if not hours or hours <= 0:
            # estimer depuis la plage de dates
            wd = working_days(sd, ed) if ed and ed >= sd else [sd]
            hours = max(1, len(wd)) * 7.0
            derived = True
        slots, last_day = build_slots(s["id"], sd, hours)
        all_slots.extend(slots)
        plan.append({"session_id": s["id"], "title": title, "n_slots": len(slots),
                     "hours": round(hours, 2), "derived": derived,
                     "end_day_genere": last_day.isoformat(),
                     "end_date_db": ed.isoformat() if ed else None})

    derived_n = sum(1 for p in plan if p["derived"])
    overflow = sum(1 for p in plan if p["end_date_db"] and p["end_day_genere"] > p["end_date_db"])
    report = {
        "mode": "apply" if args.apply else "dry-run",
        "sessions_a_traiter": len(plan),
        "total_creneaux": len(all_slots),
        "heures_estimees_depuis_dates": derived_n,
        "skipped_deja_creneaux": skip_existing,
        "skipped_session_non_matchee": skip_unmatched,
        "skipped_sans_dates": skip_no_dates,
        "depassement_end_date": overflow,
        "plan": plan[:60],
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    print(f"Sessions à doter d'un planning : {len(plan)}")
    print(f"  → créneaux à créer            : {len(all_slots)}")
    print(f"  dont heures estimées (source vide) : {derived_n}")
    print(f"Sautées : déjà des créneaux={skip_existing}, session non matchée={skip_unmatched}, sans dates={skip_no_dates}")
    print(f"Créneaux dépassant end_date (planning estimé plus long) : {overflow}")

    if not args.apply:
        print(f"\n[DRY-RUN] Aucune écriture. Rapport : {REPORT_PATH}")
        print("Relance avec --apply pour écrire.")
        return

    print("\n>>> APPLICATION…")
    done = 0
    for batch in [all_slots[i:i + 200] for i in range(0, len(all_slots), 200)]:
        rest_post("formation_time_slots", batch)
        done += len(batch)
        print(f"  créneaux {done}/{len(all_slots)}", end="\r")
    print(f"\n✅ {done} créneaux insérés. Le trigger a recalculé planned_hours.")
    print(f"Rapport : {REPORT_PATH}")


if __name__ == "__main__":
    main()
