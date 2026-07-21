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
import { isPushFinalized } from "@/lib/abby/eligibility";
import { getInvoicePdf } from "@/lib/services/abby-status";
import type { EmailAttachmentDescriptor } from "@/lib/services/email-queue";
import { renderSystemTemplate } from "@/lib/templates/registry";
import { generatePdfFromFragment } from "@/lib/services/pdf-generator";
import { convertDocxToPdfWithVariables } from "@/lib/services/docx-converter";
import { toSignedStorageUrl } from "@/lib/storage/sign-storage-url";
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
  certificat_realisation: "Certificat-realisation",
  programme_formation: "Programme",
  feuille_emargement: "Feuille-Emargement",
  feuille_emargement_collectif: "Feuille-Emargement-Collective",
  facture: "Facture",
  devis: "Devis",
  // h-22 secondaires
  avis_hab_elec_generique: "Avis-Habilitation-Electrique",
  avis_hab_elec_b0_bf_bs: "Avis-Hab-Elec-B0-BF-BS",
  avis_hab_elec_b1v_b2v_br: "Avis-Hab-Elec-B1V-B2V-BR",
  avis_hab_elec_bf_hf: "Avis-Hab-Elec-BF-HF",
  avis_hab_elec_bt: "Avis-Hab-Elec-BT",
  avis_hab_elec_bt_ht: "Avis-Hab-Elec-BT-HT",
  avis_hab_elec_h0_b0: "Avis-Hab-Elec-H0-B0",
  avis_hab_elec_h0_b0_bf_hf_bs: "Avis-Hab-Elec-H0-B0-BF-HF-BS",
  avis_hab_elec_h0_b0_initial: "Avis-Hab-Elec-H0-B0-Initial",
  attestation_aipr: "Attestation-AIPR",
  attestation_competences: "Attestation-Competences",
  attestation_abandon_formation: "Attestation-Abandon-Formation",
  certificat_travail_hauteur: "Certificat-Travail-Hauteur",
  certificat_diplome: "Certificat-Diplome",
  autorisation_image: "Autorisation-Droit-Image",
  decharge_responsabilite: "Decharge-Responsabilite",
  lettre_decharge_responsabilite: "Lettre-Decharge-Responsabilite",
  charte_formateur: "Charte-Formateur",
  contrat_engagement_stagiaire: "Contrat-Engagement-Stagiaire",
  bilan_poe: "Bilan-POE",
  reponses_evaluations: "Reponses-Evaluations",
  reponses_satisfaction_session: "Reponses-Satisfaction-Session",
  resultats_evaluations: "Resultats-Evaluations",
};

/**
 * Résout un tableau de descripteurs en pièces jointes prêtes à envoyer.
 * Les erreurs de génération individuelles sont loggées mais n'interrompent pas
 * le traitement (l'email part avec les autres pièces jointes).
 */
export async function resolveAttachments(
  supabase: SupabaseClient,
  descriptors: EmailAttachmentDescriptor[],
  // Story 4.3 : n'est passé QUE par le worker d'envoi (client service_role).
  // `/api/documents/generate` (user-scoped, ouvert aux trainer) ne le passe
  // PAS — sinon la lecture d'abby_connections échouerait sous RLS et
  // renverrait un 404 sur toute facture poussée (régression).
  options: { preferAbbyPdf?: boolean } = {}
): Promise<ResolvedAttachment[]> {
  const resolved: ResolvedAttachment[] = [];

  for (const desc of descriptors) {
    try {
      const att = await resolveOne(supabase, desc, options);
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
  desc: EmailAttachmentDescriptor,
  options: { preferAbbyPdf?: boolean } = {}
): Promise<ResolvedAttachment | null> {
  // Cas 1 : fichier déjà uploadé (URL Storage signée par exemple) — joint tel quel
  if (desc.type === "file_url") {
    // Bucket privé (RGPD) → URL signée pour pouvoir fetch.
    const signedUrl = await toSignedStorageUrl(supabase, desc.url);
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${desc.url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    return { filename: desc.filename, content: buffer };
  }

  // Cas 2 : .docx personnalisé uploadé par l'admin (avec ou sans variables)
  // → docxtemplater (variables) + CloudConvert (LibreOffice → PDF fidèle)
  if (desc.type === "uploaded_docx") {
    const pdf = await convertDocxToPdfWithVariables(await toSignedStorageUrl(supabase, desc.url), desc.variables);
    // Si filename fourni n'est pas .pdf, on remplace l'extension
    const baseName = desc.filename.replace(/\.docx?$/i, "");
    return {
      filename: `${baseName}.pdf`,
      content: pdf.buffer,
    };
  }

  // em-c-9 — Cas spéciaux facture + devis : génération via jsPDF côté serveur
  // (modules src/lib/invoice-pdf-export.ts + src/lib/devis-pdf.ts). Le PDF
  // generator est synchrone côté Node mais peut planter sur certaines features
  // (canvas pour QR codes notamment). On wrap dans try/catch large : si la gen
  // échoue, on log un event critical et l'email part sans la PJ (fail-safe).
  if (desc.type === "facture") {
    return await resolveFacture(supabase, desc.payload.invoice_id, options.preferAbbyPdf === true);
  }
  if (desc.type === "devis") {
    return await resolveDevis(supabase, desc.payload.quote_id);
  }

  // Cas 3a : Override "Modèle par défaut" — si un template Word custom a été
  // marqué default_for_doc_type pour ce type, on l'utilise À LA PLACE du HTML
  // système. Bénéfice client : 1 seul changement = effet partout.
  const defaultOverride = await findDefaultOverride(supabase, desc);
  if (defaultOverride) {
    const variables = await buildAutoVariables(supabase, desc);
    const pdf = await convertDocxToPdfWithVariables(await toSignedStorageUrl(supabase, defaultOverride.source_docx_url), variables);
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

// ============================================================
// em-c-10 — Génération PDF facture/devis via Puppeteer + templates HTML
// ============================================================
// Approche validée par Wissam (cadrage 2026-05-28) :
//   - Templates HTML dédiés (facture-email.ts, devis-email.ts) avec
//     placeholders Mustache simples `{{var}}` (pas Sellsy `[%xxx%]`).
//   - Builders Supabase chargent invoice/quote + lines + entity + session,
//     construisent un Record<string,string> de variables, substituent dans
//     le template, puis génèrent le PDF via Puppeteer (generatePdfFromFragment).
//   - Defaults safe : champs entity manquants → chaines vides, jamais crash.
//
// Visuellement proche du PDF jsPDF de TabFinances mais pas pixel-perfect.
// Story em-c-12 future pour unifier les 2 versions (preview client / email serveur).

/**
 * Tente le PDF Factur-X. `handled: false` = la facture n'est pas poussée,
 * le chemin jsPDF EXISTANT prend la suite (comportement inchangé).
 * `handled: true` avec `attachment: null` = poussée mais proxy en échec :
 * PAS de repli sur le PDF interne (un document non légal ne doit jamais
 * partir à la place de la facture légale — AC-5).
 */
async function resolveFacturXAttachment(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<{ handled: boolean; attachment: ResolvedAttachment | null }> {
  const { data, error } = await supabase
    .from("formation_invoices")
    .select("entity_id, abby_push_state, abby_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !data) return { handled: false, attachment: null };

  const invoice = data as {
    entity_id: string;
    abby_push_state: string | null;
    abby_invoice_id: string | null;
  };
  if (!isPushFinalized({ abby_push_state: invoice.abby_push_state }) || !invoice.abby_invoice_id) {
    return { handled: false, attachment: null };
  }

  const res = await getInvoicePdf(supabase, invoice.entity_id, invoiceId);
  if (res.ok) {
    return { handled: true, attachment: { filename: res.filename, content: res.pdf } };
  }

  // Poussée mais PDF indisponible : log structuré, aucune PJ (jamais jsPDF).
  // La connexion inactive est un état DURABLE (toutes les relances de
  // l'entité partiraient sans facture) → niveau critique, distinct d'une panne.
  const inactive = res.error.code === "abby_connection_inactive";
  console.log(
    JSON.stringify({
      event: "email_attachment_facturx_failed",
      level: inactive ? "critical" : "error",
      ts: new Date().toISOString(),
      invoice_id: invoiceId,
      entity_id: invoice.entity_id,
      reason: res.error.code ?? "unknown",
      message: res.error.message,
    }),
  );
  return { handled: true, attachment: null };
}

async function resolveFacture(
  supabase: SupabaseClient,
  invoiceId: string,
  preferAbbyPdf = false,
): Promise<ResolvedAttachment | null> {
  // Story 4.3 (AD-15) : sur une facture poussée-finalisée, le document
  // OFFICIEL est le Factur-X d'Abby. Appel DIRECT du service (même
  // processus) — jamais un fetch HTTP sur notre propre route : ce code
  // tourne dans le worker de relances, sans cookie de session.
  if (preferAbbyPdf) {
    const facturx = await resolveFacturXAttachment(supabase, invoiceId);
    if (facturx.handled) return facturx.attachment;
  }
  try {
    const start = Date.now();
    const html = await renderFactureHtml(supabase, invoiceId);
    if (!html) {
      console.error(
        `[attachments-resolver] facture ${invoiceId} : invoice introuvable ou contexte incomplet`,
      );
      return null;
    }
    const pdf = await generatePdfFromFragment(html, "Facture");
    const filename = `facture-${invoiceId.slice(0, 8)}.pdf`;
    console.log(
      JSON.stringify({
        event: "email_attachment_facture_generated",
        ts: new Date().toISOString(),
        invoice_id: invoiceId,
        latency_ms: Date.now() - start,
        size_bytes: pdf.buffer.length,
      }),
    );
    return { filename, content: pdf.buffer };
  } catch (err) {
    console.error(
      `[attachments-resolver] facture ${invoiceId} génération échouée :`,
      err instanceof Error ? err.message : err,
    );
    console.log(
      JSON.stringify({
        event: "email_attachment_facture_generation_failed",
        ts: new Date().toISOString(),
        invoice_id: invoiceId,
        error: err instanceof Error ? err.message : String(err),
        level: "critical",
      }),
    );
    return null;
  }
}

async function resolveDevis(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<ResolvedAttachment | null> {
  try {
    const start = Date.now();
    const html = await renderDevisHtml(supabase, quoteId);
    if (!html) {
      console.error(
        `[attachments-resolver] devis ${quoteId} : quote introuvable ou contexte incomplet`,
      );
      return null;
    }
    const pdf = await generatePdfFromFragment(html, "Devis");
    const filename = `devis-${quoteId.slice(0, 8)}.pdf`;
    console.log(
      JSON.stringify({
        event: "email_attachment_devis_generated",
        ts: new Date().toISOString(),
        quote_id: quoteId,
        latency_ms: Date.now() - start,
        size_bytes: pdf.buffer.length,
      }),
    );
    return { filename, content: pdf.buffer };
  } catch (err) {
    console.error(
      `[attachments-resolver] devis ${quoteId} génération échouée :`,
      err instanceof Error ? err.message : err,
    );
    console.log(
      JSON.stringify({
        event: "email_attachment_devis_generation_failed",
        ts: new Date().toISOString(),
        quote_id: quoteId,
        error: err instanceof Error ? err.message : String(err),
        level: "critical",
      }),
    );
    return null;
  }
}

// ── Helpers em-c-10 : builders HTML facture + devis ─────────────────────

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("fr-FR");
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  sent: "Envoyée",
  paid: "Payée",
  late: "En retard",
  cancelled: "Annulée",
};

const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  accepted: "Accepté",
  rejected: "Refusé",
  expired: "Expiré",
};

function safeStr(v: unknown): string {
  return typeof v === "string" && v.length > 0 ? v : "";
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderFactureHtml(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<string | null> {
  const { FACTURE_HTML } = await import("@/lib/templates/facture-email");

  const { data: invoice } = await supabase
    .from("formation_invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return null;

  const { data: entity } = await supabase
    .from("entities")
    .select("*")
    .eq("id", invoice.entity_id)
    .maybeSingle();
  if (!entity) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, title, start_date, end_date, planned_hours, mode, location")
    .eq("id", invoice.session_id)
    .maybeSingle();

  const { data: lines } = await supabase
    .from("formation_invoice_lines")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  const e = entity as Record<string, unknown>;
  const totalHT = (lines ?? []).reduce(
    (acc: number, l: Record<string, unknown>) =>
      acc + Number(l.quantity ?? 1) * Number(l.unit_price ?? 0),
    0,
  );
  const tvaExempt = e.tva_exempt === true;
  const tvaRate = Number(e.tva_rate) || 20;
  const tvaAmount = tvaExempt ? 0 : (totalHT * tvaRate) / 100;
  const totalTTC = totalHT + tvaAmount;

  const linesRowsHtml = (lines ?? [])
    .map((l: Record<string, unknown>) => {
      const qty = Number(l.quantity ?? 1);
      const pu = Number(l.unit_price ?? 0);
      return `<tr>
        <td>${htmlEscape(String(l.description ?? ""))}</td>
        <td class="num">${qty}</td>
        <td class="num">${fmtMoney(pu)}</td>
        <td class="num">${fmtMoney(qty * pu)}</td>
      </tr>`;
    })
    .join("");

  const logoUrl = safeStr(e.logo_url);
  const stampUrl = safeStr(e.stamp_url);
  const notes = safeStr(invoice.notes);
  const bankIban = safeStr(e.bank_iban);
  const bankName = safeStr(e.bank_name);

  const vars: Record<string, string> = {
    entity_name: safeStr(entity.name) || "MR FORMATION",
    entity_address: safeStr(e.address),
    entity_postal_code: safeStr(e.postal_code),
    entity_city: safeStr(e.city),
    entity_siret: safeStr(e.siret),
    entity_nda: safeStr(e.nda),
    entity_phone: safeStr(e.phone),
    entity_email: safeStr(e.email),
    entity_website: safeStr(e.website),
    entity_logo_html: logoUrl
      ? `<img class="logo" src="${htmlEscape(logoUrl)}" alt="Logo">`
      : "",
    entity_stamp_html: stampUrl
      ? `<img class="stamp" src="${htmlEscape(stampUrl)}" alt="Cachet">`
      : "",
    doc_title: invoice.is_avoir ? "AVOIR" : "FACTURE",
    reference: safeStr(invoice.reference),
    created_at_fr: fmtDate(invoice.created_at as string),
    due_date_fr: fmtDate(invoice.due_date as string),
    status_label:
      INVOICE_STATUS_LABELS[safeStr(invoice.status)] ?? safeStr(invoice.status),
    recipient_name: htmlEscape(safeStr(invoice.recipient_name)),
    recipient_address_block: "",
    session_block_html: session
      ? `<div class="session-info">
          <strong>Formation :</strong> ${htmlEscape(safeStr(session.title))}<br>
          ${
            session.start_date && session.end_date
              ? `<strong>Période :</strong> du ${fmtDate(session.start_date as string)} au ${fmtDate(session.end_date as string)}`
              : ""
          }
        </div>`
      : "",
    lines_rows_html: linesRowsHtml || "<tr><td colspan='4'>Aucune ligne</td></tr>",
    total_ht_fr: fmtMoney(totalHT),
    tva_label: tvaExempt
      ? "TVA non applicable (art. 261 du CGI)"
      : `TVA (${tvaRate}%)`,
    tva_amount_fr: fmtMoney(tvaAmount),
    total_ttc_fr: fmtMoney(totalTTC),
    notes_block_html: notes
      ? `<div class="notes"><strong>Notes :</strong> ${htmlEscape(notes)}</div>`
      : "",
    bank_block_html:
      bankIban && bankName
        ? `<div class="bank-block">
            <strong>Coordonnées bancaires :</strong><br>
            ${htmlEscape(bankName)}<br>
            IBAN : ${htmlEscape(bankIban)}
          </div>`
        : "",
    mentions_legales_html: safeStr(e.invoice_footer_text)
      ? htmlEscape(safeStr(e.invoice_footer_text))
      : "Document généré électroniquement. En cas de retard de paiement, des pénalités pourront s'appliquer conformément à la réglementation.",
  };

  return substituteVars(FACTURE_HTML, vars);
}

async function renderDevisHtml(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<string | null> {
  const { DEVIS_HTML } = await import("@/lib/templates/devis-email");

  const { data: quote } = await supabase
    .from("crm_quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return null;

  const { data: entity } = await supabase
    .from("entities")
    .select("*")
    .eq("id", quote.entity_id)
    .maybeSingle();
  if (!entity) return null;

  // Recipient = client ou prospect
  let recipientName = "Destinataire";
  if (quote.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("company_name")
      .eq("id", quote.client_id)
      .maybeSingle();
    recipientName = safeStr(client?.company_name) || recipientName;
  } else if (quote.prospect_id) {
    const { data: prospect } = await supabase
      .from("crm_prospects")
      .select("company_name")
      .eq("id", quote.prospect_id)
      .maybeSingle();
    recipientName = safeStr(prospect?.company_name) || recipientName;
  }

  const { data: lines } = await supabase
    .from("crm_quote_lines")
    .select("*")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true });

  const e = entity as Record<string, unknown>;
  const totalHT = (lines ?? []).reduce(
    (acc: number, l: Record<string, unknown>) =>
      acc + Number(l.quantity ?? 1) * Number(l.unit_price ?? 0),
    0,
  );
  const tvaExempt = e.tva_exempt === true;
  const tvaRate = Number(e.tva_rate) || 20;
  const tvaAmount = tvaExempt ? 0 : (totalHT * tvaRate) / 100;
  const totalTTC = totalHT + tvaAmount;

  const linesRowsHtml = (lines ?? [])
    .map((l: Record<string, unknown>) => {
      const qty = Number(l.quantity ?? 1);
      const pu = Number(l.unit_price ?? 0);
      return `<tr>
        <td>${htmlEscape(String(l.description ?? ""))}</td>
        <td class="num">${qty}</td>
        <td class="num">${fmtMoney(pu)}</td>
        <td class="num">${fmtMoney(qty * pu)}</td>
      </tr>`;
    })
    .join("");

  const logoUrl = safeStr(e.logo_url);
  const stampUrl = safeStr(e.stamp_url);
  const notes = safeStr(quote.notes);

  const vars: Record<string, string> = {
    entity_name: safeStr(entity.name) || "MR FORMATION",
    entity_address: safeStr(e.address),
    entity_postal_code: safeStr(e.postal_code),
    entity_city: safeStr(e.city),
    entity_siret: safeStr(e.siret),
    entity_nda: safeStr(e.nda),
    entity_phone: safeStr(e.phone),
    entity_email: safeStr(e.email),
    entity_website: safeStr(e.website),
    entity_logo_html: logoUrl
      ? `<img class="logo" src="${htmlEscape(logoUrl)}" alt="Logo">`
      : "",
    entity_stamp_html: stampUrl
      ? `<img class="stamp" src="${htmlEscape(stampUrl)}" alt="Cachet">`
      : "",
    reference: safeStr(quote.reference),
    created_at_fr: fmtDate(quote.created_at as string),
    valid_until_fr: fmtDate(quote.valid_until as string),
    status_label:
      QUOTE_STATUS_LABELS[safeStr(quote.status)] ?? safeStr(quote.status),
    recipient_name: htmlEscape(recipientName),
    lines_rows_html: linesRowsHtml || "<tr><td colspan='4'>Aucune ligne</td></tr>",
    total_ht_fr: fmtMoney(totalHT),
    tva_label: tvaExempt
      ? "TVA non applicable (art. 261 du CGI)"
      : `TVA (${tvaRate}%)`,
    tva_amount_fr: fmtMoney(tvaAmount),
    total_ttc_fr: fmtMoney(totalTTC),
    notes_block_html: notes
      ? `<div class="notes"><strong>Notes :</strong> ${htmlEscape(notes)}</div>`
      : "",
    signature_block_html: "",
    mentions_legales_html:
      "Cette proposition commerciale est valable selon les conditions ci-dessus. Document généré électroniquement.",
  };

  return substituteVars(DEVIS_HTML, vars);
}

function substituteVars(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}
