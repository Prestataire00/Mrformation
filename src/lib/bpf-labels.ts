/**
 * Labels FR canonical pour les enums BPF.
 *
 * Source unique — Record<BpfFundingTypeValue, string> force l'exhaustivité
 * compile-time : toute clé manquante ou orpheline provoque une erreur TS.
 *
 * Labels copiés depuis src/lib/bpf-calculator.ts (chantier Wissam mergé),
 * eux-mêmes alignés sur supabase/migrations/bpf-auto-calculation.sql.
 */

import type { BpfFundingTypeValue, BpfObjectiveValue, BpfTraineeTypeValue } from "@/lib/bpf-enums";

export const BPF_FUNDING_LABELS: Record<BpfFundingTypeValue, string> = {
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

export const BPF_OBJECTIVE_LABELS: Record<BpfObjectiveValue, string> = {
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

export const BPF_TRAINEE_TYPE_LABELS: Record<BpfTraineeTypeValue, string> = {
  salarie_prive: "Salariés d'employeurs privés (hors apprentis)",
  apprenti: "Apprentis",
  demandeur_emploi: "Personnes en recherche d'emploi",
  particulier: "Particuliers à leurs propres frais",
  autre: "Autres stagiaires",
};
