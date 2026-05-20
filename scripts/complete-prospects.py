#!/usr/bin/env python3
"""
Complétion des prospects CRM depuis un export contacts Sellsy
=============================================================

Opération PONCTUELLE (cf. docs design Approche B). Lit un export contacts
Sellsy et génère deux fichiers SQL pour compléter les champs `contact_name`,
`email`, `phone` MANQUANTS (NULL) des prospects déjà en base — sans jamais
écraser une valeur existante.

Entrée :
  ~/Downloads/export_contacts_985101779183559.csv  (séparateur ';', UTF-8)
  Colonnes : CONTACT ID; PRENOM CONTACT; NOM CONTACT; CIVILITE CONTACT;
             DATE DE CREATION; DATE DE DERNIERE MODIFICATION; FONCTION CONTACT;
             EMAIL CONTACT; TELEPHONE CONTACT; MOBILE CONTACT; CONTACT NOTE;
             ID SOCIETE SELLSY; TYPE SOCIETE; NOM SOCIETE; EMAIL SOCIETE

Sorties (dans scripts/generated-crm-import/) :
  04a_conflicts_report_prospects.sql  — READ-ONLY : charge un staging temp,
      affiche le nb de prospects matchés, les champs qui seront remplis, et
      les CONFLITS (base a déjà une valeur != fichier — non écrasée).
  04b_complete_prospects.sql          — transactionnel : UPDATE COALESCE,
      remplit uniquement les colonnes NULL.

Et un rapport CSV local (non versionné, données client) :
  scripts/generated-crm-import/multi_contacts_report.csv
      — sociétés ayant plusieurs contacts dans le fichier + contact retenu.

Clé de matching : ID SOCIETE SELLSY  ->  crm_prospects.sellsy_id
(sellsy_id est UNIQUE par entité ; pas besoin de filtrer par entity_id).

Usage :
  python3 scripts/complete-prospects.py
  python3 scripts/complete-prospects.py --downloads /chemin/perso
"""

import argparse
import csv
import sys
from pathlib import Path

CSV_NAME = "export_contacts_985101779183559.csv"
BATCH_SIZE = 200  # nb de lignes VALUES par INSERT (limite Postgres : 1664 args/stmt)

# Fonctions "décisionnaires" — départage les sociétés à contacts multiples.
DECISION_MAKER_KEYWORDS = (
    "gerant", "gérant", "directeur", "directrice", "president", "président",
    "pdg", "dg", "dirigeant", "responsable", "chef", "proprietaire", "propriétaire",
)


def sql_str(s):
    """Littéral SQL : NULL si vide, sinon chaîne échappée."""
    if s is None:
        return "NULL"
    s = str(s).strip()
    if s == "":
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def norm_space(s):
    """Collapse les espaces multiples et trim."""
    return " ".join((s or "").split())


def is_numeric_id(s):
    return bool(s) and s.strip().isdigit()


def completeness_score(email, phone):
    """Plus le contact a d'infos, plus le score est haut."""
    return (1 if email else 0) + (1 if phone else 0)


def is_decision_maker(fonction):
    f = (fonction or "").lower()
    return any(k in f for k in DECISION_MAKER_KEYWORDS)


def parse_contacts(csv_path):
    """Lit le CSV, retourne la liste des contacts normalisés (dicts)."""
    contacts = []
    skipped_no_societe = 0
    with open(csv_path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            id_societe = (row.get("ID SOCIETE SELLSY") or "").strip()
            if not is_numeric_id(id_societe):
                skipped_no_societe += 1
                continue
            prenom = norm_space(row.get("PRENOM CONTACT"))
            nom = norm_space(row.get("NOM CONTACT"))
            contact_name = norm_space(f"{prenom} {nom}")
            # email : contact en priorité, sinon société
            email = norm_space(row.get("EMAIL CONTACT")) or norm_space(row.get("EMAIL SOCIETE"))
            email = email.lower() or None
            # phone : fixe en priorité, sinon mobile
            phone = norm_space(row.get("TELEPHONE CONTACT")) or norm_space(row.get("MOBILE CONTACT"))
            phone = phone or None
            contacts.append({
                "contact_id": (row.get("CONTACT ID") or "").strip(),
                "id_societe": id_societe,
                "nom_societe": norm_space(row.get("NOM SOCIETE")),
                "contact_name": contact_name or None,
                "fonction": norm_space(row.get("FONCTION CONTACT")),
                "email": email,
                "phone": phone,
            })
    return contacts, skipped_no_societe


def build_email_societe_map(csv_path):
    """
    Construit une map email -> id_societe à partir du fichier contacts, en
    prenant EMAIL CONTACT *et* EMAIL SOCIETE. Ne garde que les emails qui
    identifient UNE SEULE société (les emails partagés entre plusieurs
    sociétés sont écartés — rattachement ambigu).

    Sert à re-lier les tâches orphelines dont le `contact_email` ne matche
    aucun prospect par email principal, mais correspond à une société connue.
    """
    email_to_societes = {}  # email -> dict {id_societe: nom_societe}
    with open(csv_path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            id_societe = (row.get("ID SOCIETE SELLSY") or "").strip()
            if not is_numeric_id(id_societe):
                continue
            nom_societe = norm_space(row.get("NOM SOCIETE"))
            for col in ("EMAIL CONTACT", "EMAIL SOCIETE"):
                email = norm_space(row.get(col)).lower()
                if email and "@" in email:
                    email_to_societes.setdefault(email, {})[id_societe] = nom_societe
    # On ne garde que les emails identifiant UNE SEULE société.
    return {
        email: (next(iter(socs)), next(iter(socs.values())))
        for email, socs in email_to_societes.items()
        if len(socs) == 1
    }


def pick_best_per_societe(contacts):
    """
    1 société -> 1 contact retenu.
    Priorité : complétude (email+tél) > fonction décisionnaire > CONTACT ID le
    plus ancien (plus petit). Retourne (best_by_societe, multi_report).
    """
    by_societe = {}
    for c in contacts:
        by_societe.setdefault(c["id_societe"], []).append(c)

    best = {}
    multi_report = []  # sociétés à >1 contact
    for id_societe, group in by_societe.items():
        def sort_key(c):
            try:
                cid = int(c["contact_id"])
            except (ValueError, TypeError):
                cid = float("inf")
            return (
                -completeness_score(c["email"], c["phone"]),
                0 if is_decision_maker(c["fonction"]) else 1,
                cid,
            )
        ordered = sorted(group, key=sort_key)
        chosen = ordered[0]
        best[id_societe] = chosen
        if len(group) > 1:
            for c in ordered:
                multi_report.append({
                    "id_societe": id_societe,
                    "nom_societe": c["nom_societe"],
                    "contact_id": c["contact_id"],
                    "contact_name": c["contact_name"] or "",
                    "fonction": c["fonction"],
                    "email": c["email"] or "",
                    "phone": c["phone"] or "",
                    "retenu": "OUI" if c["contact_id"] == chosen["contact_id"] else "non",
                })
    return best, multi_report


STAGING_TABLE = "crm_import_staging_contacts"


def emit_staging_block(best):
    """Génère le SQL : table de staging PERSISTANTE + INSERT batchés.

    Persistante (pas TEMP) pour que 04a puisse lancer ses requêtes d'aperçu
    une par une après le chargement, et que 04b la réutilise sans ré-embarquer
    les 1679 lignes. 04b la supprime en fin de traitement.
    """
    lines = [
        f"DROP TABLE IF EXISTS {STAGING_TABLE};",
        f"CREATE TABLE {STAGING_TABLE} (",
        "  id_societe   TEXT PRIMARY KEY,",
        "  nom_societe  TEXT,",
        "  contact_name TEXT,",
        "  email        TEXT,",
        "  phone        TEXT",
        ");",
        "-- RLS sans policy : table inaccessible via l'API publique (anon/",
        "-- authenticated) le temps de sa courte durée de vie. Le SQL Editor",
        "-- (rôle postgres, propriétaire) y accède normalement.",
        f"ALTER TABLE {STAGING_TABLE} ENABLE ROW LEVEL SECURITY;",
        "",
    ]
    rows = list(best.values())
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        lines.append(f"INSERT INTO {STAGING_TABLE} (id_societe, nom_societe, contact_name, email, phone) VALUES")
        values = []
        for c in batch:
            values.append(
                f"  ({sql_str(c['id_societe'])}, {sql_str(c['nom_societe'])}, "
                f"{sql_str(c['contact_name'])}, {sql_str(c['email'])}, {sql_str(c['phone'])})"
            )
        lines.append(",\n".join(values) + ";")
        lines.append("")
    return "\n".join(lines)


STAGING_EMAIL_TABLE = "crm_import_staging_email2societe"


def emit_email_map_block(email_map):
    """Génère le SQL : table staging email -> (sellsy_id, nom_societe)."""
    lines = [
        f"DROP TABLE IF EXISTS {STAGING_EMAIL_TABLE};",
        f"CREATE TABLE {STAGING_EMAIL_TABLE} (",
        "  email       TEXT PRIMARY KEY,",
        "  sellsy_id   TEXT NOT NULL,",
        "  nom_societe TEXT",
        ");",
        f"ALTER TABLE {STAGING_EMAIL_TABLE} ENABLE ROW LEVEL SECURITY;",
        "",
    ]
    items = sorted(email_map.items())
    for i in range(0, len(items), BATCH_SIZE):
        batch = items[i:i + BATCH_SIZE]
        lines.append(f"INSERT INTO {STAGING_EMAIL_TABLE} (email, sellsy_id, nom_societe) VALUES")
        values = [
            f"  ({sql_str(email)}, {sql_str(sid)}, {sql_str(nom)})"
            for email, (sid, nom) in batch
        ]
        lines.append(",\n".join(values) + ";")
        lines.append("")
    return "\n".join(lines)


TEMPLATE_05 = f"""-- ============================================================
-- 05 — RE-LIAISON des tâches orphelines via le fichier contacts
-- ============================================================
-- Généré par scripts/complete-prospects.py — NE PAS éditer à la main.
--
-- Complète relink-orphan-tasks.sql : ce dernier ne relie que par email
-- PRINCIPAL du prospect. Or beaucoup de tâches portent un email
-- (ex. EMAIL SOCIETE) différent de l'email principal du prospect.
-- Ce script utilise la map `email -> société` issue du fichier contacts
-- Sellsy (EMAIL CONTACT + EMAIL SOCIETE) pour retrouver le prospect.
--
-- Ne relie que les emails identifiant UNE SEULE société (non ambigus).
-- Idempotent (ne touche que les tâches encore prospect_id IS NULL).
--
-- ⚠️ ORDRE : après 04b et après relink-orphan-tasks.sql.
-- Lance les 3 sections une par une (sélection + Run).
-- ============================================================

-- Pont de matching : email tâche -> société (fichier contacts), puis
-- société -> prospect via sellsy_id OU nom de société. Le double critère
-- est nécessaire car Sellsy a des doublons de fiche société : la même
-- entreprise peut avoir un sellsy_id différent entre l'export contacts et
-- l'import prospects. Garde-fou : on ne relie que si le couple identifie
-- UN SEUL prospect (sinon ambiguïté -> tâche laissée orpheline).

-- ╔══ SECTION 1 — CHARGEMENT de la map email -> société ════════════════════╗
BEGIN;

{{email_map_sql}}
COMMIT;
-- ╚══ FIN SECTION 1 ════════════════════════════════════════════════════════╝


-- ── SECTION 2 — PREVIEW (read-only) : tâches orphelines et leurs candidats ─
-- nb_candidats = 1  -> sera re-liée par la SECTION 3
-- nb_candidats > 1  -> ambiguë, laissée orpheline (à traiter manuellement)
WITH task_matches AS (
  SELECT t.id AS task_id, t.title, t.contact_email,
         p.id AS prospect_id, p.company_name
  FROM crm_tasks t
  JOIN {STAGING_EMAIL_TABLE} m ON lower(t.contact_email) = m.email
  JOIN crm_prospects p
    ON p.entity_id = t.entity_id
   AND ( p.sellsy_id = m.sellsy_id
      OR lower(btrim(p.company_name)) = lower(btrim(m.nom_societe)) )
  WHERE t.prospect_id IS NULL
    AND t.contact_email IS NOT NULL
)
SELECT task_id, title, contact_email,
       COUNT(DISTINCT prospect_id)              AS nb_candidats,
       string_agg(DISTINCT company_name, ' | ') AS prospect_candidat
FROM task_matches
GROUP BY task_id, title, contact_email
ORDER BY nb_candidats DESC, title;


-- ── SECTION 3 — UPDATE transactionnel + nettoyage ────────────────────────
DO $$
BEGIN
  IF to_regclass('public.{STAGING_EMAIL_TABLE}') IS NULL THEN
    RAISE EXCEPTION 'Table {STAGING_EMAIL_TABLE} absente — exécute la SECTION 1 d''abord.';
  END IF;
END $$;

BEGIN;

WITH task_matches AS (
  SELECT t.id AS task_id, p.id AS prospect_id
  FROM crm_tasks t
  JOIN {STAGING_EMAIL_TABLE} m ON lower(t.contact_email) = m.email
  JOIN crm_prospects p
    ON p.entity_id = t.entity_id
   AND ( p.sellsy_id = m.sellsy_id
      OR lower(btrim(p.company_name)) = lower(btrim(m.nom_societe)) )
  WHERE t.prospect_id IS NULL
    AND t.contact_email IS NOT NULL
),
unambiguous AS (
  -- COUNT(DISTINCT) = 1 garantit un seul prospect ; array_agg car MIN()
  -- ne supporte pas le type uuid.
  SELECT task_id, (array_agg(DISTINCT prospect_id))[1] AS prospect_id
  FROM task_matches
  GROUP BY task_id
  HAVING COUNT(DISTINCT prospect_id) = 1
)
UPDATE crm_tasks t
SET prospect_id = u.prospect_id,
    updated_at  = NOW()
FROM unambiguous u
WHERE t.id = u.task_id;

COMMIT;

DROP TABLE IF EXISTS {STAGING_EMAIL_TABLE};

-- ── Bilan : tâches encore orphelines ──
SELECT e.slug AS entite,
       COUNT(*)                                       AS taches_total,
       COUNT(*) FILTER (WHERE t.prospect_id IS NULL)   AS encore_orphelines
FROM crm_tasks t
JOIN entities e ON e.id = t.entity_id
GROUP BY e.slug
ORDER BY e.slug;
"""


HEADER_04A = f"""-- ============================================================
-- 04a — CHARGEMENT staging + RAPPORT (conflits & aperçu)
-- ============================================================
-- Généré par scripts/complete-prospects.py — NE PAS éditer à la main.
--
-- Ne modifie AUCUNE donnée métier. Crée une table de travail
-- `{STAGING_TABLE}` contenant les contacts Sellsy, puis propose 3
-- requêtes d'aperçu.
--
-- Mode d'emploi :
--   1. Sélectionne le BLOC CHARGEMENT (jusqu'à la ligne COMMIT) + Run.
--   2. Lance ensuite les 3 requêtes d'aperçu UNE PAR UNE (sélection + Run) :
--      la table de staging est persistante, elle reste disponible.
--   3. Relis surtout le « Résultat 3 — CONFLITS » avant de lancer 04b.
--
-- À lancer APRÈS diagnostic-crm-completion.sql, AVANT 04b.
-- ============================================================

-- ╔══ BLOC CHARGEMENT ══════════════════════════════════════════════════════╗
BEGIN;

"""

FOOTER_04A = f"""COMMIT;
-- ╚══ FIN BLOC CHARGEMENT ══════════════════════════════════════════════════╝


-- ── Résultat 1 : prospects du fichier retrouvés en base, par entité ──
SELECT e.slug AS entite, COUNT(*) AS prospects_matches
FROM crm_prospects p
JOIN {STAGING_TABLE} s ON p.sellsy_id = s.id_societe
JOIN entities e ON e.id = p.entity_id
GROUP BY e.slug
ORDER BY e.slug;

-- ── Résultat 2 : champs qui SERONT remplis par 04b (actuellement NULL) ──
SELECT
  COUNT(*) FILTER (WHERE p.contact_name IS NULL AND s.contact_name IS NOT NULL) AS remplira_contact_name,
  COUNT(*) FILTER (WHERE p.email        IS NULL AND s.email        IS NOT NULL) AS remplira_email,
  COUNT(*) FILTER (WHERE p.phone        IS NULL AND s.phone        IS NOT NULL) AS remplira_phone
FROM crm_prospects p
JOIN {STAGING_TABLE} s ON p.sellsy_id = s.id_societe;

-- ── Résultat 3 : CONFLITS — base a déjà une valeur DIFFÉRENTE du fichier ──
-- Ces valeurs ne seront PAS écrasées par 04b (politique : remplir les vides).
-- À toi de trancher au cas par cas si tu veux corriger l'une d'elles.
SELECT p.sellsy_id, p.company_name,
       p.contact_name AS base_contact, s.contact_name AS fichier_contact,
       p.email        AS base_email,   s.email        AS fichier_email,
       p.phone        AS base_phone,   s.phone        AS fichier_phone
FROM crm_prospects p
JOIN {STAGING_TABLE} s ON p.sellsy_id = s.id_societe
WHERE (p.contact_name IS NOT NULL AND s.contact_name IS NOT NULL
         AND lower(p.contact_name) <> lower(s.contact_name))
   OR (p.email IS NOT NULL AND s.email IS NOT NULL
         AND lower(p.email) <> lower(s.email))
   OR (p.phone IS NOT NULL AND s.phone IS NOT NULL
         AND p.phone <> s.phone)
ORDER BY p.company_name;
"""

HEADER_04B = f"""-- ============================================================
-- 04b — COMPLÉTION prospects (UPDATE transactionnel idempotent)
-- ============================================================
-- Généré par scripts/complete-prospects.py — NE PAS éditer à la main.
--
-- PRÉ-REQUIS : 04a doit avoir été exécuté (table `{STAGING_TABLE}`
-- présente). Le bloc ci-dessous échoue proprement avec un message clair
-- si ce n'est pas le cas.
--
-- Remplit UNIQUEMENT les colonnes NULL de crm_prospects (contact_name,
-- email, phone). COALESCE garantit qu'aucune valeur existante n'est
-- écrasée. Ré-exécutable sans effet de bord (idempotent).
-- En fin de traitement, la table de staging est supprimée.
--
-- Cmd+A + Run. Le dernier SELECT affiche le bilan post-UPDATE.
-- ============================================================

-- ── Garde-fou : staging présent ? ──
DO $$
BEGIN
  IF to_regclass('public.{STAGING_TABLE}') IS NULL THEN
    RAISE EXCEPTION 'Table {STAGING_TABLE} absente — exécute 04a d''abord.';
  END IF;
END $$;

BEGIN;

-- ── UPDATE : remplit les NULL, n'écrase jamais une valeur existante ──
UPDATE crm_prospects p SET
  contact_name = COALESCE(p.contact_name, s.contact_name),
  email        = COALESCE(p.email,        s.email),
  phone        = COALESCE(p.phone,        s.phone),
  updated_at   = NOW()
FROM {STAGING_TABLE} s
WHERE p.sellsy_id = s.id_societe
  AND (
       (p.contact_name IS NULL AND s.contact_name IS NOT NULL)
    OR (p.email        IS NULL AND s.email        IS NOT NULL)
    OR (p.phone        IS NULL AND s.phone        IS NOT NULL)
  );

COMMIT;

-- ── Nettoyage : suppression de la table de travail ──
DROP TABLE IF EXISTS {STAGING_TABLE};

-- ── Bilan post-complétion ──
-- Colonnes préfixées p. : entities possède aussi email/phone (sinon "ambiguous").
SELECT e.slug AS entite,
       COUNT(*)                                            AS prospects_total,
       COUNT(*) FILTER (WHERE p.contact_name IS NULL)       AS sans_contact_name,
       COUNT(*) FILTER (WHERE p.email        IS NULL)       AS sans_email,
       COUNT(*) FILTER (WHERE p.phone        IS NULL)       AS sans_phone
FROM crm_prospects p
JOIN entities e ON e.id = p.entity_id
GROUP BY e.slug
ORDER BY e.slug;
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--downloads", default=str(Path.home() / "Downloads"))
    args = ap.parse_args()

    csv_path = Path(args.downloads) / CSV_NAME
    if not csv_path.exists():
        sys.exit(f"❌ Fichier introuvable : {csv_path}")

    out_dir = Path(__file__).parent / "generated-crm-import"
    out_dir.mkdir(exist_ok=True)

    contacts, skipped = parse_contacts(csv_path)
    best, multi_report = pick_best_per_societe(contacts)
    email_map = build_email_societe_map(csv_path)

    staging_sql = emit_staging_block(best)

    # 04a porte les données de staging (CREATE + INSERT) ; 04b réutilise la
    # table créée par 04a et n'embarque donc aucune donnée.
    (out_dir / "04a_conflicts_report_prospects.sql").write_text(
        HEADER_04A + staging_sql + "\n" + FOOTER_04A, encoding="utf-8")
    (out_dir / "04b_complete_prospects.sql").write_text(
        HEADER_04B, encoding="utf-8")

    # 05 : re-liaison des tâches orphelines via la map email -> société.
    (out_dir / "05_relink_orphan_tasks.sql").write_text(
        TEMPLATE_05.replace("{email_map_sql}", emit_email_map_block(email_map)),
        encoding="utf-8")

    # Rapport multi-contacts (CSV local — données client, gitignored)
    multi_path = out_dir / "multi_contacts_report.csv"
    with open(multi_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "id_societe", "nom_societe", "contact_id", "contact_name",
            "fonction", "email", "phone", "retenu"])
        w.writeheader()
        w.writerows(multi_report)

    nb_multi = len({m["id_societe"] for m in multi_report})
    print("── Génération terminée ──")
    print(f"  Contacts lus               : {len(contacts)}")
    print(f"  Lignes sans ID société     : {skipped} (ignorées)")
    print(f"  Sociétés uniques (staging) : {len(best)}")
    print(f"  Sociétés multi-contacts    : {nb_multi}")
    print(f"  Emails -> société (uniques): {len(email_map)}")
    print(f"  → {out_dir / '04a_conflicts_report_prospects.sql'}")
    print(f"  → {out_dir / '04b_complete_prospects.sql'}")
    print(f"  → {out_dir / '05_relink_orphan_tasks.sql'}")
    print(f"  → {multi_path}")


if __name__ == "__main__":
    main()
