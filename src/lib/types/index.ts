// ===== ENTITIES =====
export interface Entity {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  theme_color: string;
  created_at: string;
}

// ===== USERS / PROFILES =====
export type UserRole = "super_admin" | "admin" | "commercial" | "trainer" | "client" | "learner";

export interface Profile {
  id: string;
  entity_id: string | null;
  role: UserRole;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  has_crm_access: boolean;
  created_at: string;
  updated_at: string;
  entity?: Entity;
}

// ===== BPF TYPES =====
export type BpfFundingType =
  | "entreprise_privee" | "apprentissage" | "professionnalisation"
  | "reconversion_alternance" | "conge_transition" | "cpf"
  | "dispositif_chomeurs" | "non_salaries" | "plan_developpement"
  | "pouvoir_public_agents" | "instances_europeennes" | "etat"
  | "conseil_regional" | "pole_emploi" | "autres_publics"
  | "individuel" | "organisme_formation" | "autre";

export type BpfObjective =
  | "rncp_6_8" | "rncp_5" | "rncp_4" | "rncp_3" | "rncp_2" | "rncp_cqp"
  | "certification_rs" | "cqp_non_enregistre" | "autre_pro"
  | "bilan_competences" | "vae";

export type BpfCategory = BpfFundingType;

// ===== CLIENTS =====
export type ClientStatus = "active" | "inactive" | "prospect";

export interface Client {
  id: string;
  entity_id: string;
  company_name: string;
  siret: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  website: string | null;
  sector: string | null;
  naf_code: string | null;
  bpf_category: BpfCategory | null;
  status: ClientStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contacts?: Contact[];
  learners?: Learner[];
  _count?: { learners: number; enrollments: number };
}

export interface Contact {
  id: string;
  client_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  is_primary: boolean;
  created_at: string;
}

// ===== LEARNERS =====
export type LearnerType = "salarie" | "apprenti" | "demandeur_emploi" | "particulier" | "autre";

export interface Learner {
  id: string;
  profile_id: string | null;
  client_id: string | null;
  entity_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  learner_type: LearnerType;
  created_at: string;
  client?: Client;
  enrollments?: Enrollment[];
}

// ===== TRAINERS =====
export type TrainerType = "internal" | "external";

export interface Trainer {
  id: string;
  profile_id: string | null;
  entity_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  type: TrainerType;
  bio: string | null;
  hourly_rate: number | null;
  availability_notes: string | null;
  created_at: string;
  competencies?: TrainerCompetency[];
}

export interface TrainerCompetency {
  id: string;
  trainer_id: string;
  competency: string;
  level: "beginner" | "intermediate" | "expert";
}

// ===== GMAIL CONNECTIONS =====
export interface GmailConnection {
  id: string;
  trainer_id: string;
  profile_id: string;
  gmail_address: string;
  is_active: boolean;
  connected_at: string;
  last_used_at: string | null;
  last_error: string | null;
}

// ===== TRAININGS =====
export type TrainingClassification = "reglementaire" | "certifiant" | "qualifiant" | null;

export interface Training {
  id: string;
  entity_id: string;
  program_id: string | null;
  title: string;
  description: string | null;
  objectives: string | null;
  duration_hours: number | null;
  max_participants: number | null;
  price_per_person: number | null;
  category: string | null;
  certification: string | null;
  prerequisites: string | null;
  classification: TrainingClassification;
  nsf_code: string | null;
  nsf_label: string | null;
  bpf_objective: BpfObjective | null;
  bpf_funding_type: BpfFundingType | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sessions?: Session[];
  program?: Program;
}

// ===== SESSIONS (= Formation dans l'UI) =====
export type SessionStatus = "upcoming" | "in_progress" | "completed" | "cancelled";
export type SessionMode = "presentiel" | "distanciel" | "hybride";
export type FormationType = "intra" | "inter";

export interface Session {
  id: string;
  training_id: string | null;
  entity_id: string;
  title: string;
  start_date: string;
  end_date: string;
  location: string | null;
  mode: SessionMode;
  status: SessionStatus;
  max_participants: number | null;
  trainer_id: string | null;
  is_public?: boolean;
  notes: string | null;
  // Nouveaux champs formation
  type: FormationType;
  domain: string | null;
  description: string | null;
  total_price: number | null;
  planned_hours: number | null;
  visio_link: string | null;
  manager_id: string | null;
  program_id: string | null;
  is_planned: boolean;
  is_completed: boolean;
  is_dpc: boolean;
  catalog_pre_registration: boolean;
  updated_at: string;
  created_at: string;
  // Relations
  training?: Training;
  trainer?: Trainer;
  program?: Program;
  manager?: Pick<Profile, "id" | "first_name" | "last_name" | "email">;
  enrollments?: Enrollment[];
  formation_trainers?: FormationTrainer[];
  formation_companies?: FormationCompany[];
  formation_financiers?: FormationFinancier[];
  formation_comments?: FormationComment[];
  formation_time_slots?: FormationTimeSlot[];
  formation_absences?: FormationAbsence[];
  formation_documents?: FormationDocument[];
  formation_evaluation_assignments?: FormationEvaluationAssignment[];
  formation_satisfaction_assignments?: FormationSatisfactionAssignment[];
  formation_convention_documents?: FormationConventionDocument[];
  formation_elearning_assignments?: FormationElearningAssignment[];
  signatures?: Signature[];
  _count?: { enrollments: number };
}

// ===== FORMATION TIME SLOTS =====
export interface FormationTimeSlot {
  id: string;
  session_id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  slot_order: number;
  module_title: string | null;
  module_objectives: string | null;
  module_themes: string | null;
  module_exercises: string | null;
  created_at: string;
  updated_at: string;
}

// ===== FORMATION TRAINERS =====
export interface FormationTrainer {
  id: string;
  session_id: string;
  trainer_id: string;
  role: string;
  hourly_rate: number | null;
  created_at: string;
  trainer?: Trainer;
}

// ===== FORMATION COMPANIES =====
export interface FormationCompany {
  id: string;
  session_id: string;
  client_id: string;
  amount: number | null;
  email: string | null;
  reference: string | null;
  created_at: string;
  client?: Client;
}

// ===== FORMATION FINANCIERS =====
export type FinancierType =
  | "opco" | "pole_emploi" | "cpf" | "entreprise" | "region" | "autre"
  | "apprentissage" | "professionnalisation" | "reconversion_alternance" | "conge_transition"
  | "dispositif_chomeurs" | "non_salaries" | "plan_developpement"
  | "instances_europeennes" | "etat" | "conseil_regional" | "autres_publics";

export type OpcoStatus = "a_deposer" | "deposee" | "en_cours" | "acceptee" | "refusee" | "partielle";

export interface FormationFinancier {
  id: string;
  session_id: string;
  financeur_id: string | null;
  name: string;
  type: FinancierType | null;
  reference: string | null;
  amount: number | null;
  amount_requested: number | null;
  amount_granted: number | null;
  status: OpcoStatus;
  accord_number: string | null;
  deposit_date: string | null;
  response_date: string | null;
  rejection_reason: string | null;
  documents_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Financeur {
  id: string;
  entity_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: string;
  notes: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  siret: string | null;
  code_opco: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  is_active: boolean;
  created_at: string;
}

// ===== FORMATION COMMENTS =====
export interface FormationComment {
  id: string;
  session_id: string;
  author_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  author?: Pick<Profile, "id" | "first_name" | "last_name">;
}

// ===== FORMATION ABSENCES =====
export type AbsenceStatus = "justified" | "unjustified" | "excused";

export interface FormationAbsence {
  id: string;
  session_id: string;
  learner_id: string;
  time_slot_id: string | null;
  date: string;
  reason: string | null;
  status: AbsenceStatus;
  notes: string | null;
  created_at: string;
  learner?: Learner;
  time_slot?: FormationTimeSlot;
}

// ===== FORMATION DOCUMENTS =====
export type FormationDocCategory = "learner" | "program_support" | "common" | "private" | "trainer" | "common_trainer";

export interface FormationDocument {
  id: string;
  session_id: string;
  category: FormationDocCategory;
  learner_id: string | null;
  trainer_id: string | null;
  file_name: string;
  file_url: string;
  uploaded_by: string | null;
  created_at: string;
  learner?: Learner;
  trainer?: Trainer;
}

// ===== FORMATION EVALUATION ASSIGNMENTS =====
export type EvaluationType = "eval_preformation" | "eval_pendant" | "eval_postformation" | "auto_eval_pre" | "auto_eval_post";

export interface FormationEvaluationAssignment {
  id: string;
  session_id: string;
  questionnaire_id: string;
  evaluation_type: EvaluationType;
  learner_id: string | null;
  created_at: string;
  questionnaire?: Questionnaire;
}

// ===== FORMATION SATISFACTION ASSIGNMENTS =====
export type SatisfactionType = "satisfaction_chaud" | "satisfaction_froid" | "quest_financeurs" | "quest_formateurs" | "quest_managers" | "quest_entreprises" | "autres_quest";
export type SatisfactionTargetType = "learner" | "trainer" | "manager" | "financier" | "company";

export interface FormationSatisfactionAssignment {
  id: string;
  session_id: string;
  questionnaire_id: string;
  satisfaction_type: SatisfactionType;
  target_type: SatisfactionTargetType;
  target_id: string | null;
  created_at: string;
  questionnaire?: Questionnaire;
}

// ===== FORMATION CONVENTION DOCUMENTS =====
export type ConventionDocType =
  | "convocation" | "certificat_realisation" | "attestation_assiduite"
  | "feuille_emargement" | "micro_certificat"
  | "cgv" | "politique_confidentialite" | "reglement_interieur" | "programme_formation"
  | "convention_entreprise" | "feuille_emargement_collectif"
  | "convention_intervention" | "contrat_sous_traitance"
  | "custom";

export type ConventionOwnerType = "learner" | "company" | "trainer";

export interface FormationConventionDocument {
  id: string;
  session_id: string;
  doc_type: ConventionDocType;
  owner_type: ConventionOwnerType;
  owner_id: string;
  template_id: string | null;
  is_confirmed: boolean;
  confirmed_at: string | null;
  is_sent: boolean;
  sent_at: string | null;
  is_signed: boolean;
  signed_at: string | null;
  document_date: string | null;
  custom_label: string | null;
  requires_signature: boolean;
  created_at: string;
  template?: DocumentTemplate;
}

// ===== FORMATION E-LEARNING ASSIGNMENTS =====
export interface FormationElearningAssignment {
  id: string;
  session_id: string;
  learner_id: string;
  course_id: string;
  elearning_enrollment_id: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  time_elearning_modules: number;
  time_elearning_evaluations: number;
  time_other_evaluations: number;
  time_virtual_classroom: number;
  time_signed_attendance: number;
  is_completed: boolean;
  created_at: string;
  course?: { id: string; title: string; status: string; estimated_duration_minutes: number };
}

// ===== ENROLLMENTS =====
export type EnrollmentStatus = "registered" | "confirmed" | "cancelled" | "completed";

export interface Enrollment {
  id: string;
  session_id: string;
  learner_id: string | null;
  client_id: string | null;
  status: EnrollmentStatus;
  completion_rate: number;
  enrolled_at: string;
  session?: Session;
  learner?: Learner;
  client?: Client;
}

// ===== PROGRAMS =====
export interface Program {
  id: string;
  entity_id: string;
  title: string;
  description: string | null;
  objectives: string | null;
  version: number;
  is_active: boolean;
  content: Record<string, unknown> | null;
  price: number | null;
  tva_rate: number | null;
  duration_hours: number | null;
  nsf_code: string | null;
  nsf_label: string | null;
  is_apprenticeship: boolean;
  bpf_objective: BpfObjective | null;
  bpf_funding_type: BpfFundingType | null;
  created_at: string;
  updated_at: string;
  versions?: ProgramVersion[];
}

export interface ProgramVersion {
  id: string;
  program_id: string;
  version: number;
  content: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

// ===== PROGRAM ENROLLMENTS =====
export type ProgramEnrollmentStatus = "enrolled" | "in_progress" | "completed";

export interface ProgramEnrollment {
  id: string;
  program_id: string;
  learner_id: string;
  client_id: string | null;
  status: ProgramEnrollmentStatus;
  completion_rate: number;
  started_at: string | null;
  completed_at: string | null;
  enrolled_at: string;
  learner?: { id: string; first_name: string; last_name: string; email: string | null; client_id: string | null; clients?: { company_name: string } | null };
  program?: Program;
  module_progress?: ProgramModuleProgress[];
}

export interface ProgramModuleProgress {
  id: string;
  enrollment_id: string;
  module_id: number;
  is_completed: boolean;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

// ===== QUESTIONNAIRES =====
export type QuestionnaireType = "satisfaction" | "evaluation" | "survey";
export type QuestionType = "rating" | "text" | "multiple_choice" | "yes_no";
export type QualityIndicatorType =
  | "eval_preformation" | "eval_pendant" | "eval_postformation"
  | "auto_eval_pre" | "auto_eval_post"
  | "satisfaction_chaud" | "satisfaction_froid"
  | "quest_financeurs" | "quest_formateurs" | "quest_managers"
  | "quest_entreprises" | "autres_quest";

export interface Questionnaire {
  id: string;
  entity_id: string;
  title: string;
  description: string | null;
  type: QuestionnaireType;
  quality_indicator_type: QualityIndicatorType | null;
  is_active: boolean;
  created_at: string;
  questions?: Question[];
  _count?: { responses: number };
}

export interface Question {
  id: string;
  questionnaire_id: string;
  text: string;
  type: QuestionType;
  options: string[] | null;
  order_index: number;
  is_required: boolean;
}

export interface QuestionnaireResponse {
  id: string;
  questionnaire_id: string;
  session_id: string | null;
  learner_id: string | null;
  responses: Record<string, unknown>;
  submitted_at: string;
}

// ===== DOCUMENTS =====
export type DocumentType = "agreement" | "certificate" | "attendance" | "invoice" | "other";

export interface DocumentTemplate {
  id: string;
  entity_id: string;
  name: string;
  type: DocumentType;
  content: string | null;
  variables: string[] | null;
  created_at: string;
}

export interface GeneratedDocument {
  id: string;
  template_id: string | null;
  session_id: string | null;
  client_id: string | null;
  learner_id: string | null;
  name: string;
  content: string | null;
  file_url: string | null;
  created_at: string;
  template?: DocumentTemplate;
  session?: Session;
  client?: Client;
  learner?: Learner;
}

// ===== EMAILS =====
export interface EmailTemplate {
  id: string;
  entity_id: string;
  name: string;
  subject: string;
  body: string;
  type: string | null;
  variables: string[] | null;
  created_at: string;
}

export type EmailRecipientType = "learner" | "trainer" | "client" | "financier" | "manager";

export interface EmailHistory {
  id: string;
  entity_id: string;
  template_id: string | null;
  recipient_email: string;
  subject: string;
  body: string | null;
  status: "sent" | "failed" | "pending";
  sent_by: string | null;
  sent_at: string;
  error_message: string | null;
  session_id: string | null;
  recipient_type: EmailRecipientType | null;
  recipient_id: string | null;
  template?: EmailTemplate;
}

// ===== SIGNATURES =====
export interface Signature {
  id: string;
  session_id: string | null;
  signer_id: string | null;
  signer_type: "learner" | "trainer";
  signature_data: string | null;
  signed_at: string;
  document_id: string | null;
  time_slot_id: string | null;
}

// ===== SIGNING TOKENS =====
export interface SigningToken {
  id: string;
  token: string;
  session_id: string;
  enrollment_id: string | null;
  learner_id: string | null;
  trainer_id: string | null;
  entity_id: string;
  token_type: "session" | "individual";
  signer_type: "learner" | "trainer";
  time_slot_id: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

// ===== CRM =====
export interface CrmTag {
  id: string;
  entity_id: string;
  name: string;
  color: string;
  created_at: string;
}

export type ProspectStatus = "new" | "contacted" | "qualified" | "proposal" | "won" | "lost" | "dormant";

export interface CrmProspect {
  id: string;
  entity_id: string;
  company_name: string;
  siret: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  status: ProspectStatus;
  source: string | null;
  notes: string | null;
  assigned_to: string | null;
  converted_client_id: string | null;
  linked_training_id: string | null;
  score?: number;
  naf_code: string | null;
  amount: number | null;
  created_at: string;
  updated_at: string;
  assignee?: Profile;
  tags?: CrmTag[];
}

export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TaskPriority = "low" | "medium" | "high";

export interface CrmTask {
  id: string;
  entity_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  reminder_at: string | null;
  assigned_to: string | null;
  prospect_id: string | null;
  client_id: string | null;
  completion_notes: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assignee?: Profile;
  prospect?: CrmProspect;
  client?: Client;
}

export interface ProspectComment {
  id: string;
  prospect_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export interface CrmQuote {
  id: string;
  entity_id: string;
  reference: string;
  client_id: string | null;
  prospect_id: string | null;
  amount: number | null;
  status: QuoteStatus;
  valid_until: string | null;
  notes: string | null;
  bpf_funding_type: BpfFundingType | null;
  training_id: string | null;
  program_id: string | null;
  created_by: string | null;
  created_at: string;
  client?: Client;
  prospect?: CrmProspect;
  program?: Program;
}

// ===== COMMERCIAL ACTIONS =====

export type CommercialActionType =
  | "call"
  | "email"
  | "meeting"
  | "comment"
  | "status_change"
  | "quote_sent"
  | "quote_accepted"
  | "quote_rejected"
  | "task_created"
  | "document_sent"
  | "relance";

export interface CrmCommercialAction {
  id: string;
  entity_id: string;
  prospect_id: string | null;
  client_id: string | null;
  author_id: string;
  action_type: CommercialActionType;
  subject: string | null;
  content: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  author?: { id: string; first_name: string | null; last_name: string | null };
  prospect?: { id: string; company_name: string; contact_name: string | null };
}

// ===== SEGMENT CRITERIA =====
export type SegmentCriterionType =
  | "prospect_status"
  | "prospect_source"
  | "prospect_score"
  | "prospect_training"
  | "prospect_created_at"
  | "client_status"
  | "client_sector"
  | "client_city"
  | "client_created_at"
  | "tags"
  | "training_participation";

interface BaseSegmentCriterion {
  id: string;
  type: SegmentCriterionType;
}

export interface SelectCriterion extends BaseSegmentCriterion {
  type: "prospect_status" | "prospect_source" | "client_status";
  operator: "in";
  values: string[];
}

export interface TextCriterion extends BaseSegmentCriterion {
  type: "client_sector" | "client_city";
  operator: "contains" | "equals";
  value: string;
}

export interface RangeCriterion extends BaseSegmentCriterion {
  type: "prospect_score";
  operator: "between" | "gte" | "lte";
  min?: number;
  max?: number;
}

export interface DateRangeCriterion extends BaseSegmentCriterion {
  type: "prospect_created_at" | "client_created_at";
  operator: "between" | "after" | "before";
  dateFrom?: string;
  dateTo?: string;
}

export interface TagsCriterion extends BaseSegmentCriterion {
  type: "tags";
  operator: "any" | "all";
  tagIds: string[];
}

export interface TrainingCriterion extends BaseSegmentCriterion {
  type: "prospect_training" | "training_participation";
  operator: "in";
  trainingIds: string[];
}

export type SegmentCriterion =
  | SelectCriterion
  | TextCriterion
  | RangeCriterion
  | DateRangeCriterion
  | TagsCriterion
  | TrainingCriterion;

export type SegmentTargetPool = "prospects" | "clients" | "both";

export interface SegmentCriteria {
  logic: "and";
  criteria: SegmentCriterion[];
  targetPool: SegmentTargetPool;
}

export interface CrmCampaign {
  id: string;
  entity_id: string;
  name: string;
  subject: string | null;
  body: string | null;
  status: "draft" | "scheduled" | "sent" | "cancelled";
  target_type: "all_clients" | "all_prospects" | "by_naf_code" | "segment" | null;
  naf_code?: string | null;
  sent_count: number;
  created_by: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  segment_criteria?: SegmentCriteria | null;
}

// ===== CRM NOTIFICATIONS =====
export type NotificationType = "task_overdue" | "task_due_today" | "task_due_soon" | "quote_followup" | "quote_expiring" | "general" | "prospect_won" | "quote_accepted" | "quote_rejected" | "daily_digest" | "weekly_summary";

export interface CrmNotification {
  id: string;
  entity_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  link: string | null;
  resource_type: string | null;
  resource_id: string | null;
  is_read: boolean;
  created_at: string;
}

// ===== ACTIVITY LOG =====
export interface ActivityLog {
  id: string;
  entity_id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  user?: Profile;
}

// ===== DASHBOARD =====
export interface DashboardStats {
  total_clients: number;
  total_trainers: number;
  total_sessions: number;
  upcoming_sessions: number;
  total_learners: number;
  revenue_month: number;
  total_prospects: number;
  pending_tasks: number;
}

// ===== API RESPONSES =====
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// ===== BPF FINANCIAL DATA =====
export interface BPFFinancialData {
  id: string;
  entity_id: string;
  fiscal_year: number;
  section_c: Record<string, number>;
  section_d: Record<string, number>;
  section_g: Record<string, number>;
  updated_at: string;
}
