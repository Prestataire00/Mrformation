"""Conversions de fuseau horaire pour les créneaux (Europe/Paris ↔ UTC).

Miroir Python du helper TS `src/lib/timezone.ts` (toUtcIsoFromParisTime) : une heure
"murale" saisie en heure de Paris doit être stockée en TIMESTAMPTZ comme l'instant UTC
correspondant (DST géré selon la date).

Bug historique corrigé ici : `apply_creneaux.py` écrivait l'heure murale avec un suffixe
`Z` (« 09:00:00Z »), donc 09:00 UTC au lieu de 09:00 Paris → affichage décalé de +1h
(hiver) / +2h (été). `correct_utc_z_to_paris` répare une valeur ainsi mal stockée.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")
UTC = ZoneInfo("UTC")


def paris_wallclock_to_utc_iso(date_str: str, time_str: str) -> str:
    """« 2025-05-19 » + « 09:00 » (heure Paris) → « 2025-05-19T07:00:00+00:00 » (été).

    Équivalent Python de toUtcIsoFromParisTime côté app.
    """
    time_norm = time_str if len(time_str) > 5 else f"{time_str}:00"
    naive = datetime.fromisoformat(f"{date_str}T{time_norm}")
    return naive.replace(tzinfo=PARIS).astimezone(UTC).isoformat()


def correct_utc_z_to_paris(stored_iso: str) -> str:
    """Répare un instant où l'heure murale Paris a été stockée par erreur comme UTC.

    Les composantes UTC de `stored_iso` SONT l'heure murale voulue. On les ré-interprète
    en heure Paris (DST selon la date) et on renvoie l'instant UTC correct.

    Ex (été) : « 2025-05-19T09:00:00+00:00 » → « 2025-05-19T07:00:00+00:00 ».
    Ex (hiver): « 2025-01-15T09:00:00+00:00 » → « 2025-01-15T08:00:00+00:00 ».
    """
    dt = datetime.fromisoformat(stored_iso.replace("Z", "+00:00"))
    wall = dt.astimezone(UTC).replace(tzinfo=None)  # heure murale = composantes UTC
    return wall.replace(tzinfo=PARIS).astimezone(UTC).isoformat()
