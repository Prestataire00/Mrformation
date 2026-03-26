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

// ─── Labels for UI ──────────────────────────────────────────

export const BPF_FUNDING_LABELS: Record<string, string> = {
  entreprise_privee: "Entreprise privée",
  apprentissage: "Contrats d'apprentissage",
  professionnalisation: "Contrats de professionnalisation",
  reconversion_alternance: "Reconversion / alternance",
  conge_transition: "Congé / transition professionnelle",
  cpf: "Compte personnel de formation (CPF)",
  dispositif_chomeurs: "Dispositifs demandeurs d'emploi",
  non_salaries: "Travailleurs non-salariés",
  plan_developpement: "Plan de développement des compétences",
  pouvoir_public_agents: "Pouvoirs publics (formation agents)",
  instances_europeennes: "Instances européennes",
  etat: "État",
  conseil_regional: "Conseils régionaux",
  pole_emploi: "Pôle emploi",
  autres_publics: "Autres ressources publiques",
  individuel: "Particulier / Individuel",
  organisme_formation: "Organisme de formation",
  autre: "Autre",
};

export const BPF_OBJECTIVE_LABELS: Record<string, string> = {
  rncp_6_8: "RNCP niveau 6-8 (Licence, Master, Doctorat...)",
  rncp_5: "RNCP niveau 5 (BTS, DUT...)",
  rncp_4: "RNCP niveau 4 (BAC pro, BT, BP...)",
  rncp_3: "RNCP niveau 3 (BEP, CAP...)",
  rncp_2: "RNCP niveau 2",
  rncp_cqp: "CQP sans niveau de qualification",
  certification_rs: "Certification / habilitation RS",
  cqp_non_enregistre: "CQP non enregistré RNCP/RS",
  autre_pro: "Autres formations professionnelles",
  bilan_competences: "Bilans de compétences",
  vae: "VAE (validation acquis expérience)",
};
