// ─── BPF Section C Auto-Calculator ──────────────────────────
// Calculates BPF Section C (revenue by source) from accepted quotes
// and Section D (charges) from formation_trainers hourly rates.

import type { BpfFundingType } from "@/lib/types";

// ─── Mapping: bpf_funding_type → Section C line key ─────────

const FUNDING_TO_LINE: Record<string, string> = {
  entreprise_privee: "line_1",
  apprentissage: "line_2a",
  professionnalisation: "line_2b",
  reconversion_alternance: "line_2c",
  conge_transition: "line_2d",
  cpf: "line_2e",
  dispositif_chomeurs: "line_2f",
  non_salaries: "line_2g",
  plan_developpement: "line_2h",
  pouvoir_public_agents: "line_3",
  instances_europeennes: "line_4",
  etat: "line_5",
  conseil_regional: "line_6",
  pole_emploi: "line_7",
  autres_publics: "line_8",
  individuel: "line_9",
  organisme_formation: "line_10",
  autre: "line_11",
};

export function getFundingLineKey(fundingType: string | null): string | null {
  if (!fundingType) return null;
  return FUNDING_TO_LINE[fundingType] || null;
}

// ─── Aggregate quotes into Section C lines ──────────────────

interface QuoteForBPF {
  amount: number | null;
  bpf_funding_type: string | null;
  program?: { bpf_funding_type: string | null } | null;
  client?: { bpf_category: string | null } | null;
}

export function computeSectionC(quotes: QuoteForBPF[]): Record<string, number> {
  const result: Record<string, number> = {};

  for (const q of quotes) {
    const amount = q.amount || 0;
    if (amount <= 0) continue;

    // Priority: quote.bpf_funding_type > program.bpf_funding_type > client.bpf_category
    const fundingType =
      q.bpf_funding_type ||
      q.program?.bpf_funding_type ||
      q.client?.bpf_category ||
      null;

    const lineKey = getFundingLineKey(fundingType);
    if (lineKey) {
      result[lineKey] = (result[lineKey] || 0) + amount;
    } else {
      // Fallback: if no mapping, put in "autre" (line 11)
      result["line_11"] = (result["line_11"] || 0) + amount;
    }
  }

  return result;
}

// ─── Aggregate trainer costs into Section D ─────────────────

interface SessionTrainerForBPF {
  hourly_rate: number | null;
  session_id: string;
  trainer?: { type: string } | null;
}

interface SessionDurationMap {
  [sessionId: string]: number; // duration_hours
}

export interface SectionDResult {
  total_charges: number;
  salaires_formateurs: number;
  achats_prestation: number;
}

export function computeSectionD(
  sessionTrainers: SessionTrainerForBPF[],
  sessionDurations: SessionDurationMap
): SectionDResult {
  let salaires = 0;
  let achats = 0;

  for (const st of sessionTrainers) {
    const rate = st.hourly_rate || 0;
    const hours = sessionDurations[st.session_id] || 0;
    const cost = rate * hours;

    if (cost <= 0) continue;

    const trainerType =
      (Array.isArray(st.trainer)
        ? (st.trainer as Record<string, unknown>[])[0]?.type
        : st.trainer?.type) || "internal";

    if (trainerType === "external") {
      achats += cost;
    } else {
      salaires += cost;
    }
  }

  return {
    total_charges: salaires + achats,
    salaires_formateurs: salaires,
    achats_prestation: achats,
  };
}

// ─── BPF Objective mapping → F-3 row indices ───────────────

// Index mapping for the f3 rows in defaultBPF.f3 array:
// 0  = a. RNCP total (sum of rows 1-6)
// 1  = dont niveau 6-8
// 2  = dont niveau 5
// 3  = dont niveau 4
// 4  = dont niveau 3
// 5  = dont niveau 2
// 6  = dont CQP sans niveau
// 7  = b. Certifications RS
// 8  = c. CQP non enregistré
// 9  = d. Autres formations
// 10 = e. Bilans de compétences
// 11 = f. VAE
// 12 = Total

const OBJECTIVE_TO_F3_INDEX: Record<string, number> = {
  rncp_6_8: 1,
  rncp_5: 2,
  rncp_4: 3,
  rncp_3: 4,
  rncp_2: 5,
  rncp_cqp: 6,
  certification_rs: 7,
  cqp_non_enregistre: 8,
  autre_pro: 9,
  bilan_competences: 10,
  vae: 11,
};

// RNCP indices (1-6) that aggregate into row 0
const RNCP_INDICES = [1, 2, 3, 4, 5, 6];

export function getF3Index(bpfObjective: string | null): number {
  if (!bpfObjective) return 9; // default: "autres formations professionnelles"
  return OBJECTIVE_TO_F3_INDEX[bpfObjective] ?? 9;
}

export function isRncpIndex(index: number): boolean {
  return RNCP_INDICES.includes(index);
}

// ─── Labels for UI (delegation vers bpf-labels.ts — typage strict) ───

export { BPF_FUNDING_LABELS, BPF_OBJECTIVE_LABELS } from "./bpf-labels";

// ─── Section C from Invoices (fiable / à vérifier split) ───

interface InvoiceForBPF {
  amount: number;
  funding_type: string | null;
  invoice_date_confirmed: boolean;
  is_avoir: boolean;
  status: string;
}

export interface SectionCFromInvoicesResult {
  fiable: Record<string, number>;
  a_verifier: Record<string, number>;
  non_classifie: { fiable: number; a_verifier: number };
}

export function computeSectionCFromInvoices(
  invoices: InvoiceForBPF[]
): SectionCFromInvoicesResult {
  const fiable: Record<string, number> = {};
  const a_verifier: Record<string, number> = {};
  const non_classifie = { fiable: 0, a_verifier: 0 };

  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;

    const amount = inv.amount;
    const lineKey = getFundingLineKey(inv.funding_type);

    if (!lineKey) {
      // funding_type is null or unknown → non_classifie
      if (inv.invoice_date_confirmed) {
        non_classifie.fiable += amount;
      } else {
        non_classifie.a_verifier += amount;
      }
      continue;
    }

    const bucket = inv.invoice_date_confirmed ? fiable : a_verifier;
    bucket[lineKey] = (bucket[lineKey] || 0) + amount;
  }

  return { fiable, a_verifier, non_classifie };
}

// ─── Data Gap Detection ────────────────────────────────────

interface InvoiceForDataGaps {
  id?: string;
  amount: number;
  funding_type: string | null;
  invoice_date_confirmed: boolean;
  is_avoir: boolean;
  status: string;
  invoice_date?: string | null;
  parent_invoice_id?: string | null;
}

interface EnrollmentForDataGaps {
  id: string;
  bpf_trainee_type: string | null;
  status: string;
}

interface TrainingForDataGaps {
  id: string;
  bpf_objective: string | null;
}

interface FormationTrainerForDataGaps {
  id: string;
  hourly_rate: number | null;
}

interface SignatureForDataGaps {
  time_slot_id: string | null;
}

export interface AvoirOrphelin {
  id: string;
  amount: number;
  invoice_date: string;
  parent_invoice_id: string;
}

export interface DataGapsResult {
  invoices_sans_funding: number;
  invoices_non_confirmees: number;
  avoirs_orphelins: AvoirOrphelin[];
  enrollments_sans_type: number;
  trainings_sans_objective: number;
  sessions_sans_cout: number;
  signatures_legacy: number;
}

export function computeDataGaps(data: {
  invoices: InvoiceForDataGaps[];
  enrollments: EnrollmentForDataGaps[];
  trainings: TrainingForDataGaps[];
  formationTrainers: FormationTrainerForDataGaps[];
  signatures: SignatureForDataGaps[];
}): DataGapsResult {
  const { invoices, enrollments, trainings, formationTrainers, signatures } = data;

  // Build a map of invoice id → invoice_date year for cross-year avoir detection
  const invoiceDateByYear: Record<string, number> = {};
  for (const inv of invoices) {
    if (inv.id && inv.invoice_date) {
      invoiceDateByYear[inv.id] = new Date(inv.invoice_date).getFullYear();
    }
  }

  const avoirs_orphelins: AvoirOrphelin[] = [];
  let invoices_sans_funding = 0;
  let invoices_non_confirmees = 0;

  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;

    if (!inv.funding_type) invoices_sans_funding++;
    if (!inv.invoice_date_confirmed) invoices_non_confirmees++;

    // Cross-year avoir detection
    if (
      inv.is_avoir &&
      inv.parent_invoice_id &&
      inv.id &&
      inv.invoice_date
    ) {
      const avoirYear = new Date(inv.invoice_date).getFullYear();
      const parentYear = invoiceDateByYear[inv.parent_invoice_id];
      if (parentYear !== undefined && parentYear !== avoirYear) {
        avoirs_orphelins.push({
          id: inv.id,
          amount: inv.amount,
          invoice_date: inv.invoice_date,
          parent_invoice_id: inv.parent_invoice_id,
        });
      }
    }
  }

  const enrollments_sans_type = enrollments.filter(
    (e) => e.status !== "cancelled" && !e.bpf_trainee_type
  ).length;

  const trainings_sans_objective = trainings.filter(
    (t) => !t.bpf_objective
  ).length;

  const sessions_sans_cout = formationTrainers.filter(
    (ft) => ft.hourly_rate === null || ft.hourly_rate === 0
  ).length;

  const signatures_legacy = signatures.filter(
    (s) => s.time_slot_id === null
  ).length;

  return {
    invoices_sans_funding,
    invoices_non_confirmees,
    avoirs_orphelins,
    enrollments_sans_type,
    trainings_sans_objective,
    sessions_sans_cout,
    signatures_legacy,
  };
}

// ─── Section F1: Stagiaires by type ────────────────────────

interface EnrollmentForF1 {
  id: string;
  bpf_trainee_type: string;
  status: string;
  session_id: string;
}

interface SignatureForF1 {
  enrollment_id: string;
  time_slot_id: string | null;
  signed_at: string;
  session_computed_hours?: number;
}

interface TimeSlotForF1 {
  id: string;
  session_id: string;
  start_time: string;
  duration_hours: number;
}

export function computeSectionF1(
  enrollments: EnrollmentForF1[],
  signatures: SignatureForF1[],
  timeSlots: TimeSlotForF1[],
  year: number
): Record<string, { count: number; hours: number }> {
  const result: Record<string, { count: number; hours: number }> = {};

  // Build time slot lookup
  const slotById = new Map<string, TimeSlotForF1>();
  for (const ts of timeSlots) {
    slotById.set(ts.id, ts);
  }

  // Count total slots per session (for legacy fallback)
  const totalSlotsBySession = new Map<string, number>();
  for (const ts of timeSlots) {
    totalSlotsBySession.set(
      ts.session_id,
      (totalSlotsBySession.get(ts.session_id) || 0) + 1
    );
  }

  // Group signatures by enrollment_id
  const sigsByEnrollment = new Map<string, SignatureForF1[]>();
  for (const sig of signatures) {
    const arr = sigsByEnrollment.get(sig.enrollment_id) || [];
    arr.push(sig);
    sigsByEnrollment.set(sig.enrollment_id, arr);
  }

  for (const enrollment of enrollments) {
    if (enrollment.status === "cancelled") continue;

    const enrollmentSigs = sigsByEnrollment.get(enrollment.id) || [];
    let hours = 0;
    let hasHoursInYear = false;

    for (const sig of enrollmentSigs) {
      if (sig.time_slot_id === null) {
        // Legacy fallback: impute hours = session_computed_hours / total_slots
        const sigYear = new Date(sig.signed_at).getFullYear();
        if (sigYear !== year) continue;

        const totalSlots = totalSlotsBySession.get(enrollment.session_id) || 1;
        const sessionHours = sig.session_computed_hours || 0;
        hours += sessionHours / totalSlots;
        hasHoursInYear = true;
      } else {
        // Normal: look up the time slot
        const slot = slotById.get(sig.time_slot_id);
        if (!slot) continue;

        const slotYear = new Date(slot.start_time).getFullYear();
        if (slotYear !== year) continue;

        hours += slot.duration_hours;
        hasHoursInYear = true;
      }
    }

    if (!hasHoursInYear) continue;

    const type = enrollment.bpf_trainee_type;
    if (!result[type]) {
      result[type] = { count: 0, hours: 0 };
    }
    result[type].count += 1;
    result[type].hours += hours;
  }

  return result;
}
