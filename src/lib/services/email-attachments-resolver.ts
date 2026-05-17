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
import { renderSystemTemplate } from "@/lib/templates/registry";
import { generatePdfFromFragment } from "@/lib/services/pdf-generator";
import { convertDocxToPdfWithVariables } from "@/lib/services/docx-converter";
import {
  getResolvedVariablesMap,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import type { Session, Learner, Client, Trainer } from "@/lib/types";

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

  // Cas 3a : Override "Modèle par défaut" — si un template Word custom a été
  // marqué default_for_doc_type pour ce type, on l'utilise À LA PLACE du HTML
  // système. Bénéfice client : 1 seul changement = effet partout.
  const defaultOverride = await findDefaultOverride(supabase, desc);
  if (defaultOverride) {
    const variables = await buildAutoVariables(supabase, desc);
    const pdf = await convertDocxToPdfWithVariables(defaultOverride.source_docx_url, variables);
    const filenameSlug = (FILENAME_LABELS[desc.type] ?? desc.type).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return {
      filename: `${filenameSlug}.pdf`,
      content: pdf.buffer,
    };
  }

  // Cas 3b : Génération PDF via template HTML existant (templates de la plateforme)
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
 * Cherche un template Word custom marqué `default_for_doc_type = desc.type`
 * pour l'entité du contexte (déduite via session_id ou client_id).
 * Retourne null si aucun override → comportement classique (HTML système).
 */
async function findDefaultOverride(
  supabase: SupabaseClient,
  desc: Exclude<EmailAttachmentDescriptor, { type: "file_url" } | { type: "uploaded_docx" }>
): Promise<{ source_docx_url: string } | null> {
  // Déduire l'entity_id depuis le payload (via session, client, ou direct)
  let entityId: string | null = null;

  if ("session_id" in desc.payload && desc.payload.session_id) {
    const { data } = await supabase
      .from("sessions")
      .select("entity_id")
      .eq("id", desc.payload.session_id)
      .single();
    entityId = data?.entity_id ?? null;
  }

  if (!entityId) return null;

  const { data: override } = await supabase
    .from("document_templates")
    .select("source_docx_url, mode")
    .eq("entity_id", entityId)
    .eq("default_for_doc_type", desc.type)
    .eq("mode", "docx_fidelity")
    .maybeSingle();

  if (!override?.source_docx_url) return null;
  return { source_docx_url: override.source_docx_url };
}

/**
 * Construit le set de variables résolues pour le rendu d'un template Word
 * override par défaut (`mode='docx_fidelity'`). Charge tout depuis Supabase et
 * utilise le path unifié `getResolvedVariablesMap()` — même formateur de dates
 * (date-fns / `dd/MM/yyyy`) que le rendu HTML, mêmes 46 variables (incluant
 * l'organisme : `{{logo_organisme}}`, `{{siret_organisme}}`, etc.).
 *
 * Avant Story B0 : cette fonction utilisait son propre formateur
 * `toLocaleDateString("fr-FR")` et exposait seulement ~10 variables —
 * incohérence avec le rendu HTML côté Web.
 */
async function buildAutoVariables(
  supabase: SupabaseClient,
  desc: Exclude<EmailAttachmentDescriptor, { type: "file_url" } | { type: "uploaded_docx" }>
): Promise<Record<string, string>> {
  const context: ResolveContext = {};

  // Session — récupère le full record pour avoir entity_id, training, etc.
  if ("session_id" in desc.payload && desc.payload.session_id) {
    const { data: session } = await supabase
      .from("sessions")
      .select("*, training:trainings(*), enrollments:enrollments(learner:learners(*), client_id), program:programs(*)")
      .eq("id", desc.payload.session_id)
      .single();
    if (session) {
      context.session = session as unknown as Session;
      // Entity : on charge via session.entity_id (clé multi-tenant).
      if (session.entity_id) {
        context.entity = await loadEntitySettings(supabase, session.entity_id);
      }
    }
  }

  if ("learner_id" in desc.payload && desc.payload.learner_id) {
    const { data: learner } = await supabase
      .from("learners")
      .select("*")
      .eq("id", desc.payload.learner_id)
      .single();
    if (learner) context.learner = learner as unknown as Learner;
  }

  if ("client_id" in desc.payload && desc.payload.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("*, contacts(*)")
      .eq("id", desc.payload.client_id)
      .single();
    if (client) context.client = client as unknown as Client;
  }

  if ("trainer_id" in desc.payload && desc.payload.trainer_id) {
    const { data: trainer } = await supabase
      .from("trainers")
      .select("*")
      .eq("id", desc.payload.trainer_id)
      .single();
    if (trainer) context.trainer = trainer as unknown as Trainer;
  }

  return getResolvedVariablesMap(context);
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

  // Charge l'entité complète (nom + identité visuelle pour les templates PDF)
  const { data: entity } = await supabase
    .from("entities")
    .select("name, legal_form, siret, nda, ape_code, rcs, capital, address, postal_code, city, region, email, phone, website, president_name, president_title, logo_url, stamp_url, signature_url")
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

  return renderSystemTemplate(desc.type, {
    formation: session as unknown as Session,
    learner: learner ?? undefined,
    company: company ?? undefined,
    trainer: trainer ?? undefined,
    entityName,
    entity: entity ?? undefined,
  });
}
