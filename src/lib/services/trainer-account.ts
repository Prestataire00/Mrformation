import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTempPassword } from "@/lib/services/learner-account";
import { isSyntheticEmail } from "@/lib/utils/learner-email-synthetic";

/** Fiche formateur minimale nécessaire aux opérations de compte. */
export type TrainerAccountRow = {
  id: string;
  entity_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  profile_id: string | null;
};

function slugify(s: string): string {
  return (
    (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "formateur"
  );
}

/** Email synthétique non routable, identique au format historique de la batch route. */
export function buildTrainerSyntheticEmail(
  trainer: { id: string; first_name?: string | null; last_name?: string | null },
  entitySlug: string,
): string {
  const name = slugify(`${trainer.last_name ?? ""}-${trainer.first_name ?? ""}`);
  return `${name}.${trainer.id.slice(0, 8)}@trainer.${entitySlug}.local`;
}

export type EnsureTrainerAccountResult = {
  status: "created" | "skipped" | "error";
  email: string | null;
  password: string | null;
  syntheticEmailUsed: boolean;
  error: string | null;
};

/**
 * Crée le compte Supabase Auth d'un formateur (email réel sinon synthétique),
 * upsert son profil `trainer` et relie la fiche (`trainers.profile_id` + `email`).
 * Idempotent : si la fiche est déjà reliée → status 'skipped' sans rien recréer.
 * `usedEmails` permet de dédupliquer les emails réels au sein d'un batch.
 * Requiert un client service_role (appels `auth.admin.*`).
 */
export async function ensureTrainerAccount(
  admin: SupabaseClient,
  params: { trainer: TrainerAccountRow; entitySlug: string; usedEmails?: Set<string> },
): Promise<EnsureTrainerAccountResult> {
  const { trainer, entitySlug } = params;
  const usedEmails = params.usedEmails ?? new Set<string>();

  if (trainer.profile_id) {
    return { status: "skipped", email: trainer.email, password: null, syntheticEmailUsed: false, error: null };
  }

  const realEmail = (trainer.email ?? "").trim().toLowerCase();
  const hasUsableEmail =
    !!realEmail && realEmail.includes("@") && !realEmail.endsWith(".local") && !usedEmails.has(realEmail);
  let resolvedEmail = hasUsableEmail ? realEmail : buildTrainerSyntheticEmail(trainer, entitySlug);
  let syntheticUsed = !hasUsableEmail;

  const password = generateTempPassword();

  let { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: resolvedEmail,
    password,
    email_confirm: true,
    user_metadata: { first_name: trainer.first_name, last_name: trainer.last_name },
  });

  // Email déjà pris dans Auth → repli sur synthétique (une seule fois).
  if (authError && !syntheticUsed) {
    resolvedEmail = buildTrainerSyntheticEmail(trainer, entitySlug);
    syntheticUsed = true;
    ({ data: authUser, error: authError } = await admin.auth.admin.createUser({
      email: resolvedEmail,
      password,
      email_confirm: true,
      user_metadata: { first_name: trainer.first_name, last_name: trainer.last_name },
    }));
  }

  if (authError || !authUser?.user) {
    return {
      status: "error",
      email: resolvedEmail,
      password: null,
      syntheticEmailUsed: syntheticUsed,
      error: authError?.message ?? "Création auth échouée",
    };
  }

  usedEmails.add(resolvedEmail);

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: authUser.user.id,
      email: resolvedEmail,
      first_name: trainer.first_name,
      last_name: trainer.last_name,
      role: "trainer",
      entity_id: trainer.entity_id,
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (profileError) {
    return { status: "error", email: resolvedEmail, password: null, syntheticEmailUsed: syntheticUsed, error: `profil: ${profileError.message}` };
  }

  // Persiste aussi `temp_password` (miroir de learners.temp_password) pour que
  // le mot de passe affiché sur la convention formateur soit stable et
  // réutilisable sans jamais réinitialiser le login. Cf. add_trainer_temp_password.sql.
  const { error: linkError } = await admin
    .from("trainers")
    .update({ profile_id: authUser.user.id, email: resolvedEmail, temp_password: password })
    .eq("id", trainer.id)
    .eq("entity_id", trainer.entity_id);
  if (linkError) {
    return { status: "error", email: resolvedEmail, password: null, syntheticEmailUsed: syntheticUsed, error: `lien: ${linkError.message}` };
  }

  return { status: "created", email: resolvedEmail, password, syntheticEmailUsed: syntheticUsed, error: null };
}

export type ResetTrainerPasswordResult =
  | { ok: true; email: string | null; password: string }
  | { ok: false; error: string };

/** Régénère le mot de passe d'un formateur déjà relié. Renvoie le nouveau mot de passe (affiché une fois). */
export async function resetTrainerPassword(
  admin: SupabaseClient,
  params: { entityId: string; trainerId: string },
): Promise<ResetTrainerPasswordResult> {
  const { data: trainer } = await admin
    .from("trainers")
    .select("id, entity_id, email, profile_id")
    .eq("id", params.trainerId)
    .eq("entity_id", params.entityId)
    .single();

  if (!trainer) return { ok: false, error: "Formateur introuvable" };
  if (!trainer.profile_id) return { ok: false, error: "Ce formateur n'a pas de compte à réinitialiser" };

  const password = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(trainer.profile_id as string, { password });
  if (error) return { ok: false, error: error.message };

  // Garde `trainers.temp_password` synchro avec le password auth qu'on vient
  // de régénérer, pour que la convention affiche le mdp réellement actif. On
  // logue si la persistance échoue (le password auth, lui, EST déjà changé) —
  // sinon la prochaine convention afficherait un ancien mdp devenu invalide.
  const { error: persistError } = await admin
    .from("trainers")
    .update({ temp_password: password })
    .eq("id", params.trainerId)
    .eq("entity_id", params.entityId);
  if (persistError) {
    console.error(
      "[resetTrainerPassword] persistance trainers.temp_password échouée:",
      persistError.message,
    );
  }

  return { ok: true, email: (trainer.email as string | null), password };
}

/**
 * Résout les credentials formateur à afficher sur une convention (bloc
 * « Accès à votre espace formateur »), selon la logique idempotente de la spec
 * (spec-convention-formateur-bloc-acces.md, Design Notes / I/O Matrix) :
 *
 *  1. `temp_password` déjà présent → on l'utilise tel quel (stable, AUCUN reset).
 *  2. sinon, pas de `profile_id` → `ensureTrainerAccount` crée le compte et
 *     persiste `temp_password` ; on renvoie l'email + le mdp fraîchement généré.
 *  3. sinon (compte legacy sans `temp_password`) → PAS de reset (ne jamais
 *     casser le login d'un formateur actif) → renvoie `undefined`. Le template
 *     affiche alors URL + email + QR + une note « mot de passe oublié ».
 *
 * Non bloquant côté appelant : si la création de compte échoue, on renvoie
 * `undefined` et la convention se génère quand même (bloc sans mdp + note).
 *
 * Requiert un client service_role (`ensureTrainerAccount` appelle `auth.admin.*`).
 */
export async function resolveTrainerCredentialsForConvention(
  admin: SupabaseClient,
  params: { trainer: TrainerAccountRow & { temp_password?: string | null }; entitySlug: string },
): Promise<{ email: string; password: string } | undefined> {
  const { trainer, entitySlug } = params;

  // Un login formateur = email RÉEL et routable. Sans email, ou avec un email
  // synthétique `.local` (fiche sans email connu), on n'affiche AUCUN credential :
  // un mot de passe sans email routable = login inutilisable + « mot de passe
  // oublié » qui part dans le vide. On évite aussi de créer un compte synthétique
  // orphelin pour un doc. → le template affiche alors email vide + note.
  if (!trainer.email || isSyntheticEmail(trainer.email)) return undefined;
  const email = trainer.email;

  // Cas 1 : mot de passe déjà persisté → stable, on ne touche à rien.
  if (trainer.temp_password) {
    return { email, password: trainer.temp_password };
  }

  // Cas 2 : pas encore de compte → on le crée + persiste (ensureTrainerAccount
  // écrit trainers.temp_password quand status === "created"). On n'affiche que si
  // un email réel a été utilisé (jamais un repli synthétique).
  if (!trainer.profile_id) {
    const r = await ensureTrainerAccount(admin, { trainer, entitySlug });
    if (r.status === "created" && r.password && r.email && !r.syntheticEmailUsed) {
      return { email: r.email, password: r.password };
    }
    return undefined;
  }

  // Cas 3 : compte legacy sans temp_password → pas de reset (login préservé).
  return undefined;
}

export type OrphanTrainerAccount = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

/**
 * Comptes formateur "orphelins" : profils `role = 'trainer'` de l'entité qui ne sont
 * reliés à aucune fiche `trainers`. Sert à proposer une liaison à un compte existant.
 */
export async function listOrphanTrainerAccounts(
  admin: SupabaseClient,
  entityId: string,
): Promise<OrphanTrainerAccount[]> {
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, first_name, last_name")
    .eq("role", "trainer")
    .eq("entity_id", entityId);

  const { data: linked } = await admin
    .from("trainers")
    .select("profile_id")
    .eq("entity_id", entityId)
    .not("profile_id", "is", null);

  const linkedIds = new Set(
    (linked ?? []).map((r) => r.profile_id).filter((id): id is string => id !== null),
  );
  return ((profiles ?? []) as OrphanTrainerAccount[]).filter((p) => !linkedIds.has(p.id));
}

export type LinkResult = { ok: true } | { ok: false; error: string };

/** Relie une fiche à un compte formateur orphelin de la MÊME entité (validation serveur). */
export async function linkTrainerToProfile(
  admin: SupabaseClient,
  params: { entityId: string; trainerId: string; profileId: string },
): Promise<LinkResult> {
  const orphans = await listOrphanTrainerAccounts(admin, params.entityId);
  if (!orphans.some((o) => o.id === params.profileId)) {
    return { ok: false, error: "Compte non éligible (doit être un compte formateur non relié de cette entité)" };
  }
  const { error } = await admin
    .from("trainers")
    .update({ profile_id: params.profileId })
    .eq("id", params.trainerId)
    .eq("entity_id", params.entityId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Délie une fiche de son compte (le compte auth subsiste → redevient orphelin, ré-liable). */
export async function unlinkTrainerProfile(
  admin: SupabaseClient,
  params: { entityId: string; trainerId: string },
): Promise<LinkResult> {
  const { error } = await admin
    .from("trainers")
    .update({ profile_id: null })
    .eq("id", params.trainerId)
    .eq("entity_id", params.entityId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
