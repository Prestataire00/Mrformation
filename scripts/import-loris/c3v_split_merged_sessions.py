#!/usr/bin/env python3
"""
Répare les sessions C3V FUSIONNÉES par la dédup de l'import.

Bug : `map_session` déduplique par `stable_external_id("session", titre, début)`
→ le Code formation n'entre PAS dans la clé → 2 sessions de même titre+début
mais Code différent ont été fusionnées en une seule, avec formateurs/apprenants/
clients/factures des deux collés dessus.

Réparation (NON DESTRUCTIVE) par groupe fusionné :
  - on garde la session existante pour le 1ᵉ code (ordre fichier) ;
  - on CRÉE la session manquante pour chaque code suivant ;
  - on DÉPLACE vers elle les données qui lui appartiennent, discriminées par le
    Code formation dans les fichiers source :
      factures  → par Numéro (external_reference) — clé unique, fiable ;
      inscript. → par nom d'apprenant EXCLUSIF au code ;
      formateurs→ par nom EXCLUSIF au code ;
      entreprises→ par nom EXCLUSIF au code ;
  - on GÉNÈRE le planning (créneaux) de la nouvelle session.
Aucune suppression. Scopé C3V. Idempotent (skip si la session du code existe déjà).

DRY-RUN par défaut, --apply pour écrire.
  python3 scripts/import-loris/c3v_split_merged_sessions.py [--apply]
"""

import argparse
import importlib.util
import json
import sys
import urllib.request
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
_spec = importlib.util.spec_from_file_location("rec", HERE / "c3v_reconcile.py")
rec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rec)
from tz_paris import paris_wallclock_to_utc_iso  # noqa: E402

REPORT_PATH = HERE / "c3v_split_merged_sessions_report.json"
F_FORMATEURS = "Suivi_de_l_activite__des_formateurs.xlsx"
F_FACTURES = "suivi_des_factures.xlsx"


# ── Planning (copié de apply_creneaux) ─────────────────────────────────────
def easter(y):
    a = y % 19; b = y // 100; c = y % 100
    d = (19*a + b - b//4 - ((b - (b+8)//25 + 1)//3) + 15) % 30
    e = (32 + 2*(b % 4) + 2*(c//4) - d - (c % 4)) % 7
    f = d + e - 7*((a + 11*d + 22*e)//451) + 114
    return date(y, f//31, f % 31 + 1)


def holidays_for(y):
    e = easter(y); h = {date(y, m, d) for m, d in [(1,1),(5,1),(5,8),(7,14),(8,15),(11,1),(11,11),(12,25)]}
    h |= {e+timedelta(days=1), e+timedelta(days=39), e+timedelta(days=50)}
    return h


_HC = {}
def is_wd(d):
    if d.weekday() >= 5: return False
    if d.year not in _HC: _HC[d.year] = holidays_for(d.year)
    return d not in _HC[d.year]


def working_days(s, e):
    out = []; cur = s
    while cur <= e:
        if is_wd(cur): out.append(cur)
        cur += timedelta(days=1)
    return out


def parse_hours(v):
    s = rec.norm(v)
    if not s: return None
    p = s.split(":")
    try: return int(p[0]) + (int(p[1]) if len(p) > 1 else 0)/60.0
    except (ValueError, IndexError): return None


def parse_date(s):
    s = (s or "")[:10]
    try: y, m, d = s.split("-"); return date(int(y), int(m), int(d))
    except ValueError: return None


def build_slots(session_id, start_d, hours):
    slots = []; remaining = hours; order = 0; cur = start_d
    while not is_wd(cur): cur += timedelta(days=1)
    guard = 0
    while remaining > 0.01 and guard < 400:
        guard += 1
        if not is_wd(cur): cur += timedelta(days=1); continue
        ds = cur.isoformat()
        morn = min(3.0, remaining); eh = int(9+morn); em = int(round((9+morn-eh)*60))
        slots.append({"session_id": session_id, "title": "Matin",
                      "start_time": paris_wallclock_to_utc_iso(ds, "09:00"),
                      "end_time": paris_wallclock_to_utc_iso(ds, f"{eh:02d}:{em:02d}"), "slot_order": order})
        order += 1; remaining -= morn
        if remaining > 0.01:
            aft = min(4.0, remaining); eh = int(13+aft); em = int(round((13+aft-eh)*60))
            slots.append({"session_id": session_id, "title": "Après-midi",
                          "start_time": paris_wallclock_to_utc_iso(ds, "13:00"),
                          "end_time": paris_wallclock_to_utc_iso(ds, f"{eh:02d}:{em:02d}"), "slot_order": order})
            order += 1; remaining -= aft
        cur += timedelta(days=1)
    return slots


# ── REST ────────────────────────────────────────────────────────────────────
def post(table, rows, repr_=False):
    req = urllib.request.Request(f"{rec.SUPABASE_URL}/rest/v1/{table}", data=json.dumps(rows).encode(),
        headers={"apikey": rec.SERVICE_ROLE, "Authorization": f"Bearer {rec.SERVICE_ROLE}",
                 "Content-Type": "application/json",
                 "Prefer": "return=representation" if repr_ else "return=minimal"}, method="POST")
    with urllib.request.urlopen(req) as r:
        raw = r.read(); return json.loads(raw) if (repr_ and raw) else None


def patch_ids(table, ids, body):
    for b in [ids[i:i+100] for i in range(0, len(ids), 100)]:
        url = f"{rec.SUPABASE_URL}/rest/v1/{table}?id=in.(" + ",".join(b) + ")"
        req = urllib.request.Request(url, data=json.dumps(body).encode(),
            headers={"apikey": rec.SERVICE_ROLE, "Authorization": f"Bearer {rec.SERVICE_ROLE}",
                     "Content-Type": "application/json", "Prefer": "return=minimal"}, method="PATCH")
        urllib.request.urlopen(req).read()


def nk(s):  # name key insensible à l'ordre
    return " ".join(sorted(rec.norm_name(s).split()))


def to_decimal(v):
    import re
    s = rec.norm(v)
    if not s: return None
    s = re.sub(r"[^\d.,\-]", "", s)
    if not s: return None
    if "." in s and "," in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try: return round(float(s), 2)
    except ValueError: return None


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    print(f"Split sessions fusionnées C3V — {'APPLY (écriture)' if args.apply else 'DRY-RUN'}\n")

    # ── Source : par code ──
    rows_sess = rec.read_xlsx(rec.F_SESSIONS)
    code_row = {}                      # code -> source row
    group_codes = defaultdict(list)    # (title_norm, start) -> [codes en ordre fichier]
    for r in rows_sess:
        code = rec.norm(r.get("Code formation"))
        title = rec.norm(r.get("Nom de la formation"))
        start = rec.to_date(r.get("Date de début de la formation"))
        if not code or not title: continue
        code_row[code] = r
        group_codes[(rec.norm_name(title), start)].append(code)

    def per_code(filename, code_col, val_col, keyfn):
        m = defaultdict(set)
        for r in rec.read_xlsx(filename):
            c = rec.norm(r.get(code_col)); v = rec.norm(r.get(val_col))
            if c and v: m[c].add(keyfn(v))
        return m
    names_by_code = per_code(rec.F_STAGIAIRES, "Code formation", "Nom", nk)
    trainers_by_code = per_code(F_FORMATEURS, "Code formation", "Formateur", nk)
    ents_by_code = per_code(rec.F_CLIENTS, "Code formation", "Entreprise/Client", rec.norm_name)
    nums_by_code = per_code(F_FACTURES, "Code formation", "Numéro", lambda s: s)

    # ── DB lookups ──
    db_sessions = rec.rest_get_all("sessions", select="id,title,start_date,training_id,loris_external_id",
                                   entity_id=f"eq.{rec.C3V_ENTITY_ID}")
    sess_by_extid = {s["loris_external_id"]: s for s in db_sessions if s.get("loris_external_id")}
    learners = {l["id"]: nk(f"{l.get('last_name') or ''} {l.get('first_name') or ''}")
                for l in rec.rest_get_all("learners", select="id,first_name,last_name", entity_id=f"eq.{rec.C3V_ENTITY_ID}")}
    trainers = {t["id"]: nk(f"{t.get('last_name') or ''} {t.get('first_name') or ''}")
                for t in rec.rest_get_all("trainers", select="id,first_name,last_name", entity_id=f"eq.{rec.C3V_ENTITY_ID}")}
    clients = {c["id"]: rec.norm_name(c.get("company_name")) for c in rec.rest_get_all("clients", select="id,company_name", entity_id=f"eq.{rec.C3V_ENTITY_ID}")}

    merged = {k: v for k, v in group_codes.items() if len(v) > 1}
    plan = []
    for (tnorm, start), codes in merged.items():
        code_a = codes[0]
        ra = code_row[code_a]; title = rec.norm(ra.get("Nom de la formation"))
        extid_a = rec.stable_external_id("session", title or "", start or "")
        sess_a = sess_by_extid.get(extid_a)
        if not sess_a:
            plan.append({"groupe": f"{title} {start}", "erreur": "session existante introuvable"}); continue
        for code_b in codes[1:]:
            rb = code_row[code_b]
            new_extid = rec.stable_external_id("session", title or "", start or "", code_b)
            if new_extid in sess_by_extid:
                plan.append({"groupe": f"{title} {start}", "code_b": code_b, "skip": "déjà splitté"}); continue
            # données du code_b (exclusives, sauf factures = par numéro unique)
            names_b = names_by_code.get(code_b, set()) - names_by_code.get(code_a, set())
            trn_b = trainers_by_code.get(code_b, set()) - trainers_by_code.get(code_a, set())
            ent_b = ents_by_code.get(code_b, set()) - ents_by_code.get(code_a, set())
            nums_b = nums_by_code.get(code_b, set())
            # DB rows actuellement sur sess_a
            enr = rec.rest_get_all("enrollments", select="id,learner_id,client_id", session_id=f"eq.{sess_a['id']}")
            ft = rec.rest_get_all("formation_trainers", select="id,trainer_id", session_id=f"eq.{sess_a['id']}")
            inv = rec.rest_get_all("formation_invoices", select="id,external_reference", session_id=f"eq.{sess_a['id']}")
            fc = rec.rest_get_all("formation_companies", select="id,client_id", session_id=f"eq.{sess_a['id']}")
            mv_enr = [e["id"] for e in enr if learners.get(e["learner_id"]) in names_b]
            mv_ft = [x["id"] for x in ft if trainers.get(x["trainer_id"]) in trn_b]
            mv_inv = [i["id"] for i in inv if i.get("external_reference") in nums_b]
            mv_fc = [x["id"] for x in fc if clients.get(x["client_id"]) in ent_b]
            hours = parse_hours(rb.get("Heures prévues"))
            sd = parse_date(rec.to_date(rb.get("Date de début de la formation")))
            ed = parse_date(rec.to_date(rb.get("Date de fin de la formation")))
            if not hours or hours <= 0:
                hours = max(1, len(working_days(sd, ed) if (ed and ed >= sd) else [sd])) * 7.0 if sd else 7.0
            item = {"groupe": f"{title} {start}", "code_a": code_a, "code_b": code_b,
                    "session_a": sess_a["id"], "new_extid": new_extid,
                    "mv_inscriptions": len(mv_enr), "mv_formateurs": len(mv_ft),
                    "mv_factures": len(mv_inv), "mv_entreprises": len(mv_fc),
                    "creneaux": "?", "_apply": {"rb": None}}
            plan.append(item)
            if not args.apply:
                slots_preview = build_slots("preview", sd, hours) if sd else []
                item["creneaux"] = len(slots_preview)
                continue
            # ── APPLY ──
            new_sess = post("sessions", [{
                "entity_id": rec.C3V_ENTITY_ID, "training_id": sess_a.get("training_id"),
                "title": title, "start_date": rec.to_date(rb.get("Date de début de la formation")),
                "end_date": rec.to_date(rb.get("Date de fin de la formation")),
                "status": "completed" if (rec.norm(rb.get("Statut")) or "").lower().startswith(("termin","achev")) else "planned",
                "location": rec.norm(rb.get("Emplacement")),
                "price": to_decimal(rb.get("Montant HT")),
                "total_price": to_decimal(rb.get("Montant HT")),
                "loris_external_id": new_extid,
                "loris_metadata": {"split_from": sess_a["id"], "loris_code": code_b},
            }], repr_=True)
            bid = new_sess[0]["id"]
            if mv_enr: patch_ids("enrollments", mv_enr, {"session_id": bid})
            if mv_ft: patch_ids("formation_trainers", mv_ft, {"session_id": bid})
            if mv_inv: patch_ids("formation_invoices", mv_inv, {"session_id": bid})
            if mv_fc: patch_ids("formation_companies", mv_fc, {"session_id": bid})
            slots = build_slots(bid, sd, hours) if sd else []
            for b in [slots[i:i+200] for i in range(0, len(slots), 200)]:
                post("formation_time_slots", b)
            item["creneaux"] = len(slots); item["new_session"] = bid
            item.pop("_apply", None)

    for p in plan: p.pop("_apply", None)
    REPORT_PATH.write_text(json.dumps(plan, ensure_ascii=False, indent=2))
    print(f"Groupes fusionnés : {len(merged)} | sessions à créer : {sum(1 for p in plan if p.get('code_b') and not p.get('skip'))}\n")
    for p in plan:
        if p.get("skip"): print(f"  ⏭️  {p['groupe']} code {p['code_b']} : {p['skip']}"); continue
        if p.get("erreur"): print(f"  ❌ {p['groupe']} : {p['erreur']}"); continue
        print(f"  ▸ {p['groupe'][:42]:42} code {p['code_a']}→garde | code {p['code_b']}→NOUVELLE : "
              f"+{p['mv_inscriptions']} inscr, +{p['mv_factures']} fact, +{p['mv_formateurs']} form, "
              f"+{p['mv_entreprises']} ent, {p['creneaux']} créneaux")
    print(f"\n{'✅ APPLIQUÉ' if args.apply else '[DRY-RUN] aucune écriture'}. Rapport : {REPORT_PATH}")


if __name__ == "__main__":
    main()
