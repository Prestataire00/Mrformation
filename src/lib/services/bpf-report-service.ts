// ─── BPF Report Service ────────────────────────────────────
// Supabase queries to fetch all data needed for BPF report calculation.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isContentLocked } from "@/lib/abby/eligibility";

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
  duration_hours: number | null;
}

export interface BPFTrainerNested {
  id: string;
  type: string | null;
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
  bpf_validated_at?: string | null;
  bpf_validated_by?: string | null;
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
    .select("id, title, bpf_objective, duration_hours")
    .in("id", safeTrainingIds);

  if (trainingsErr) throw trainingsErr;

  // 7. Fetch formation_trainers with nested trainer info
  const { data: formationTrainers, error: ftErr } = await supabase
    .from("formation_trainers")
    .select(
      "id, session_id, trainer_id, hourly_rate, agreed_cost_ht, trainers(id, type, hourly_rate, first_name, last_name)"
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
  // Verrou Abby (story 3.5, FR-21) : invoice_date EST la date d'émission
  // poussée à Abby (emittedAt) — une remédiation BPF ne doit jamais faire
  // diverger la date LMS d'une facture légale. funding_type et
  // invoice_date_confirmed restent LIBRES (analytique BPF, non poussés).
  if (updates.invoice_date !== undefined) {
    const { data: current, error: lookupError } = await supabase
      .from("formation_invoices")
      .select("abby_push_state")
      .eq("id", invoiceId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    const row = current as { abby_push_state: string | null } | null;
    if (row && isContentLocked({ abby_push_state: row.abby_push_state })) {
      throw new Error(
        "La date d'émission de cette facture est verrouillée : elle est engagée dans Abby. Pour la corriger, créez un avoir."
      );
    }
  }
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

// ─── BPF par-formation (onglet BPF du détail formation) ────────────

/**
 * Miroir de {@link fetchBPFData} filtré sur UNE session (unité = session_id),
 * pour l'onglet BPF du détail formation. Toutes les requêtes filtrent par
 * session_id ; la session elle-même est bornée par entity_id (isolation
 * multi-tenant stricte). Les factures sont limitées à l'année civile `year`
 * (par invoice_date), les signatures au signer_type = 'learner' — mêmes
 * conventions que le rapport global, pour que les chiffres réconcilient.
 */
export async function fetchBPFDataForSession(
  supabase: SupabaseClient,
  entityId: string,
  sessionId: string,
  year: number
): Promise<BPFRawData> {
  // 1. La session (bornée entity_id → isolation stricte).
  // NB : on ne SELECT PAS bpf_validated_at/by ici. L'état de validation est lu
  // côté composant depuis la prop `formation` (chargée en select("*"), tolérante
  // aux colonnes absentes). Un SELECT explicite de ces colonnes ferait échouer
  // TOUT le fetch si la migration / le cache de schéma PostgREST n'est pas encore
  // en place — cassant l'onglet entier au lieu de juste masquer la ligne d'audit.
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select(
      "id, title, training_id, start_date, end_date, computed_hours, is_subcontracted_to_other_of, entity_id"
    )
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (sessionErr) throw sessionErr;

  const sessions = session ? [session as BPFSession] : [];

  // Défense en profondeur : si la session n'existe pas DANS cette entité, on
  // s'arrête là. Les sous-requêtes ci-dessous ne filtrent que par session_id
  // (la RLS est peu fiable en prod) : sans cette garde, un sessionId d'une autre
  // entité pourrait exposer ses enrollments/signatures/etc.
  if (!session) {
    return {
      invoices: [],
      enrollments: [],
      signatures: [],
      timeSlots: [],
      trainings: [],
      formationTrainers: [],
      sessions: [],
    };
  }

  // 2. Factures de la session, dans l'année civile (exclut annulées).
  const { data: invoices, error: invoicesErr } = await supabase
    .from("formation_invoices")
    .select(
      "id, amount, funding_type, invoice_date, invoice_date_confirmed, is_avoir, status, parent_invoice_id, external_reference, recipient_name, session_id"
    )
    .eq("entity_id", entityId)
    .eq("session_id", sessionId)
    .gte("invoice_date", `${year}-01-01`)
    .lte("invoice_date", `${year}-12-31`)
    .neq("status", "cancelled");

  if (invoicesErr) throw invoicesErr;

  // 3. Inscriptions de la session.
  const { data: enrollments, error: enrollmentsErr } = await supabase
    .from("enrollments")
    .select("id, session_id, learner_id, status, bpf_trainee_type")
    .eq("session_id", sessionId);

  if (enrollmentsErr) throw enrollmentsErr;

  // 4. Émargements apprenants de la session.
  const { data: signatures, error: signaturesErr } = await supabase
    .from("signatures")
    .select("id, session_id, signer_id, signer_type, time_slot_id, signed_at")
    .eq("session_id", sessionId)
    .eq("signer_type", "learner");

  if (signaturesErr) throw signaturesErr;

  // 5. Créneaux de la session.
  const { data: timeSlots, error: timeSlotsErr } = await supabase
    .from("formation_time_slots")
    .select("id, session_id, start_time, end_time")
    .eq("session_id", sessionId);

  if (timeSlotsErr) throw timeSlotsErr;

  // 6. Formation (training) de la session, via training_id.
  let trainings: BPFTraining[] = [];
  const trainingId = session?.training_id as string | null | undefined;
  if (trainingId) {
    const { data: training, error: trainingErr } = await supabase
      .from("trainings")
      .select("id, title, bpf_objective, duration_hours")
      .eq("id", trainingId)
      .maybeSingle();

    if (trainingErr) throw trainingErr;
    if (training) trainings = [training as BPFTraining];
  }

  // 7. Formateurs de la session (coûts pour le trou "sessions sans coût").
  const { data: formationTrainers, error: ftErr } = await supabase
    .from("formation_trainers")
    .select(
      "id, session_id, trainer_id, hourly_rate, agreed_cost_ht, trainers(id, type, hourly_rate, first_name, last_name)"
    )
    .eq("session_id", sessionId);

  if (ftErr) throw ftErr;

  return {
    invoices: (invoices || []) as BPFInvoice[],
    enrollments: (enrollments || []) as BPFEnrollment[],
    signatures: (signatures || []) as BPFSignature[],
    timeSlots: (timeSlots || []) as BPFTimeSlot[],
    trainings,
    formationTrainers: (formationTrainers || []) as BPFFormationTrainer[],
    sessions,
  };
}

/**
 * Récupère le nom affichable "Prénom Nom" d'un utilisateur (validateur BPF)
 * à partir de son id de profil. Retourne null si introuvable ou nom vide.
 *
 * PAS de filtre entity_id ici : le lookup se fait par id d'utilisateur déjà
 * connu (issu de sessions.bpf_validated_by), et un validateur super_admin peut
 * appartenir à une autre entité — un filtre entité l'exclurait à tort.
 */
export async function fetchValidatorName(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;
  const name = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return name || null;
}

/**
 * État de validation BPF de plusieurs sessions, pour la barre de progression
 * « X/Y formations validées » du rapport global.
 *
 * RÉSILIENCE (contre-mesure directe au hotfix `dc573b13`) : la lecture des
 * colonnes `bpf_validated_at`/`bpf_validated_by` est ISOLÉE dans son propre
 * try/catch. Un SELECT explicite d'une colonne absente du cache de schéma
 * PostgREST fait échouer TOUTE la requête — jamais dans le fetch global.
 * En cas d'échec (cache pas encore rechargé, colonne manquante…), on renvoie
 * une map vide : la barre affiche X=0 sans casser le rapport (warn console,
 * pas de toast). entity_id strict → isolation multi-tenant.
 */
export async function fetchSessionValidations(
  supabase: SupabaseClient,
  entityId: string,
  sessionIds: string[]
): Promise<Record<string, { validated_at: string | null; validated_by: string | null }>> {
  if (sessionIds.length === 0) return {};

  try {
    const { data, error } = await supabase
      .from("sessions")
      .select("id, bpf_validated_at, bpf_validated_by")
      .eq("entity_id", entityId)
      .in("id", sessionIds);

    if (error) throw error;

    const map: Record<
      string,
      { validated_at: string | null; validated_by: string | null }
    > = {};
    for (const row of data ?? []) {
      const r = row as {
        id: string;
        bpf_validated_at: string | null;
        bpf_validated_by: string | null;
      };
      map[r.id] = {
        validated_at: r.bpf_validated_at ?? null,
        validated_by: r.bpf_validated_by ?? null,
      };
    }
    return map;
  } catch (err) {
    console.warn(
      "[BPF] fetchSessionValidations: lecture de l'état de validation indisponible (barre à 0)",
      err
    );
    return {};
  }
}

/**
 * Valide une session pour le BPF : trace qui (userId) et quand (now).
 * entity_id strict → un admin ne valide que dans son organisme.
 */
export async function validateSessionBPF(
  supabase: SupabaseClient,
  entityId: string,
  sessionId: string,
  userId: string
) {
  const { error } = await supabase
    .from("sessions")
    .update({
      bpf_validated_at: new Date().toISOString(),
      bpf_validated_by: userId,
    })
    .eq("id", sessionId)
    .eq("entity_id", entityId);
  if (error) throw error;
}

/**
 * Annule la validation BPF d'une session (remet les deux champs à null).
 * entity_id strict.
 */
export async function unvalidateSessionBPF(
  supabase: SupabaseClient,
  entityId: string,
  sessionId: string
) {
  const { error } = await supabase
    .from("sessions")
    .update({
      bpf_validated_at: null,
      bpf_validated_by: null,
    })
    .eq("id", sessionId)
    .eq("entity_id", entityId);
  if (error) throw error;
}
