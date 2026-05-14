import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/logger";

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
      logEvent("rollback_delete_failed", {
        table: "learners",
        learner_id: learner.id,
        error: rollbackError.message,
      });
    }
    return {
      ok: false,
      error: { message: enrollError.message, code: enrollError.code },
    };
  }

  return { ok: true, learner };
}

export type EnrollLearnersBulkInput = {
  sessionId: string;
  clientId: string;
  learnerIds: string[];
  status?: string;
};

/**
 * Inscrit en lot plusieurs apprenants existants à une session, tous rattachés
 * à la même entreprise (`clientId`). Effectue un seul insert.
 * Si `learnerIds` est vide, retourne `ok` avec `count` 0 sans toucher la base.
 */
export async function enrollLearnersBulk(
  supabase: SupabaseClient,
  input: EnrollLearnersBulkInput
): Promise<ServiceResult<{ count: number }>> {
  if (input.learnerIds.length === 0) {
    return { ok: true, count: 0 };
  }

  const status = input.status ?? "registered";
  const { error } = await supabase.from("enrollments").insert(
    input.learnerIds.map((learnerId) => ({
      session_id: input.sessionId,
      learner_id: learnerId,
      client_id: input.clientId,
      status,
    }))
  );

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true, count: input.learnerIds.length };
}

/**
 * Retire un enrollment d'une session. Filtre par sessionId en défense en profondeur.
 */
export async function removeEnrollment(
  supabase: SupabaseClient,
  enrollmentId: string,
  sessionId: string
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("enrollments")
    .delete()
    .eq("id", enrollmentId)
    .eq("session_id", sessionId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true };
}
