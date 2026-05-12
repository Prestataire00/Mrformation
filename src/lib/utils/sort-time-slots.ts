/**
 * Trie un tableau de slots par `start_time` croissant (chronologique strict).
 *
 * Bug résolu (audit Loris) : les créneaux d'après-midi s'affichaient AVANT
 * ceux du matin quand l'admin créait le slot aprem en premier (ordre source =
 * created_at, pas start_time).
 *
 * - Stable : 2 slots avec même start_time conservent leur ordre d'origine
 * - Pur : ne mute pas le tableau passé en argument
 */
export function sortSlotsByStart<T extends { start_time: string }>(slots: T[]): T[] {
  return [...slots].sort((a, b) =>
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
}
