"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logEvent, logger } from "@/lib/logger";

/**
 * Story em-c-3a — Server Action archiveTemplate (soft-delete is_active=false).
 *
 * Workflow :
 *   1. Auth check
 *   2. Lookup usage via la vue SQL `email_template_usage` (em-a-5)
 *   3. Si usage_count > 0 → bloquer avec return `in_use` + usageCount
 *      (le UI affiche la modal "Désactive les automations d'abord")
 *   4. Sinon UPDATE is_active = FALSE + updated_by + revalidatePath
 *   5. Log structuré email_template_archived
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
  input: ArchiveTemplateInput,
): Promise<ArchiveTemplateResult> {
  const parsed = archiveTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  // Vérifier que le template existe (et qu'on a le droit via RLS)
  const { data: template, error: fetchError } = await supabase
    .from("email_templates")
    .select("id, entity_id, is_active")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (fetchError) {
    logger.error("archiveTemplate fetch error", fetchError, { template_id: parsed.data.id });
    return { ok: false, error: fetchError.message };
  }
  if (!template) return { ok: false, error: "not_found" };

  // Check usage via vue email_template_usage (em-a-5)
  const { data: usage, error: usageError } = await supabase
    .from("email_template_usage")
    .select("usage_count")
    .eq("template_id", parsed.data.id)
    .maybeSingle();

  // Si la vue n'a pas de ligne pour ce template, usage_count = 0 (template orphelin)
  // Si erreur (vue absente), on log mais on continue (fail-safe défaut = archive autorisé)
  if (usageError) {
    logger.warn("archiveTemplate usage check failed (continuing)", { error: usageError.message });
  }
  const usageCount = usage?.usage_count ?? 0;
  if (usageCount > 0) {
    return { ok: false, error: "in_use", usageCount };
  }

  // Soft-archive
  const { error: updateError } = await supabase
    .from("email_templates")
    .update({ is_active: false, updated_by: user.id })
    .eq("id", parsed.data.id);

  if (updateError) {
    logger.error("archiveTemplate update error", updateError, { template_id: parsed.data.id });
    return { ok: false, error: updateError.message };
  }

  logEvent("email_template_archived", {
    template_id: parsed.data.id,
    entity_id: template.entity_id,
    archived_by: user.id,
  });

  revalidatePath("/admin/emails");
  return { ok: true };
}
