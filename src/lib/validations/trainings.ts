/**
 * Validation Zod pour la table trainings — champs BPF.
 *
 * Schéma partiel couvrant les colonnes touchées par le BPF.
 * Les valeurs bpf_funding_type et bpf_objective sont importées
 * depuis la source unique bpf-enums.ts (alignée sur la migration SQL).
 */

import { z } from "zod";
import { BPF_FUNDING_TYPE_VALUES, BPF_OBJECTIVE_VALUES } from "@/lib/bpf-enums";

export const trainingBpfSchema = z.object({
  id: z.string().uuid(),
  entity_id: z.string().uuid(),
  title: z.string().min(1, "Le titre est requis").max(255),
  bpf_objective: z.enum(BPF_OBJECTIVE_VALUES).optional().nullable(),
  bpf_funding_type: z.enum(BPF_FUNDING_TYPE_VALUES).optional().nullable(),
});

export type TrainingBpfInput = z.infer<typeof trainingBpfSchema>;
