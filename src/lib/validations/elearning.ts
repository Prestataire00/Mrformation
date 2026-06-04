/**
 * EL-4 audit BMAD — Schémas Zod du module e-learning.
 *
 * Avant : 0 formulaire utilisait RHF + Zod dans /admin/elearning
 * (hub dialog Nouveau cours, dialog durée, wizard create). Validation
 * inline manuelle, pas d'affichage d'erreurs par champ. Violation
 * règle absolue #6 CLAUDE.md.
 *
 * Ce module centralise les schémas réutilisables pour brancher Zod
 * partout sans dupliquer les regex/enums.
 */

import { z } from "zod";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
const stringToNumber = (v: unknown) => {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n as number) ? n : undefined;
};

// ── Dialog "Nouveau cours" du hub (programs.content.type='elearning') ──

export const elearningCourseStatusEnum = z.enum(["draft", "published", "archived"]);

export const elearningCourseModuleSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string().min(1, "Le titre du module est requis").max(255, "Maximum 255 caractères"),
  duration_minutes: z.preprocess(stringToNumber, z.number().min(0).max(10_000).optional()),
  order_index: z.number().optional(),
});

export const elearningHubCourseSchema = z.object({
  title: z.string().min(1, "Le titre est requis").max(255, "Maximum 255 caractères"),
  description: z.preprocess(emptyToNull, z.string().max(5000).nullable()),
  objectives: z.preprocess(emptyToNull, z.string().max(5000).nullable()),
  status: elearningCourseStatusEnum,
  modules: z.array(elearningCourseModuleSchema).min(1, "Au moins un module est requis"),
});

export type ElearningHubCourseInput = z.input<typeof elearningHubCourseSchema>;

// ── Édition de la durée estimée (detail course) ────────────────────

export const elearningDurationSchema = z.object({
  estimated_duration_minutes: z.preprocess(
    stringToNumber,
    z.number().min(1, "Durée minimale 1 minute").max(100_000, "Durée maximale 100 000 minutes"),
  ),
});

export type ElearningDurationInput = z.input<typeof elearningDurationSchema>;

// ── Wizard create (configuration générale) ─────────────────────────

export const elearningCourseTypeEnum = z.enum([
  "presentation_quiz",
  "presentation_quiz_flashcard",
  "quiz",
  "flashcards",
]);

export const elearningCreateConfigSchema = z.object({
  title: z.string().min(1, "Le titre est requis").max(255),
  description: z.preprocess(emptyToNull, z.string().max(5000).nullable()),
  objectives: z.preprocess(emptyToNull, z.string().max(5000).nullable()),
  course_type: elearningCourseTypeEnum,
  num_chapters: z.number().int().min(1).max(20),
  final_quiz_target_count: z.number().int().min(0).max(50),
  gamma_theme_id: z.preprocess(emptyToNull, z.string().max(255).nullable()),
});

export type ElearningCreateConfigInput = z.input<typeof elearningCreateConfigSchema>;

// ── Helper : extrait erreurs pour affichage sous chaque champ ──────

type ZodLikeError = { error: { issues: Array<{ path: PropertyKey[]; message: string }> } };

export function getElearningFormErrors<T>(
  result: { success: true } | ({ success: false } & ZodLikeError),
): Partial<Record<keyof T & string, string>> {
  if (result.success) return {};
  const map: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !map[key]) map[key] = issue.message;
  }
  return map as Partial<Record<keyof T & string, string>>;
}
