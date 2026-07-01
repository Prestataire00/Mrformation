export interface DerouleFields {
  module_title: string | null;
  module_objectives: string | null;
  module_themes: string | null;
  module_exercises: string | null;
}

/** Whitelist stricte : seuls les 4 champs de déroulé pédagogique sont conservés. */
export function pickDerouleFields(body: Record<string, unknown>): DerouleFields {
  return {
    module_title: (body.module_title as string) ?? null,
    module_objectives: (body.module_objectives as string) ?? null,
    module_themes: (body.module_themes as string) ?? null,
    module_exercises: (body.module_exercises as string) ?? null,
  };
}

const hasText = (v: string | null | undefined): boolean =>
  typeof v === "string" && v.trim().length > 0;

/** Créneaux PASSÉS (end_time < now) ET ayant du contenu module (anti-brouillon apprenant). */
export function filterPastSlotsWithContent<
  T extends {
    end_time: string;
    module_title?: string | null;
    module_objectives?: string | null;
    module_themes?: string | null;
    module_exercises?: string | null;
  },
>(slots: T[], now: Date): T[] {
  return slots.filter(
    (s) =>
      new Date(s.end_time).getTime() < now.getTime() &&
      (hasText(s.module_title) ||
        hasText(s.module_objectives) ||
        hasText(s.module_themes) ||
        hasText(s.module_exercises)),
  );
}
