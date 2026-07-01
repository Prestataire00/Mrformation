import { z } from "zod";

export const TRIGGER_TYPES = [
  "session_start_minus_days", "session_end_plus_days", "on_session_creation",
  "on_session_completion", "on_enrollment", "on_signature_complete",
  "opco_deposit_reminder", "invoice_overdue", "questionnaire_reminder", "certificate_ready",
] as const;

export const RECIPIENT_TYPES = ["learners", "trainers", "companies", "all"] as const;

export const packMetaSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(120),
  description: z.string().max(2000).optional().nullable(),
  icon: z.string().max(16).optional().nullable(),
  color: z.string().max(32).optional().nullable(),
  is_default: z.boolean().optional().default(false),
});

export const packStepSchema = z.object({
  trigger_type: z.enum(TRIGGER_TYPES),
  days_offset: z.number().int().min(0).max(3650).optional().default(0),
  recipient_type: z.enum(RECIPIENT_TYPES).optional().nullable(),
  document_type: z.string().max(80).optional().nullable(),
  template_id: z.string().uuid().optional().nullable(),
  condition_subcontracted: z.boolean().optional().nullable(),
  send_email: z.boolean().optional().default(true),
  name: z.string().max(160).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
}).refine(
  (s) => (s.document_type && s.document_type.length > 0) || !!s.template_id,
  { message: "Chaque étape doit avoir un document ou un template email", path: ["document_type"] },
);

export const packStepsSchema = z.array(packStepSchema);

export type PackMetaInput = z.infer<typeof packMetaSchema>;
export type PackStepInput = z.infer<typeof packStepSchema>;
