/**
 * Validation Zod pour la table crm_quotes — champs BPF.
 *
 * Schéma partiel couvrant les colonnes touchées par le BPF.
 * Les valeurs bpf_funding_type sont importées depuis la source
 * unique bpf-enums.ts (alignée sur la migration SQL).
 */

import { z } from "zod";
import { BPF_FUNDING_TYPE_VALUES } from "@/lib/bpf-enums";

export const crmQuoteBpfSchema = z.object({
  id: z.string().uuid(),
  entity_id: z.string().uuid(),
  bpf_funding_type: z.enum(BPF_FUNDING_TYPE_VALUES).optional().nullable(),
});

export type CrmQuoteBpfInput = z.infer<typeof crmQuoteBpfSchema>;
