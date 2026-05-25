/**
 * Mass-send helper pour TabConventionDocs (Story F2).
 *
 * Pour chaque doc_type supporté, mappe vers un endpoint server-side qui
 * génère N PDFs en parallèle + envoie N emails Resend + update is_sent.
 *
 * MVP : seulement `convocation`. Les autres doc_types (certificat_realisation,
 * attestation_assiduite, convention_entreprise, etc.) seront ajoutés via
 * stories futures F2.x en créant les endpoints `send-X-batch-email`
 * correspondants.
 */

export const BATCH_SEND_ENDPOINTS_BY_DOC_TYPE: Partial<Record<string, string>> = {
  convocation: "send-convocations-batch-email",
  certificat_realisation: "send-certificats-realisation-batch-email",
  attestation_assiduite: "send-attestations-assiduite-batch-email",
  feuille_emargement: "send-emargements-individuels-batch-email",
  convention_entreprise: "send-conventions-batch-email",
  convention_intervention: "send-conventions-intervention-batch-email",
  // Nouveaux (Stories F1.x/F2.x)
  cgv: "send-cgv-batch-email",
  reglement_interieur: "send-reglement-interieur-batch-email",
  politique_confidentialite: "send-politique-confidentialite-batch-email",
  planning_semaine: "send-planning-semaine-batch-email",
  feuille_emargement_vierge: "send-feuille-emargement-vierge-batch-email",
  bilan_poe: "send-bilans-poe-batch-email",
  reponses_evaluations: "send-reponses-evaluations-batch-email",
  reponses_satisfaction_session: "send-reponses-satisfaction-batch-email",
  resultats_evaluations: "send-resultats-evaluations-batch-email",
  attestation_aipr: "send-attestations-aipr-batch-email",
  attestation_competences: "send-attestations-competences-batch-email",
  attestation_abandon_formation: "send-attestations-abandon-batch-email",
  certificat_travail_hauteur: "send-certificats-travail-hauteur-batch-email",
  certificat_diplome: "send-certificats-diplome-batch-email",
  // 9 variantes habilitation → même route
  avis_hab_elec_generique: "send-avis-habilitation-electrique-batch-email",
  avis_hab_elec_b0_bf_bs: "send-avis-habilitation-electrique-batch-email",
  avis_hab_elec_b1v_b2v_br: "send-avis-habilitation-electrique-batch-email",
  avis_hab_elec_bf_hf: "send-avis-habilitation-electrique-batch-email",
  avis_hab_elec_bt: "send-avis-habilitation-electrique-batch-email",
  avis_hab_elec_bt_ht: "send-avis-habilitation-electrique-batch-email",
  avis_hab_elec_h0_b0: "send-avis-habilitation-electrique-batch-email",
  avis_hab_elec_h0_b0_bf_hf_bs: "send-avis-habilitation-electrique-batch-email",
  avis_hab_elec_h0_b0_initial: "send-avis-habilitation-electrique-batch-email",
};

export interface BatchSendResult {
  totalRequested: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ learnerId: string; learnerName: string; error: string }>;
  latencyMs: number;
}

interface SendArgs {
  docType: string;
  sessionId: string;
}

interface BatchSendApiResponse {
  totalRequested: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ learnerId: string; learnerName: string; error: string }>;
  totalLatencyMs: number;
}

export function hasBatchSendEndpoint(docType: string): boolean {
  return docType in BATCH_SEND_ENDPOINTS_BY_DOC_TYPE;
}

export async function sendBatchEmail(args: SendArgs): Promise<BatchSendResult> {
  const endpoint = BATCH_SEND_ENDPOINTS_BY_DOC_TYPE[args.docType];
  if (!endpoint) {
    throw new Error(`Aucun endpoint batch-send pour doc_type=${args.docType}`);
  }

  const res = await fetch(`/api/documents/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: args.sessionId, docType: args.docType }),
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error ?? `Erreur serveur (${res.status})`);
  }

  const data = (await res.json()) as BatchSendApiResponse;

  return {
    totalRequested: data.totalRequested,
    successCount: data.successCount,
    failureCount: data.failureCount,
    errors: data.errors,
    latencyMs: data.totalLatencyMs,
  };
}
