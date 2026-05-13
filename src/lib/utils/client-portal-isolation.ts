import type { Enrollment, Learner } from "@/lib/types";

/**
 * Helpers d'isolation pour le portail client (Story 3.7 — NFR-SEC-2).
 *
 * Invariant : un utilisateur de rôle "client" rattaché à l'entreprise X ne doit voir,
 * dans le portail client, QUE les données liées à ses propres apprenants.
 *
 * Sur une formation INTER avec plusieurs entreprises (X, Y, Z), chaque entreprise
 * voit la formation MAIS uniquement avec SES apprenants (filtrage par learner.client_id).
 *
 * Ces helpers ne touchent pas à la DB — ils sont purs. La RLS Supabase reste la
 * première barrière. Ces helpers sont la défense en profondeur applicative.
 */

/**
 * Retourne les `learner.id` qui appartiennent au client courant.
 */
export function getLearnerIdsForClient(
  learners: Pick<Learner, "id" | "client_id">[] | null | undefined,
  clientId: string
): string[] {
  if (!learners || !clientId) return [];
  return learners
    .filter((l) => l.client_id === clientId)
    .map((l) => l.id);
}

/**
 * Filtre des enrollments en gardant uniquement ceux dont le `learner_id` appartient au client courant.
 * Défense en profondeur : même si une query Supabase oubliait un `.eq("client_id", ...)`,
 * ce helper bloque la fuite à l'étape suivante.
 */
export function filterEnrollmentsByLearnerIds(
  enrollments: Pick<Enrollment, "learner_id">[] | null | undefined,
  allowedLearnerIds: string[]
): Pick<Enrollment, "learner_id">[] {
  if (!enrollments || enrollments.length === 0) return [];
  if (allowedLearnerIds.length === 0) return [];
  const allowed = new Set(allowedLearnerIds);
  return enrollments.filter((e) => !!e.learner_id && allowed.has(e.learner_id));
}

/**
 * Compte les apprenants d'un client présents sur une session donnée.
 * En INTER avec partage de session entre clients : retourne uniquement le count du client courant.
 */
export function countClientLearnersOnSession(
  enrollments: Pick<Enrollment, "learner_id" | "session_id">[] | null | undefined,
  allowedLearnerIds: string[],
  sessionId: string
): number {
  if (!enrollments || !sessionId || allowedLearnerIds.length === 0) return 0;
  const allowed = new Set(allowedLearnerIds);
  return enrollments.filter(
    (e) => e.session_id === sessionId && !!e.learner_id && allowed.has(e.learner_id)
  ).length;
}
