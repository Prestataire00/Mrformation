/**
 * Libellés lisibles des documents / pièces jointes d'email, et rendu d'un
 * descripteur `email_history.attachments` en texte affichable.
 *
 * Module PUR (aucune dépendance serveur : ni Resend, ni Supabase) → importable
 * depuis un composant client. Ne pas remplacer par un import de
 * batch-email-handler (qui tirerait du code serveur dans le bundle client).
 *
 * Cf. docs/superpowers/specs/2026-07-09-email-history-attachments-design.md
 */

/** Type de document (doc_type / descriptor.type) → libellé FR. */
export const DOCUMENT_LABELS: Record<string, string> = {
  convention_entreprise: "Convention de formation",
  convention_intervention: "Convention d'intervention",
  convocation: "Convocation",
  programme_formation: "Programme de formation",
  certificat_realisation: "Certificat de réalisation",
  certificat_diplome: "Certificat de diplôme",
  certificat_travail_hauteur: "Certificat travail en hauteur",
  attestation_assiduite: "Attestation d'assiduité",
  attestation_competences: "Attestation de compétences",
  attestation_abandon_formation: "Attestation d'abandon",
  attestation_aipr: "Attestation AIPR",
  feuille_emargement: "Feuille d'émargement",
  feuille_emargement_collectif: "Feuille d'émargement collective",
  bilan_poe: "Bilan POE",
  reponses_evaluations: "Réponses aux évaluations",
  reponses_satisfaction_session: "Réponses de satisfaction",
  resultats_evaluations: "Résultats des évaluations",
  autorisation_image: "Autorisation de droit à l'image",
  facture: "Facture",
  devis: "Devis",
};

/**
 * Forme lâche d'un descripteur stocké dans `email_history.attachments`.
 * Couvre les descripteurs de la file (`{ type, payload }`, `{ type:"file_url",
 * filename }`) ET ceux des envois directs (`{ type, filename, signature_link }`).
 */
export interface EmailAttachmentRecord {
  type?: string;
  filename?: string;
  signature_link?: boolean;
  payload?: unknown;
}

/** « certificat_realisation » → « Certificat realisation » (fallback lisible). */
function prettifyType(type: string): string {
  const s = type.replace(/_/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Pièce jointe";
}

/**
 * Rend un descripteur de pièce jointe en libellé affichable + note optionnelle.
 * - type connu → « <Libellé> (PDF) »
 * - sinon filename → le nom de fichier tel quel
 * - sinon type prettifié / « Pièce jointe »
 * - `signature_link` → note « Lien de signature inclus »
 */
export function describeAttachment(desc: EmailAttachmentRecord): { label: string; note?: string } {
  const mapped = desc.type ? DOCUMENT_LABELS[desc.type] : undefined;
  const label = mapped
    ? `${mapped} (PDF)`
    : desc.filename || (desc.type ? prettifyType(desc.type) : "Pièce jointe");
  const note = desc.signature_link ? "Lien de signature inclus" : undefined;
  return { label, note };
}
