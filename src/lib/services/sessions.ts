import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueEmail } from "@/lib/services/email-queue";

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
 * Résout le prix catalogue d'une formation pour une entité donnée.
 * Retourne `trainings.price_per_person` si disponible et non null, sinon `null`.
 * Erreurs Supabase (RLS, ID invalide) silencieuses — le caller gère le fallback.
 *
 * Utilisé par POST /api/sessions pour auto-remplir `total_price` lorsque `training_id`
 * est fourni mais que `price` ne l'est pas (cf. Story 2.1).
 */
export async function resolveCatalogPrice(
  supabase: SupabaseClient,
  trainingId: string,
  entityId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("trainings")
    .select("price_per_person")
    .eq("id", trainingId)
    .eq("entity_id", entityId)
    .single();

  if (error || !data) return null;

  const value = (data as { price_per_person: number | null }).price_per_person;
  return typeof value === "number" ? value : null;
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

/**
 * UPDATE atomique d'un ou plusieurs champs d'une session.
 * Filtre par id ET entity_id (défense en profondeur, AR20).
 *
 * Utilisé par les sous-composants Résumé pour éditer description/location/manager/visio_link.
 * Renvoie ServiceResult pour que le caller affiche error.message dans le toast.
 */
export async function updateSessionField(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
  patch: Record<string, unknown>,
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("sessions")
    .update(patch)
    .eq("id", sessionId)
    .eq("entity_id", entityId);
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true };
}

/**
 * Duplique une session : copie 14 champs métier, suffixe ` (copie)` au titre,
 * status = "upcoming". Refuse si la session source n'appartient pas à entityId.
 * Renvoie l'id de la nouvelle session pour redirection.
 */
export async function duplicateSession(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult<{ newId: string }>> {
  const { data: src, error: readErr } = await supabase
    .from("sessions")
    .select(
      "training_id, entity_id, title, start_date, end_date, location, mode, max_participants, notes, type, domain, description, total_price, planned_hours, program_id",
    )
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .single();
  if (readErr || !src) {
    return { ok: false, error: { message: readErr?.message ?? "Session introuvable" } };
  }

  const payload = { ...src, title: `${src.title} (copie)`, status: "upcoming" };
  const { data, error } = await supabase
    .from("sessions")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: { message: error?.message ?? "Échec duplication" } };
  }
  return { ok: true, newId: data.id };
}

/**
 * Supprime une session. PostgreSQL gère le cleanup automatique selon les FKs :
 *   ON DELETE CASCADE → row supprimée :
 *     formation_trainers, formation_companies, formation_financiers,
 *     formation_comments, formation_time_slots, enrollments, formation_documents,
 *     qualiopi_snapshots, formation_invoices, formation_invoice_lines,
 *     formation_evaluation/satisfaction/elearning_assignments
 *   ON DELETE SET NULL → row conservée, session_id passé à NULL :
 *     signatures, documents, email_history,
 *     qualiopi_mock_audits, qualiopi_proof_checks, questionnaire_responses,
 *     generated_documents
 *
 * Le comportement SET NULL est intentionnel (préserve historique). Identique
 * au comportement du code avant cette refacto (qui ne supprimait pas non plus
 * ces tables) — pas de régression, juste atomicité gagnée.
 */
export async function deleteSession(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .eq("entity_id", entityId);
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true };
}

/**
 * Envoie le lien visio à tous les apprenants inscrits (registered/confirmed)
 * d'une session via la queue email (asynchrone, retry inclus).
 *
 * Retourne { enqueued, skipped } : enqueued = emails ajoutés à email_history,
 * skipped = learners sans email ou échec d'enqueue.
 *
 * Pré-conditions :
 *  - La session existe et appartient à entityId (défense en profondeur)
 *  - La session a un visio_link non vide
 */
export async function sendVisioLinkToLearners(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<ServiceResult<{ enqueued: number; skipped: number }>> {
  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .select("id, title, start_date, end_date, location, visio_link, entity_id")
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .single();
  if (sessErr || !session) {
    return { ok: false, error: { message: sessErr?.message ?? "Session introuvable" } };
  }
  if (!session.visio_link) {
    return { ok: false, error: { message: "Aucun lien visio configuré pour cette formation" } };
  }

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("learner:learners!enrollments_learner_id_fkey(id, email, first_name, last_name)")
    .eq("session_id", sessionId)
    .in("status", ["registered", "confirmed"]);

  let enqueued = 0;
  let skipped = 0;

  for (const e of enrollments ?? []) {
    const l = e.learner as unknown as {
      id: string;
      email: string | null;
      first_name: string;
      last_name: string;
    } | null;
    if (!l?.email) {
      skipped++;
      continue;
    }

    const subject = `Lien visio — ${session.title}`;
    const body = `Bonjour ${l.first_name},

Voici le lien pour rejoindre la formation "${session.title}" en visio :

${session.visio_link}

Dates : du ${session.start_date} au ${session.end_date}${session.location ? `
Lieu : ${session.location}` : ""}

À bientôt,
L'équipe de formation`;

    try {
      await enqueueEmail(supabase, {
        to: l.email,
        subject,
        body,
        entity_id: entityId,
        session_id: sessionId,
        recipient_type: "learner",
        recipient_id: l.id,
      });
      enqueued++;
    } catch {
      skipped++;
    }
  }

  return { ok: true, enqueued, skipped };
}
