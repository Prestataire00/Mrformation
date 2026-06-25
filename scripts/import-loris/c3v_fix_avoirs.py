#!/usr/bin/env python3
"""
Flag les AVOIRS C3V : l'import (map_formation_invoice) ne posait jamais
`is_avoir`, donc les avoirs (Type='Avoir' côté Loris) ont été stockés comme
des factures à montant négatif, non flaggées → ils plombent le « total
facturé » de l'onglet Finances (qui filtre `!is_avoir`).

On pose `is_avoir=true` sur les factures dont le Type source = « Avoir »,
reconnaissables au champ `notes` ("Loris Avoir — …", écrit à l'import depuis
la colonne Type). Non destructif (UPDATE du seul flag, montant inchangé).
Idempotent. Scopé entité C3V. DRY-RUN par défaut, --apply pour écrire.

  python3 scripts/import-loris/c3v_fix_avoirs.py [--apply]
"""

import argparse
import importlib.util
import json
import urllib.request
from pathlib import Path

_spec = importlib.util.spec_from_file_location("rec", Path(__file__).parent / "c3v_reconcile.py")
rec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rec)

REPORT_PATH = Path(__file__).parent / "c3v_fix_avoirs_report.json"


def patch_ids(ids):
    for batch in [ids[i:i + 100] for i in range(0, len(ids), 100)]:
        url = f"{rec.SUPABASE_URL}/rest/v1/formation_invoices?id=in.(" + ",".join(batch) + ")"
        req = urllib.request.Request(
            url, data=json.dumps({"is_avoir": True}).encode(),
            headers={"apikey": rec.SERVICE_ROLE, "Authorization": f"Bearer {rec.SERVICE_ROLE}",
                     "Content-Type": "application/json", "Prefer": "return=minimal"}, method="PATCH")
        urllib.request.urlopen(req).read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    print(f"Fix avoirs C3V — {'APPLY (écriture)' if args.apply else 'DRY-RUN'}\n")

    inv = rec.rest_get_all("formation_invoices",
                           select="id,amount,is_avoir,notes,recipient_name",
                           entity_id=f"eq.{rec.C3V_ENTITY_ID}")
    # Type=Avoir → notes commence par "Loris Avoir"
    avoirs = [i for i in inv if (i.get("notes") or "").startswith("Loris Avoir")]
    a_flag = [i for i in avoirs if not i.get("is_avoir")]
    pos = [i for i in a_flag if float(i.get("amount") or 0) > 0]

    report = {
        "mode": "apply" if args.apply else "dry-run",
        "factures_total": len(inv),
        "type_avoir": len(avoirs),
        "a_flagger (is_avoir actuellement false)": len(a_flag),
        "deja_flaggees": len(avoirs) - len(a_flag),
        "avoirs_montant_positif (à vérifier)": len(pos),
        "somme_avoirs": round(sum(float(i.get("amount") or 0) for i in avoirs), 2),
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    print(f"Factures C3V : {len(inv)}")
    print(f"  Type=Avoir : {len(avoirs)}  (déjà flaggées={len(avoirs)-len(a_flag)})")
    print(f"  → à poser is_avoir=true : {len(a_flag)}")
    print(f"  somme des avoirs : {report['somme_avoirs']} € (négatif = crédits)")
    if pos:
        print(f"  ⚠️ {len(pos)} avoirs à montant POSITIF (inhabituel — à vérifier manuellement)")

    if not args.apply:
        print(f"\n[DRY-RUN] Aucune écriture. Rapport : {REPORT_PATH}")
        return

    print("\n>>> APPLICATION…")
    patch_ids([i["id"] for i in a_flag])
    print(f"✅ {len(a_flag)} avoirs flaggés. Rapport : {REPORT_PATH}")


if __name__ == "__main__":
    main()
