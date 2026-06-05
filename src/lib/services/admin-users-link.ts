/**
 * Helpers de jointure pour `GET /api/admin/users`.
 *
 * Joint chaque profile Supabase Auth avec son enregistrement
 * `learners` / `trainers` correspondant via `profile_id`.
 *
 * Note (epic-2-5 aut-b-2) : on ne peut PAS joindre par email car les
 * apprenants créés sans email réel utilisent un email synthétique
 * `@learner.<entity-slug>.local` ≠ de l'email du profile Supabase Auth.
 * Toute jointure email-based briserait ces apprenants.
 */

export type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  avatar_url: string | null;
  created_at: string | null;
};

export type LinkedLearnerRow = {
  id: string;
  profile_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
};

export type LinkedTrainerRow = LinkedLearnerRow;

export type LinkedUser = ProfileRow & {
  source: "profile";
  linked_learner: LinkedLearnerRow | undefined;
  linked_trainer: LinkedTrainerRow | undefined;
};

export function linkProfilesWithLearnersAndTrainers(
  profiles: ProfileRow[],
  learners: LinkedLearnerRow[],
  trainers: LinkedTrainerRow[],
): LinkedUser[] {
  const learnerByProfileId = new Map<string, LinkedLearnerRow>();
  for (const l of learners) {
    if (l.profile_id) learnerByProfileId.set(l.profile_id, l);
  }
  const trainerByProfileId = new Map<string, LinkedTrainerRow>();
  for (const t of trainers) {
    if (t.profile_id) trainerByProfileId.set(t.profile_id, t);
  }

  return profiles.map((p) => ({
    ...p,
    source: "profile" as const,
    linked_learner: learnerByProfileId.get(p.id),
    linked_trainer: trainerByProfileId.get(p.id),
  }));
}
