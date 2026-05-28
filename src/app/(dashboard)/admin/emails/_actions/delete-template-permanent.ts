"use server";

import { z } from "zod";

/**
 * Scaffold em-c-1 — Server Action deleteTemplatePermanent (HARD DELETE).
 *
 * Implémentation complète en em-c-4 :
 *   - confirmText DOIT être 'supprimer' (validation côté serveur)
 *   - Check absence référence par formation_automation_rules.template_id
 *   - Check absence référence par crm_automation_rules.config.template_id
 *   - Si référencé → bloquer
 *   - Sinon → DELETE + revalidatePath
 */
export const deleteTemplatePermanentSchema = z.object({
  id: z.string().uuid(),
  confirmText: z.literal("supprimer", {
    message: "Vous devez taper 'supprimer' pour confirmer",
  }),
});

export type DeleteTemplatePermanentInput = z.infer<typeof deleteTemplatePermanentSchema>;

export type DeleteTemplatePermanentResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "referenced_by_rules"; references: string[] }
  | { ok: false; error: string };

export async function deleteTemplatePermanent(
  _input: DeleteTemplatePermanentInput,
): Promise<DeleteTemplatePermanentResult> {
  // TODO em-c-4 : implémenter avec check références + HARD DELETE.
  return { ok: false, error: "not_implemented_yet" };
}
