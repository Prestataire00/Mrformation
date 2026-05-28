"use server";

import { z } from "zod";

/**
 * Scaffold em-c-1 — Server Action archiveTemplate (soft-delete is_active=false).
 *
 * Implémentation complète en em-c-3 / em-c-4 :
 *   - Check usage_count via vue email_template_usage (em-a-5)
 *   - Si usage_count > 0 → bloquer + return { ok: false, error: 'in_use' }
 *   - Sinon → UPDATE is_active = FALSE + revalidatePath
 */
export const archiveTemplateSchema = z.object({
  id: z.string().uuid(),
});

export type ArchiveTemplateInput = z.infer<typeof archiveTemplateSchema>;

export type ArchiveTemplateResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "in_use"; usageCount: number }
  | { ok: false; error: string };

export async function archiveTemplate(
  _input: ArchiveTemplateInput,
): Promise<ArchiveTemplateResult> {
  // TODO em-c-3/c-4 : implémenter avec check usage + soft archive.
  return { ok: false, error: "not_implemented_yet" };
}
