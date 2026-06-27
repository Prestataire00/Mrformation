import { z } from "zod";

/**
 * Schema Zod pour l'édition d'un formateur intégré à une session (Story 1.1).
 * Champs éditables : role, hourly_rate, daily_rate, hours_done, agreed_cost_ht.
 *
 * Les champs numériques sont des strings (inputs HTML). Les transforms
 * convertissent vers les types attendus par le service.
 */
export const editFormationTrainerSchema = z.object({
  role: z.enum(["formateur", "co-formateur", "intervenant"], {
    message: "Le rôle est requis",
  }),
  hourly_rate: z
    .string()
    .transform((v) => (v.trim() === "" ? null : parseFloat(v)))
    .refine((v) => v === null || (!isNaN(v) && v >= 0 && v <= 10000), {
      message: "Taux horaire : nombre entre 0 et 10 000",
    }),
  daily_rate: z
    .string()
    .transform((v) => (v.trim() === "" ? null : parseFloat(v)))
    .refine((v) => v === null || (!isNaN(v) && v >= 0 && v <= 10000), {
      message: "Taux journalier : nombre entre 0 et 10 000",
    }),
  hours_done: z
    .string()
    .transform((v) => (v.trim() === "" ? null : parseFloat(v)))
    .refine((v) => v === null || (!isNaN(v) && v >= 0 && v <= 8760), {
      message: "Heures : nombre entre 0 et 8 760",
    }),
  agreed_cost_ht: z
    .string()
    .transform((v) => (v.trim() === "" ? null : parseFloat(v)))
    .refine((v) => v === null || (!isNaN(v) && v >= 0 && v <= 1000000), {
      message: "Coût HT : nombre entre 0 et 1 000 000",
    }),
});

/** Type des valeurs d'input du formulaire (strings sauf role). */
export type EditFormationTrainerFormInput = {
  role: "formateur" | "co-formateur" | "intervenant";
  hourly_rate: string;
  daily_rate: string;
  hours_done: string;
  agreed_cost_ht: string;
};

/** Type des valeurs après validation/transform (pour le service). */
export type EditFormationTrainerInput = z.infer<typeof editFormationTrainerSchema>;
