"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logEvent, logger } from "@/lib/logger";

/**
 * Story em-c-4 — Server Action deleteTemplatePermanent (HARD DELETE).
 *
 * Workflow :
 *   1. Auth + validation Zod (confirmText DOIT être "supprimer")
 *   2. Lookup template
 *   3. Check absence référence par formation_automation_rules.template_id
 *   4. Check absence référence par crm_automation_rules.config.template_id
 *   5. Si référencé → return referenced_by_rules + liste descriptive
 *   6. Sinon → HARD DELETE + revalidatePath + log
 *
 * Note : email_history.template_id a ON DELETE SET NULL (cf schéma
 * em-a-1), donc l'historique des emails envoyés via ce template
 * reste accessible — seule la FK est détachée.
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
  | { ok: false; error: "validation_failed"; issues: z.ZodIssue[] }
  | { ok: false; error: "unauthorized" }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "referenced_by_rules"; references: string[] }
  | { ok: false; error: string };

export async function deleteTemplatePermanent(
  input: DeleteTemplatePermanentInput,
): Promise<DeleteTemplatePermanentResult> {
  const parsed = deleteTemplatePermanentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", issues: parsed.error.issues };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { data: template, error: fetchError } = await supabase
    .from("email_templates")
    .select("id, entity_id, name, key")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (fetchError) {
    logger.error("deleteTemplatePermanent fetch error", fetchError, { template_id: parsed.data.id });
    return { ok: false, error: fetchError.message };
  }
  if (!template) return { ok: false, error: "not_found" };

  // Check référence par formation_automation_rules.template_id
  const { data: formationRules } = await supabase
    .from("formation_automation_rules")
    .select("id, name")
    .eq("template_id", parsed.data.id);

  // Check référence par crm_automation_rules.config->>'template_id'
  const { data: crmRules } = await supabase
    .from("crm_automation_rules")
    .select("id, name, config")
    .filter("config->>template_id", "eq", parsed.data.id);

  const references: string[] = [
    ...(formationRules ?? []).map(
      (r) => `Formation: ${r.name as string} (id=${r.id as string})`,
    ),
    ...(crmRules ?? []).map(
      (r) => `CRM: ${r.name as string} (id=${r.id as string})`,
    ),
  ];

  if (references.length > 0) {
    logEvent("email_template_delete_blocked_referenced", {
      template_id: parsed.data.id,
      references_count: references.length,
    });
    return { ok: false, error: "referenced_by_rules", references };
  }

  // HARD DELETE
  const { error: deleteError } = await supabase
    .from("email_templates")
    .delete()
    .eq("id", parsed.data.id);

  if (deleteError) {
    logger.error("deleteTemplatePermanent delete error", deleteError, {
      template_id: parsed.data.id,
    });
    return { ok: false, error: deleteError.message };
  }

  logEvent("email_template_deleted_permanent", {
    template_id: parsed.data.id,
    entity_id: template.entity_id,
    template_name: template.name,
    template_key: template.key,
    deleted_by: user.id,
  });

  revalidatePath("/admin/emails");
  return { ok: true };
}
