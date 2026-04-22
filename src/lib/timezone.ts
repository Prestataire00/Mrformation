import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Timezone de référence pour l'application (organismes de formation français).
 */
export const APP_TIMEZONE = "Europe/Paris";

/**
 * Convertit une date + heure "naïve" (saisie utilisateur en heure Paris)
 * en ISO string UTC correct pour stockage en TIMESTAMPTZ.
 *
 * Ex: "2026-04-22" + "09:00" → "2026-04-22T07:00:00.000Z" (été, UTC+2)
 *     "2026-01-15" + "09:00" → "2026-01-15T08:00:00.000Z" (hiver, UTC+1)
 */
export function toUtcIsoFromParisTime(dateStr: string, timeStr: string): string {
  const normalizedTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const naiveDate = `${dateStr}T${normalizedTime}`;
  const utcDate = fromZonedTime(naiveDate, APP_TIMEZONE);
  return utcDate.toISOString();
}

/**
 * Affiche une date UTC (venue de la base) en heure Paris.
 */
export function formatInParis(isoString: string | Date, formatStr: string): string {
  return formatInTimeZone(isoString, APP_TIMEZONE, formatStr);
}

/** Heure:minute en heure Paris. */
export function formatTimeInParis(isoString: string | Date): string {
  return formatInParis(isoString, "HH:mm");
}

/** Date en heure Paris (dd/MM/yyyy). */
export function formatDateInParis(isoString: string | Date): string {
  return formatInParis(isoString, "dd/MM/yyyy");
}

/** Date + heure en heure Paris. */
export function formatDateTimeInParis(isoString: string | Date): string {
  return formatInParis(isoString, "dd/MM/yyyy HH:mm");
}
