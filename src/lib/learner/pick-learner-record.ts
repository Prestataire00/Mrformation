/**
 * Choisit LA fiche `learners` à utiliser pour les pages apprenant qui résolvent
 * l'apprenant courant depuis `auth.uid()` (= `profile_id`).
 *
 * Problème : `profile_id` n'est PAS unique sur `learners`. Un même compte auth
 * peut porter PLUSIEURS fiches apprenant — cas « apprenant sans email » : des
 * apprenants importés sans adresse individuelle sont rattachés à un compte
 * partagé (ex. un organisme avec 10 fiches « Apprenant N » sur un seul login).
 * `.single()` ET `.maybeSingle()` lèvent alors une erreur (≥ 2 lignes) → page
 * vide / cassée pour ces comptes.
 *
 * Régression-safe : avec UNE seule fiche (cas courant) renvoie cette fiche quoi
 * qu'il arrive — strictement équivalent à l'ancien `.single()/.maybeSingle()`.
 * Avec plusieurs fiches, choix DÉTERMINISTE (plus petit `id`) pour une vue
 * cohérente d'une page à l'autre. On ne fait PAS d'union (ne pas mélanger les
 * données de plusieurs personnes derrière un compte partagé).
 *
 * NB : le vrai correctif du compte partagé est l'attribution d'un compte par
 * apprenant (P0 « auth apprenant sans email ») ; ce picker évite seulement que
 * le code casse en attendant.
 */
export function pickLearnerRecord<T extends { id: string }>(
  rows: T[] | null | undefined,
): T | null {
  const list = rows ?? [];
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  return [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}
