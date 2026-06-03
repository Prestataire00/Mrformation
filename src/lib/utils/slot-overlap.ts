/**
 * PLAN-6 audit BMAD — Helper pure de détection d'overlap entre 2 créneaux.
 *
 * Deux créneaux se chevauchent strictement quand :
 *   a.start < b.end   ET   b.start < a.end
 *
 * Le critère est strict (< et non ≤) : un créneau qui finit à 12:00 et un
 * qui commence à 12:00 ne se chevauchent PAS (transition matin/aprem
 * directe sans pause). On considère les ISO en ms via Date.parse.
 */

export interface TimeRange {
  start_time: string;
  end_time: string;
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  const aStart = new Date(a.start_time).getTime();
  const aEnd = new Date(a.end_time).getTime();
  const bStart = new Date(b.start_time).getTime();
  const bEnd = new Date(b.end_time).getTime();
  return aStart < bEnd && bStart < aEnd;
}
