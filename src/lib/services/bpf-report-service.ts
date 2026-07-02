// ─── BPF Report Service ────────────────────────────────────
// Supabase queries to fetch all data needed for BPF report calculation.

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Raw data types returned by fetchBPFData ───────────────

export interface BPFInvoice {
  id: string;
  amount: number;
  funding_type: string | null;
  invoice_date: string;
  invoice_date_confirmed: boolean;
  is_avoir: boolean;
  status: string;
  parent_invoice_id: string | null;
  external_reference: string | null;
  recipient_name: string | null;
  session_id: string | null;
}

export interface BPFEnrollment {
  id: string;
  bpf_trainee_type: string | null;
  status: string;
  session_id: string;
  learner_id: string;
}

export interface BPFSignature {
  id: string;
  session_id: string;
  signer_id: string;
  signer_type: string;
  time_slot_id: string | null;
  signed_at: string;
}

export interface BPFTimeSlot {
  id: string;
  session_id: string;
  start_time: string;
  end_time: string;
}

export interface BPFTraining {
  id: string;
  title: string;
  bpf_objective: string | null;
}

export interface BPFTrainerNested {
  id: string;
  is_external: boolean;
  hourly_rate: number | null;
  first_name: string | null;
  last_name: string | null;
}

export interface BPFFormationTrainer {
  id: string;
  session_id: string;
  trainer_id: string;
  hourly_rate: number | null;
  agreed_cost_ht: number | null;
  trainers: BPFTrainerNested | BPFTrainerNested[] | null;
}

export interface BPFSession {
  id: string;
  title: string;
  training_id: string | null;
  start_date: string | null;
  end_date: string | null;
  computed_hours: number | null;
  is_subcontracted_to_other_of: boolean;
  entity_id: string;
}

export interface BPFRawData {
  invoices: BPFInvoice[];
  enrollments: BPFEnrollment[];
  signatures: BPFSignature[];
  timeSlots: BPFTimeSlot[];
  trainings: BPFTraining[];
  formationTrainers: BPFFormationTrainer[];
  sessions: BPFSession[];
}

/**
 * Fetch all data needed for BPF report calculation.
 *
 * CANCELLATION SEMANTICS (documented per cadrage-module-bpf.md §4):
 * - Cadre C: formation_invoices.status = 'cancelled' → invoice annulée comptablement
 *   (different from avoir: avoir has is_avoir=true and negative amount)
 * - Cadre F: enrollments.status = 'cancelled' → inscription annulée avant participation
 *   (0 hours signed by construction). An abandoned learner keeps registered/confirmed
 *   status and their signed hours COUNT in the BPF.
 *
 * @param supabase - Supabase client (authenticated)
 * @param entityId - Entity ID to filter by (multi-tenant isolation)
 * @param year - Civil year for the BPF report
 */
export async function fetchBPFData(
  supabase: SupabaseClient,
  entityId: string,
  year: number
): Promise<BPFRawData> {
  // 1. Fetch invoices for the year by invoice_date (exclude cancelled)
  const { data: invoices, error: invoicesErr } = await supabase
    .from("formation_invoices")
    .select(
      "id, amount, funding_type, invoice_date, invoice_date_confirmed, is_avoir, status, parent_invoice_id, external_reference, recipient_name, session_id"
    )
    .eq("entity_id", entityId)
    .gte("invoice_date", `${year}-01-01`)
    .lte("invoice_date", `${year}-12-31`)
    .neq("status", "cancelled");

  if (invoicesErr) throw invoicesErr;

  // 2. Fetch sessions for the entity
  const { data: sessions, error: sessionsErr } = await supabase
    .from("sessions")
    .select(
      "id, title, training_id, start_date, end_date, computed_hours, is_subcontracted_to_other_of, entity_id"
    )
    .eq("entity_id", entityId);

  if (sessionsErr) throw sessionsErr;

  const sessionIds = (sessions || []).map((s: BPFSession) => s.id);
  const safeSessionIds = sessionIds.length > 0 ? sessionIds : ["__none__"];

  // 3. Fetch enrollments for those sessions
  const { data: enrollments, error: enrollmentsErr } = await supabase
    .from("enrollments")
    .select("id, session_id, learner_id, status, bpf_trainee_type")
    .in("session_id", safeSessionIds);

  if (enrollmentsErr) throw enrollmentsErr;

  // 4. Fetch learner signatures for those sessions
  const { data: signatures, error: signaturesErr } = await supabase
    .from("signatures")
    .select("id, session_id, signer_id, signer_type, time_slot_id, signed_at")
    .in("session_id", safeSessionIds)
    .eq("signer_type", "learner");

  if (signaturesErr) throw signaturesErr;

  // 5. Fetch time slots for those sessions
  const { data: timeSlots, error: timeSlotsErr } = await supabase
    .from("formation_time_slots")
    .select("id, session_id, start_time, end_time")
    .in("session_id", safeSessionIds);

  if (timeSlotsErr) throw timeSlotsErr;

  // 6. Fetch trainings referenced by sessions
  const trainingIds = [
    ...new Set(
      (sessions || [])
        .map((s: BPFSession) => s.training_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const safeTrainingIds = trainingIds.length > 0 ? trainingIds : ["__none__"];

  const { data: trainings, error: trainingsErr } = await supabase
    .from("trainings")
    .select("id, title, bpf_objective")
    .in("id", safeTrainingIds);

  if (trainingsErr) throw trainingsErr;

  // 7. Fetch formation_trainers with nested trainer info
  const { data: formationTrainers, error: ftErr } = await supabase
    .from("formation_trainers")
    .select(
      "id, session_id, trainer_id, hourly_rate, agreed_cost_ht, trainers(id, is_external, hourly_rate, first_name, last_name)"
    )
    .in("session_id", safeSessionIds);

  if (ftErr) throw ftErr;

  return {
    invoices: (invoices || []) as BPFInvoice[],
    enrollments: (enrollments || []) as BPFEnrollment[],
    signatures: (signatures || []) as BPFSignature[],
    timeSlots: (timeSlots || []) as BPFTimeSlot[],
    trainings: (trainings || []) as BPFTraining[],
    formationTrainers: (formationTrainers || []) as BPFFormationTrainer[],
    sessions: (sessions || []) as BPFSession[],
  };
}

// ─── Mutation helpers for DataGapsPanel ───────────────────────

export async function updateInvoiceBPF(
  supabase: SupabaseClient,
  invoiceId: string,
  updates: {
    invoice_date?: string;
    funding_type?: string;
    invoice_date_confirmed?: boolean;
  }
) {
  const { error } = await supabase
    .from("formation_invoices")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", invoiceId);
  if (error) throw error;
}

export async function updateEnrollmentBPF(
  supabase: SupabaseClient,
  enrollmentId: string,
  bpfTraineeType: string
) {
  const { error } = await supabase
    .from("enrollments")
    .update({ bpf_trainee_type: bpfTraineeType })
    .eq("id", enrollmentId);
  if (error) throw error;
}

export async function batchUpdateEnrollmentsBPF(
  supabase: SupabaseClient,
  enrollmentIds: string[],
  bpfTraineeType: string
) {
  const { error } = await supabase
    .from("enrollments")
    .update({ bpf_trainee_type: bpfTraineeType })
    .in("id", enrollmentIds);
  if (error) throw error;
}

export async function updateTrainingBPF(
  supabase: SupabaseClient,
  trainingId: string,
  bpfObjective: string
) {
  const { error } = await supabase
    .from("trainings")
    .update({
      bpf_objective: bpfObjective,
      updated_at: new Date().toISOString(),
    })
    .eq("id", trainingId);
  if (error) throw error;
}

export async function updateFormationTrainerCost(
  supabase: SupabaseClient,
  formationTrainerId: string,
  agreedCostHt: number
) {
  const { error } = await supabase
    .from("formation_trainers")
    .update({ agreed_cost_ht: agreedCostHt })
    .eq("id", formationTrainerId);
  if (error) throw error;
}

/**
 * Confirme en une seule mutation la date de plusieurs factures.
 * Sert le batch "Confirmer les N dates" du DataGapsPanel : fiabilisation
 * de masse des factures importées (invoice_date_confirmed = true).
 */
export async function batchConfirmInvoiceDates(
  supabase: SupabaseClient,
  entityId: string,
  invoiceIds: string[]
) {
  if (invoiceIds.length === 0) return;
  const { error } = await supabase
    .from("formation_invoices")
    .update({ invoice_date_confirmed: true, updated_at: new Date().toISOString() })
    .eq("entity_id", entityId)
    .in("id", invoiceIds);
  if (error) throw error;
}
