/**
 * Helpers de formatage d'une ISO UTC en heure locale Europe/Paris,
 * indépendants du TZ runtime (Node en UTC sur Netlify Functions, navigateur
 * en local de l'utilisateur, etc.).
 *
 * Contexte du bug fixé : le résolveur de variables convocation/convention
 * appelait `new Date(iso).getHours()`, qui dépend du fuseau runtime. En
 * prod Netlify (UTC), un créneau saisi 09:00 Paris (= 07:00Z l'été) sortait
 * "07:00" dans le PDF de convocation alors que le planning l'affiche
 * correctement à "09:00".
 *
 * Tous les helpers ici garantissent l'affichage en Europe/Paris quel que
 * soit le serveur d'exécution.
 */

const PARIS_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

interface ParisParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

function partsFromIso(iso: string): ParisParts {
  const parts = PARIS_FORMATTER.formatToParts(new Date(iso));
  const map: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const p of parts) map[p.type] = p.value;
  // Intl peut renvoyer "24" pour minuit dans certains environnements ; normalise.
  let hour = map.hour ?? "00";
  if (hour === "24") hour = "00";
  return {
    year: map.year ?? "1970",
    month: map.month ?? "01",
    day: map.day ?? "01",
    hour,
    minute: map.minute ?? "00",
  };
}

/** Renvoie "HH:mm" en heure locale Paris pour une ISO. */
export function formatTimeParis(iso: string): string {
  try {
    const p = partsFromIso(iso);
    return `${p.hour}:${p.minute}`;
  } catch {
    return "--:--";
  }
}

/** Renvoie l'heure (0-23) en heure locale Paris pour une ISO. */
export function getHourParis(iso: string): number {
  try {
    return parseInt(partsFromIso(iso).hour, 10);
  } catch {
    return 0;
  }
}

/** Renvoie "YYYY-MM-DD" en date locale Paris pour une ISO. */
export function formatYmdParis(iso: string): string {
  try {
    const p = partsFromIso(iso);
    return `${p.year}-${p.month}-${p.day}`;
  } catch {
    return "1970-01-01";
  }
}
