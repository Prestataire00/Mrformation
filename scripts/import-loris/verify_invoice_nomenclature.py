#!/usr/bin/env python3
"""Vérification read-only de la nomenclature des factures (FAC-YY-N).

Confirme, par année fiscale :
  - le max(N) des numéros Excel importés (external_reference « FAC-YY-N »),
  - l'absence de collision avec un global_number de facture prefix='FAC',
  - le prochain numéro qui sera attribué (= max(N Excel, global_number FAC) + 1).
Aucune écriture.
"""
import importlib.util, re, os
from collections import defaultdict

_spec = importlib.util.spec_from_file_location(
    "rec", os.path.join(os.path.dirname(__file__), "reconcile_code_formation.py")
)
rec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rec)

inv = rec.rest_get_all(
    "formation_invoices",
    select="prefix,global_number,fiscal_year,external_reference",
    entity_id=f"eq.{rec.MR_ENTITY_ID}",
)

max_excel = defaultdict(int)   # year -> max N Excel
max_fac = defaultdict(int)     # year -> max global_number prefix=FAC
excel_ns = defaultdict(set)    # year -> {N Excel}
fac_ns = defaultdict(set)      # year -> {global_number FAC}

for i in inv:
    year = i.get("fiscal_year")
    ext = i.get("external_reference") or ""
    m = re.match(r"^FAC-(\d{2})-(\d+)$", ext)
    if m and year is not None:
        n = int(m.group(2))
        max_excel[year] = max(max_excel[year], n)
        excel_ns[year].add(n)
    if i.get("prefix") == "FAC" and year is not None:
        gn = i.get("global_number") or 0
        max_fac[year] = max(max_fac[year], gn)
        fac_ns[year].add(gn)

years = sorted(set(max_excel) | set(max_fac))
print(f"{len(inv)} factures examinées (entité MR)\n")
collisions = 0
for y in years:
    inter = excel_ns[y] & fac_ns[y]
    nxt = max(max_excel[y], max_fac[y]) + 1
    yy = y % 100
    flag = "  ⚠ COLLISION" if inter else ""
    print(f"  {y}: max Excel={max_excel[y]} | max FAC app={max_fac[y]} "
          f"→ prochain = FAC-{yy:02d}-{nxt}{flag}")
    if inter:
        collisions += 1
        print(f"     numéros en conflit: {sorted(inter)}")

print(f"\n{'❌' if collisions else '✅'} {collisions} année(s) en collision")
