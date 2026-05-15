#!/usr/bin/env python3
"""
Import CRM Sellsy → Supabase (MR + C3V)
========================================

Lit 5 fichiers CSV exportés depuis Sellsy (placés dans ~/Downloads par défaut),
parse les données, et génère 4 fichiers SQL idempotents à exécuter dans
Supabase SQL Editor :

  00_reset_crm_data.sql         (destructif : DELETE crm_* pour MR + C3V)
  01_import_prospects.sql       (INSERT ON CONFLICT (sellsy_id, entity_id))
  02_import_comments.sql        (INSERT ON CONFLICT (sellsy_id, entity_id))
  03_import_tasks.sql           (INSERT ON CONFLICT (sellsy_external_ref, entity_id))

Hypothèses :
  - Migration `add_crm_sellsy_import_fields.sql` déjà appliquée.
  - Les UUIDs des entités MR/C3V sont récupérés via sous-requête SQL
    `(SELECT id FROM entities WHERE slug = 'mr-formation' LIMIT 1)` — le script
    ne hardcode aucun UUID.
  - Les `assigned_to` (UUIDs profile) sont récupérés via sous-requête sur le nom.
    Si le profile n'existe pas → assigned_to = NULL et le nom est préservé
    dans le champ `notes`.

Usage :
  python3 scripts/import-sellsy-crm.py
  python3 scripts/import-sellsy-crm.py --downloads /chemin/perso
"""

import argparse
import csv
import hashlib
import re
import sys
from pathlib import Path

# ── Configuration ──────────────────────────────────────────────────────────────

FILES = {
    "c3v_prospects": "C3V liste prospect.csv",
    "c3v_comments": "C3V commentaires.csv",
    "mr_prospects": "MR - PROSPECT À JOUR DU 12_11.csv",
    "mr_comments": "MR - COMMENTAIRES À JOUR DU 12_11.csv",
    "mr_tasks": "MR - TACHES À JOUR DU 12_11.csv",
}

ENCODINGS = {
    "c3v_prospects": "utf-8",
    "c3v_comments": "utf-8",
    "mr_prospects": "utf-8",
    "mr_comments": "utf-8",
    "mr_tasks": "latin-1",  # confirmé à l'analyse
}

ENTITY_SLUG = {
    "mr": "mr-formation",
    "c3v": "c3v-formation",
}

BATCH_SIZE = 200  # nb d'INSERT VALUES par statement (Postgres limite à 1664 args/stmt)
SPLIT_ROWS_PER_FILE = 400  # nb max de rows par fichier en mode --split (vise ~200KB/file)


# ── Helpers SQL ────────────────────────────────────────────────────────────────

def sql_str(s):
    """Escape une valeur en littéral SQL. NULL si vide ou 'N/C'."""
    if s is None:
        return "NULL"
    s = str(s).strip()
    if s == "" or s.upper() == "N/C":
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def parse_fr_date(s):
    """DD/MM/YYYY ou DD/MM/YYYY, HH:MM → 'YYYY-MM-DD' (str) ou None."""
    if not s:
        return None
    s = s.split(",")[0].strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if not m:
        return None
    d, mo, y = m.groups()
    return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"


def parse_fr_datetime(s):
    """DD/MM/YYYY, HH:MM → 'YYYY-MM-DD HH:MM:00' (str) ou None."""
    if not s:
        return None
    s = s.strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})(?:[, ]+(\d{1,2}):(\d{2}))?", s)
    if not m:
        return None
    d, mo, y, h, mi = m.groups()
    if h and mi:
        return f"{y}-{mo.zfill(2)}-{d.zfill(2)} {h.zfill(2)}:{mi}:00"
    return f"{y}-{mo.zfill(2)}-{d.zfill(2)} 00:00:00"


def owner_subquery(owner_raw):
    """Génère une sous-requête SQL qui retourne l'id profile correspondant
    au nom donné, ou NULL si introuvable. Tente d'abord le nom complet,
    fallback sur le nom seul (last_name uniquement)."""
    if not owner_raw or owner_raw.strip() == "":
        return "NULL"
    name = re.sub(r"\s*\(.*?\)", "", owner_raw).strip()
    return (
        "COALESCE("
        f"(SELECT id FROM profiles WHERE LOWER(first_name || ' ' || last_name) = LOWER({sql_str(name)}) LIMIT 1),"
        f"(SELECT id FROM profiles WHERE LOWER(last_name) = LOWER({sql_str(name.split()[-1])}) LIMIT 1)"
        ")"
    )


def entity_sub(entity_key):
    slug = ENTITY_SLUG[entity_key]
    return f"(SELECT id FROM entities WHERE slug = '{slug}' LIMIT 1)"


def task_hash(title, date_creation, id_objet_lie, entity_key):
    """Pour les tâches qui n'ont pas d'ID Sellsy : MD5 stable comme external_ref."""
    raw = f"{entity_key}|{title}|{date_creation}|{id_objet_lie}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


# ── Parse CSV ──────────────────────────────────────────────────────────────────

def read_csv(path, encoding):
    with open(path, encoding=encoding, newline="") as fh:
        return list(csv.DictReader(fh, delimiter=";"))


def map_prospect(row, entity_key):
    """Ligne CSV prospect → dict champs DB."""
    notes_parts = []
    owner_raw = row.get("Propriétaire", "").strip()
    if owner_raw:
        notes_parts.append(f"Propriétaire Sellsy : {owner_raw}")
    contact_raw = row.get("Contacts", "").strip()
    if contact_raw and contact_raw != row.get("Propriétaire", "").strip():
        notes_parts.append(f"Contact : {contact_raw}")
    return {
        "sellsy_id": row.get("id sellsy", "").strip(),
        "company_name": row.get("Nom", "").strip(),
        "siret": row.get("N° SIREN", "").strip() or None,  # SIRET corrompu, on stocke le SIREN
        "contact_name": row.get("Contacts", "").strip() or row.get("Propriétaire", "").strip(),
        "email": row.get("Email", "").strip() or None,
        "phone": row.get("Téléphone", "").strip() or row.get("Mobile", "").strip() or None,
        "address": row.get("ADRESSE PARTIE 1", "").strip() or None,
        "postal_code": row.get("CODE POSTAL", "").strip() or None,
        "city": row.get("VILLE", "").strip() or None,
        "country": row.get("CODE PAYS", "").strip() or None,
        "naf_code": row.get("APE/NAF", "").strip() or None,
        "created_at": parse_fr_datetime(row.get("Date de création", "")),
        "source": "sellsy_import",
        "owner_raw": owner_raw,
        "notes": "\n".join(notes_parts) if notes_parts else None,
        "entity_key": entity_key,
    }


def map_comment(row, entity_key):
    return {
        "sellsy_id": row.get("ID COMMENTAIRE SELLSY", "").strip(),
        "parent_sellsy_id": row.get("ID COMMENTAIRE PARENT", "").strip() or "0",
        "prospect_sellsy_id": row.get("ID CLIENT/PROSPECT/FOURNISSEUR", "").strip(),
        "author_email": row.get("EMAIL CLIENT/PROSPECT/FOURNISSEUR", "").strip() or None,
        "author_name": row.get("NOM CLIENT/PROSPECT/FOURNISSEUR", "").strip() or None,
        "comment_date": parse_fr_date(row.get("DATE", "")),
        "text": row.get("TEXTE", "").strip(),
        "entity_key": entity_key,
    }


def map_task(row, entity_key):
    title = row.get("TITRE", "").strip()
    date_creation = row.get("DATE DE CREATION", "").strip()
    id_objet_lie = row.get("ID OBJET LIE", "").strip()
    objet_lie_type = row.get("OBJET LIE", "").strip().upper()
    return {
        "external_ref": task_hash(title, date_creation, id_objet_lie, entity_key),
        "title": title or "(sans titre)",
        "status": "completed" if row.get("TERMINEE", "").strip().upper() == "OUI" else "pending",
        "label": row.get("LABEL", "").strip() or None,
        "due_date": parse_fr_date(row.get("DATE", "")),
        "created_at": parse_fr_datetime(date_creation),
        "description": row.get("DESCRIPTION", "").strip() or None,
        "creator_raw": row.get("CREATEUR", "").strip(),
        "prospect_sellsy_id": id_objet_lie if "PROSPECT" in objet_lie_type or objet_lie_type == "" else None,
        "entity_key": entity_key,
    }


# ── Génération SQL ─────────────────────────────────────────────────────────────

HEADER = """-- ============================================================
-- {title}
-- Généré le {date} par scripts/import-sellsy-crm.py
-- ============================================================
"""

def write_reset(out_dir):
    sql = HEADER.format(title="00 — Reset des données CRM existantes (MR + C3V)", date="2026-05-15")
    sql += """
-- ⚠️  DESTRUCTIF — supprime toutes les lignes CRM des entités MR + C3V.
-- Encapsulé dans une transaction : si une partie échoue, ROLLBACK automatique.
-- Ordre : enfants → parents (FK constraint).

BEGIN;

DELETE FROM crm_prospect_comments
 WHERE entity_id IN (
   (SELECT id FROM entities WHERE slug = 'mr-formation' LIMIT 1),
   (SELECT id FROM entities WHERE slug = 'c3v-formation' LIMIT 1)
 );

DELETE FROM crm_tasks
 WHERE entity_id IN (
   (SELECT id FROM entities WHERE slug = 'mr-formation' LIMIT 1),
   (SELECT id FROM entities WHERE slug = 'c3v-formation' LIMIT 1)
 );

DELETE FROM crm_quotes
 WHERE entity_id IN (
   (SELECT id FROM entities WHERE slug = 'mr-formation' LIMIT 1),
   (SELECT id FROM entities WHERE slug = 'c3v-formation' LIMIT 1)
 );

DELETE FROM crm_campaigns
 WHERE entity_id IN (
   (SELECT id FROM entities WHERE slug = 'mr-formation' LIMIT 1),
   (SELECT id FROM entities WHERE slug = 'c3v-formation' LIMIT 1)
 );

DELETE FROM crm_prospects
 WHERE entity_id IN (
   (SELECT id FROM entities WHERE slug = 'mr-formation' LIMIT 1),
   (SELECT id FROM entities WHERE slug = 'c3v-formation' LIMIT 1)
 );

-- Vérification avant COMMIT — doit retourner 0 partout :
SELECT
  (SELECT COUNT(*) FROM crm_prospects WHERE entity_id IN (
     (SELECT id FROM entities WHERE slug IN ('mr-formation','c3v-formation')))) AS prospects_restants,
  (SELECT COUNT(*) FROM crm_tasks WHERE entity_id IN (
     (SELECT id FROM entities WHERE slug IN ('mr-formation','c3v-formation')))) AS tasks_restants,
  (SELECT COUNT(*) FROM crm_quotes WHERE entity_id IN (
     (SELECT id FROM entities WHERE slug IN ('mr-formation','c3v-formation')))) AS quotes_restants,
  (SELECT COUNT(*) FROM crm_campaigns WHERE entity_id IN (
     (SELECT id FROM entities WHERE slug IN ('mr-formation','c3v-formation')))) AS campaigns_restants,
  (SELECT COUNT(*) FROM crm_prospect_comments WHERE entity_id IN (
     (SELECT id FROM entities WHERE slug IN ('mr-formation','c3v-formation')))) AS comments_restants;

COMMIT;
"""
    (out_dir / "00_reset_crm_data.sql").write_text(sql, encoding="utf-8")


def _prospect_row_sql(p):
    return (
        f"({sql_str(p['sellsy_id'])}, "
        f"{entity_sub(p['entity_key'])}, "
        f"{sql_str(p['company_name'])}, "
        f"{sql_str(p['siret'])}, "
        f"{sql_str(p['contact_name'])}, "
        f"{sql_str(p['email'])}, "
        f"{sql_str(p['phone'])}, "
        f"{sql_str(p['address'])}, "
        f"{sql_str(p['postal_code'])}, "
        f"{sql_str(p['city'])}, "
        f"{sql_str(p['country'])}, "
        f"{sql_str(p['naf_code'])}, "
        f"{sql_str(p['created_at']) if p['created_at'] else 'NOW()'}, "
        f"{sql_str(p['source'])}, "
        f"{owner_subquery(p['owner_raw'])}, "
        f"{sql_str(p['notes'])})"
    )


_PROSPECTS_CONFLICT = (
    "ON CONFLICT (sellsy_id, entity_id) DO UPDATE SET "
    "company_name = EXCLUDED.company_name, "
    "siret = EXCLUDED.siret, "
    "contact_name = EXCLUDED.contact_name, "
    "email = EXCLUDED.email, "
    "phone = EXCLUDED.phone, "
    "address = EXCLUDED.address, "
    "postal_code = EXCLUDED.postal_code, "
    "city = EXCLUDED.city, "
    "country = EXCLUDED.country, "
    "naf_code = EXCLUDED.naf_code, "
    "assigned_to = EXCLUDED.assigned_to, "
    "notes = EXCLUDED.notes, "
    "updated_at = NOW();"
)


def write_prospects(out_dir, prospects, split=False):
    rows_per_file = SPLIT_ROWS_PER_FILE if split else len(prospects) or 1
    total_parts = (len(prospects) + rows_per_file - 1) // rows_per_file

    for part_idx in range(total_parts):
        start = part_idx * rows_per_file
        end = min(start + rows_per_file, len(prospects))
        part_rows = prospects[start:end]
        is_last = (part_idx == total_parts - 1)

        title = (
            f"01_{chr(ord('a') + part_idx)} — Import prospects {start+1}-{end}/{len(prospects)}"
            if split else f"01 — Import prospects ({len(prospects)} lignes)"
        )
        sql = HEADER.format(title=title, date="2026-05-15")
        sql += "\nBEGIN;\n\n"

        for i in range(0, len(part_rows), BATCH_SIZE):
            batch = part_rows[i : i + BATCH_SIZE]
            sql += (
                "INSERT INTO crm_prospects "
                "(sellsy_id, entity_id, company_name, siret, contact_name, email, phone, "
                "address, postal_code, city, country, naf_code, created_at, source, "
                "assigned_to, notes)\nVALUES\n"
            )
            sql += ",\n".join(_prospect_row_sql(p) for p in batch)
            sql += "\n" + _PROSPECTS_CONFLICT + "\n\n"

        if is_last:
            sql += (
                "-- Vérification :\n"
                "SELECT entity_id, COUNT(*) AS prospects_importes\n"
                "  FROM crm_prospects WHERE source = 'sellsy_import'\n"
                "  GROUP BY entity_id;\n\n"
            )
        sql += "COMMIT;\n"

        if split:
            fname = f"01_{chr(ord('a') + part_idx)}_import_prospects.sql"
        else:
            fname = "01_import_prospects.sql"
        (out_dir / fname).write_text(sql, encoding="utf-8")


def _comment_row_sql(c):
    if not c["text"]:
        return None
    prospect_sub = (
        f"(SELECT id FROM crm_prospects WHERE sellsy_id = {sql_str(c['prospect_sellsy_id'])} "
        f"AND entity_id = {entity_sub(c['entity_key'])} LIMIT 1)"
    )
    return (
        f"({sql_str(c['sellsy_id'])}, "
        f"{sql_str(c['parent_sellsy_id'])}, "
        f"{prospect_sub}, "
        f"{entity_sub(c['entity_key'])}, "
        f"{sql_str(c['author_name'])}, "
        f"{sql_str(c['author_email'])}, "
        f"{sql_str(c['comment_date'])}::date, "
        f"{sql_str(c['text'])})"
    )


def write_comments(out_dir, comments, split=False):
    rows_per_file = SPLIT_ROWS_PER_FILE if split else len(comments) or 1
    total_parts = (len(comments) + rows_per_file - 1) // rows_per_file

    for part_idx in range(total_parts):
        start = part_idx * rows_per_file
        end = min(start + rows_per_file, len(comments))
        part_rows = comments[start:end]
        is_last = (part_idx == total_parts - 1)

        title = (
            f"02_{chr(ord('a') + part_idx)} — Import commentaires {start+1}-{end}/{len(comments)}"
            if split else f"02 — Import commentaires ({len(comments)} lignes)"
        )
        sql = HEADER.format(title=title, date="2026-05-15")
        sql += "\nBEGIN;\n\n"

        for i in range(0, len(part_rows), BATCH_SIZE):
            batch = part_rows[i : i + BATCH_SIZE]
            rows_sql = [r for r in (_comment_row_sql(c) for c in batch) if r]
            if not rows_sql:
                continue
            sql += (
                "INSERT INTO crm_prospect_comments "
                "(sellsy_id, parent_sellsy_id, prospect_id, entity_id, author_name, "
                "author_email, comment_date, text)\nVALUES\n"
            )
            sql += ",\n".join(rows_sql)
            sql += "\nON CONFLICT (sellsy_id, entity_id) DO NOTHING;\n\n"

        if is_last:
            sql += (
                "-- Nettoyage final : on supprime les commentaires orphelins (prospect_id NULL\n"
                "-- = le commentaire référençait un sellsy_id de prospect inexistant en base).\n"
                "DELETE FROM crm_prospect_comments WHERE prospect_id IS NULL;\n\n"
                "-- Vérification :\n"
                "SELECT entity_id, COUNT(*) AS comments_importes\n"
                "  FROM crm_prospect_comments GROUP BY entity_id;\n\n"
            )
        sql += "COMMIT;\n"

        if split:
            fname = f"02_{chr(ord('a') + part_idx)}_import_comments.sql"
        else:
            fname = "02_import_comments.sql"
        (out_dir / fname).write_text(sql, encoding="utf-8")


def _task_row_sql(t):
    prospect_sub = (
        f"(SELECT id FROM crm_prospects WHERE sellsy_id = {sql_str(t['prospect_sellsy_id'])} "
        f"AND entity_id = {entity_sub(t['entity_key'])} LIMIT 1)"
        if t["prospect_sellsy_id"]
        else "NULL"
    )
    return (
        f"({sql_str(t['external_ref'])}, "
        f"{entity_sub(t['entity_key'])}, "
        f"{sql_str(t['title'])}, "
        f"{sql_str(t['status'])}, "
        f"{sql_str(t['label'])}, "
        f"{sql_str(t['due_date'])}::date, "
        f"{sql_str(t['description'])}, "
        f"{prospect_sub}, "
        f"{owner_subquery(t['creator_raw'])}, "
        f"{sql_str(t['created_at']) if t['created_at'] else 'NOW()'})"
    )


def write_tasks(out_dir, tasks, split=False):
    rows_per_file = SPLIT_ROWS_PER_FILE if split else len(tasks) or 1
    total_parts = (len(tasks) + rows_per_file - 1) // rows_per_file

    for part_idx in range(total_parts):
        start = part_idx * rows_per_file
        end = min(start + rows_per_file, len(tasks))
        part_rows = tasks[start:end]
        is_last = (part_idx == total_parts - 1)

        title = (
            f"03_{chr(ord('a') + part_idx)} — Import tâches {start+1}-{end}/{len(tasks)}"
            if split else f"03 — Import tâches MR ({len(tasks)} lignes)"
        )
        sql = HEADER.format(title=title, date="2026-05-15")
        sql += "\nBEGIN;\n\n"

        for i in range(0, len(part_rows), BATCH_SIZE):
            batch = part_rows[i : i + BATCH_SIZE]
            sql += (
                "INSERT INTO crm_tasks "
                "(sellsy_external_ref, entity_id, title, status, label, due_date, "
                "description, prospect_id, created_by, created_at)\nVALUES\n"
            )
            sql += ",\n".join(_task_row_sql(t) for t in batch)
            sql += "\nON CONFLICT (sellsy_external_ref, entity_id) DO NOTHING;\n\n"

        if is_last:
            sql += (
                "-- Vérification :\n"
                "SELECT entity_id, status, COUNT(*) AS tasks_importes\n"
                "  FROM crm_tasks WHERE sellsy_external_ref IS NOT NULL\n"
                "  GROUP BY entity_id, status;\n\n"
            )
        sql += "COMMIT;\n"

        if split:
            fname = f"03_{chr(ord('a') + part_idx)}_import_tasks.sql"
        else:
            fname = "03_import_tasks.sql"
        (out_dir / fname).write_text(sql, encoding="utf-8")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Import CRM Sellsy → Supabase")
    parser.add_argument(
        "--downloads",
        type=Path,
        default=Path.home() / "Downloads",
        help="Dossier contenant les 5 CSV Sellsy (défaut : ~/Downloads)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).parent / "generated-crm-import",
        help="Dossier de sortie des SQL générés",
    )
    parser.add_argument(
        "--split",
        action="store_true",
        help=f"Découpe chaque import en plusieurs fichiers de ~{SPLIT_ROWS_PER_FILE} lignes "
             "(pour rester sous la limite ~1 MB du Supabase SQL Editor)",
    )
    args = parser.parse_args()

    args.out.mkdir(exist_ok=True)

    # Verify all files exist
    missing = [f for f in FILES.values() if not (args.downloads / f).exists()]
    if missing:
        print(f"❌ Fichiers manquants dans {args.downloads}:", file=sys.stderr)
        for m in missing:
            print(f"   - {m}", file=sys.stderr)
        sys.exit(1)

    # Parse CSVs
    print("📥 Lecture des CSV...")
    prospects = []
    for key, entity_key in [("c3v_prospects", "c3v"), ("mr_prospects", "mr")]:
        rows = read_csv(args.downloads / FILES[key], ENCODINGS[key])
        for r in rows:
            if r.get("Type", "").strip().lower() == "prospect":
                prospects.append(map_prospect(r, entity_key))
        print(f"   {key}: {len(rows)} lignes lues")

    comments = []
    for key, entity_key in [("c3v_comments", "c3v"), ("mr_comments", "mr")]:
        rows = read_csv(args.downloads / FILES[key], ENCODINGS[key])
        comments.extend(map_comment(r, entity_key) for r in rows)
        print(f"   {key}: {len(rows)} lignes lues")

    tasks = []
    rows = read_csv(args.downloads / FILES["mr_tasks"], ENCODINGS["mr_tasks"])
    tasks.extend(map_task(r, "mr") for r in rows)
    print(f"   mr_tasks: {len(rows)} lignes lues")

    # Nettoie les anciens fichiers split (sinon résidus d'un précédent run mélangés)
    for old in args.out.glob("0[123]_*_import_*.sql"):
        old.unlink()
    for old in args.out.glob("0[123]_import_*.sql"):
        old.unlink()

    # Génération
    mode = "split" if args.split else "single-file"
    print(f"\n📝 Génération des SQL ({mode})...")
    write_reset(args.out)
    write_prospects(args.out, prospects, split=args.split)
    write_comments(args.out, comments, split=args.split)
    write_tasks(args.out, tasks, split=args.split)

    # Rapport
    print(f"\n✅ Généré dans {args.out}/")
    print(f"   00_reset_crm_data.sql       (destructif : DELETE)")
    if args.split:
        files = sorted(args.out.glob("0[123]_*_import_*.sql"))
        for f in files:
            print(f"   {f.name:35s} ({f.stat().st_size // 1024} KB)")
        print(f"\n   → {len(files)} fichiers à coller dans SQL Editor (ordre alphabétique : a, b, c, ...)")
    else:
        print(f"   01_import_prospects.sql     ({len(prospects)} prospects)")
        print(f"   02_import_comments.sql      ({len(comments)} commentaires)")
        print(f"   03_import_tasks.sql         ({len(tasks)} tâches)")

    # Stats détaillées
    print("\n📊 Stats détaillées :")
    owners = {}
    for p in prospects:
        o = re.sub(r"\s*\(.*?\)", "", p["owner_raw"]).strip() or "(aucun)"
        owners[o] = owners.get(o, 0) + 1
    print("   Prospects par propriétaire :")
    for o, n in sorted(owners.items(), key=lambda x: -x[1]):
        print(f"     {o:35s} {n}")

    by_entity_p = {"mr": 0, "c3v": 0}
    for p in prospects:
        by_entity_p[p["entity_key"]] += 1
    print(f"\n   Prospects par entité : MR={by_entity_p['mr']}  C3V={by_entity_p['c3v']}")

    by_entity_c = {"mr": 0, "c3v": 0}
    for c in comments:
        by_entity_c[c["entity_key"]] += 1
    print(f"   Commentaires par entité : MR={by_entity_c['mr']}  C3V={by_entity_c['c3v']}")

    print(f"   Tâches : MR={len(tasks)}  C3V=0")

    # SIRET vides
    no_siret = sum(1 for p in prospects if not p["siret"])
    print(f"\n   ⚠️  Prospects sans SIREN : {no_siret}")

    no_email = sum(1 for p in prospects if not p["email"])
    print(f"   ⚠️  Prospects sans email : {no_email}")

    print("\n🎯 Étapes suivantes :")
    print("   1. Vérifier les SQL générés dans " + str(args.out))
    print("   2. Lancer dans Supabase : add_crm_sellsy_import_fields.sql (migration)")
    print("   3. (Optionnel) Lancer 00_reset_crm_data.sql pour wipe les données existantes")
    print("   4. Lancer 01_import_prospects.sql → 02_import_comments.sql → 03_import_tasks.sql")


if __name__ == "__main__":
    main()
