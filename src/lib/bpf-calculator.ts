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
  agreed_cost_ht?: number | null;
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

  // Aligné sur le DataGapsPanel (onglet Formateurs) : un formateur n'est un
  // "trou" que si AUCUN coût n'est renseigné (ni agreed_cost_ht, ni hourly_rate).
  // agreed_cost_ht == null couvre null ET undefined (tests sans ce champ inchangés).
  const sessions_sans_cout = formationTrainers.filter(
    (ft) => ft.agreed_cost_ht == null && (ft.hourly_rate === null || ft.hourly_rate === 0)
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

// ─── Section F2: activité sous-traitée à un autre organisme ─

interface EnrollmentForF2 {
  learner_id: string;
  session_id: string;
  status: string;
}

interface SessionInfoForF2 {
  duration: number;
  isSubcontracted: boolean;
}

/**
 * Cadre F-2 : stagiaires et heures des sessions dont l'action a été confiée
 * à un AUTRE organisme (sessions.is_subcontracted_to_other_of = true).
 * Même base d'heures que le F-1 affiché (durée de session par inscription),
 * pour que les stagiaires F-2 forment un sous-ensemble cohérent du F-1.
 */
export function computeSectionF2(
  enrollments: EnrollmentForF2[],
  sessionInfoById: Record<string, SessionInfoForF2>
): { stagiaires: number; heures: number } {
  const learners = new Set<string>();
  let heures = 0;

  for (const e of enrollments) {
    if (e.status === "cancelled") continue;
    const info = sessionInfoById[e.session_id];
    if (!info || !info.isSubcontracted) continue;
    // On ignore les heures d'une inscription sans apprenant identifié, comme le fait
    // le F-1 (skip learner_id vide) — garantit que F-2 ⊆ F-1 aussi en heures.
    if (!e.learner_id) continue;

    learners.add(e.learner_id);
    heures += info.duration || 0;
  }

  return { stagiaires: learners.size, heures };
}

// ─── Vue d'affichage du Cadre C (total combiné + split) ────

export interface SectionCView {
  /** fiable + à-vérifier par ligne (total affiché en tête, ne chute pas) */
  combined: Record<string, number>;
  /** factures à date confirmée */
  fiable: Record<string, number>;
  /** factures importées non confirmées */
  aVerifier: Record<string, number>;
}

/**
 * Aplati le résultat de computeSectionCFromInvoices pour l'affichage et l'export.
 * Les factures sans funding_type (non_classifie) sont repliées sur la ligne 11
 * ("Autres produits") — comme l'ancien calcul devis — tout en restant signalées
 * comme trou via computeDataGaps. aVerifierCount vient de gaps.invoices_non_confirmees.
 */
export function buildSectionCView(
  result: SectionCFromInvoicesResult
): SectionCView {
  const combined: Record<string, number> = {};
  for (const [k, v] of Object.entries(result.fiable)) {
    combined[k] = (combined[k] || 0) + v;
  }
  for (const [k, v] of Object.entries(result.a_verifier)) {
    combined[k] = (combined[k] || 0) + v;
  }

  const fiable = { ...result.fiable };
  const aVerifier = { ...result.a_verifier };

  const ncFiable = result.non_classifie.fiable;
  const ncAVerifier = result.non_classifie.a_verifier;

  if (ncFiable !== 0) fiable.line_11 = (fiable.line_11 || 0) + ncFiable;
  if (ncAVerifier !== 0) aVerifier.line_11 = (aVerifier.line_11 || 0) + ncAVerifier;
  if (ncFiable !== 0 || ncAVerifier !== 0) {
    combined.line_11 = (combined.line_11 || 0) + ncFiable + ncAVerifier;
  }

  return { combined, fiable, aVerifier };
}

// ─── Synthèse BPF par session (onglet BPF du détail formation) ─────

/** Ordre canonique des buckets F-1 (aligné sur BPFForm / rapport global). */
const F1_TRAINEE_TYPES = [
  "salarie_prive",
  "apprenti",
  "demandeur_emploi",
  "particulier",
  "autre",
] as const;

type F1TraineeType = (typeof F1_TRAINEE_TYPES)[number];

export interface SessionF1Row {
  type: F1TraineeType;
  stagiaires: number;
  heures: number;
}

interface SessionBpfInvoice {
  amount: number;
  funding_type: string | null;
  invoice_date_confirmed: boolean;
  is_avoir: boolean;
  status: string;
  id?: string;
  invoice_date?: string | null;
  parent_invoice_id?: string | null;
}

interface SessionBpfEnrollment {
  id: string;
  learner_id: string;
  session_id: string;
  status: string;
  bpf_trainee_type: string | null;
}

interface SessionBpfTraining {
  id: string;
  bpf_objective: string | null;
}

interface SessionBpfFormationTrainer {
  id: string;
  hourly_rate: number | null;
  agreed_cost_ht?: number | null;
}

interface SessionBpfSignature {
  time_slot_id: string | null;
}

export interface SessionBpfSummary {
  /** Stagiaires uniques (mêmes règles que le F-1 global). */
  stagiaires: number;
  /** Heures = durée training × inscriptions non annulées (méthode globale). */
  heures: number;
  sectionC: SectionCView;
  /** Total CA HT = fiable + à-vérifier (combined). */
  caTotal: number;
  /** Sous-total des factures à date confirmée. */
  caFiable: number;
  /** Sous-total des factures importées non confirmées. */
  caAVerifier: number;
  /** Nombre de factures à vérifier (= gaps.invoices_non_confirmees, cohérent BPF-2.3). */
  aVerifierCount: number;
  /** F-1 par type de stagiaire (méthode durée-session, comme le global). */
  f1: SessionF1Row[];
  /** F-2 : activité sous-traitée à un autre organisme. */
  f2: { stagiaires: number; heures: number };
  gaps: DataGapsResult;
  /** Les 5 trous "bloquants" du DataGapsPanel (pastille 🟢 ⇔ 0). */
  totalGaps: number;
}

function sumRecordValues(rec: Record<string, number>): number {
  return Object.values(rec).reduce((sum, v) => sum + v, 0);
}

/**
 * Synthèse BPF d'UNE session : compose les calculateurs purs existants sur des
 * données déjà filtrées par session_id, pour que le résumé de l'onglet égale la
 * contribution de cette session au rapport global (`/admin/reports/bpf`).
 *
 * - Cadre C : buildSectionCView(computeSectionCFromInvoices(factures de la session)).
 * - F-1 : méthode du rapport global (BPFForm) — heures = durationHours par
 *   inscription non annulée, stagiaires = learners uniques par bpf_trainee_type
 *   (null → "autre"). PAS computeSectionF1 (heures signées → divergerait).
 * - F-2 : computeSectionF2 (sessions sous-traitées à un autre organisme).
 * - totalGaps : les 5 trous du DataGapsPanel (identique au panneau).
 */
export function computeSessionBpfSummary(data: {
  invoices: SessionBpfInvoice[];
  enrollments: SessionBpfEnrollment[];
  trainings: SessionBpfTraining[];
  formationTrainers: SessionBpfFormationTrainer[];
  signatures: SessionBpfSignature[];
  isSubcontracted: boolean;
  durationHours: number;
}): SessionBpfSummary {
  const {
    invoices,
    enrollments,
    trainings,
    formationTrainers,
    signatures,
    isSubcontracted,
    durationHours,
  } = data;

  // ── Cadre C (produits, split fiable / à-vérifier) ──
  const sectionCResult = computeSectionCFromInvoices(
    invoices.map((inv) => ({
      amount: inv.amount,
      funding_type: inv.funding_type,
      invoice_date_confirmed: inv.invoice_date_confirmed,
      is_avoir: inv.is_avoir,
      status: inv.status,
    }))
  );
  const sectionC = buildSectionCView(sectionCResult);
  const caFiable = sumRecordValues(sectionC.fiable);
  const caAVerifier = sumRecordValues(sectionC.aVerifier);
  const caTotal = sumRecordValues(sectionC.combined);

  // ── Trous de données (5 compteurs + avoirs orphelins + signatures legacy) ──
  const gaps = computeDataGaps({
    invoices: invoices.map((inv) => ({
      id: inv.id,
      amount: inv.amount,
      funding_type: inv.funding_type,
      invoice_date_confirmed: inv.invoice_date_confirmed,
      is_avoir: inv.is_avoir,
      status: inv.status,
      invoice_date: inv.invoice_date,
      parent_invoice_id: inv.parent_invoice_id,
    })),
    enrollments: enrollments.map((e) => ({
      id: e.id,
      bpf_trainee_type: e.bpf_trainee_type,
      status: e.status,
    })),
    trainings: trainings.map((t) => ({
      id: t.id,
      bpf_objective: t.bpf_objective,
    })),
    formationTrainers: formationTrainers.map((ft) => ({
      id: ft.id,
      hourly_rate: ft.hourly_rate,
      agreed_cost_ht: ft.agreed_cost_ht ?? null,
    })),
    signatures: signatures.map((s) => ({ time_slot_id: s.time_slot_id })),
  });

  // totalGaps = exactement les 5 trous "bloquants" du DataGapsPanel.
  const totalGaps =
    gaps.invoices_sans_funding +
    gaps.invoices_non_confirmees +
    gaps.enrollments_sans_type +
    gaps.trainings_sans_objective +
    gaps.sessions_sans_cout;

  // aVerifierCount cohérent avec BPF-2.3 : nombre de factures non confirmées.
  const aVerifierCount = gaps.invoices_non_confirmees;

  // ── Cadre F-1 : méthode du rapport global (durée training × inscription) ──
  const learnersByType: Record<F1TraineeType, Set<string>> = {
    salarie_prive: new Set(),
    apprenti: new Set(),
    demandeur_emploi: new Set(),
    particulier: new Set(),
    autre: new Set(),
  };
  const hoursByType: Record<F1TraineeType, number> = {
    salarie_prive: 0,
    apprenti: 0,
    demandeur_emploi: 0,
    particulier: 0,
    autre: 0,
  };

  for (const e of enrollments) {
    if (e.status === "cancelled") continue;
    const learnerId = e.learner_id || "";
    if (!learnerId) continue;

    // bpf_trainee_type null/inconnu → "autre" (comme BPFForm).
    let lType = e.bpf_trainee_type as F1TraineeType | null;
    if (!lType || !(lType in learnersByType)) lType = "autre";

    learnersByType[lType].add(learnerId);
    hoursByType[lType] += durationHours;
  }

  const f1: SessionF1Row[] = F1_TRAINEE_TYPES.map((type) => ({
    type,
    stagiaires: learnersByType[type].size,
    heures: hoursByType[type],
  }));

  const stagiaires = f1.reduce((sum, row) => sum + row.stagiaires, 0);
  const heures = f1.reduce((sum, row) => sum + row.heures, 0);

  // ── Cadre F-2 : activité sous-traitée à un autre organisme ──
  // Mono-session : chaque inscription pointe la même session, même durée/flag.
  const sessionInfoById: Record<
    string,
    { duration: number; isSubcontracted: boolean }
  > = {};
  for (const e of enrollments) {
    sessionInfoById[e.session_id] = {
      duration: durationHours,
      isSubcontracted,
    };
  }
  const f2 = computeSectionF2(
    enrollments.map((e) => ({
      learner_id: e.learner_id || "",
      session_id: e.session_id,
      status: e.status,
    })),
    sessionInfoById
  );

  return {
    stagiaires,
    heures,
    sectionC,
    caTotal,
    caFiable,
    caAVerifier,
    aVerifierCount,
    f1,
    f2,
    gaps,
    totalGaps,
  };
}

// ─── Progression de dépôt BPF (barre X/Y du rapport global) ─────────

interface DepositProgressInvoice {
  id?: string;
  amount: number;
  funding_type: string | null;
  invoice_date_confirmed: boolean;
  is_avoir: boolean;
  status: string;
  invoice_date?: string | null;
  parent_invoice_id?: string | null;
  session_id: string | null;
}

interface DepositProgressEnrollment {
  id: string;
  bpf_trainee_type: string | null;
  status: string;
  session_id: string;
}

interface DepositProgressTraining {
  id: string;
  bpf_objective: string | null;
}

interface DepositProgressFormationTrainer {
  id: string;
  hourly_rate: number | null;
  agreed_cost_ht?: number | null;
  session_id: string;
}

interface DepositProgressSignature {
  time_slot_id: string | null;
  session_id: string;
}

interface DepositProgressSession {
  id: string;
  training_id: string | null;
}

export interface BpfDepositProgress {
  /** Y : nombre de sessions de l'exercice (sessionIds.length). */
  total: number;
  /** X : sessions validées ET sans trou (🟢). */
  ready: number;
  /** true si total > 0 ET toutes les sessions sont prêtes → « prêt à déposer ». */
  allReady: boolean;
}

/**
 * Progression « X/Y formations validées → prêt à déposer » du rapport BPF global.
 *
 * Pour chaque session de l'exercice (`sessionIds`), on rejoue `computeDataGaps`
 * sur les données déjà chargées (`bpfRaw`) filtrées par `session_id` — même
 * définition de « sans trou » (les 5 compteurs bloquants) que la pastille de
 * l'onglet BPF et que le DataGapsPanel, garantissant la cohérence.
 *
 * Une session est comptée dans X (`ready`) si elle est à la fois :
 *  - validée (`validatedBySession[sessionId] === true`, lu de façon résiliente
 *    côté service depuis `bpf_validated_at`), ET
 *  - actuellement sans trou (`totalGaps === 0`).
 *
 * Auto-dé-validation PASSIVE : une session validée dont un trou réapparaît sort
 * simplement de X (aucune écriture — l'audit `bpf_validated_at` reste intact).
 *
 * Fonction PURE et testable — aucune I/O.
 */
export function computeBpfDepositProgress(
  sessionIds: string[],
  data: {
    invoices: DepositProgressInvoice[];
    enrollments: DepositProgressEnrollment[];
    trainings: DepositProgressTraining[];
    formationTrainers: DepositProgressFormationTrainer[];
    signatures: DepositProgressSignature[];
    sessions: DepositProgressSession[];
  },
  validatedBySession: Record<string, boolean>
): BpfDepositProgress {
  const { invoices, enrollments, trainings, formationTrainers, signatures, sessions } =
    data;

  let ready = 0;

  for (const sessionId of sessionIds) {
    // Le training de la session (via sessions[].training_id).
    const trainingId = sessions.find((s) => s.id === sessionId)?.training_id ?? null;
    const sessionTrainings = trainingId
      ? trainings.filter((t) => t.id === trainingId)
      : [];

    const gaps = computeDataGaps({
      invoices: invoices
        .filter((inv) => inv.session_id === sessionId)
        .map((inv) => ({
          id: inv.id,
          amount: inv.amount,
          funding_type: inv.funding_type,
          invoice_date_confirmed: inv.invoice_date_confirmed,
          is_avoir: inv.is_avoir,
          status: inv.status,
          invoice_date: inv.invoice_date,
          parent_invoice_id: inv.parent_invoice_id,
        })),
      enrollments: enrollments
        .filter((e) => e.session_id === sessionId)
        .map((e) => ({
          id: e.id,
          bpf_trainee_type: e.bpf_trainee_type,
          status: e.status,
        })),
      trainings: sessionTrainings.map((t) => ({
        id: t.id,
        bpf_objective: t.bpf_objective,
      })),
      formationTrainers: formationTrainers
        .filter((ft) => ft.session_id === sessionId)
        .map((ft) => ({
          id: ft.id,
          hourly_rate: ft.hourly_rate,
          agreed_cost_ht: ft.agreed_cost_ht ?? null,
        })),
      signatures: signatures
        .filter((s) => s.session_id === sessionId)
        .map((s) => ({ time_slot_id: s.time_slot_id })),
    });

    // Les 5 mêmes trous « bloquants » que le DataGapsPanel / la pastille.
    const totalGaps =
      gaps.invoices_sans_funding +
      gaps.invoices_non_confirmees +
      gaps.enrollments_sans_type +
      gaps.trainings_sans_objective +
      gaps.sessions_sans_cout;

    if (validatedBySession[sessionId] === true && totalGaps === 0) {
      ready += 1;
    }
  }

  const total = sessionIds.length;
  return {
    total,
    ready,
    allReady: total > 0 && ready === total,
  };
}
