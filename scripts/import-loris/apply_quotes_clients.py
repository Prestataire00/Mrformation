#!/usr/bin/env python3
"""
Rattache les DEVIS orphelins (ni client_id ni prospect_id) à un client, via le destinataire
conservé dans loris_metadata.loris_destinataire → clients.company_name (fiche canonique si doublons).
Idempotent (ne touche que les orphelins). DRY-RUN par défaut ; --apply pour écrire.
"""
import argparse, importlib.util, json, urllib.request
from collections import defaultdict
from pathlib import Path
_spec=importlib.util.spec_from_file_location("rec",Path(__file__).parent/"reconcile_code_formation.py")
rec=importlib.util.module_from_spec(_spec); _spec.loader.exec_module(rec)

def patch(fid, body):
    req=urllib.request.Request(f"{rec.SUPABASE_URL}/rest/v1/crm_quotes?id=eq.{fid}", data=json.dumps(body).encode(),
        headers={"apikey":rec.SERVICE_ROLE,"Authorization":f"Bearer {rec.SERVICE_ROLE}","Content-Type":"application/json","Prefer":"return=minimal"}, method="PATCH")
    urllib.request.urlopen(req).read()

def dest_of(meta):
    if isinstance(meta, dict): return meta.get("loris_destinataire")
    return None

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--apply",action="store_true"); args=ap.parse_args()
    print(f"DEVIS → client (par destinataire) — {'APPLY' if args.apply else 'DRY-RUN'}\n")
    clients=rec.rest_get_all("clients", select="id,company_name", entity_id=f"eq.{rec.MR_ENTITY_ID}")
    cby=defaultdict(list)
    for c in clients: cby[rec.norm_name(c["company_name"])].append(c["id"])
    Q=rec.rest_get_all("crm_quotes", select="id,client_id,prospect_id,loris_metadata", entity_id=f"eq.{rec.MR_ENTITY_ID}")
    orph=[q for q in Q if not q.get("client_id") and not q.get("prospect_id")]
    updates=[]; stats={"sans_destinataire":0,"client_introuvable":0}; unmatched=defaultdict(int)
    for q in orph:
        d=dest_of(q.get("loris_metadata"))
        if not d: stats["sans_destinataire"]+=1; continue
        cids=cby.get(rec.norm_name(d))
        if not cids: stats["client_introuvable"]+=1; unmatched[d]+=1; continue
        updates.append((q["id"], sorted(cids)[0]))
    print(f"Devis orphelins (ni client ni prospect) : {len(orph)}")
    print(f"  → rattachables à un client : {len(updates)}")
    print(f"  non rattachables : sans destinataire={stats['sans_destinataire']}, client introuvable={stats['client_introuvable']}")
    if unmatched: print("  destinataires sans client (échantillon):", list(unmatched)[:8])
    if not args.apply: print("\n[DRY-RUN] Aucune écriture."); return
    print("\n>>> APPLICATION…")
    for qid,cid in updates: patch(qid, {"client_id": cid})
    print(f"✅ {len(updates)} devis rattachés à leur client.")

if __name__=="__main__": main()
