import { z } from "zod";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidField = z
  .string()
  .regex(UUID_REGEX, "UUID invalide")
  .optional()
  .nullable();

export const createTaskSchema = z.object({
  title: z.string().min(1, "Le titre est requis").max(255),
  description: z.string().max(5000).optional().nullable(),
  status: z
    .enum(["pending", "in_progress", "completed", "cancelled"])
    .optional()
    .default("pending"),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  // Type/Label libre — typiquement l'un des 4 connus Sellsy (Rappel, Relance,
  // Appel téléphonique, Rendez-vous) mais le champ accepte du texte libre
  // pour les types custom. Cf util `SELLSY_TASK_LABELS`.
  label: z.string().max(100).optional().nullable(),
  contact_email: z
    .string()
    .email("Email invalide")
    .optional()
    .nullable()
    .or(z.literal("")),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (YYYY-MM-DD)")
    .optional()
    .nullable(),
  reminder_at: z.string().optional().nullable(),
  assigned_to: uuidField,
  prospect_id: uuidField,
  client_id: uuidField,
  completion_notes: z.string().max(5000).optional().nullable(),
  completed_at: z.string().optional().nullable(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const uuidParamSchema = z
  .string()
  .regex(UUID_REGEX, "Identifiant invalide");
