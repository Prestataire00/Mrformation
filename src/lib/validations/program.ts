/**
 * Lot C audit BMAD — Validation Zod des formulaires Programmes.
 *
 * Avant : aucun formulaire du module Programmes n'utilisait React Hook
 * Form + Zod. Validation manuelle inline (`if (!formData.title.trim())`)
 * avec messages d'erreur via toast générique. Violation règle absolue #6
 * CLAUDE.md.
 *
 * Ce module définit les schémas Zod réutilisables :
 *  - programHubFormSchema : dialog Add/Edit du hub (champs scalaires +
 *    métadonnées BPF/Qualiopi de premier niveau)
 *  - programContentSchema : valide la structure JSON du contenu pédagogique
 *    (modules) — utilisé conjointement pour valider le textarea JSON brut
 *  - programCreateSessionSchema : dialog "Créer une session" dans la page
 *    détail programme
 *
 * Le helper `getProgramFormErrors` mappe un ZodSafeParseError en
 * Record<champ, premier message> pour affichage sous chaque <Input>.
 */

import { z } from "zod";
import { BPF_FUNDING_TYPE_VALUES, BPF_OBJECTIVE_VALUES } from "@/lib/bpf-enums";

// ── Schémas auxiliaires ────────────────────────────────────────────

/**
 * Structure JSON du contenu pédagogique d'un programme.
 * Aligné sur l'interface ProgramContent (src/lib/types/index.ts).
 */
export const programContentSchema = z.object({
  modules: z
    .array(
      z.object({
        id: z.number(),
        title: z.string().min(1, "Le titre du module est requis"),
        duration_hours: z.number().min(0).optional(),
        objectives: z.array(z.string()).optional(),
        topics: z.array(z.string()).optional(),
      }),
    )
    .min(1, "Au moins un module est requis"),
  duration_hours: z.number().min(0).optional(),
  duration_days: z.number().min(0).optional(),
  location: z.string().max(255).optional(),
  specialty: z.string().max(255).optional(),
  diploma: z.string().max(500).optional(),
  cpf_eligible: z.boolean().optional(),
  target_audience: z.string().max(5000).optional(),
  prerequisites: z.string().max(5000).optional(),
  team_description: z.string().max(5000).optional(),
  evaluation_methods: z.array(z.string()).optional(),
  pedagogical_resources: z.array(z.string()).optional(),
  certification_results: z.string().max(5000).optional(),
  certification_terms: z.string().max(5000).optional(),
  certification_details: z.string().max(5000).optional(),
});

export type ProgramContentInput = z.infer<typeof programContentSchema>;

// ── Schéma principal : dialog Add/Edit hub ─────────────────────────

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
const stringToNumberOrNull = (v: unknown) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n as number) ? n : null;
};

export const programHubFormSchema = z.object({
  title: z.string().min(1, "Le titre est requis").max(255, "Maximum 255 caractères"),
  description: z.preprocess(emptyToNull, z.string().max(5000).nullable()),
  objectives: z.preprocess(emptyToNull, z.string().max(5000).nullable()),
  // Le content est saisi en string JSON dans le textarea ; on valide
  // que c'est du JSON valide ET conforme à programContentSchema.
  content: z
    .string()
    .min(1, "Le contenu est requis")
    .refine((raw) => {
      try {
        JSON.parse(raw);
        return true;
      } catch {
        return false;
      }
    }, "JSON invalide — vérifiez la syntaxe")
    .refine((raw) => {
      try {
        const parsed = JSON.parse(raw);
        return programContentSchema.safeParse(parsed).success;
      } catch {
        return false;
      }
    }, "Le contenu doit avoir une clé \"modules\" non vide"),
  price: z.preprocess(stringToNumberOrNull, z.number().min(0).max(1_000_000).nullable()),
  tva_rate: z.preprocess(stringToNumberOrNull, z.number().min(0).max(100).nullable()),
  duration_hours: z.preprocess(stringToNumberOrNull, z.number().min(0).max(10_000).nullable()),
  nsf_code: z.preprocess(emptyToNull, z.string().max(20).nullable()),
  nsf_label: z.preprocess(emptyToNull, z.string().max(255).nullable()),
  is_apprenticeship: z.boolean(),
  bpf_objective: z.preprocess(
    emptyToNull,
    z.enum(BPF_OBJECTIVE_VALUES).nullable(),
  ),
  bpf_funding_type: z.preprocess(
    emptyToNull,
    z.enum(BPF_FUNDING_TYPE_VALUES).nullable(),
  ),
});

export type ProgramHubFormInput = z.input<typeof programHubFormSchema>;
export type ProgramHubFormOutput = z.output<typeof programHubFormSchema>;

// ── Schéma : créer une session depuis un programme ─────────────────

export const programCreateSessionSchema = z.object({
  title: z.string().min(1, "Le titre est requis").max(255),
  startDate: z.string().min(1, "La date de début est requise"),
  endDate: z.string().min(1, "La date de fin est requise"),
  location: z.preprocess(emptyToNull, z.string().max(255).nullable()),
  mode: z.enum(["presentiel", "distanciel", "hybride"]),
  trainerId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
}).refine(
  (data) => new Date(data.startDate) <= new Date(data.endDate),
  { message: "La date de fin doit être postérieure à la date de début", path: ["endDate"] },
);

export type ProgramCreateSessionInput = z.infer<typeof programCreateSessionSchema>;

// ── Helper : extrait une map { champ → premier message } ────────────

type ZodLikeError = { error: { issues: Array<{ path: PropertyKey[]; message: string }> } };

export function getProgramFormErrors<T>(
  result: { success: true } | ({ success: false } & ZodLikeError),
): Partial<Record<keyof T & string, string>> {
  if (result.success) return {};
  const map: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !map[key]) {
      map[key] = issue.message;
    }
  }
  return map as Partial<Record<keyof T & string, string>>;
}
