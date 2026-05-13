import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

/**
 * Retourne les session_ids liés à un client via formation_companies.
 * Source canonique unique de la liaison session ↔ entreprise (cf. Story 1.1).
 */
export async function getSessionIdsByClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<ServiceResult<{ sessionIds: string[] }>> {
  const { data, error } = await supabase
    .from("formation_companies")
    .select("session_id")
    .eq("client_id", clientId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }

  const sessionIds = (data ?? []).map((r: { session_id: string }) => r.session_id);
  return { ok: true, sessionIds };
}

export type LinkSessionToCompanyInput = {
  sessionId: string;
  clientId: string;
  amount?: number | null;
};

/**
 * Lie (ou met à jour) une session à une entreprise via formation_companies.
 * Upsert sur la clé (session_id, client_id) : idempotent.
 */
export async function linkSessionToCompany(
  supabase: SupabaseClient,
  input: LinkSessionToCompanyInput
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("formation_companies")
    .upsert(
      {
        session_id: input.sessionId,
        client_id: input.clientId,
        amount: input.amount ?? null,
      },
      { onConflict: "session_id,client_id" }
    );

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true };
}

export type CreateSessionInput = {
  sessionData: Record<string, unknown>;
  clientId: string | null | undefined;
};

export type SessionRow = {
  id: string;
  [key: string]: unknown;
};

/**
 * Crée une session et, optionnellement, sa liaison formation_companies (atomicité applicative).
 * Si la liaison échoue, la session est supprimée (rollback applicatif).
 * Le champ `client_id` ne doit JAMAIS apparaître dans sessionData (Story 1.1 — colonne legacy).
 */
export async function createSessionWithOptionalCompany(
  supabase: SupabaseClient,
  input: CreateSessionInput
): Promise<ServiceResult<{ session: SessionRow }>> {
  const { data: session, error: insertError } = await supabase
    .from("sessions")
    .insert(input.sessionData)
    .select()
    .single();

  if (insertError || !session) {
    return {
      ok: false,
      error: {
        message: insertError?.message ?? "Failed to create session",
        code: insertError?.code,
      },
    };
  }

  if (input.clientId) {
    const amount = typeof input.sessionData.price === "number" ? input.sessionData.price : null;
    const { error: fcError } = await supabase
      .from("formation_companies")
      .insert({
        session_id: session.id,
        client_id: input.clientId,
        amount,
      });

    if (fcError) {
      const { error: rollbackError } = await supabase
        .from("sessions")
        .delete()
        .eq("id", session.id);
      if (rollbackError) {
        console.error("[sessions] rollback delete failed", {
          sessionId: session.id,
          error: rollbackError,
        });
      }
      return {
        ok: false,
        error: { message: fcError.message, code: fcError.code },
      };
    }
  }

  return { ok: true, session };
}

/**
 * Met à jour une session avec les champs fournis. Helper minimal pour respecter AR20
 * (toute logique Supabase passe par src/lib/services/).
 *
 * Le champ `client_id` ne doit JAMAIS apparaître dans `updates` (Story 1.1 — colonne legacy).
 * Pour mettre à jour la liaison entreprise, utiliser `linkSessionToCompany`.
 */
export async function updateSession(
  supabase: SupabaseClient,
  sessionId: string,
  updates: Record<string, unknown>
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("sessions")
    .update(updates)
    .eq("id", sessionId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true };
}
