import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { slugifyName } from "@/lib/utils/slugify-name";
import { buildSyntheticEmail, isSyntheticEmail } from "@/lib/utils/learner-email-synthetic";

/**
 * Génère un mot de passe temporaire alphanumeric 12 chars sans caractères
 * ambigus (pas de O/0/I/l/1) — facilite le copier-coller depuis le PDF
 * de convocation par l'apprenant. Garantit au moins 1 majuscule + 1
 * minuscule + 1 chiffre (sinon ~16% des tirages n'auraient pas eu de
 * digit pour 12 chars sur 56).
 */
export function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const required = [
    upper[crypto.randomInt(0, upper.length)],
    lower[crypto.randomInt(0, lower.length)],
    digits[crypto.randomInt(0, digits.length)],
  ];
  const rest = Array.from(
    { length: 9 },
    () => all[crypto.randomInt(0, all.length)],
  );
  // Mélange Fisher-Yates avec crypto.randomInt pour garantir un shuffle
  // non biaisé (et non-flaky : `Math.random()` interdit côté Workflow,
  // crypto.randomInt OK ici).
  const out = [...required, ...rest];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
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
 * Gère les apprenants SANS email réel : un email synthétique non-routable
 * (`<username>@learner.<slug>.local`) est généré pour satisfaire la contrainte
 * d'unicité de Supabase Auth ; l'apprenant se connecte alors par identifiant
 * (username) + mot de passe (résolu via /api/auth/resolve-username au login).
 * Retourne null uniquement en cas d'échec dur (apprenant introuvable / createUser KO).
 */
export async function ensureLearnerAccount(
  supabase: SupabaseClient,
  learnerId: string,
): Promise<LearnerCredentials | null> {
  const { data: learner } = await supabase
    .from("learners")
    .select("id, email, username, first_name, last_name, profile_id, temp_password, entity_id")
    .eq("id", learnerId)
    .single();

  if (!learner) return null;

  // Idempotent : si compte ET password déjà setup → réutiliser tel quel.
  // Cohérence : toutes les convocations futures du même apprenant montrent
  // le même password (sinon l'apprenant aurait à mémoriser plusieurs).
  if (learner.profile_id && learner.temp_password) {
    return { email: (learner.email as string | null) ?? "", tempPassword: learner.temp_password };
  }

  // Résout l'email de connexion : réel si dispo, sinon SYNTHÉTIQUE pour les
  // apprenants sans email (ils se connectent par identifiant + mot de passe).
  const hasRealEmail = !!learner.email && !isSyntheticEmail(learner.email);
  let resolvedEmail: string;
  let syntheticEmailUsed = false;
  if (hasRealEmail) {
    resolvedEmail = (learner.email as string).trim().toLowerCase();
  } else {
    const { data: entityRow } = await supabase
      .from("entities")
      .select("slug")
      .eq("id", learner.entity_id)
      .single();
    const entitySlug = (entityRow?.slug as string) ?? "mr-formation";
    const username = (learner.username as string) || `apprenant-${learnerId.slice(0, 8)}`;
    resolvedEmail = buildSyntheticEmail(username, entitySlug);
    syntheticEmailUsed = true;
  }

  const password = generateTempPassword();
  let authUserId = learner.profile_id as string | null;

  if (!authUserId) {
    // Cas 1 : apprenant sans profile_id. Check si un auth user existe
    // déjà avec cet email (créé hors flow ou par un précédent run partiel).
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === resolvedEmail.toLowerCase(),
    );

    if (existingUser) {
      authUserId = existingUser.id;
      // Override son password (l'apprenant utilisera celui-ci désormais)
      await supabase.auth.admin.updateUserById(authUserId, { password });
    } else {
      // Créer un nouveau auth user avec le password
      const { data: newUser, error } = await supabase.auth.admin.createUser({
        email: resolvedEmail,
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
      email: resolvedEmail,
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

  // Persiste profile_id + temp_password (+ email synthétique si généré) sur learners.
  const learnerUpdate: Record<string, unknown> = {
    profile_id: authUserId,
    temp_password: password,
    password_must_change: true,
  };
  if (syntheticEmailUsed) {
    learnerUpdate.email = resolvedEmail;
    learnerUpdate.synthetic_email_used = true;
  }
  await supabase.from("learners").update(learnerUpdate).eq("id", learnerId);

  return { email: resolvedEmail, tempPassword: password };
}

// ============================================================================
// Pédagogie V2 Epic 2.5 — Création apprenant + credentials sans persistance
// ============================================================================

export type CreateLearnerInput = {
  entityId: string;
  /** Slug entity pour fabriquer un email synthétique si pas d'email réel. */
  entitySlug: string;
  firstName: string;
  lastName: string;
  /** Email réel optionnel. Si absent : email synthétique de domaine .local. */
  email?: string | null;
  /** Optionnel : lien direct vers une entreprise cliente (bulk via fiche session). */
  clientId?: string | null;
};

export type CreateLearnerResult = {
  learnerId: string;
  username: string;
  email: string;
  tempPassword: string;
  syntheticEmailUsed: boolean;
};

/**
 * Crée un apprenant + son compte Supabase Auth + un mot de passe temporaire.
 *
 * Différences avec `ensureLearnerAccount` :
 *  - Crée la ligne `learners` (alors qu'`ensureLearnerAccount` la suppose existante)
 *  - Accepte un apprenant SANS email (synthèse `<username>@learner.<slug>.local`)
 *  - NE PERSISTE PAS `temp_password` en DB (réduction dette RGPD) — le password
 *    n'est retourné que dans la réponse de cette fonction. Si l'admin perd le PDF,
 *    il doit utiliser la route /regenerate-credentials qui regen un nouveau.
 *  - Marque `password_must_change = true` (middleware Epic 2.5 v2 force la
 *    réinit à la 1re connexion).
 *
 * Le `username` est auto-généré par le trigger PG `tg_learners_autogen_username`
 * à partir de first_name/last_name. En cas de collision UNIQUE (23505) malgré
 * le trigger, retry avec suffix UUID court.
 *
 * @param supabase client service_role (bypass RLS, accès `auth.admin.*`)
 */
export async function createLearnerWithCredentials(
  supabase: SupabaseClient,
  input: CreateLearnerInput,
): Promise<CreateLearnerResult> {
  // 1. Préparer email (réel ou synthétique) + flag.
  const usernameCandidate = `${slugifyName(input.firstName)}.${slugifyName(input.lastName)}`.substring(0, 50);
  const realEmail = input.email?.trim() || null;
  const syntheticEmailUsed = !realEmail;
  const emailToUse = realEmail ?? buildSyntheticEmail(usernameCandidate, input.entitySlug);

  // 2. INSERT learners (le trigger PG va auto-générer username, retourne la valeur finale).
  //    Pas de `username` explicite : on laisse le trigger le générer (collision -N gérée).
  const insertPayload: Record<string, unknown> = {
    entity_id: input.entityId,
    first_name: input.firstName,
    last_name: input.lastName,
    email: emailToUse,
    synthetic_email_used: syntheticEmailUsed,
    password_must_change: true,
  };
  if (input.clientId) insertPayload.client_id = input.clientId;

  let learnerRow: { id: string; username: string } | null = null;
  let lastError: unknown = null;
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from("learners")
      .insert(insertPayload)
      .select("id, username")
      .single();
    if (!error && data) {
      learnerRow = data as { id: string; username: string };
      break;
    }
    lastError = error;
    // Collision UNIQUE (code postgres 23505) sur username → on insiste, le trigger
    // va incrémenter le suffix. Si vraiment bloqué après MAX_RETRIES, on injecte
    // un username explicite avec suffix UUID.
    if ((error as { code?: string } | null)?.code === "23505" && attempt < MAX_RETRIES - 1) {
      continue;
    }
    if (attempt === MAX_RETRIES - 1) {
      const uuidSuffix = crypto.randomUUID().slice(0, 4);
      insertPayload.username = `${usernameCandidate}-${uuidSuffix}`.substring(0, 50);
    }
  }
  if (!learnerRow) {
    throw new Error(`createLearnerWithCredentials: insert learner failed after ${MAX_RETRIES} retries (${String(lastError)})`);
  }

  // 3. Générer temp_password (NE PAS le persister).
  const tempPassword = generateTempPassword();

  // 4. Créer compte Supabase Auth.
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: emailToUse,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      first_name: input.firstName,
      last_name: input.lastName,
      role: "learner",
      password_must_change: true,
    },
  });
  if (authErr || !authUser.user) {
    // Rollback applicatif : delete la learner row qu'on vient d'insérer.
    await supabase.from("learners").delete().eq("id", learnerRow.id);
    throw new Error(`createLearnerWithCredentials: auth.admin.createUser failed (${authErr?.message ?? "unknown"})`);
  }
  const authUserId = authUser.user.id;

  // 5. Upsert profile.
  await supabase.from("profiles").upsert({
    id: authUserId,
    first_name: input.firstName,
    last_name: input.lastName,
    role: "learner",
    entity_id: input.entityId,
  });

  // 6. Link learners.profile_id (sans persister temp_password).
  await supabase
    .from("learners")
    .update({ profile_id: authUserId })
    .eq("id", learnerRow.id);

  return {
    learnerId: learnerRow.id,
    username: learnerRow.username,
    email: emailToUse,
    tempPassword,
    syntheticEmailUsed,
  };
}

