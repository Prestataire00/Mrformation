"use server";

import { z } from "zod";

/**
 * Scaffold em-c-1 — Server Action duplicateTemplateToEntity (super_admin only).
 *
 * Implémentation complète en em-d-1 :
 *   - Check côté serveur user_role()='super_admin' (NFR-EML-SEC-5)
 *   - INSERT copie avec entity_id=targetEntityId, key=NULL (collision uniqueness)
 *   - revalidatePath + retourne le copyId pour navigation [Voir →]
 */
export const duplicateTemplateToEntitySchema = z.object({
  templateId: z.string().uuid(),
  targetEntityId: z.string().uuid(),
});

export type DuplicateTemplateToEntityInput = z.infer<
  typeof duplicateTemplateToEntitySchema
>;

export type DuplicateTemplateToEntityResult =
  | { ok: true; copyId: string }
  | { ok: false; error: "unauthorized" }
  | { ok: false; error: "forbidden" }
  | { ok: false; error: "not_found" }
  | { ok: false; error: string };

export async function duplicateTemplateToEntity(
  _input: DuplicateTemplateToEntityInput,
): Promise<DuplicateTemplateToEntityResult> {
  // TODO em-d-1 : implémenter check super_admin server-side + INSERT.
  return { ok: false, error: "not_implemented_yet" };
}
