/**
 * Helper commun pour les endpoints `/api/documents/send-X-batch-email`
 * (Story F2 et extensions F2.x).
 *
 * Factorise : init Resend + fromAddress par entité + Promise.allSettled
 * + envoi Resend avec PDF en pj + log email_history + update is_sent
 * (les 2 writes en best-effort, ne bloquent pas la réponse).
 *
 * Chaque endpoint reste responsable du chargement métier (session,
 * enrollments, clients, trainers, etc.). Il fournit une liste de
 * `RecipientGenerationTask` au helper qui génère le PDF lazy (skip
 * si email absent) puis envoie.
 *
 * Également exporté : `batchSendDocsEmail` — orchestrateur générique
 * qui charge les destinataires depuis le registry et délègue à
 * `executeBatchEmailSend`. Consommé par les routes thin-wrapper F1.x/F2.x.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/logger";
import { resolveEmailTemplate } from "@/lib/services/email-template-resolver";

// Story em-b-6 cleanup — Resolver email-template-resolver = chemin unique
// pour subject + body batch. Fallback hardcoded conservé
// (EMAIL_SUBJECT_LABELS + buildEmailHtmlBody/TextBody) en cas de seed
// manquant — contexte user-triggered (routes batch), fail-soft pour ne
// pas casser un envoi déclenché par admin.
import {
  SYSTEM_TEMPLATES_BY_DOC_TYPE,
  renderSystemTemplate,
} from "@/lib/templates/registry";
import {
  getResolvedVariablesMap,
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import { convertDocxToPdfWithVariables } from "@/lib/services/docx-converter";
import { appendCommercialSignature, loadCommercialSignature } from "@/lib/email/signature";
import { toSignedStorageUrl } from "@/lib/storage/sign-storage-url";
import { loadClientsWithContacts } from "@/lib/services/load-client";
import { loadSessionAggregates } from "@/lib/services/load-session-aggregates";
import { loadEvaluationResults } from "@/lib/services/load-evaluation-results";
import { generateLoginQrDataUrl } from "@/lib/services/login-qr-code";
import type { Session, Learner, Client, Trainer, Contact } from "@/lib/types";

/**
 * Lot F : doc_types qui consomment data.sessionAggregates. Pour ces docs,
 * batch-email-handler doit charger les agrégats session avant de générer
 * les PDFs (sinon les builders retournent "Aucune réponse...").
 */
const DOC_TYPES_NEEDING_AGGREGATES = new Set<string>([
  "reponses_evaluations",
  "reponses_satisfaction_session",
]);

const isResendConfigured =
  !!process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== "votre-cle-resend";

const resend = isResendConfigured ? new Resend(process.env.RESEND_API_KEY) : null;

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface RecipientGenerationTask {
  ownerId: string;
  ownerName: string;
  ownerEmail: string | null;
  /** Génère le PDF buffer. Appelée seulement si `ownerEmail` est présent. */
  generatePdf: () => Promise<Buffer>;
  emailSubject: string;
  emailHtmlBody: string;
  emailTextBody: string;
  attachmentFilename: string;
}

export interface BatchSendError {
  ownerId: string;
  ownerName: string;
  error: string;
}

export interface BatchSendOutcome {
  totalRequested: number;
  successCount: number;
  failureCount: number;
  errors: BatchSendError[];
  latencyMs?: number;
}

export interface BatchSendOptions {
  supabase: SupabaseClient;
  entityId: string;
  profileId: string;
  sessionId: string;
  docType: string;
  /** Filtre owner_type pour l'update is_sent (learner / company / trainer). */
  ownerType: "learner" | "company" | "trainer";
}

/**
 * Pour chaque task : génère PDF lazy → envoie Resend + log email_history
 * + update is_sent. Promise.allSettled : une erreur individuelle n'arrête
 * pas les autres.
 */
export async function executeBatchEmailSend(
  tasks: RecipientGenerationTask[],
  options: BatchSendOptions,
): Promise<BatchSendOutcome> {
  if (!resend) {
    throw new Error("RESEND_API_KEY non configurée");
  }

  // From-address selon l'entité (même règle que /api/emails/send)
  const { data: entityRow } = await options.supabase
    .from("entities")
    .select("name")
    .eq("id", options.entityId)
    .single();
  const fromAddress = (entityRow?.name || "").toLowerCase().includes("c3v")
    ? "C3V Formation <noreply@c3vformation.fr>"
    : "MR Formation <noreply@mrformation.fr>";

  const serviceSupabase = createServiceClient();
  const errors: BatchSendError[] = [];
  let successCount = 0;
  const batchStartedAt = Date.now();

  const settled = await Promise.allSettled(
    tasks.map(async (task) => {
      const taskStartedAt = Date.now();
      if (!task.ownerEmail) {
        throw new Error("Pas d'email");
      }

      // Génère PDF (lazy : skippé si email absent ci-dessus)
      const pdfBuffer = await task.generatePdf();

      const sendResult = await resend!.emails.send({
        from: fromAddress,
        to: [task.ownerEmail],
        subject: task.emailSubject,
        html: task.emailHtmlBody,
        text: task.emailTextBody,
        attachments: [{ filename: task.attachmentFilename, content: pdfBuffer }],
      });

      if (sendResult.error) {
        throw new Error(sendResult.error.message ?? "Resend send error");
      }

      // Log email_history (best-effort)
      try {
        await serviceSupabase.from("email_history").insert({
          recipient_email: task.ownerEmail,
          subject: task.emailSubject,
          body: task.emailTextBody,
          status: "sent",
          sent_at: new Date().toISOString(),
          entity_id: options.entityId,
          sent_by: options.profileId,
          session_id: options.sessionId,
          recipient_type: options.ownerType,
          recipient_id: task.ownerId,
          sent_via: "resend",
          // Trace de la pièce jointe (PDF du document) pour l'historique.
          attachments: [{ type: options.docType, filename: task.attachmentFilename }],
        });
      } catch (logErr) {
        console.error("[batch-email-handler] email_history insert failed:", logErr);
      }

      // Update is_sent sur le doc correspondant (best-effort, table unifiée `documents`)
      try {
        await serviceSupabase
          .from("documents")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("source_table", "sessions")
          .eq("source_id", options.sessionId)
          .eq("doc_type", options.docType)
          .eq("owner_type", options.ownerType)
          .eq("owner_id", task.ownerId)
          .neq("status", "signed"); // ne pas downgrader
      } catch (updateErr) {
        console.error("[batch-email-handler] is_sent update failed:", updateErr);
      }

      logEvent("document_sent", {
        entity_id: options.entityId,
        doc_type: options.docType,
        session_id: options.sessionId,
        owner_id: task.ownerId,
        owner_type: options.ownerType,
        recipient_email: task.ownerEmail,
        resend_id: sendResult.data?.id ?? null,
        latency_ms: Date.now() - taskStartedAt,
      });

      return { ownerId: task.ownerId, resendId: sendResult.data?.id };
    }),
  );

  settled.forEach((outcome, idx) => {
    const task = tasks[idx];
    if (outcome.status === "fulfilled") {
      successCount += 1;
    } else {
      const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      errors.push({ ownerId: task.ownerId, ownerName: task.ownerName, error: msg });
      logEvent("document_failed", {
        entity_id: options.entityId,
        doc_type: options.docType,
        session_id: options.sessionId,
        owner_id: task.ownerId,
        owner_type: options.ownerType,
        action: "send_email",
        error_message: msg,
      });
    }
  });

  logEvent("batch_send_summary", {
    entity_id: options.entityId,
    doc_type: options.docType,
    session_id: options.sessionId,
    owner_type: options.ownerType,
    total: tasks.length,
    success: successCount,
    failure: errors.length,
    latency_ms: Date.now() - batchStartedAt,
  });

  return {
    totalRequested: tasks.length,
    successCount,
    failureCount: errors.length,
    errors,
    latencyMs: Date.now() - batchStartedAt,
  };
}

// ============================================================================
// Orchestrateur générique batchSendDocsEmail (Stories F1.x / F2.x)
// ============================================================================

/**
 * Résultat retourné par `batchSendDocsEmail`. Enveloppe `BatchSendOutcome`
 * avec un discriminant `ok` pour faciliter le traitement côté routes API.
 */
export interface BatchSendDocsResult {
  ok: true;
  totalRequested: number;
  successCount: number;
  failureCount: number;
  errors: BatchSendError[];
  latencyMs?: number;
}

export interface BatchSendDocsError {
  ok: false;
  error: { message: string; code?: string };
}

/** Labels pour le sujet email par doc_type. */
const EMAIL_SUBJECT_LABELS: Record<string, string> = {
  convocation: "Convocation",
  certificat_realisation: "Certificat de réalisation",
  attestation_assiduite: "Attestation d'assiduité",
  feuille_emargement: "Feuille d'émargement",
  feuille_emargement_collectif: "Feuille d'émargement collective",
  convention_entreprise: "Convention de formation",
  convention_intervention: "Convention d'intervention",
  programme_formation: "Programme de formation",
  cgv: "Conditions Générales de Vente",
  reglement_interieur: "Règlement intérieur",
  politique_confidentialite: "Politique de confidentialité",
  feuille_emargement_vierge: "Feuille d'émargement vierge",
  planning_hebdo_signe: "Planning hebdomadaire signé",
  avis_hab_elec_generique: "Avis d'habilitation électrique",
  avis_hab_elec_b0_bf_bs: "Avis d'habilitation électrique B0/BF/BS",
  avis_hab_elec_b1v_b2v_br: "Avis d'habilitation électrique B1V/B2V/BR",
  avis_hab_elec_bf_hf: "Avis d'habilitation électrique BF/HF",
  avis_hab_elec_bt: "Avis d'habilitation électrique BT",
  avis_hab_elec_bt_ht: "Avis d'habilitation électrique BT/HT",
  avis_hab_elec_h0_b0: "Avis d'habilitation électrique H0/B0",
  avis_hab_elec_h0_b0_bf_hf_bs: "Avis d'habilitation électrique H0/B0/BF/HF/BS",
  avis_hab_elec_h0_b0_initial: "Avis d'habilitation électrique H0/B0 Initial",
  attestation_aipr: "Attestation AIPR",
  attestation_competences: "Attestation de compétences",
  attestation_abandon_formation: "Attestation d'abandon de formation",
  certificat_travail_hauteur: "Certificat de travail en hauteur",
  certificat_diplome: "Certificat / Diplôme",
  autorisation_image: "Autorisation droit à l'image",
  decharge_responsabilite: "Décharge de responsabilité",
  lettre_decharge_responsabilite: "Lettre de décharge de responsabilité",
  charte_formateur: "Charte formateur",
  contrat_engagement_stagiaire: "Contrat d'engagement stagiaire",
  bilan_poe: "Bilan POE",
  reponses_evaluations: "Réponses aux évaluations",
  reponses_satisfaction_session: "Réponses satisfaction",
  resultats_evaluations: "Résultats des évaluations",
};

/** Labels pour le nom du fichier PDF attaché. */
const FILENAME_LABELS: Record<string, string> = {
  convocation: "Convocation",
  certificat_realisation: "Certificat-realisation",
  attestation_assiduite: "Attestation-assiduite",
  feuille_emargement: "Feuille-Emargement",
  feuille_emargement_collectif: "Feuille-Emargement-Collective",
  convention_entreprise: "Convention",
  convention_intervention: "Convention-intervention",
  programme_formation: "Programme",
  cgv: "CGV",
  reglement_interieur: "Reglement-interieur",
  politique_confidentialite: "Politique-confidentialite",
  feuille_emargement_vierge: "Feuille-Emargement-vierge",
  planning_hebdo_signe: "Planning-hebdo-signe",
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
  reponses_satisfaction_session: "Reponses-Satisfaction",
  resultats_evaluations: "Resultats-Evaluations",
};

/**
 * Orchestrateur générique pour les routes /api/documents/send-{type}-batch-email
 * (Stories F1.x/F2.x).
 *
 * Pour un docType donné :
 *  1. Charge la session avec entity_id filter (multi-tenant sécurisé)
 *  2. Résout ownerType depuis `SYSTEM_TEMPLATES_BY_DOC_TYPE` (source de vérité unique)
 *  3. Charge les destinataires selon ownerType (learner / company / trainer / session)
 *  4. Pour chaque destinataire, construit un `RecipientGenerationTask` qui :
 *     a. ⚠ CRITIQUE — Vérifie si un template Word custom (mode=docx_fidelity,
 *        default_for_doc_type=docType) existe → utilise convertDocxToPdfWithVariables
 *        (reproduit fidèlement email-attachments-resolver.ts:findDefaultOverride)
 *     b. Sinon → génère depuis le template HTML système via DocumentGenerationService
 *  5. Délègue à `executeBatchEmailSend` pour envoi Resend + log email_history + is_sent
 *
 * @param profileId  UUID du profil admin qui déclenche l'envoi (utilisé pour email_history.sent_by).
 */
export async function batchSendDocsEmail(
  supabase: SupabaseClient,
  entityId: string,
  sessionId: string,
  docType: string,
  profileId: string,
): Promise<BatchSendDocsResult | BatchSendDocsError> {
  // 1. Charger session + check entity_id (sécurité multi-tenant)
  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .select("*, training:trainings(*)")
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .single();
  if (sessErr || !session) {
    return {
      ok: false,
      error: { message: sessErr?.message ?? "Session introuvable", code: "SESSION_NOT_FOUND" },
    };
  }

  // 2. Résoudre ownerType depuis le registry (source de vérité unique)
  const tpl = SYSTEM_TEMPLATES_BY_DOC_TYPE[docType];
  if (!tpl) {
    return {
      ok: false,
      error: { message: `Doc_type inconnu : ${docType}`, code: "UNKNOWN_DOC_TYPE" },
    };
  }
  const ownerType = tpl.ownerType;

  // 3. Charger les destinataires selon ownerType
  const recipientRows = await loadRecipientsByOwnerType(supabase, sessionId, entityId, ownerType);
  if (recipientRows.length === 0) {
    return { ok: true, totalRequested: 0, successCount: 0, failureCount: 0, errors: [] };
  }

  // 4. Charger entity settings (branding, logo) pour les templates HTML et docx
  const entitySettings = await loadEntitySettings(supabase, entityId);

  // 5. ⚠ CRITIQUE — Vérifier template Word custom (docx_fidelity)
  //    Reproduit exactement la logique de findDefaultOverride() dans
  //    email-attachments-resolver.ts : même table, mêmes filtres
  //    (entity_id + default_for_doc_type + mode='docx_fidelity').
  const { data: customTpl } = await supabase
    .from("document_templates")
    .select("source_docx_url")
    .eq("entity_id", entityId)
    .eq("default_for_doc_type", docType)
    .eq("mode", "docx_fidelity")
    .maybeSingle();
  const customDocxUrl = customTpl?.source_docx_url ?? null;

  // Prépare les services partagés (1 instance par batch, pas par tâche)
  const engine = createDefaultEngine();
  const service = new DocumentGenerationService({ engine, supabase });
  const sessionTitle = (session as { title?: string }).title ?? "Formation";
  const subjectLabel = EMAIL_SUBJECT_LABELS[docType] ?? docType;
  const filenameLabel = FILENAME_LABELS[docType] ?? docType;
  const entityName = (entitySettings as unknown as { name?: string })?.name ?? "Formation";

  // em-b-6 cleanup : resolver = chemin unique, lookup 1× par batch
  let resolvedSubjectTpl: string | null = null;
  let resolvedBodyTpl: string | null = null;
  const resolvedBatch = await resolveEmailTemplate(supabase, `batch_${docType}`, entityId);
  if (resolvedBatch) {
    resolvedSubjectTpl = resolvedBatch.subject;
    resolvedBodyTpl = resolvedBatch.body;
  } else {
    console.warn(
      `[batch-email] resolveEmailTemplate('batch_${docType}') retourne null pour entité ${entityId}, fallback hardcoded EMAIL_SUBJECT_LABELS`,
    );
  }

  // Lot F : agrégats session pour reponses_evaluations / reponses_satisfaction.
  // Sans ça les builders {{tableau_reponses_*}} retournent "Aucune réponse..."
  // même quand les questionnaires ont reçu des réponses. 1 seul fetch par
  // batch (pas par destinataire) car les agrégats sont session-scoped.
  let sessionAggregates: ResolveContext["sessionAggregates"];
  if (DOC_TYPES_NEEDING_AGGREGATES.has(docType)) {
    try {
      sessionAggregates = await loadSessionAggregates(supabase, sessionId);
    } catch (err) {
      console.warn("[batch-email] loadSessionAggregates failed:", err);
    }
  }

  // Signature commerciale : chargée 1× par lot depuis le profil déclencheur
  // (profileId), ajoutée en bas du corps résolu de chaque email.
  const commercialSignature = await loadCommercialSignature(supabase, profileId);

  // Lot H : QR code connexion pour convocation (1× par batch). Un batch =
  // une seule entité (entityId/sessionId du scope) → on encode son slug dans
  // l'URL : /login?entity=<slug> (sélecteur d'organisme pré-rempli). Repli
  // /login si pas de slug.
  let loginQrCodeDataUrl: string | undefined;
  if (docType === "convocation") {
    const qr = await generateLoginQrDataUrl(entitySettings?.slug ?? undefined);
    if (qr) loginQrCodeDataUrl = qr;
  }

  // 6. Construire les RecipientGenerationTask
  const tasks: RecipientGenerationTask[] = recipientRows.map((recipient) => {
    const slugName = recipient.name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 60) || "destinataire";

    // Contexte de résolution du TEXTE de l'email (objet + corps), identique à
    // celui du PDF (cf. generatePdf plus bas). Indispensable : les balises
    // insérées depuis le catalogue UI le sont au format Sellsy `[%Libellé%]`
    // (cf. InsertVariableButton), que l'ancien `applyBatchVars` codé en dur
    // ignorait totalement → `[%Date de fin de la formation%]`, `[%Nom de
    // l'organisme%]`, etc. restaient littérales dans l'email.
    const emailCtx: ResolveContext = {
      session: session as unknown as Session,
      entity: entitySettings,
      learner:
        ownerType === "learner" || ownerType === "session"
          ? (recipient.fullRecord as unknown as Learner)
          : undefined,
      client: ownerType === "company" ? (recipient.fullRecord as unknown as Client) : undefined,
      trainer: ownerType === "trainer" ? (recipient.fullRecord as unknown as Trainer) : undefined,
      sessionAggregates,
      loginQrCodeDataUrl,
    };

    // Résolveur unifié (catalogue complet : `{{cle}}` ET `[%Libellé%]`), PUIS
    // compat legacy pour les clés hors-catalogue des anciens templates seedés
    // ({{formation}}, {{entite}}, {{prenom_formateur}} — laissées littérales par
    // le résolveur car absentes du catalogue, donc réécrites ici).
    const applyBatchVars = (s: string) =>
      resolveDocumentVariables(s, emailCtx)
        .replaceAll("{{formation}}", sessionTitle)
        .replaceAll("{{entite}}", entityName)
        .replaceAll("{{prenom_formateur}}", recipient.name);

    const finalSubject = resolvedSubjectTpl
      ? applyBatchVars(resolvedSubjectTpl)
      : `${subjectLabel} — ${sessionTitle}`;
    // Résout le corps une seule fois (réutilisé pour les versions texte + HTML)
    // puis ajoute la signature commerciale en bas.
    const resolvedBodyText = resolvedBodyTpl
      ? appendCommercialSignature(applyBatchVars(resolvedBodyTpl), commercialSignature)
      : null;
    const finalTextBody =
      resolvedBodyText ?? buildEmailTextBody(docType, sessionTitle, recipient.name);
    const finalHtmlBody = resolvedBodyText
      ? `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#374151;white-space:pre-wrap;">${resolvedBodyText.replace(/\n/g, "<br/>")}</div>`
      : buildEmailHtmlBody(docType, sessionTitle, recipient.name);

    return {
      ownerId: recipient.id,
      ownerName: recipient.name,
      ownerEmail: recipient.email,
      emailSubject: finalSubject,
      emailHtmlBody: finalHtmlBody,
      emailTextBody: finalTextBody,
      attachmentFilename: `${filenameLabel.toLowerCase()}-${slugName}.pdf`,
      generatePdf: async (): Promise<Buffer> => {
        // Lot F : charge evaluationResults par destinataire si doc per-apprenant
        // (resultats_evaluations exige sessionId + learnerId).
        let evaluationResults: ResolveContext["evaluationResults"];
        if (
          docType === "resultats_evaluations" &&
          (ownerType === "learner" || ownerType === "session")
        ) {
          try {
            evaluationResults = await loadEvaluationResults(supabase, sessionId, recipient.id);
          } catch (err) {
            console.warn("[batch-email] loadEvaluationResults failed:", err);
          }
        }

        // Construit le contexte de résolution de variables
        const ctx: ResolveContext = {
          session: session as unknown as Session,
          entity: entitySettings,
          // ownerType "session" charge des apprenants (cf. loadRecipientsByOwnerType)
          // → on passe le fullRecord comme Learner pour que les variables
          //   [%Nom de l'apprenant%] etc. soient résolues correctement.
          learner: (ownerType === "learner" || ownerType === "session")
            ? (recipient.fullRecord as unknown as Learner) : undefined,
          client: ownerType === "company" ? (recipient.fullRecord as unknown as Client) : undefined,
          trainer: ownerType === "trainer" ? (recipient.fullRecord as unknown as Trainer) : undefined,
          sessionAggregates,
          evaluationResults,
          loginQrCodeDataUrl,
        };

        // 6a. ⚠ CRITIQUE — Branchement docx_fidelity PRIORITAIRE
        //     Si le client a uploadé un template Word personnalisé pour ce doc_type,
        //     on l'utilise à la place du template HTML système.
        //     → getResolvedVariablesMap() → Record<string,string> pour docxtemplater
        //     C'est exactement ce que fait email-attachments-resolver.ts:buildAutoVariables()
        if (customDocxUrl) {
          const variables = getResolvedVariablesMap(ctx);
          // Bucket privé (RGPD) → URL signée pour le converter externe.
          const pdf = await convertDocxToPdfWithVariables(await toSignedStorageUrl(supabase, customDocxUrl), variables);
          return pdf.buffer;
        }

        // 6b. Template HTML système (fallback)
        //     renderSystemTemplate retourne null si doc_type absent du registry —
        //     mais on a déjà vérifié que tpl existe (étape 2), donc safe.
        const html = renderSystemTemplate(docType, {
          formation: session as unknown as Session,
          learner: (ownerType === "learner" || ownerType === "session")
            ? (recipient.fullRecord as unknown as Learner) : undefined,
          company: ownerType === "company" ? (recipient.fullRecord as unknown as Client) : undefined,
          trainer: ownerType === "trainer" ? (recipient.fullRecord as unknown as Trainer) : undefined,
          entity: entitySettings ?? undefined,
          // Lot F : propage les agrégats session pour que les builders
          // {{tableau_reponses_*}} retournent les vraies données.
          sessionAggregates,
          evaluationResults,
          // Lot H : QR code connexion convocation
          loginQrCodeDataUrl,
        });
        if (!html) {
          throw new Error(`Template HTML système introuvable pour doc_type="${docType}"`);
        }

        const footer = resolveDocumentVariables(tpl.footer, ctx);
        const result = await service.generate({
          entityId,
          docType,
          html,
          cacheInputs: {
            doc_type: docType,
            session_id: sessionId,
            ...((ownerType === "learner" || ownerType === "session") && { learner_id: recipient.id }),
            ...(ownerType === "company" && { client_id: recipient.id }),
            ...(ownerType === "trainer" && { trainer_id: recipient.id }),
            session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
            // Lot F + H : bump pour invalider les anciens PDFs en cache
            // (sans agrégats / sans QR code convocation).
            custom_variables: { cache_version: "lot-h-bis-v1" },
          },
          options: {
            format: "A4",
            margins: { top: "18mm", right: "16mm", bottom: "22mm", left: "16mm" },
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: "<span></span>",
            footerTemplate: footer,
          },
        });
        return result.buffer;
      },
    };
  });

  // 7. Déléguer à executeBatchEmailSend pour l'envoi + log email_history + is_sent
  //    ownerType "session" mappe sur "learner" pour les logs (les docs de session
  //    sont envoyés aux apprenants inscrits).
  const sendOwnerType: "learner" | "company" | "trainer" =
    ownerType === "session" ? "learner" : ownerType;

  const outcome = await executeBatchEmailSend(tasks, {
    supabase,
    entityId,
    profileId,
    sessionId,
    docType,
    ownerType: sendOwnerType,
  });

  return {
    ok: true,
    totalRequested: outcome.totalRequested,
    successCount: outcome.successCount,
    failureCount: outcome.failureCount,
    errors: outcome.errors,
    latencyMs: outcome.latencyMs,
  };
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

interface RecipientRow {
  id: string;
  name: string;
  email: string | null;
  /** Enregistrement complet (Learner | Client | Trainer) pour le contexte de template. */
  fullRecord: unknown;
}

/**
 * Charge les destinataires d'une session selon ownerType.
 *
 * - learner  : apprenants inscrits (enrollments, status in registered/confirmed/completed)
 * - company  : clients rattachés via formation_companies, email = override de la table
 *              OU email du contact primary (loadClientsWithContacts pour éviter PGRST201)
 * - trainer  : formateurs rattachés via formation_trainers
 * - session  : même que learner (les docs "session" sont envoyés à tous les apprenants)
 */
async function loadRecipientsByOwnerType(
  supabase: SupabaseClient,
  sessionId: string,
  _entityId: string,
  ownerType: "learner" | "company" | "trainer" | "session",
): Promise<RecipientRow[]> {
  if (ownerType === "learner" || ownerType === "session") {
    const { data } = await supabase
      .from("enrollments")
      .select("learner:learners(*)")
      .eq("session_id", sessionId)
      .in("status", ["registered", "confirmed", "completed"]);

    return (data ?? [])
      .map((row): RecipientRow | null => {
        const l = row.learner as unknown as {
          id: string;
          email: string | null;
          first_name: string;
          last_name: string;
          [key: string]: unknown;
        } | null;
        if (!l) return null;
        return {
          id: l.id,
          name: `${l.first_name} ${l.last_name}`,
          email: l.email,
          fullRecord: l as unknown,
        };
      })
      .filter((x): x is RecipientRow => x !== null);
  }

  if (ownerType === "company") {
    // Charge les liens formation_companies (avec email override si renseigné)
    const { data: links } = await supabase
      .from("formation_companies")
      .select("client_id, email")
      .eq("session_id", sessionId);
    if (!links || links.length === 0) return [];

    const rows = links as unknown as Array<{ client_id: string | null; email: string | null }>;
    const clientIds = rows
      .map((r) => r.client_id)
      .filter((id): id is string => Boolean(id));
    if (clientIds.length === 0) return [];

    // loadClientsWithContacts — 2 queries séparées pour éviter PGRST201
    const clientsMap = await loadClientsWithContacts(supabase, clientIds);

    return rows
      .map((row): RecipientRow | null => {
        if (!row.client_id) return null;
        const client = clientsMap.get(row.client_id);
        if (!client) return null;

        // Email : override de formation_companies en priorité, sinon contact primary
        const email: string | null =
          row.email ??
          pickClientEmail(client);

        return {
          id: client.id,
          name: client.company_name ?? client.id,
          email,
          fullRecord: client as unknown,
        };
      })
      .filter((x): x is RecipientRow => x !== null);
  }

  if (ownerType === "trainer") {
    const { data } = await supabase
      .from("formation_trainers")
      .select("trainer:trainers(*)")
      .eq("session_id", sessionId);

    return (data ?? [])
      .map((row): RecipientRow | null => {
        const t = row.trainer as unknown as {
          id: string;
          email: string | null;
          first_name: string;
          last_name: string;
          [key: string]: unknown;
        } | null;
        if (!t) return null;
        return {
          id: t.id,
          name: `${t.first_name} ${t.last_name}`,
          email: t.email,
          fullRecord: t as unknown,
        };
      })
      .filter((x): x is RecipientRow => x !== null);
  }

  return [];
}

/** Email primaire = contact `is_primary=true` avec email, sinon 1er contact avec email. */
function pickClientEmail(client: Client): string | null {
  const contacts = (client.contacts ?? []) as Contact[];
  const withEmail = contacts.filter((c) => c.email);
  const primary = withEmail.find((c) => c.is_primary);
  return primary?.email ?? withEmail[0]?.email ?? null;
}

function buildEmailHtmlBody(docType: string, sessionTitle: string, recipientName: string): string {
  const label = EMAIL_SUBJECT_LABELS[docType] ?? docType;
  return (
    `<p>Bonjour,</p>\n` +
    `<p>Veuillez trouver ci-joint votre <strong>${label}</strong> pour la formation <strong>${sessionTitle}</strong>.</p>\n` +
    `<p>Cordialement,<br/>L'équipe formation</p>`
  );
  void recipientName; // disponible pour personnalisation future
}

function buildEmailTextBody(docType: string, sessionTitle: string, recipientName: string): string {
  const label = EMAIL_SUBJECT_LABELS[docType] ?? docType;
  return (
    `Bonjour,\n\n` +
    `Veuillez trouver ci-joint votre ${label} pour la formation ${sessionTitle}.\n\n` +
    `Cordialement,\nL'équipe formation`
  );
  void recipientName;
}
