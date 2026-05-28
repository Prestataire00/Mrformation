"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logEvent, logger } from "@/lib/logger";

/**
 * Story em-c-4 — Server Action restoreTemplate.
 *
 * Restaure un template archivé (UPDATE is_active = TRUE).
 * Pas de check d'unicité de key : la contrainte UNIQUE PARTIAL de
 * em-a-1 (WHERE key IS NOT NULL AND is_active = TRUE) garantit qu'une
 * tentative de restore vers une key déjà active sera rejetée par DB.
 */
export const restoreTemplateSchema = z.object({
  id: z.string().uuid(),
});

export type RestoreTemplateInput = z.infer<typeof restoreTemplateSchema>;

export type RestoreTemplateResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "key_already_active"; conflictingKey: string }
  | { ok: false; error: string };

export async function restoreTemplate(
  input: RestoreTemplateInput,
): Promise<RestoreTemplateResult> {
  const parsed = restoreTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { data: template, error: fetchError } = await supabase
    .from("email_templates")
    .select("id, entity_id, key, is_active")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (fetchError) {
    logger.error("restoreTemplate fetch error", fetchError, { template_id: parsed.data.id });
    return { ok: false, error: fetchError.message };
  }
  if (!template) return { ok: false, error: "not_found" };

  const { error: updateError } = await supabase
    .from("email_templates")
    .update({ is_active: true, updated_by: user.id })
    .eq("id", parsed.data.id);

  if (updateError) {
    // Si la contrainte UNIQUE partial est violée (autre template avec
    // même key déjà actif), Postgres retourne code 23505.
    if (updateError.code === "23505" && template.key) {
      logEvent("email_template_restore_blocked_key_collision", {
        template_id: parsed.data.id,
        key: template.key,
      });
      return { ok: false, error: "key_already_active", conflictingKey: template.key };
    }
    logger.error("restoreTemplate update error", updateError, { template_id: parsed.data.id });
    return { ok: false, error: updateError.message };
  }

  logEvent("email_template_restored", {
    template_id: parsed.data.id,
    entity_id: template.entity_id,
    restored_by: user.id,
  });

  revalidatePath("/admin/emails");
  return { ok: true };
}
