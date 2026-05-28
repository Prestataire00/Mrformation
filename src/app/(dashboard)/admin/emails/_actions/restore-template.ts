"use server";

import { z } from "zod";

/**
 * Scaffold em-c-1 — Server Action restoreTemplate (UPDATE is_active=true).
 * Implémentation complète en em-c-4.
 */
export const restoreTemplateSchema = z.object({
  id: z.string().uuid(),
});

export type RestoreTemplateInput = z.infer<typeof restoreTemplateSchema>;

export type RestoreTemplateResult =
  | { ok: true }
  | { ok: false; error: string };

export async function restoreTemplate(
  _input: RestoreTemplateInput,
): Promise<RestoreTemplateResult> {
  // TODO em-c-4 : implémenter avec UPDATE is_active = TRUE + revalidatePath.
  return { ok: false, error: "not_implemented_yet" };
}
