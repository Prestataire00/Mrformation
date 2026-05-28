"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logEvent, logger } from "@/lib/logger";

/**
 * Story em-d-1 — Server Action duplicateTemplateToEntity.
 *
 * Permet à un super_admin (gérant MR + C3V) de dupliquer un template
 * d'une entité vers une autre. Pattern décrit dans architecture
 * §Authentication & Security (ID-EML-5) — check côté serveur
 * indispensable, jamais juste UI (NFR-EML-SEC-5).
 *
 * Workflow :
 *   1. Auth check
 *   2. Lookup profile pour récupérer role
 *   3. Si role !== 'super_admin' → return forbidden
 *   4. Lookup template source (RLS auto-scope à l'entité du user
 *      OU à toutes les entités si super_admin)
 *   5. INSERT copie avec :
 *      - entity_id = targetEntityId
 *      - key = NULL (évite collision UNIQUE index si target a déjà
 *        un template avec cette key active)
 *      - created_by = auth.uid() (audit cross-entity)
 *      - name préfixé "[Copie] " pour différenciation visuelle
 *   6. Log structuré email_template_duplicated_cross_entity
 *   7. revalidatePath + retourne copyId pour navigation [Voir →]
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
  | { ok: false; error: "validation_failed"; issues: z.ZodIssue[] }
  | { ok: false; error: "unauthorized" }
  | { ok: false; error: "forbidden" }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "same_entity" }
  | { ok: false; error: string };

export async function duplicateTemplateToEntity(
  input: DuplicateTemplateToEntityInput,
): Promise<DuplicateTemplateToEntityResult> {
  const parsed = duplicateTemplateToEntitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", issues: parsed.error.issues };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  // NFR-EML-SEC-5 — Check côté SERVEUR (jamais juste UI)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileError) {
    logger.error("duplicateTemplateToEntity profile fetch error", profileError, { user_id: user.id });
    return { ok: false, error: profileError.message };
  }
  if (!profile || profile.role !== "super_admin") {
    logEvent("email_template_duplicate_forbidden", {
      user_id: user.id,
      template_id: parsed.data.templateId,
      target_entity_id: parsed.data.targetEntityId,
      user_role: profile?.role ?? null,
    });
    return { ok: false, error: "forbidden" };
  }

  // Lookup template source (super_admin peut lire cross-entité)
  const { data: source, error: srcError } = await supabase
    .from("email_templates")
    .select("*")
    .eq("id", parsed.data.templateId)
    .maybeSingle();
  if (srcError) {
    logger.error("duplicateTemplateToEntity source fetch error", srcError, { template_id: parsed.data.templateId });
    return { ok: false, error: srcError.message };
  }
  if (!source) return { ok: false, error: "not_found" };

  // Sécurité : empêcher self-duplication
  if (source.entity_id === parsed.data.targetEntityId) {
    return { ok: false, error: "same_entity" };
  }

  // INSERT copie avec key=NULL pour éviter collision UNIQUE index
  // (em-a-1 : email_templates_entity_key_uniq (entity_id, key) WHERE
  // key IS NOT NULL AND is_active = TRUE)
  const sourceTyped = source as Record<string, unknown>;
  const { id: _ignored, created_at: _ca, updated_at: _ua, ...rest } = sourceTyped as {
    id: unknown;
    created_at: unknown;
    updated_at: unknown;
    [k: string]: unknown;
  };
  void _ignored;
  void _ca;
  void _ua;
  const insertPayload: Record<string, unknown> = {
    ...rest,
    entity_id: parsed.data.targetEntityId,
    key: null, // reset pour éviter collision
    name: `[Copie] ${(rest.name as string) ?? "Sans nom"}`,
    created_by: user.id,
    updated_by: user.id,
    is_active: true,
  };

  const { data: copy, error: insertError } = await supabase
    .from("email_templates")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError) {
    logger.error("duplicateTemplateToEntity insert error", insertError, {
      template_id: parsed.data.templateId,
      target_entity_id: parsed.data.targetEntityId,
    });
    return { ok: false, error: insertError.message };
  }

  logEvent("email_template_duplicated_cross_entity", {
    source_template_id: parsed.data.templateId,
    source_entity_id: source.entity_id as string,
    target_entity_id: parsed.data.targetEntityId,
    copy_id: copy.id as string,
    duplicated_by: user.id,
  });

  revalidatePath("/admin/emails");
  return { ok: true, copyId: copy.id as string };
}
