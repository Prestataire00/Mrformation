import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

export type EnrollLearnerInput = {
  sessionId: string;
  learnerId: string;
  clientId: string | null;
  status?: string;
};

/**
 * Inscrit un apprenant existant à une session.
 * Le `client_id` rattache l'apprenant à une entreprise dans le contexte de cette session.
 * En INTRA mono-entreprise : peut être l'unique client_id de la session.
 * En INTER multi-entreprises : doit être l'une des entreprises rattachées (Story 3.3).
 * Si la session n'a pas encore d'entreprise rattachée : clientId doit être null
 * (mais l'UI doit normalement bloquer ce cas — cf. Story 3.3).
 */
export async function enrollLearner(
  supabase: SupabaseClient,
  input: EnrollLearnerInput
): Promise<ServiceResult<Record<never, never>>> {
  // never-throw : une coupure réseau fait rejeter l'await Supabase. Sans ce
  // try/catch, l'exception remontait au handler UI (souvent sans try/catch) et
  // figeait le bouton (spinner bloqué, aucun toast). On renvoie toujours un
  // ServiceResult exploitable.
  try {
    const { error } = await supabase
      .from("enrollments")
      .insert({
        session_id: input.sessionId,
        learner_id: input.learnerId,
        client_id: input.clientId,
        status: input.status ?? "registered",
      });

    if (error) {
      return { ok: false, error: { message: error.message, code: error.code } };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: { message: err instanceof Error ? err.message : "Erreur réseau lors de l'inscription" },
    };
  }
}

export type CreateLearnerAndEnrollInput = {
  firstName: string;
  lastName: string;
  email: string | null;
  entityId: string;
  sessionId: string;
  clientId: string | null;
};

export type LearnerRow = {
  id: string;
  [key: string]: unknown;
};

/**
 * Crée un nouvel apprenant ET l'inscrit à une session, en atomicité applicative.
 * Si l'enrollment échoue, le learner créé est supprimé (rollback applicatif), à la manière
 * de `createSessionWithOptionalCompany` dans `sessions.ts`.
 */
export async function createLearnerAndEnroll(
  supabase: SupabaseClient,
  input: CreateLearnerAndEnrollInput
): Promise<ServiceResult<{ learner: LearnerRow }>> {
  // never-throw (cf. enrollLearner) : protège le handler UI du gel sur coupure
  // réseau. Le rollback applicatif (enroll échoué → suppression du learner)
  // reste géré pour le cas d'erreur RENVOYÉE par Supabase.
  try {
    const { data: learner, error: createError } = await supabase
      .from("learners")
      .insert({
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        entity_id: input.entityId,
      })
      .select()
      .single();

    if (createError || !learner) {
      return {
        ok: false,
        error: {
          message: createError?.message ?? "Failed to create learner",
          code: createError?.code,
        },
      };
    }

    const { error: enrollError } = await supabase
      .from("enrollments")
      .insert({
        session_id: input.sessionId,
        learner_id: learner.id,
        client_id: input.clientId,
        status: "registered",
      });

    if (enrollError) {
      const { error: rollbackError } = await supabase
        .from("learners")
        .delete()
        .eq("id", learner.id);
      if (rollbackError) {
        console.error("[enrollments] rollback delete learner failed", {
          learnerId: learner.id,
          error: rollbackError,
        });
      }
      return {
        ok: false,
        error: { message: enrollError.message, code: enrollError.code },
      };
    }

    return { ok: true, learner };
  } catch (err) {
    return {
      ok: false,
      error: { message: err instanceof Error ? err.message : "Erreur réseau lors de la création/inscription" },
    };
  }
}

/**
 * Retire un enrollment d'une session. Filtre par sessionId en défense en profondeur.
 */
export async function removeEnrollment(
  supabase: SupabaseClient,
  enrollmentId: string,
  sessionId: string
): Promise<ServiceResult<Record<never, never>>> {
  // never-throw (cf. enrollLearner).
  try {
    const { error } = await supabase
      .from("enrollments")
      .delete()
      .eq("id", enrollmentId)
      .eq("session_id", sessionId);

    if (error) {
      return { ok: false, error: { message: error.message, code: error.code } };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: { message: err instanceof Error ? err.message : "Erreur réseau lors du retrait" },
    };
  }
}
