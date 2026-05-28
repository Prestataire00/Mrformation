"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logEvent, logger } from "@/lib/logger";

/**
 * Story em-c-3a — Server Action saveTemplate avec optimistic locking.
 *
 * Pattern (cf. architecture-module-emails.md §Implementation Patterns 3) :
 *   - Auth check via Supabase getUser()
 *   - Validation Zod stricte (name, subject, body required, category enum)
 *   - Optimistic locking : compare `initialUpdatedAt` (snapshot au load
 *     du dialog) vs DB.updated_at → si mismatch, abort + return
 *     `concurrent_edit` pour que le UI affiche "Quelqu'un a modifié ce
 *     template entre-temps. [Recharger]" (FR-EML-46)
 *   - UPDATE avec `updated_by = auth.uid()` ; trigger PG `updated_at`
 *     se déclenche automatiquement (em-a-1)
 *   - revalidatePath('/admin/emails') pour rafraîchir cache Next.js
 *   - Log structuré email_template_edit_completed
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

export async function saveTemplate(input: SaveTemplateInput): Promise<SaveTemplateResult> {
  const parsed = saveTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", issues: parsed.error.issues };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const start = Date.now();

  // Optimistic lock (ID-EML-4) — compare initialUpdatedAt vs DB
  const { data: current, error: fetchError } = await supabase
    .from("email_templates")
    .select("updated_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (fetchError) {
    logger.error("saveTemplate fetch updated_at error", fetchError, { template_id: parsed.data.id });
    return { ok: false, error: fetchError.message };
  }
  if (!current) {
    return { ok: false, error: "not_found" };
  }
  if (current.updated_at !== parsed.data.initialUpdatedAt) {
    logEvent("email_template_concurrent_edit_conflict", {
      template_id: parsed.data.id,
      user_id: user.id,
      initial_updated_at: parsed.data.initialUpdatedAt,
      current_updated_at: current.updated_at,
    });
    return {
      ok: false,
      error: "concurrent_edit",
      currentUpdatedAt: current.updated_at,
    };
  }

  const { id, initialUpdatedAt: _ignored, sender_email, ...rest } = parsed.data;
  void _ignored;
  const payload: Record<string, unknown> = {
    ...rest,
    updated_by: user.id,
    // sender_email peut être chaîne vide (Zod .or(literal(""))) → on stocke NULL pour cohérence DB
    sender_email: sender_email && sender_email.length > 0 ? sender_email : null,
  };

  const { error: updateError } = await supabase
    .from("email_templates")
    .update(payload)
    .eq("id", id);

  if (updateError) {
    logger.error("saveTemplate update error", updateError, { template_id: id });
    return { ok: false, error: updateError.message };
  }

  const duration_ms = Date.now() - start;
  logEvent("email_template_edit_completed", {
    template_id: id,
    user_id: user.id,
    duration_ms,
  });

  revalidatePath("/admin/emails");
  return { ok: true };
}
