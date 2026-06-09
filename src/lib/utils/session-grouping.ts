/**
 * Partitionne les sessions du Hub Formations en trois groupes d'affichage :
 * - active   : sessions sur lesquelles l'admin doit agir (à venir, en cours)
 * - completed: sessions terminées (rangées dans un pli replié)
 * - cancelled: sessions annulées (rangées dans un pli replié distinct)
 *
 * Tout statut inconnu est traité comme actif : défaut sûr, la session reste
 * visible plutôt que d'être cachée dans un pli.
 *
 * Fonction pure (pas de dépendance React) → testable en isolation.
 * Le générique <T> évite d'importer le type de la page ; seul `status` est requis.
 */
export function partitionSessions<T extends { status: string }>(
  sessions: T[]
): { active: T[]; completed: T[]; cancelled: T[] } {
  const active: T[] = [];
  const completed: T[] = [];
  const cancelled: T[] = [];

  for (const session of sessions) {
    if (session.status === "completed") {
      completed.push(session);
    } else if (session.status === "cancelled") {
      cancelled.push(session);
    } else {
      active.push(session);
    }
  }

  return { active, completed, cancelled };
}
