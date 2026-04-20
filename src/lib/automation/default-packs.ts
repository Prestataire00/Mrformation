export interface AutomationRuleTemplate {
  name: string;
  description: string;
  trigger_type: string;
  days_offset?: number;
  recipient_type?: string;
  document_type?: string;
  scope: "formation" | "crm";
}

export interface AutomationPack {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  rules: AutomationRuleTemplate[];
}

export const AUTOMATION_PACKS: AutomationPack[] = [
  {
    id: "qualiopi-standard",
    name: "Pack Qualiopi standard",
    description: "Les 6 automations essentielles pour respecter Qualiopi",
    icon: "🎓",
    color: "blue",
    rules: [
      {
        name: "Convocation J-5",
        description: "Envoi automatique de la convocation 5 jours avant le début",
        trigger_type: "session_start_minus_days",
        days_offset: 5,
        recipient_type: "learners",
        document_type: "convocation",
        scope: "formation",
      },
      {
        name: "Positionnement J-3",
        description: "Questionnaire de positionnement 3 jours avant",
        trigger_type: "session_start_minus_days",
        days_offset: 3,
        recipient_type: "learners",
        document_type: "questionnaire_positionnement",
        scope: "formation",
      },
      {
        name: "Satisfaction à chaud",
        description: "Questionnaire de satisfaction à la fin de la formation",
        trigger_type: "on_session_completion",
        days_offset: 0,
        recipient_type: "learners",
        document_type: "questionnaire_satisfaction",
        scope: "formation",
      },
      {
        name: "Satisfaction client J+7",
        description: "Questionnaire satisfaction entreprise 7 jours après",
        trigger_type: "session_end_plus_days",
        days_offset: 7,
        recipient_type: "companies",
        document_type: "questionnaire_satisfaction_client",
        scope: "formation",
      },
      {
        name: "Satisfaction à froid J+30",
        description: "Évaluation à froid 30 jours après la fin",
        trigger_type: "session_end_plus_days",
        days_offset: 30,
        recipient_type: "learners",
        document_type: "questionnaire_satisfaction_froid",
        scope: "formation",
      },
      {
        name: "Certificat de réalisation",
        description: "Génération automatique à la fin de la formation",
        trigger_type: "on_session_completion",
        days_offset: 0,
        recipient_type: "learners",
        document_type: "certificat_realisation",
        scope: "formation",
      },
    ],
  },
  {
    id: "opco",
    name: "Pack OPCO",
    description: "Rappels automatiques pour les dossiers OPCO",
    icon: "💰",
    color: "green",
    rules: [
      {
        name: "Rappel dépôt OPCO J-10",
        description: "Rappel 10 jours avant le début pour déposer le dossier OPCO",
        trigger_type: "opco_deposit_reminder",
        days_offset: 10,
        recipient_type: "all",
        scope: "formation",
      },
      {
        name: "Rappel OPCO post-formation J+3",
        description: "Rappel envoi des pièces justificatives 3 jours après",
        trigger_type: "session_end_plus_days",
        days_offset: 3,
        recipient_type: "companies",
        document_type: "opco_justificatifs",
        scope: "formation",
      },
    ],
  },
  {
    id: "commercial",
    name: "Pack Commercial",
    description: "Relances et suivi automatique des prospects et devis",
    icon: "📈",
    color: "purple",
    rules: [
      {
        name: "Relance devis J+7",
        description: "Relance automatique si le devis n'a pas été signé après 7 jours",
        trigger_type: "invoice_overdue",
        days_offset: 7,
        recipient_type: "companies",
        document_type: "relance_devis",
        scope: "crm",
      },
      {
        name: "Rappel facture en retard J+15",
        description: "Rappel si la facture n'est pas réglée après 15 jours",
        trigger_type: "invoice_overdue",
        days_offset: 15,
        recipient_type: "companies",
        document_type: "relance_facture",
        scope: "crm",
      },
    ],
  },
  {
    id: "sous-traitance",
    name: "Pack Sous-traitance",
    description: "Workflow spécial pour les formations sous-traitées",
    icon: "🤝",
    color: "amber",
    rules: [
      {
        name: "Contrat sous-traitance J-10",
        description: "Envoi du contrat de sous-traitance 10 jours avant",
        trigger_type: "session_start_minus_days",
        days_offset: 10,
        recipient_type: "trainers",
        document_type: "contrat_sous_traitance",
        scope: "formation",
      },
      {
        name: "Documents post-formation ST J+3",
        description: "Rappel récupération documents du sous-traitant",
        trigger_type: "session_end_plus_days",
        days_offset: 3,
        recipient_type: "trainers",
        document_type: "documents_post_st",
        scope: "formation",
      },
    ],
  },
];
