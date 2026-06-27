import { z } from "zod";

/**
 * Schema Zod pour l'édition d'une entreprise rattachée à une session (Story 1.2).
 * Champs éditables : amount, email, reference.
 *
 * Les champs du formulaire sont des strings (inputs HTML). Les transforms
 * convertissent vers les types attendus par le service.
 */
export const editCompanyOnSessionSchema = z.object({
  amount: z
    .string()
    .transform((v) => (v.trim() === "" ? null : parseFloat(v)))
    .refine((v) => v === null || (!isNaN(v) && v >= 0), {
      message: "Le montant doit être un nombre positif",
    }),
  email: z
    .string()
    .transform((v) => (v.trim() === "" ? null : v.trim()))
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Email invalide",
    }),
  reference: z
    .string()
    .transform((v) => (v.trim() === "" ? null : v.trim()))
    .refine((v) => v === null || v.length <= 255, {
      message: "Référence trop longue (255 caractères max)",
    }),
});

/** Type des valeurs d'input du formulaire (strings). */
export type EditCompanyFormInput = {
  amount: string;
  email: string;
  reference: string;
};

/** Type des valeurs après validation/transform (pour le service). */
export type EditCompanyOnSessionFormValues = z.infer<typeof editCompanyOnSessionSchema>;
