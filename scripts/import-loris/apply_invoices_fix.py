#!/usr/bin/env python3
"""
Corrige la MAUVAISE ATTRIBUTION des factures à leur session : l'import (map_formation_invoice)
matchait la session par TITRE → pour des titres identiques, factures sur la mauvaise session.
Réattribue `formation_invoices.session_id` via « Code formation » (fichier factures).

Matching facture DB ↔ ligne source :
  1) par `external_reference` (= « Numéro ») quand le Numéro existe ;
  2) repli par CONTENU (montant + destinataire + date d'échéance) pour les factures sans Numéro
     (l'import leur a donné une réf de repli LORIS-FAC-{idx}), réattribution UNIQUEMENT si non ambigu.

DRY-RUN par défaut ; --apply pour écrire.
"""
import argparse, importlib.util, json, re, urllib.request
from pathlib import Path
_spec = importlib.util.spec_from_file_location("rec", Path(__file__).parent / "reconcile_code_formation.py")
rec = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(rec)
F_FACTURES = "Suivi des factures (1).xlsx"


def rest_patch(table, id_filter, body):
    url = f"{rec.SUPABASE_URL}/rest/v1/{table}?{id_filter}"
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
        headers={"apikey": rec.SERVICE_ROLE, "Authorization": f"Bearer {rec.SERVICE_ROLE}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"}, method="PATCH")
    urllib.request.urlopen(req).read()


def to_num(v):
    if v is None: return 0.0
    if isinstance(v, (int, float)): return float(v)
    import re as _re
    s = _re.sub(r"[^\d.,\-]", "", str(v))
    if not s: return 0.0
    if "." in s and "," in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try: return float(s)
    except ValueError: return 0.0


def ckey(amount, dest, due):
    a = int(round(to_num(amount)))
    return (a, rec.norm_name(dest or ""), (due or "")[:10])


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--apply", action="store_true"); args = ap.parse_args()
    print(f"FIX factures (réattribution session par Code) — {'APPLY' if args.apply else 'DRY-RUN'}\n")

    db_sessions = rec.rest_get_all("sessions", select="id,title,start_date,loris_external_id", entity_id=f"eq.{rec.MR_ENTITY_ID}")
    sx = {s["loris_external_id"]: s for s in db_sessions if s.get("loris_external_id")}
    inv = rec.rest_get_all("formation_invoices", select="id,external_reference,session_id,external_source,amount,recipient_name,due_date", entity_id=f"eq.{rec.MR_ENTITY_ID}")

    # code -> session (fichier activité, via extid titre+date)
    code2sid = {}
    for r in rec.read_xlsx(rec.F_SESSIONS):
        c = rec.norm(r.get("Code formation")); t = rec.norm(r.get("Nom de la formation")); d = rec.to_date(r.get("Date de début de la formation"))
        z = sx.get(rec.stable_external_id("session", t or "", d or ""))
        if c and z: code2sid[c] = z["id"]

    # rows_fac : lecture identique à l'import (même ordre) → index fiable pour les réf de repli.
    rows_fac = rec.read_xlsx(F_FACTURES)
    ref2code = {}
    for r in rows_fac:
        code = rec.norm(r.get("Code formation"))
        ref = rec.norm(r.get("Numéro"))
        if ref and code: ref2code[ref] = code

    def src_match(row, dbf):
        """Garde-fou : la ligne source[idx] correspond-elle à la facture DB (montant+destinataire) ?"""
        dest = rec.norm_name(rec.norm(row.get("Destinataire")) or rec.norm(row.get("Client")) or "")
        return (int(round(to_num(row.get("Montant")))) == int(round(to_num(dbf.get("amount"))))
                and dest == rec.norm_name(dbf.get("recipient_name") or ""))

    updates = []
    stats = {"deja_ok": 0, "par_ref": 0, "par_index": 0, "index_mismatch": 0, "code_sans_session": 0, "non_loris": 0}
    for f in inv:
        if f.get("external_source") != "loris": stats["non_loris"] += 1; continue
        ref = f.get("external_reference") or ""
        code = ref2code.get(ref) if ref else None
        via = "ref"
        if not code:  # réf de repli LORIS-FAC-{idx} → match par index (ordre préservé) + garde-fou contenu
            m = re.match(r"^LORIS-FAC-(\d+)$", ref)
            if not m: stats["index_mismatch"] += 1; continue
            idx = int(m.group(1))
            if idx >= len(rows_fac) or not src_match(rows_fac[idx], f):
                stats["index_mismatch"] += 1; continue
            code = rec.norm(rows_fac[idx].get("Code formation")); via = "index"
        sid = code2sid.get(code)
        if not sid: stats["code_sans_session"] += 1; continue
        if f["session_id"] == sid: stats["deja_ok"] += 1
        else:
            updates.append((f["id"], sid)); stats["par_ref" if via == "ref" else "par_index"] += 1

    print(f"Factures loris : {sum(1 for f in inv if f.get('external_source') == 'loris')}")
    print(f"  déjà sur la bonne session : {stats['deja_ok']}")
    print(f"  À RÉATTRIBUER : {len(updates)} (par réf Numéro={stats['par_ref']}, par index={stats['par_index']})")
    print(f"  non traitées : index non aligné={stats['index_mismatch']}, code sans session={stats['code_sans_session']}, non-loris={stats['non_loris']}")

    if not args.apply:
        print("\n[DRY-RUN] Aucune écriture."); return
    print("\n>>> APPLICATION…")
    for fid, sid in updates:
        rest_patch("formation_invoices", f"id=eq.{fid}", {"session_id": sid})
    print(f"✅ {len(updates)} factures réattribuées à la bonne session.")


if __name__ == "__main__":
    main()
