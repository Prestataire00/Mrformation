/**
 * Service de queue email — wrapper autour de email_history.
 *
 * Pattern : au lieu d'envoyer un email synchronously et bloquer la request
 * (latence + risque timeout), on l'enqueue en `status='pending'`. Le cron
 * Netlify (process-scheduled-emails.mts → /api/emails/process-scheduled)
 * vide la queue toutes les 5 minutes par batch avec retry exponential backoff.
 *
 * Usage :
 *   import { enqueueEmail } from "@/lib/services/email-queue";
 *   await enqueueEmail(supabase, {
 *     to: "user@example.com",
 *     subject: "Bienvenue",
 *     body: "...",
 *     entity_id: profile.entity_id,
 *     scheduled_for: new Date(Date.now() + 24 * 3600 * 1000), // optionnel
 *   });
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface EnqueueEmailPayload {
  to: string;
  subject: string;
  body: string;
  entity_id: string;
  template_id?: string | null;
  trainer_id?: string | null;
  session_id?: string | null;
  recipient_type?: "learner" | "trainer" | "client" | "financier" | "manager" | null;
  recipient_id?: string | null;
  sent_by?: string | null;
  /** Date d'envoi programmée. Si absent, envoyé au prochain run du cron. */
  scheduled_for?: Date | null;
  /** Nombre max de tentatives avant abandon. Défaut : 5. */
  max_retries?: number;
}

export interface EnqueueResult {
  id: string;
  scheduled_for: string | null;
}

/**
 * Enqueue un email. Retourne l'id de la ligne email_history créée.
 * Le cron Netlify se chargera de l'envoi (max 5 min de délai par défaut).
 *
 * Préfère cette fonction à un POST direct vers /api/emails/send pour :
 * - Les envois en lot (relances, automation, broadcast)
 * - Les envois programmés (J+1, J-3 avant session, etc.)
 * - Les envois où la latence n'est pas critique
 *
 * Garde POST /api/emails/send pour :
 * - Les envois user-triggered avec besoin de feedback immédiat
 * - Les envois Gmail OAuth (le cron ne gère que Resend)
 */
export async function enqueueEmail(
  supabase: SupabaseClient,
  payload: EnqueueEmailPayload
): Promise<EnqueueResult> {
  const recipient = payload.to.trim().toLowerCase();
  if (!recipient) throw new Error("enqueueEmail: 'to' est requis");
  if (!payload.subject?.trim()) throw new Error("enqueueEmail: 'subject' est requis");
  if (!payload.entity_id) throw new Error("enqueueEmail: 'entity_id' est requis");

  const scheduledFor = payload.scheduled_for ?? null;

  const { data, error } = await supabase
    .from("email_history")
    .insert({
      entity_id: payload.entity_id,
      template_id: payload.template_id ?? null,
      recipient_email: recipient,
      subject: payload.subject.trim(),
      body: payload.body || "",
      status: "pending",
      sent_at: scheduledFor ? scheduledFor.toISOString() : new Date().toISOString(),
      scheduled_for: scheduledFor ? scheduledFor.toISOString() : null,
      sent_by: payload.sent_by ?? null,
      trainer_id: payload.trainer_id ?? null,
      session_id: payload.session_id ?? null,
      recipient_type: payload.recipient_type ?? null,
      recipient_id: payload.recipient_id ?? null,
      retry_count: 0,
      max_retries: payload.max_retries ?? 5,
    })
    .select("id, scheduled_for")
    .single();

  if (error) {
    throw new Error(`enqueueEmail failed: ${error.message}`);
  }

  return { id: data.id, scheduled_for: data.scheduled_for };
}

/**
 * Enqueue plusieurs emails en bulk insert (1 seule requête DB).
 * Beaucoup plus rapide que d'appeler enqueueEmail() N fois.
 *
 * Usage typique : envois de relances à toute une cohorte d'apprenants.
 */
export async function enqueueEmails(
  supabase: SupabaseClient,
  payloads: EnqueueEmailPayload[]
): Promise<{ inserted: number }> {
  if (payloads.length === 0) return { inserted: 0 };

  const rows = payloads.map((p) => {
    const recipient = p.to.trim().toLowerCase();
    if (!recipient) throw new Error("enqueueEmails: 'to' requis sur chaque payload");
    if (!p.subject?.trim()) throw new Error("enqueueEmails: 'subject' requis sur chaque payload");
    if (!p.entity_id) throw new Error("enqueueEmails: 'entity_id' requis sur chaque payload");

    const scheduledFor = p.scheduled_for ?? null;
    return {
      entity_id: p.entity_id,
      template_id: p.template_id ?? null,
      recipient_email: recipient,
      subject: p.subject.trim(),
      body: p.body || "",
      status: "pending" as const,
      sent_at: scheduledFor ? scheduledFor.toISOString() : new Date().toISOString(),
      scheduled_for: scheduledFor ? scheduledFor.toISOString() : null,
      sent_by: p.sent_by ?? null,
      trainer_id: p.trainer_id ?? null,
      session_id: p.session_id ?? null,
      recipient_type: p.recipient_type ?? null,
      recipient_id: p.recipient_id ?? null,
      retry_count: 0,
      max_retries: p.max_retries ?? 5,
    };
  });

  const { error, count } = await supabase
    .from("email_history")
    .insert(rows, { count: "exact" });

  if (error) {
    throw new Error(`enqueueEmails failed: ${error.message}`);
  }

  return { inserted: count ?? rows.length };
}

/**
 * Calcule le prochain délai de retry selon une stratégie exponential backoff :
 *   1ère tentative : immédiat
 *   2ème : +1 min
 *   3ème : +5 min
 *   4ème : +30 min
 *   5ème : +2 h
 *   6ème : +12 h
 *   au-delà : status passe à 'failed_permanent'
 */
export function computeNextRetryAt(retryCount: number): Date | null {
  const backoffMinutes = [1, 5, 30, 120, 720]; // 1m, 5m, 30m, 2h, 12h
  if (retryCount >= backoffMinutes.length) return null;
  const minutes = backoffMinutes[retryCount];
  return new Date(Date.now() + minutes * 60 * 1000);
}
