/**
 * PLAN-11 audit BMAD — Calcule les jours fériés français pour une année donnée.
 *
 * Aujourd'hui BulkSlotCreator crée silencieusement un créneau le 14 juillet
 * ou le 25 décembre sans alerter — l'admin ne le remarque qu'à l'envoi des
 * convocations.
 *
 * Inclus :
 *  - dates fixes (1er janvier, 1er mai, 8 mai, 14 juillet, 15 août,
 *    1er novembre, 11 novembre, 25 décembre)
 *  - dates mobiles dérivées de Pâques (Lundi de Pâques, Ascension, Lundi
 *    de Pentecôte) — algorithme Gauss/Computus.
 *
 * Pas inclus pour l'instant : jours fériés régionaux (Alsace-Moselle :
 * Vendredi saint + Saint-Étienne 26/12 ; Mayotte/Guadeloupe/Réunion :
 * abolition de l'esclavage). Si besoin, ajouter une option `region`.
 */

/** Calcule le dimanche de Pâques pour une année (algorithme Gauss simplifié). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monthIndex = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, monthIndex, day);
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface FrenchHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

/**
 * Retourne la liste des jours fériés français pour une année.
 */
export function getFrenchHolidays(year: number): FrenchHoliday[] {
  const easter = easterSunday(year);
  return [
    { date: `${year}-01-01`, name: "Jour de l'An" },
    { date: toYmd(addDays(easter, 1)), name: "Lundi de Pâques" },
    { date: `${year}-05-01`, name: "Fête du Travail" },
    { date: `${year}-05-08`, name: "Victoire 1945" },
    { date: toYmd(addDays(easter, 39)), name: "Ascension" },
    { date: toYmd(addDays(easter, 50)), name: "Lundi de Pentecôte" },
    { date: `${year}-07-14`, name: "Fête nationale" },
    { date: `${year}-08-15`, name: "Assomption" },
    { date: `${year}-11-01`, name: "Toussaint" },
    { date: `${year}-11-11`, name: "Armistice 1918" },
    { date: `${year}-12-25`, name: "Noël" },
  ];
}

/**
 * Construit un Set de dates YYYY-MM-DD fériées pour une plage d'années.
 * Optimisation : utilisé pour un lookup O(1) dans une boucle de génération
 * de slots.
 */
export function buildHolidaySet(yearFrom: number, yearTo: number): Set<string> {
  const set = new Set<string>();
  for (let y = yearFrom; y <= yearTo; y++) {
    for (const h of getFrenchHolidays(y)) set.add(h.date);
  }
  return set;
}

/**
 * Vérifie si une date YYYY-MM-DD est fériée en France métropolitaine.
 */
export function isFrenchHoliday(ymd: string): boolean {
  const year = parseInt(ymd.slice(0, 4), 10);
  if (!Number.isFinite(year)) return false;
  return getFrenchHolidays(year).some((h) => h.date === ymd);
}
