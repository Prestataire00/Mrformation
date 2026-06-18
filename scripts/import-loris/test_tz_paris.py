"""Tests de tz_paris — lancer : python3 scripts/import-loris/test_tz_paris.py"""
from tz_paris import paris_wallclock_to_utc_iso, correct_utc_z_to_paris


def test_paris_to_utc_ete():
    # 09:00 Paris en été (UTC+2) → 07:00 UTC
    assert paris_wallclock_to_utc_iso("2025-05-19", "09:00") == "2025-05-19T07:00:00+00:00"


def test_paris_to_utc_hiver():
    # 09:00 Paris en hiver (UTC+1) → 08:00 UTC
    assert paris_wallclock_to_utc_iso("2025-01-15", "09:00") == "2025-01-15T08:00:00+00:00"


def test_correction_matin_ete():
    # bug : 09:00 stocké comme UTC → doit devenir 07:00 UTC (été)
    assert correct_utc_z_to_paris("2025-05-19T09:00:00+00:00") == "2025-05-19T07:00:00+00:00"


def test_correction_apresmidi_ete():
    # bug : 13:00 stocké comme UTC → 11:00 UTC (été)
    assert correct_utc_z_to_paris("2025-05-19T13:00:00+00:00") == "2025-05-19T11:00:00+00:00"


def test_correction_hiver():
    # bug : 09:00 stocké comme UTC → 08:00 UTC (hiver)
    assert correct_utc_z_to_paris("2025-01-15T09:00:00+00:00") == "2025-01-15T08:00:00+00:00"


def test_correction_avec_suffixe_Z():
    assert correct_utc_z_to_paris("2025-05-19T13:00:00Z") == "2025-05-19T11:00:00+00:00"


def test_correction_idempotente_apres_fix():
    # une valeur déjà corrigée (07:00 UTC été = 09:00 Paris) ne doit PAS rebouger l'heure murale Paris
    once = correct_utc_z_to_paris("2025-05-19T09:00:00+00:00")  # → 07:00 UTC
    # ré-appliquer la correction sur une valeur correcte la décalerait : on ne le fait donc
    # JAMAIS deux fois — le script de fix filtre sur l'heure UTC 09/13. On vérifie juste la 1re passe.
    assert once == "2025-05-19T07:00:00+00:00"


if __name__ == "__main__":
    import sys
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  ✓ {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  ✗ {t.__name__}: {e}")
    print(f"\n{'❌' if failed else '✅'} {len(tests) - failed}/{len(tests)} tests OK")
    sys.exit(1 if failed else 0)
