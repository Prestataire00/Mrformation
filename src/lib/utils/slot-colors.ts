/**
 * Story 4.1 — palette de couleurs pour les créneaux de planning
 * (`formation_time_slots.color`).
 *
 * Palette RESTREINTE volontairement : on stocke la valeur de fond (hex), et on
 * associe une couleur de texte sombre garantissant un contraste lisible. Évite
 * un color-picker totalement libre qui produirait des combinaisons illisibles.
 */

export interface SlotColor {
  /** Libellé affiché dans le sélecteur. */
  name: string;
  /** Couleur de fond stockée en base (hex). */
  value: string;
  /** Couleur de texte associée (contraste garanti). */
  text: string;
}

export const SLOT_COLOR_PALETTE: SlotColor[] = [
  { name: "Bleu", value: "#dbeafe", text: "#1e40af" },
  { name: "Vert", value: "#dcfce7", text: "#166534" },
  { name: "Ambre", value: "#fef3c7", text: "#92400e" },
  { name: "Rose", value: "#fce7f3", text: "#9d174d" },
  { name: "Violet", value: "#ede9fe", text: "#5b21b6" },
  { name: "Cyan", value: "#cffafe", text: "#155e75" },
  { name: "Rouge", value: "#fee2e2", text: "#991b1b" },
  { name: "Gris", value: "#f3f4f6", text: "#374151" },
];

/** Vrai si la valeur fait partie de la palette autorisée (ou est vide/null). */
export function isValidSlotColor(value: string | null | undefined): boolean {
  if (!value) return true;
  return SLOT_COLOR_PALETTE.some((c) => c.value === value);
}

/** Couleur de texte contrastée pour une valeur de fond, ou undefined si inconnue/vide. */
export function getSlotColorText(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return SLOT_COLOR_PALETTE.find((c) => c.value === value)?.text;
}
