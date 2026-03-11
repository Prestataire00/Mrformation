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
export type UserRole = "admin" | "trainer" | "client" | "learner";

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

// ===== TRAININGS =====
export type TrainingClassification = "reglementaire" | "certifiant" | "qualifiant" | null;

export interface Training {
  id: string;
  entity_id: string;
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
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sessions?: Session[];
}

// ===== SESSIONS =====
export type SessionStatus = "upcoming" | "in_progress" | "completed" | "cancelled";
export type SessionMode = "presentiel" | "distanciel" | "hybride";

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
  created_at: string;
  training?: Training;
  trainer?: Trainer;
  enrollments?: Enrollment[];
  _count?: { enrollments: number };
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
  assigned_to: string | null;
  prospect_id: string | null;
  client_id: string | null;
  created_at: string;
  assignee?: Profile;
  prospect?: CrmProspect;
  client?: Client;
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
  created_by: string | null;
  created_at: string;
  client?: Client;
  prospect?: CrmProspect;
}

export interface CrmCampaign {
  id: string;
  entity_id: string;
  name: string;
  subject: string | null;
  body: string | null;
  status: "draft" | "scheduled" | "sent" | "cancelled";
  target_type: "all_clients" | "all_prospects" | "segment" | null;
  sent_count: number;
  created_by: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
}

// ===== CRM NOTIFICATIONS =====
export type NotificationType = "task_overdue" | "task_due_today" | "task_due_soon" | "quote_followup" | "quote_expiring" | "general";

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
