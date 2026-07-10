import { z } from "zod";
import { BPF_TRAINEE_TYPE_VALUES } from "@/lib/bpf-enums";

/**
 * Schéma d'édition de la fiche stagiaire depuis la formation.
 * Champs apprenant (learners) : prénom, nom, email.
 * Champ BPF par inscription (enrollments.bpf_trainee_type).
 */
export const editFormationLearnerSchema = z.object({
  first_name: z.string().trim().min(1, "Le prénom est requis"),
  last_name: z.string().trim().min(1, "Le nom est requis"),
  email: z.union([z.string().trim().email("Email invalide"), z.literal("")]),
  bpf_trainee_type: z.enum(BPF_TRAINEE_TYPE_VALUES, {
    message: "Le type de stagiaire est requis",
  }),
});

export type EditFormationLearnerInput = z.infer<typeof editFormationLearnerSchema>;
