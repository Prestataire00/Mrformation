import { z } from "zod";

// Shared helpers
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SIRET_REGEX = /^\d{14}$/;
export const PHONE_REGEX = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\./0-9]*$/;

export const uuidField = z.string().regex(UUID_REGEX, "UUID invalide").optional().nullable();
export const requiredUuid = z.string().regex(UUID_REGEX, "UUID invalide");

export const emailField = z.string().email("Email invalide").max(255);
export const phoneField = z.preprocess(
  (val) => (val === "" ? null : val),
  z.string().regex(PHONE_REGEX, "Numéro de téléphone invalide").max(20).optional().nullable()
);
export const siretField = z.string().regex(SIRET_REGEX, "Le SIRET doit contenir exactement 14 chiffres").optional().nullable();
export const urlField = z.string().url("URL invalide").max(500).optional().nullable().or(z.literal(""));
export const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (YYYY-MM-DD)").optional().nullable();

// Pagination helper - caps per_page at 100
export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("per_page") || "20")));
  const offset = (page - 1) * perPage;
  return { page, perPage, offset };
}

// Client schemas
export const createClientSchema = z.object({
  company_name: z.string().min(1, "Le nom de l'entreprise est requis").max(255),
  siret: siretField,
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  postal_code: z.string().max(10).optional().nullable(),
  website: urlField,
  sector: z.string().max(100).optional().nullable(),
  status: z.enum(["active", "inactive", "prospect"]).optional().default("active"),
  notes: z.string().max(5000).optional().nullable(),
  phone: phoneField,
  email: emailField.optional().nullable(),
});

export const updateClientSchema = createClientSchema.partial();

// Trainer schemas
export const createTrainerSchema = z.object({
  first_name: z.string().min(1, "Le prénom est requis").max(100),
  last_name: z.string().min(1, "Le nom est requis").max(100),
  email: emailField,
  phone: phoneField,
  bio: z.string().max(5000).optional().nullable(),
  specialties: z.array(z.string().max(100)).optional().nullable(),
  status: z.enum(["active", "inactive"]).optional().default("active"),
  hourly_rate: z.number().min(0).max(10000).optional().nullable(),
});

export const updateTrainerSchema = createTrainerSchema.partial();

// Training schemas
export const createTrainingSchema = z.object({
  title: z.string().min(1, "Le titre est requis").max(255),
  description: z.string().max(10000).optional().nullable(),
  duration_hours: z.number().min(0.5).max(10000).optional().nullable(),
  price: z.number().min(0).max(1000000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional().nullable(),
  status: z.enum(["draft", "active", "archived"]).optional().default("draft"),
  prerequisites: z.string().max(5000).optional().nullable(),
});

export const updateTrainingSchema = createTrainingSchema.partial();

// Session schemas
export const createSessionSchema = z.object({
  training_id: requiredUuid,
  trainer_id: uuidField,
  client_id: uuidField,
  start_date: dateField,
  end_date: dateField,
  location: z.string().max(255).optional().nullable(),
  status: z.enum(["planned", "in_progress", "completed", "cancelled"]).optional().default("planned"),
  max_participants: z.number().int().min(1).max(1000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const updateSessionSchema = createSessionSchema.partial();

// User creation schema (admin)
export const createUserSchema = z.object({
  email: emailField,
  password: z.string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .max(128)
    .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
    .regex(/[a-z]/, "Le mot de passe doit contenir au moins une minuscule")
    .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre"),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  role: z.enum(["admin", "trainer", "client", "learner"]),
  phone: phoneField,
});

// CRM Prospect schema
export const createProspectSchema = z.object({
  company_name: z.string().min(1, "Le nom de l'entreprise est requis").max(255),
  contact_name: z.string().max(255).optional().nullable(),
  contact_email: emailField.optional().nullable(),
  contact_phone: phoneField,
  status: z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]).optional().default("new"),
  source: z.string().max(100).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  estimated_value: z.number().min(0).max(10000000).optional().nullable(),
});

export const updateProspectSchema = createProspectSchema.partial();

// CRM Quote schema
export const createQuoteSchema = z.object({
  prospect_id: uuidField,
  client_id: uuidField,
  title: z.string().min(1, "Le titre est requis").max(255),
  amount: z.number().min(0).max(10000000),
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]).optional().default("draft"),
  valid_until: dateField,
  notes: z.string().max(5000).optional().nullable(),
});

export const updateQuoteSchema = createQuoteSchema.partial();

// Formation Time Slot schemas
export const createTimeSlotSchema = z.object({
  title: z.string().max(500).optional().nullable(),
  start_time: z.string().min(1, "L'heure de début est requise"),
  end_time: z.string().min(1, "L'heure de fin est requise"),
  slot_order: z.number().int().min(0).optional(),
  module_title: z.string().max(500).optional().nullable(),
  module_objectives: z.string().max(5000).optional().nullable(),
  module_themes: z.string().max(5000).optional().nullable(),
  module_exercises: z.string().max(5000).optional().nullable(),
});

export const updateTimeSlotSchema = createTimeSlotSchema.partial();

export const bulkTimeSlotSchema = z.object({
  variant: z.enum([
    "every_day",
    "every_day_no_weekends",
    "with_lunch",
    "with_lunch_no_weekends",
    "weekly",
    "weekly_with_lunch",
  ]),
  date_from: z.string().min(1, "La date de début est requise"),
  date_to: z.string().min(1, "La date de fin est requise"),
  time_start: z.string().min(1, "L'heure de début est requise"),
  time_end: z.string().min(1, "L'heure de fin est requise"),
  lunch_start: z.string().optional().default("12:00"),
  lunch_end: z.string().optional().default("13:00"),
  weekly_day: z.number().int().min(0).max(6).optional(),
  title: z.string().max(500).optional(),
});
