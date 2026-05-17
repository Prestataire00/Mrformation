import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";

/**
 * Génère un mot de passe temporaire alphanumeric 12 chars sans caractères
 * ambigus (pas de O/0/I/l/1) — facilite le copier-coller depuis le PDF
 * de convocation par l'apprenant.
 */
export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length: 12 }, () => chars[crypto.randomInt(0, chars.length)]).join("");
}

export type LearnerCredentials = {
  email: string;
  tempPassword: string;
};

/**
 * Crée ou récupère le compte Supabase Auth d'un apprenant + son mot de
 * passe temporaire (stocké en clair dans learners.temp_password).
 *
 * Idempotent : si déjà créé, retourne le password existant pour cohérence
 * entre toutes les convocations futures du même apprenant.
 *
 * Requis : le `supabase` passé doit être un service role client (pour les
 * appels `auth.admin.*`). Voir le pattern inline dans la route appelante.
 *
 * Retourne null si l'apprenant n'a pas d'email (skip silencieux, l'admin
 * doit ajouter l'email avant de pouvoir générer une convocation).
 */
export async function ensureLearnerAccount(
  supabase: SupabaseClient,
  learnerId: string,
): Promise<LearnerCredentials | null> {
  const { data: learner } = await supabase
    .from("learners")
    .select("id, email, first_name, last_name, profile_id, temp_password, entity_id")
    .eq("id", learnerId)
    .single();

  if (!learner?.email) return null;

  // Idempotent : si compte ET password déjà setup → réutiliser tel quel.
  // Cohérence : toutes les convocations futures du même apprenant montrent
  // le même password (sinon l'apprenant aurait à mémoriser plusieurs).
  if (learner.profile_id && learner.temp_password) {
    return { email: learner.email, tempPassword: learner.temp_password };
  }

  const password = generateTempPassword();
  let authUserId = learner.profile_id;

  if (!authUserId) {
    // Cas 1 : apprenant sans profile_id. Check si un auth user existe
    // déjà avec cet email (créé hors flow ou par un précédent run partiel).
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === learner.email.toLowerCase(),
    );

    if (existingUser) {
      authUserId = existingUser.id;
      // Override son password (l'apprenant utilisera celui-ci désormais)
      await supabase.auth.admin.updateUserById(authUserId, { password });
    } else {
      // Créer un nouveau auth user avec le password
      const { data: newUser, error } = await supabase.auth.admin.createUser({
        email: learner.email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: learner.first_name,
          last_name: learner.last_name,
          role: "learner",
        },
      });
      if (error || !newUser.user) {
        console.error("[learner-account] createUser failed:", error);
        return null;
      }
      authUserId = newUser.user.id;
    }

    // Upsert le profile (le trigger Supabase peut l'avoir déjà créé via createUser).
    await supabase.from("profiles").upsert({
      id: authUserId,
      first_name: learner.first_name,
      last_name: learner.last_name,
      role: "learner",
      entity_id: learner.entity_id,
    });
  } else {
    // Cas 2 : profile_id existant mais pas de temp_password (apprenant
    // créé via l'ancien flow magic link avant ce fix). Just regénérer
    // un password et l'updater côté Supabase.
    await supabase.auth.admin.updateUserById(authUserId, { password });
  }

  // Persiste profile_id + temp_password en clair sur learners
  await supabase
    .from("learners")
    .update({ profile_id: authUserId, temp_password: password })
    .eq("id", learnerId);

  return { email: learner.email, tempPassword: password };
}
