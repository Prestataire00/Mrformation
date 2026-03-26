import { z } from "zod";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidField = z
  .string()
  .regex(UUID_REGEX, "UUID invalide")
  .optional()
  .nullable();

export const createCommercialActionSchema = z.object({
  prospect_id: uuidField,
  client_id: uuidField,
  action_type: z.enum([
    "call",
    "email",
    "meeting",
    "comment",
    "status_change",
    "quote_sent",
    "quote_accepted",
    "quote_rejected",
    "task_created",
    "document_sent",
    "relance",
  ]),
  subject: z.string().max(255).optional().nullable(),
  content: z.string().max(5000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});
