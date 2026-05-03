/**
 * Resolver des descripteurs de pièces jointes vers fichiers prêts à attacher.
 *
 * Pour chaque descripteur stocké dans `email_history.attachments`, charge les
 * données nécessaires depuis Supabase, génère le HTML via `getDefaultTemplate()`
 * (templates existants), puis convertit en PDF via `pdf-generator.ts`.
 *
 * Utilisé par le worker `/api/emails/process-scheduled` juste avant Resend.send.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailAttachmentDescriptor } from "@/lib/services/email-queue";
import { getDefaultTemplate } from "@/lib/document-templates-defaults";
import { generatePdfFromFragment } from "@/lib/services/pdf-generator";
import { convertDocxToPdfWithVariables } from "@/lib/services/docx-converter";
import type { Session } from "@/lib/types";

export interface ResolvedAttachment {
  filename: string;
  /** Buffer prêt à passer à Resend (`attachments[].content`). */
  content: Buffer;
}

const FILENAME_LABELS: Record<string, string> = {
  convocation: "Convocation",
  convention_entreprise: "Convention",
  convention_intervention: "Convention-intervention",
  contrat_sous_traitance: "Contrat-sous-traitance",
  certificat_realisation: "Certificat-realisation",
  programme_formation: "Programme",
  facture: "Facture",
  devis: "Devis",
};

/**
 * Résout un tableau de descripteurs en pièces jointes prêtes à envoyer.
 * Les erreurs de génération individuelles sont loggées mais n'interrompent pas
 * le traitement (l'email part avec les autres pièces jointes).
 */
export async function resolveAttachments(
  supabase: SupabaseClient,
  descriptors: EmailAttachmentDescriptor[]
): Promise<ResolvedAttachment[]> {
  const resolved: ResolvedAttachment[] = [];

  for (const desc of descriptors) {
    try {
      const att = await resolveOne(supabase, desc);
      if (att) resolved.push(att);
    } catch (err) {
      console.error(
        `[attachments-resolver] Échec résolution ${desc.type}:`,
        err instanceof Error ? err.message : err
      );
      // On continue : un attachment cassé ne doit pas bloquer l'envoi du reste
    }
  }

  return resolved;
}

async function resolveOne(
  supabase: SupabaseClient,
  desc: EmailAttachmentDescriptor
): Promise<ResolvedAttachment | null> {
  // Cas 1 : fichier déjà uploadé (URL Storage signée par exemple) — joint tel quel
  if (desc.type === "file_url") {
    const response = await fetch(desc.url);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${desc.url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    return { filename: desc.filename, content: buffer };
  }

  // Cas 2 : .docx personnalisé uploadé par l'admin (avec ou sans variables)
  // → docxtemplater (variables) + CloudConvert (LibreOffice → PDF fidèle)
  if (desc.type === "uploaded_docx") {
    const pdf = await convertDocxToPdfWithVariables(desc.url, desc.variables);
    // Si filename fourni n'est pas .pdf, on remplace l'extension
    const baseName = desc.filename.replace(/\.docx?$/i, "");
    return {
      filename: `${baseName}.pdf`,
      content: pdf.buffer,
    };
  }

  // Cas 3 : Génération PDF via template HTML existant (templates de la plateforme)
  const html = await renderTemplateHtml(supabase, desc);
  if (!html) return null;

  const label = FILENAME_LABELS[desc.type] ?? desc.type;
  const pdf = await generatePdfFromFragment(html, label);

  // Slug filename (sans accents, sans espaces)
  const filenameSlug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    filename: `${filenameSlug}.pdf`,
    content: pdf.buffer,
  };
}

/**
 * Charge les données nécessaires et appelle le générateur de template approprié.
 * Retourne null si la donnée requise est introuvable (logué mais pas d'erreur).
 */
async function renderTemplateHtml(
  supabase: SupabaseClient,
  desc: Exclude<EmailAttachmentDescriptor, { type: "file_url" } | { type: "uploaded_docx" }>
): Promise<string | null> {
  const sessionId =
    "session_id" in desc.payload ? desc.payload.session_id : null;
  if (!sessionId) {
    console.warn(`[attachments-resolver] ${desc.type} sans session_id`);
    return null;
  }

  // Charge la session avec ses relations standard
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, title, start_date, end_date, location, entity_id, status, planned_hours, total_price, mode, training:trainings(*)"
    )
    .eq("id", sessionId)
    .single();

  if (!session) {
    console.warn(`[attachments-resolver] session ${sessionId} introuvable`);
    return null;
  }

  // Charge le nom d'entité pour l'affichage
  const { data: entity } = await supabase
    .from("entities")
    .select("name")
    .eq("id", session.entity_id)
    .single();
  const entityName = entity?.name || "MR FORMATION";

  // Selon le type, charge la cible spécifique (learner / client / trainer)
  let learner: { id?: string; first_name: string; last_name: string; email?: string } | undefined;
  let company:
    | {
        company_name: string;
        address?: string | null;
        siret?: string | null;
      }
    | undefined;
  let trainer: { first_name: string; last_name: string } | undefined;

  if ("learner_id" in desc.payload && desc.payload.learner_id) {
    const { data } = await supabase
      .from("learners")
      .select("id, first_name, last_name, email")
      .eq("id", desc.payload.learner_id)
      .single();
    if (data) learner = data;
  }

  if ("client_id" in desc.payload && desc.payload.client_id) {
    const { data } = await supabase
      .from("clients")
      .select("company_name, address, siret")
      .eq("id", desc.payload.client_id)
      .single();
    if (data) company = data;
  }

  if ("trainer_id" in desc.payload && desc.payload.trainer_id) {
    const { data } = await supabase
      .from("trainers")
      .select("first_name, last_name")
      .eq("id", desc.payload.trainer_id)
      .single();
    if (data) trainer = data;
  }

  return getDefaultTemplate(desc.type, {
    formation: session as unknown as Session,
    learner,
    company,
    trainer,
    entityName,
  });
}
