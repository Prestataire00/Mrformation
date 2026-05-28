"use server";

import { z } from "zod";

/**
 * Scaffold em-c-1 — Server Action saveTemplate.
 *
 * Implémentation complète en em-c-3 (Dialog Édition 3-col) :
 *   - Validation Zod stricte (name, subject, body, category enum)
 *   - Optimistic locking via comparaison updated_at (ID-EML-4)
 *   - Concurrent edit detection → return { ok: false, error: 'concurrent_edit' }
 *   - revalidatePath('/admin/emails')
 *
 * Schema export pour réutilisation côté UI (RHF resolver).
 */
export const saveTemplateSchema = z.object({
  id: z.string().uuid(),
  initialUpdatedAt: z.string(),
  name: z.string().min(1, "Le nom est requis"),
  subject: z.string().min(1, "Le sujet est requis"),
  body: z.string().min(1, "Le corps est requis"),
  category: z
    .enum(["transactional", "automation", "reminder", "batch", "campaign", "custom"])
    .optional(),
  recipient_type: z.string().optional(),
  sender_name: z.string().optional(),
  sender_email: z.string().email("Email invalide").optional().or(z.literal("")),
  attachment_doc_types: z.array(z.string()).optional(),
});

export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>;

export type SaveTemplateResult =
  | { ok: true }
  | { ok: false; error: "validation_failed"; issues: z.ZodIssue[] }
  | { ok: false; error: "unauthorized" }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "concurrent_edit"; currentUpdatedAt: string }
  | { ok: false; error: string };

export async function saveTemplate(_input: SaveTemplateInput): Promise<SaveTemplateResult> {
  // TODO em-c-3 : implémenter le full save avec optimistic lock.
  return { ok: false, error: "not_implemented_yet" };
}
