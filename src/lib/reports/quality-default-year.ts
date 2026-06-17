export interface YearData { year: number; dataCount: number; }

/** Choisit l'année à afficher par défaut : celle qui a le plus de données
 *  (égalité → la plus récente). Si aucune année n'a de données, l'année courante. */
export function pickDefaultQualityYear(years: YearData[], currentYear: number): number {
  const withData = years.filter((y) => y.dataCount > 0);
  if (withData.length === 0) return currentYear;
  return withData.reduce((best, y) =>
    y.dataCount > best.dataCount || (y.dataCount === best.dataCount && y.year > best.year) ? y : best,
  ).year;
}
