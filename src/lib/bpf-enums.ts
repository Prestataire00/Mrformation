/**
 * Source unique des valeurs BPF canonical.
 *
 * Les tableaux ci-dessous sont copiés EXACTEMENT depuis
 * supabase/migrations/bpf-auto-calculation.sql (lignes 34-69).
 * Les types dérivés doivent être strictement identiques à
 * BpfFundingType et BpfObjective de src/lib/types/index.ts.
 */

import type { BpfFundingType, BpfObjective, BpfTraineeType } from "@/lib/types";

// ── 18 valeurs funding type (SQL lignes 49-69) ──────────────────

export const BPF_FUNDING_TYPE_VALUES = [
  "entreprise_privee",
  "apprentissage",
  "professionnalisation",
  "reconversion_alternance",
  "conge_transition",
  "cpf",
  "dispositif_chomeurs",
  "non_salaries",
  "plan_developpement",
  "pouvoir_public_agents",
  "instances_europeennes",
  "etat",
  "conseil_regional",
  "pole_emploi",
  "autres_publics",
  "individuel",
  "organisme_formation",
  "autre",
] as const satisfies readonly BpfFundingType[];

// ── 11 valeurs objective (SQL lignes 34-47) ─────────────────────

export const BPF_OBJECTIVE_VALUES = [
  "rncp_6_8",
  "rncp_5",
  "rncp_4",
  "rncp_3",
  "rncp_2",
  "rncp_cqp",
  "certification_rs",
  "cqp_non_enregistre",
  "autre_pro",
  "bilan_competences",
  "vae",
] as const satisfies readonly BpfObjective[];

// ── 5 valeurs trainee type (Cadre F-1 Cerfa 10443) ─────────────

export const BPF_TRAINEE_TYPE_VALUES = [
  "salarie_prive",
  "apprenti",
  "demandeur_emploi",
  "particulier",
  "autre",
] as const satisfies readonly BpfTraineeType[];

// ── Types dérivés ───────────────────────────────────────────────

export type BpfFundingTypeValue = (typeof BPF_FUNDING_TYPE_VALUES)[number];
export type BpfObjectiveValue = (typeof BPF_OBJECTIVE_VALUES)[number];
export type BpfTraineeTypeValue = (typeof BPF_TRAINEE_TYPE_VALUES)[number];
